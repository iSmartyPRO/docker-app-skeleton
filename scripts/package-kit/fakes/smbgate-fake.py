#!/usr/bin/env python3
"""
A fake SMB gateway for the package kit (docs/package-testing.md «Fakes»).

The File server package starts its gateway (gateway/smbgate.py) with
$SMBGATE_PYTHON; the kit points that at fakes/python-smbgate, which runs this
file instead. It speaks the same protocol on the same private Unix socket
(X-Gate-Key, X-Gate parameters, JSON answers, raw file bodies) but serves one
small read-only folder tree from memory for every server and share: no network
connection is ever made — no SMB server, no domain controller. Writes answer
403 ACCESS_DENIED (a read-only share), thumbnails 415, unknown operations 404,
like the real gateway does in those cases.

Plain python3 standard library (the host has no smbprotocol).
"""

import base64
import hmac
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from socketserver import UnixStreamServer

KEY = os.environ.get("SMBGATE_KEY", "")
NOW = time.time() - 3600

# The share's tree: folders are dicts, files are bytes.
TREE = {
    "Documents": {
        "report.txt": b"Package kit report\nline 2\n",
        "notes.md": b"# Kit notes\n\nA fake file server folder.\n",
        "Archive": {
            "old.txt": b"old\n",
        },
    },
    "Projects": {
        "plan.csv": b"name,value\nkit,1\n",
    },
    "readme.txt": b"Fake SMB share of the package kit\n",
}


class GateError(Exception):
    def __init__(self, status, code, message=""):
        super().__init__(message or code)
        self.status = status
        self.code = code


def parts_of(path):
    parts = [part for part in str(path or "").replace("\\", "/").split("/") if part]
    for part in parts:
        if part in (".", "..") or any(ord(ch) < 32 or ch in '<>:"|?*' for ch in part) or len(part) > 255:
            raise GateError(400, "INVALID_PATH", "Invalid path")
    return parts


def lookup(path):
    node = TREE
    name = ""
    for part in parts_of(path):
        if not isinstance(node, dict):
            raise GateError(404, "NOT_FOUND", "Not found")
        match = next((key for key in node if key.lower() == part.lower()), None)
        if match is None:
            raise GateError(404, "NOT_FOUND", "Not found")
        node = node[match]
        name = match
    return name, node


def shape(name, node):
    folder = isinstance(node, dict)
    return {"name": name, "dir": folder, "size": 0 if folder else len(node), "mtime": NOW, "ctime": NOW, "hidden": False, "readonly": not folder}


READ_ONLY = {"read": True, "write": False, "delete": False, "known": True}


def op_probe(req):
    name, node = lookup(req.get("path"))
    out = {"entry": shape(name, node), "access": READ_ONLY}
    if req.get("volume"):
        out["volume"] = {"total": 10 * 1024**3, "free": 4 * 1024**3}
    return out


def op_list(req):
    _name, node = lookup(req.get("path"))
    if not isinstance(node, dict):
        raise GateError(400, "NOT_A_FOLDER", "Not a folder")
    return {"entries": [shape(key, value) for key, value in node.items()], "access": READ_ONLY}


def op_stat(req):
    name, node = lookup(req.get("path"))
    out = {"entry": shape(name, node)}
    if req.get("access"):
        out["access"] = READ_ONLY
    return out


def op_search(req):
    needle = str(req.get("q") or "").strip().lower()
    if len(needle) < 2:
        return {"entries": [], "truncated": False}
    results = []

    def walk(node, path):
        for key, value in node.items():
            if needle in key.lower():
                results.append({**shape(key, value), "path": "/".join(path)})
            if isinstance(value, dict):
                walk(value, path + [key])

    _name, start = lookup(req.get("path"))
    if isinstance(start, dict):
        walk(start, parts_of(req.get("path")))
    return {"entries": results[:200], "truncated": False}


def denied(_req):
    raise GateError(403, "ACCESS_DENIED", "The kit's fake share is read-only")


JSON_OPS = {
    "auth": lambda req: {"ok": True},
    "probe": op_probe,
    "shares": lambda req: {"shares": [{"name": "kit", "remark": "fake share", "disk": True, "special": False}]},
    "list": op_list,
    "stat": op_stat,
    "search": op_search,
    "volume": lambda req: {"total": 10 * 1024**3, "free": 4 * 1024**3},
    "checkwrite": lambda req: dict(READ_ONLY),
    "logout": lambda req: {"ok": True},
    "mkdir": denied,
    "mkdirs": denied,
    "rename": denied,
    "move": denied,
    "delete": denied,
    "write": denied,
    "acl_set": denied,
    "acl_restore": denied,
    "acl_propagate": denied,
    "thumb": lambda req: (_ for _ in ()).throw(GateError(415, "NO_THUMBNAIL", "Not an image")),
}


class Handler(BaseHTTPRequestHandler):
    server_version = "smbgate-fake/1"
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *args):
        return

    def address_string(self):
        return "unix"

    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.send_json(200, {"ok": True, "fake": True})

    def do_POST(self):
        op = self.path.strip("/")
        try:
            if not KEY or not hmac.compare_digest(self.headers.get("X-Gate-Key", ""), KEY):
                raise GateError(403, "GATE_FORBIDDEN", "Bad key")
            raw = self.headers.get("X-Gate", "")
            req = json.loads(base64.b64decode(raw).decode("utf-8")) if raw else {}
            length = int(self.headers.get("Content-Length") or 0)
            if length:
                self.rfile.read(length)
            if op == "read":
                return self.read_file(req)
            if op not in JSON_OPS:
                raise GateError(404, "NOT_FOUND", "Unknown operation")
            self.send_json(200, JSON_OPS[op](req))
        except GateError as error:
            self.send_json(error.status, {"code": error.code, "error": str(error), "ntstatus": None})
        except Exception as error:  # noqa: BLE001
            self.send_json(502, {"code": "SMB_ERROR", "error": str(error)[:300], "ntstatus": None})

    def read_file(self, req):
        _name, node = lookup(req.get("path"))
        if isinstance(node, dict):
            raise GateError(400, "IS_A_FOLDER", "Is a folder")
        size = len(node)
        start = int(req.get("start") or 0)
        end = req.get("end")
        end = size - 1 if end is None else min(int(end), size - 1)
        chunk = node[start : end + 1] if size else b""
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(chunk)))
        self.send_header("X-Size", str(size))
        self.send_header("X-Mtime", str(NOW))
        self.end_headers()
        self.wfile.write(chunk)


class UnixHTTPServer(UnixStreamServer, ThreadingHTTPServer):
    daemon_threads = True

    def server_bind(self):
        try:
            os.unlink(self.server_address)
        except FileNotFoundError:
            pass
        old = os.umask(0o177)
        try:
            UnixStreamServer.server_bind(self)
        finally:
            os.umask(old)
        self.server_name = "smbgate-fake"
        self.server_port = 0

    def get_request(self):
        request, _ = self.socket.accept()
        return request, ("unix", 0)


def main():
    if len(sys.argv) < 2 or not KEY:
        print("usage: SMBGATE_KEY=… smbgate-fake.py <socket>", file=sys.stderr)
        sys.exit(2)
    server = UnixHTTPServer(sys.argv[1], Handler)
    print(f"smbgate ready on {sys.argv[1]} (package kit fake)", flush=True)

    def watch_parent():
        try:
            sys.stdin.read()
        finally:
            os._exit(0)

    threading.Thread(target=watch_parent, daemon=True).start()
    server.serve_forever()


if __name__ == "__main__":
    main()
