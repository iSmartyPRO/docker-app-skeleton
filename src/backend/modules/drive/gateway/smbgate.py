#!/usr/bin/env python3
"""
SMB gateway for the Drive module.

A small HTTP server on a private Unix socket that the Node backend starts and
talks to. It speaks SMB 2/3 to Windows file servers (and Samba) through
smbprotocol: listing with the caller's effective rights, streaming reads with
ranges, atomic uploads, folder archives, thumbnails, search and share
enumeration.

Security model
  * Only the parent process can reach the socket (0600, random key header).
  * Every request carries the credentials to use. Sessions are pooled per
    credential (server + user + password hash), never shared between people:
    smbprotocol's own pool matches sessions by user name alone.
  * Paths are share-relative, validated component by component: no "..", no
    alternate data streams (":"), no characters Windows forbids in names.
"""

import base64
import hashlib
import hmac
import io
import json
import os
import socket
import struct
import sys
import threading
import time
import uuid
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from socketserver import UnixStreamServer

import smbclient
import smbclient.shutil as smbshutil
from smbclient import _pool
from smbprotocol.create_contexts import (
    CreateContextName,
    SMB2CreateContextRequest,
    SMB2CreateQueryMaximalAccessRequest,
    SMB2CreateQueryMaximalAccessResponse,
)
from smbprotocol.exceptions import SMBAuthenticationError, SMBException, SMBOSError, SMBResponseException
from smbprotocol.file_info import FileAttributes
from smbprotocol.open import (
    CreateDisposition,
    FilePipePrinterAccessMask,
    ImpersonationLevel,
    Open,
    ShareAccess,
)

KEY = os.environ.get("SMBGATE_KEY", "")
IDLE_SECONDS = int(os.environ.get("SMBGATE_IDLE", "300"))
# Sessions are renewed after this age so AD group changes apply (like a new logon).
MAX_AGE_SECONDS = int(os.environ.get("SMBGATE_MAX_AGE", "900"))
CHUNK = 1024 * 1024
# Seconds an upload body may stay silent before the gateway gives up on it.
BODY_IDLE_TIMEOUT = 120
FORBIDDEN = set('<>:"|?*\\/')

# ── Errors ──────────────────────────────────────────────────────────────────

NTSTATUS = {
    0xC0000022: (403, "ACCESS_DENIED"),
    0xC00000CA: (403, "ACCESS_DENIED"),
    0xC000006D: (401, "AUTH_FAILED"),
    0xC000006A: (401, "AUTH_FAILED"),
    0xC0000064: (401, "AUTH_FAILED"),
    0xC000006E: (401, "ACCOUNT_RESTRICTED"),
    0xC000006F: (401, "ACCOUNT_RESTRICTED"),
    0xC0000070: (401, "ACCOUNT_RESTRICTED"),
    0xC0000071: (401, "PASSWORD_EXPIRED"),
    0xC0000224: (401, "PASSWORD_EXPIRED"),
    0xC0000072: (401, "ACCOUNT_DISABLED"),
    0xC0000193: (401, "ACCOUNT_DISABLED"),
    0xC0000234: (401, "ACCOUNT_LOCKED"),
    0xC000000F: (404, "NOT_FOUND"),
    0xC0000034: (404, "NOT_FOUND"),
    0xC000003A: (404, "NOT_FOUND"),
    0xC0000033: (400, "INVALID_NAME"),
    0xC0000035: (409, "EXISTS"),
    0xC00000CC: (404, "SHARE_NOT_FOUND"),
    0xC0000225: (404, "NOT_FOUND"),
    0xC0000257: (404, "NOT_FOUND"),
    0xC0000043: (423, "FILE_LOCKED"),
    0xC0000054: (423, "FILE_LOCKED"),
    0xC0000101: (409, "NOT_EMPTY"),
    0xC0000056: (409, "DELETE_PENDING"),
    0xC0000121: (403, "ACCESS_DENIED"),
    0xC000007F: (507, "DISK_FULL"),
    0xC0000044: (507, "QUOTA_EXCEEDED"),
    0xC00000BA: (400, "IS_A_FOLDER"),
    0xC0000103: (400, "NOT_A_FOLDER"),
}


class GateError(Exception):
    def __init__(self, status, code, message="", ntstatus=None):
        super().__init__(message or code)
        self.status = status
        self.code = code
        self.ntstatus = ntstatus


def translate(exc):
    """Maps any SMB / network failure to (http status, code, message)."""
    if isinstance(exc, GateError):
        return exc
    status = getattr(exc, "ntstatus", None)
    if status is None:
        status = getattr(exc, "status", None)
    if isinstance(status, int) and status in NTSTATUS:
        http, code = NTSTATUS[status]
        return GateError(http, code, str(exc), status)
    text = str(exc)
    for marker, code in (
        ("STATUS_LOGON_FAILURE", "AUTH_FAILED"),
        ("STATUS_ACCOUNT_DISABLED", "ACCOUNT_DISABLED"),
        ("STATUS_ACCOUNT_LOCKED_OUT", "ACCOUNT_LOCKED"),
        ("STATUS_PASSWORD_EXPIRED", "PASSWORD_EXPIRED"),
        ("STATUS_PASSWORD_MUST_CHANGE", "PASSWORD_EXPIRED"),
    ):
        if marker in text:
            return GateError(401, code, text)
    if isinstance(exc, SMBAuthenticationError):
        return GateError(401, "AUTH_FAILED", text)
    if isinstance(exc, (OSError, ValueError, SMBException, socket.timeout, TimeoutError)) and (
        "connect" in text.lower() or "timed out" in text.lower() or isinstance(exc, (socket.timeout, TimeoutError, ConnectionError))
    ):
        return GateError(502, "SERVER_UNREACHABLE", text)
    if isinstance(exc, (SMBException, SMBOSError, SMBResponseException)):
        return GateError(502, "SMB_ERROR", text, status if isinstance(status, int) else None)
    return GateError(500, "GATE_ERROR", text)


# ── Sessions, one pool per credential ───────────────────────────────────────

POOLS = {}
POOLS_LOCK = threading.Lock()


class Pool:
    def __init__(self):
        self.cache = {}
        self.created = time.monotonic()
        self.used = self.created
        self.lock = threading.Lock()


RETIRED = []


def pool_for(server, cred):
    material = "\0".join(
        [
            str(server.get("host", "")).lower(),
            str(server.get("port", 445)),
            str(cred.get("domain", "")).lower(),
            str(cred.get("username", "")).lower(),
            str(cred.get("password", "")),
            "e" if server.get("encrypt") else "",
        ]
    )
    key = hashlib.sha256(material.encode("utf-8")).hexdigest()
    with POOLS_LOCK:
        pool = POOLS.get(key)
        if pool and time.monotonic() - pool.created > MAX_AGE_SECONDS:
            # Transfers still running on the old sessions finish; it closes later.
            RETIRED.append(pool)
            pool = None
        if not pool:
            pool = POOLS[key] = Pool()
        pool.used = time.monotonic()
        return pool


def reaper():
    while True:
        time.sleep(30)
        now = time.monotonic()
        with POOLS_LOCK:
            stale = [key for key, pool in POOLS.items() if now - pool.used > IDLE_SECONDS]
            dropped = [POOLS.pop(key) for key in stale]
            expired = [pool for pool in RETIRED if now - pool.created > MAX_AGE_SECONDS + 3600]
            for pool in expired:
                RETIRED.remove(pool)
            dropped += expired
        for pool in dropped:
            try:
                smbclient.reset_connection_cache(fail_on_error=False, connection_cache=pool.cache)
            except Exception:  # noqa: BLE001 - best effort on idle sockets
                pass


def drop_pool(server, cred):
    pool = pool_for(server, cred)
    with POOLS_LOCK:
        for key, value in list(POOLS.items()):
            if value is pool:
                POOLS.pop(key, None)
    try:
        smbclient.reset_connection_cache(fail_on_error=False, connection_cache=pool.cache)
    except Exception:  # noqa: BLE001
        pass


def account(cred):
    user = str(cred.get("username") or "").strip()
    domain = str(cred.get("domain") or "").strip()
    if not user:
        raise GateError(401, "CREDENTIALS_REQUIRED", "No credentials")
    if "\\" in user or "@" in user or not domain:
        return user
    return f"{domain}\\{user}"


def session_kwargs(req):
    server = req.get("server") or {}
    cred = req.get("cred") or {}
    pool = pool_for(server, cred)
    pool.used = time.monotonic()
    kwargs = {
        "username": account(cred),
        "password": str(cred.get("password") or ""),
        "port": int(server.get("port") or 445),
        "connection_cache": pool.cache,
        "connection_timeout": int(server.get("timeout") or 10),
        "auth_protocol": "ntlm",
    }
    if server.get("encrypt"):
        kwargs["encrypt"] = True
    return kwargs


# ── Paths ───────────────────────────────────────────────────────────────────


def clean_parts(path):
    parts = [part for part in str(path or "").replace("\\", "/").split("/") if part != ""]
    for part in parts:
        if part in (".", "..") or any(ch in FORBIDDEN or ord(ch) < 32 for ch in part) or len(part) > 255:
            raise GateError(400, "INVALID_PATH", "Invalid path")
    return parts


def clean_name(name):
    name = str(name or "").strip()
    if not name or name in (".", "..") or name.endswith(".") or any(ch in FORBIDDEN or ord(ch) < 32 for ch in name) or len(name) > 255:
        raise GateError(400, "INVALID_NAME", "Invalid name")
    return name


def clean_share(share):
    share = str(share or "").strip().strip("\\/")
    if not share or any(ch in '<>:"|?*\\/' or ord(ch) < 32 for ch in share):
        raise GateError(400, "INVALID_SHARE", "Invalid share")
    return share


def host_of(req):
    host = str((req.get("server") or {}).get("host") or "").strip().strip("\\/")
    if not host or any(ch in "\\/ <>\"|?*" for ch in host):
        raise GateError(400, "INVALID_HOST", "Invalid host")
    return host


def unc(req, path=None, extra=None):
    base = rf"\\{host_of(req)}\{clean_share(req.get('share'))}"
    parts = clean_parts(req.get("path") if path is None else path)
    if extra:
        parts.append(clean_name(extra))
    return base + ("\\" + "\\".join(parts) if parts else "")


def rel_join(path, name):
    parts = clean_parts(path)
    parts.append(clean_name(name))
    return "/".join(parts)


# ── Helpers ─────────────────────────────────────────────────────────────────

HIDDEN = FileAttributes.FILE_ATTRIBUTE_HIDDEN
SYSTEM = FileAttributes.FILE_ATTRIBUTE_SYSTEM
READONLY = FileAttributes.FILE_ATTRIBUTE_READONLY
DIRECTORY = FileAttributes.FILE_ATTRIBUTE_DIRECTORY
TEMP_PREFIX = "~$portal-"


def ts(value):
    try:
        return value.timestamp()
    except Exception:  # noqa: BLE001
        return None


def entry_shape(name, info):
    attrs = int(info.file_attributes)
    return {
        "name": name,
        "dir": bool(attrs & DIRECTORY),
        "size": 0 if attrs & DIRECTORY else int(info.end_of_file),
        "mtime": ts(info.last_write_time),
        "ctime": ts(info.creation_time),
        "hidden": bool(attrs & HIDDEN) or bool(attrs & SYSTEM) or name.startswith("~$") or name.startswith(TEMP_PREFIX),
        "readonly": bool(attrs & READONLY),
    }


def stat_shape(name, st):
    attrs = int(getattr(st, "st_file_attributes", 0) or 0)
    is_dir = bool(attrs & DIRECTORY)
    return {
        "name": name,
        "dir": is_dir,
        "size": 0 if is_dir else int(st.st_size),
        "mtime": st.st_mtime,
        "ctime": getattr(st, "st_ctime", None),
        "hidden": bool(attrs & HIDDEN) or bool(attrs & SYSTEM),
        "readonly": bool(attrs & READONLY),
    }


def maximal_access(path, kwargs):
    """
    The caller's effective rights on a file or folder, as the server computes
    them from the share permissions and NTFS ACLs (SMB2 "MxAc" create context).
    Returns None when the server does not answer it (then the UI just tries).
    """
    try:
        tree, fd_path = _pool.get_smb_tree(path, **kwargs)
        handle = Open(tree, fd_path)
        request = SMB2CreateContextRequest()
        request["buffer_name"] = CreateContextName.SMB2_CREATE_QUERY_MAXIMAL_ACCESS_REQUEST
        request["buffer_data"] = SMB2CreateQueryMaximalAccessRequest()
        responses = handle.create(
            ImpersonationLevel.Impersonation,
            FilePipePrinterAccessMask.FILE_READ_ATTRIBUTES,
            0,
            ShareAccess.FILE_SHARE_READ | ShareAccess.FILE_SHARE_WRITE | ShareAccess.FILE_SHARE_DELETE,
            CreateDisposition.FILE_OPEN,
            0,
            create_contexts=[request],
        )
        try:
            for response in responses or []:
                if isinstance(response, SMB2CreateQueryMaximalAccessResponse):
                    if response["query_status"].get_value() != 0:
                        return None
                    return int(response["maximal_access"].get_value())
        finally:
            handle.close()
    except (SMBOSError, SMBResponseException) as exc:
        mapped = translate(exc)
        if mapped.code in ("NOT_FOUND", "AUTH_FAILED", "ACCOUNT_DISABLED", "ACCOUNT_LOCKED", "PASSWORD_EXPIRED", "SHARE_NOT_FOUND", "ACCESS_DENIED"):
            raise mapped from exc
        return None
    return None


def rights(mask):
    if mask is None:
        return {"read": True, "write": True, "delete": True, "known": False}
    full = bool(mask & 0x10000000)  # GENERIC_ALL
    return {
        "read": full or bool(mask & 0x1),
        # FILE_WRITE_DATA / FILE_ADD_FILE, FILE_ADD_SUBDIRECTORY
        "write": full or bool(mask & 0x2) or bool(mask & 0x4),
        # DELETE, FILE_DELETE_CHILD
        "delete": full or bool(mask & 0x10000) or bool(mask & 0x40),
        "known": True,
    }


def swap_into(temp, target, folder, kwargs):
    """
    Replaces `target` with `temp`. Rename-with-replace is refused by some
    servers, so the old file steps aside first and comes back on failure.
    """
    backup = folder + "\\" + f"{TEMP_PREFIX}{uuid.uuid4().hex[:12]}.old"
    smbclient.rename(target, backup, **kwargs)
    try:
        smbclient.rename(temp, target, **kwargs)
    except Exception:
        smbclient.rename(backup, target, **kwargs)
        raise
    try:
        smbclient.remove(backup, **kwargs)
    except Exception:  # noqa: BLE001 - a hidden leftover is harmless
        pass


def free_name(folder_unc, name, kwargs, first=2):
    stem, dot, ext = name.rpartition(".")
    if not dot or not stem:
        stem, ext = name, ""
    try:
        taken = {entry.name.lower() for entry in smbclient.scandir(folder_unc, **kwargs)}
    except Exception:  # noqa: BLE001
        taken = set()
    if name.lower() not in taken:
        return name
    for index in range(first, 1000):
        candidate = f"{stem} ({index}).{ext}" if ext else f"{stem} ({index})"
        if candidate.lower() not in taken:
            return candidate
    raise GateError(409, "EXISTS", "Name taken")


# ── Share enumeration (MS-SRVS NetrShareEnum over \PIPE\srvsvc) ─────────────

SRVSVC = uuid.UUID("4b324fc8-1670-01d3-1278-5a47bf6ee188")
NDR = uuid.UUID("8a885d04-1ceb-11c9-9fe8-08002b104860")


def rpc_header(ptype, body_len, call_id, flags=0x03):
    return struct.pack("<BBBBIHHI", 5, 0, ptype, flags, 0x10, 16 + body_len, 0, call_id)


def ndr_wstr(text):
    data = (text + "\0").encode("utf-16-le")
    count = len(text) + 1
    out = struct.pack("<III", count, 0, count) + data
    return out + b"\0" * ((4 - len(out) % 4) % 4)


def read_pdu(pipe):
    """Named pipes are message-mode: one read returns one whole PDU fragment."""
    return pipe.read(1024 * 1024)


def enum_shares(req):
    kwargs = session_kwargs(req)
    path = rf"\\{host_of(req)}\IPC$\srvsvc"
    pipe = smbclient.open_file(path, mode="w+b", buffering=0, file_type="pipe", **kwargs)
    try:
        bind = struct.pack("<HHI", 4280, 4280, 0) + struct.pack("<BBH", 1, 0, 0)
        bind += struct.pack("<HBB", 0, 1, 0) + SRVSVC.bytes_le + struct.pack("<HH", 3, 0) + NDR.bytes_le + struct.pack("<I", 2)
        pipe.write(rpc_header(11, len(bind), 1) + bind)
        ack = read_pdu(pipe)
        if not ack or ack[2] != 12:
            raise GateError(502, "RPC_BIND_FAILED", "srvsvc bind failed")

        stub = struct.pack("<I", 0x00020000) + ndr_wstr(host_of(req))
        stub += struct.pack("<II", 1, 1) + struct.pack("<I", 0x00020004) + struct.pack("<II", 0, 0)
        stub += struct.pack("<I", 0xFFFFFFFF) + struct.pack("<I", 0)
        body = struct.pack("<IHH", len(stub), 0, 15) + stub
        pipe.write(rpc_header(0, len(body), 2) + body)

        payload = b""
        while True:
            pdu = read_pdu(pipe)
            if not pdu or len(pdu) < 24:
                raise GateError(502, "RPC_FAILED", "Empty RPC response")
            if pdu[2] == 3:  # fault
                status = struct.unpack_from("<I", pdu, 24)[0]
                if status == 5:
                    raise GateError(403, "ACCESS_DENIED", "Share list denied")
                raise GateError(502, "RPC_FAILED", f"RPC fault {status:#x}")
            payload += pdu[24:]
            if pdu[3] & 0x02:
                break
        return parse_share_enum(payload)
    finally:
        pipe.close()


def parse_share_enum(data):
    offset = 0

    def u32():
        nonlocal offset
        value = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        return value

    def wstr():
        nonlocal offset
        _max, _off, actual = struct.unpack_from("<III", data, offset)
        offset += 12
        text = data[offset : offset + actual * 2].decode("utf-16-le", "replace").rstrip("\0")
        offset += actual * 2
        offset += (4 - offset % 4) % 4
        return text

    u32()  # level
    u32()  # union switch
    if not u32():  # container pointer
        return []
    count = u32()
    if not u32():  # buffer pointer
        return []
    u32()  # array max count
    raw = []
    for _ in range(count):
        name_ptr, share_type, remark_ptr = u32(), u32(), u32()
        raw.append((name_ptr, share_type, remark_ptr))
    shares = []
    for name_ptr, share_type, remark_ptr in raw:
        name = wstr() if name_ptr else ""
        remark = wstr() if remark_ptr else ""
        base = share_type & 0x0FFFFFFF
        shares.append(
            {
                "name": name,
                "remark": remark,
                "disk": base == 0,
                "special": bool(share_type & 0x80000000) or name.endswith("$"),
            }
        )
    return shares


# ── Operations ──────────────────────────────────────────────────────────────


def op_probe(req, _body):
    """Connect, authenticate, open the share root (or a path) and report rights."""
    kwargs = session_kwargs(req)
    target = unc(req)
    st = smbclient.stat(target, **kwargs)
    result = {"entry": stat_shape(clean_parts(req.get("path"))[-1] if clean_parts(req.get("path")) else "", st)}
    result["access"] = rights(maximal_access(target, kwargs))
    if req.get("volume"):
        try:
            volume = smbclient.stat_volume(target, **kwargs)
            result["volume"] = {"total": volume.total_size, "free": volume.caller_available_size}
        except Exception:  # noqa: BLE001
            result["volume"] = None
    return result


def op_auth(req, _body):
    """Authenticates against the server (IPC$ tree connect) without touching a share."""
    kwargs = session_kwargs(req)
    _pool.get_smb_tree(rf"\\{host_of(req)}\IPC$", **kwargs)
    return {"ok": True}


def op_shares(req, _body):
    return {"shares": enum_shares(req)}


def op_list(req, _body):
    kwargs = session_kwargs(req)
    target = unc(req)
    entries = []
    for entry in smbclient.scandir(target, **kwargs):
        if entry.name in (".", ".."):
            continue
        entries.append(entry_shape(entry.name, entry.smb_info))
    return {"entries": entries, "access": rights(maximal_access(target, kwargs))}


def op_stat(req, _body):
    kwargs = session_kwargs(req)
    target = unc(req)
    parts = clean_parts(req.get("path"))
    st = smbclient.stat(target, **kwargs)
    result = {"entry": stat_shape(parts[-1] if parts else "", st)}
    if req.get("access"):
        result["access"] = rights(maximal_access(target, kwargs))
    return result


def op_mkdir(req, _body):
    kwargs = session_kwargs(req)
    folder = unc(req)
    name = clean_name(req.get("name"))
    if req.get("unique"):
        name = free_name(folder, name, kwargs)
    target = unc(req, extra=name)
    smbclient.mkdir(target, **kwargs)
    return {"entry": stat_shape(name, smbclient.stat(target, **kwargs))}


def op_mkdirs(req, body):
    """
    Folder uploads: makes every folder of a tree below `path` ("a", "a/b", ...,
    parents first). Existing folders are reused; a failure (a file in the way,
    no rights) is reported for that folder and everything below it, the rest
    go ahead. Returns one {created, error} per entry of `dirs`, in order.
    """
    kwargs = session_kwargs(req)
    base = clean_parts(req.get("path"))
    dirs = (body or {}).get("dirs")
    if not isinstance(dirs, list) or len(dirs) > 5000:
        raise GateError(400, "BAD_REQUEST", "Bad folder list")
    known = {}
    results = []
    for raw in dirs:
        parts = clean_parts(raw)
        if not parts or len(parts) > 64:
            raise GateError(400, "INVALID_PATH", "Invalid path")
        for part in parts:
            clean_name(part)
        created = False
        error = None
        for depth in range(1, len(parts) + 1):
            key = "/".join(parts[:depth]).lower()
            if key not in known:
                target = unc(req, path="/".join(base + parts[:depth]))
                try:
                    smbclient.mkdir(target, **kwargs)
                    known[key] = None
                    if depth == len(parts):
                        created = True
                except Exception as exc:  # noqa: BLE001 - reported per folder
                    mapped = translate(exc)
                    if mapped.status == 401 or mapped.code in ("SERVER_UNREACHABLE", "SHARE_NOT_FOUND"):
                        raise mapped from exc
                    if mapped.code == "EXISTS":
                        try:
                            st = smbclient.stat(target, **kwargs)
                            known[key] = None if stat_shape("", st)["dir"] else "NOT_A_FOLDER"
                        except Exception as exc2:  # noqa: BLE001
                            known[key] = translate(exc2).code
                    else:
                        known[key] = mapped.code
            error = known[key]
            if error:
                break
        results.append({"created": created, "error": error})
    return {"results": results}


def op_rename(req, _body):
    kwargs = session_kwargs(req)
    source = unc(req)
    parts = clean_parts(req.get("path"))
    if not parts:
        raise GateError(400, "INVALID_PATH", "Cannot rename the root")
    name = clean_name(req.get("name"))
    target = unc(req, path="/".join(parts[:-1]), extra=name)
    if parts[-1] == name:
        return {"entry": stat_shape(name, smbclient.stat(source, **kwargs))}
    if parts[-1].lower() == name.lower():
        # Case-only renames go through a temporary name on case-insensitive servers.
        temp = unc(req, path="/".join(parts[:-1]), extra=f"{TEMP_PREFIX}{uuid.uuid4().hex[:8]}")
        smbclient.rename(source, temp, **kwargs)
        smbclient.rename(temp, target, **kwargs)
    else:
        smbclient.rename(source, target, **kwargs)
    return {"entry": stat_shape(name, smbclient.stat(target, **kwargs))}


def op_move(req, _body):
    """Moves (or copies) items into another folder of the same share, or of another share on the same server."""
    kwargs = session_kwargs(req)
    dest_req = dict(req, share=req.get("toShare") or req.get("share"), path=req.get("toPath"))
    dest_folder = unc(dest_req)
    same_share = clean_share(dest_req["share"]).lower() == clean_share(req.get("share")).lower()
    copy = bool(req.get("copy"))
    moved = []
    for item in req.get("items") or []:
        parts = clean_parts(item)
        if not parts:
            raise GateError(400, "INVALID_PATH", "Cannot move the root")
        source = unc(req, path=item)
        dest_parts = clean_parts(dest_req["path"])
        if same_share and [p.lower() for p in dest_parts[: len(parts)]] == [p.lower() for p in parts]:
            raise GateError(400, "MOVE_CYCLE", "Cannot move a folder into itself")
        name = parts[-1]
        if same_share and "/".join(parts[:-1]).lower() == "/".join(dest_parts).lower() and not copy:
            moved.append(name)
            continue
        name = free_name(dest_folder, name, kwargs)
        target = dest_folder + "\\" + name
        is_dir = smbclient.path.isdir(source, **kwargs)
        if same_share and not copy:
            smbclient.rename(source, target, **kwargs)
        elif is_dir:
            smbshutil.copytree(source, target, **kwargs)
            if not copy:
                smbshutil.rmtree(source, **kwargs)
        else:
            smbshutil.copy2(source, target, **kwargs)
            if not copy:
                smbclient.remove(source, **kwargs)
        moved.append(name)
    return {"names": moved}


def op_delete(req, _body):
    kwargs = session_kwargs(req)
    removed = 0
    for item in req.get("items") or [req.get("path")]:
        parts = clean_parts(item)
        if not parts:
            raise GateError(400, "INVALID_PATH", "Cannot delete the root")
        target = unc(req, path=item)
        if smbclient.path.isdir(target, **kwargs):
            smbshutil.rmtree(target, **kwargs)
        else:
            smbclient.remove(target, **kwargs)
        removed += 1
    return {"removed": removed}


def op_search(req, _body):
    kwargs = session_kwargs(req)
    needle = str(req.get("q") or "").strip().lower()
    if len(needle) < 2:
        return {"entries": [], "truncated": False}
    limit = min(int(req.get("limit") or 200), 500)
    deadline = time.monotonic() + min(float(req.get("seconds") or 8), 20)
    start = clean_parts(req.get("path"))
    queue = [start]
    results = []
    visited = 0
    truncated = False
    while queue:
        if time.monotonic() > deadline or visited > 4000:
            truncated = True
            break
        parts = queue.pop(0)
        visited += 1
        try:
            entries = list(smbclient.scandir(unc(req, path="/".join(parts)), **kwargs))
        except Exception:  # noqa: BLE001 - folders we cannot open are skipped
            continue
        for entry in entries:
            if entry.name in (".", ".."):
                continue
            shape = entry_shape(entry.name, entry.smb_info)
            if shape["hidden"] and not req.get("hidden"):
                continue
            if needle in entry.name.lower():
                shape["path"] = "/".join(parts)
                results.append(shape)
                if len(results) >= limit:
                    return {"entries": results, "truncated": True}
            if shape["dir"] and len(parts) < 12:
                queue.append(parts + [entry.name])
    return {"entries": results, "truncated": truncated}


def op_checkwrite(req, _body):
    """
    Can this account add and remove items in a folder? Used before a public
    link is allowed to grant uploads or changes. The server's "maximal
    access" answer is not enough on its own (Samba, for one, reports the
    file-system rights and ignores a share's read-only / write-list rules),
    so a hidden marker file is created and removed again whenever the answer
    does not already rule writing out. Returns {read, write, delete, known}.
    """
    kwargs = session_kwargs(req)
    folder = unc(req)
    mask = maximal_access(folder, kwargs)
    reported = rights(mask)
    if mask is not None and not reported["write"]:
        return reported
    marker = unc(req, extra=f"{TEMP_PREFIX}{uuid.uuid4().hex[:12]}.probe")
    try:
        with smbclient.open_file(marker, mode="xb", **kwargs) as handle:
            handle.write(b"")
    except Exception as exc:  # noqa: BLE001
        mapped = translate(exc)
        if mapped.code == "ACCESS_DENIED" or mapped.ntstatus == 0xC00000A2:  # denied, or a write-protected share
            return {"read": True, "write": False, "delete": bool(reported["delete"]) if mask is not None else False, "known": True}
        raise mapped from exc
    try:
        smbclient.remove(marker, **kwargs)
        removable = True
    except Exception:  # noqa: BLE001 - a hidden leftover is harmless
        removable = False
    return {"read": True, "write": True, "delete": removable and bool(reported["delete"]), "known": True}


def op_volume(req, _body):
    kwargs = session_kwargs(req)
    volume = smbclient.stat_volume(unc(req), **kwargs)
    return {"total": volume.total_size, "free": volume.caller_available_size}


def op_logout(req, _body):
    drop_pool(req.get("server") or {}, req.get("cred") or {})
    return {"ok": True}


JSON_OPS = {
    "auth": op_auth,
    "probe": op_probe,
    "shares": op_shares,
    "list": op_list,
    "stat": op_stat,
    "mkdir": op_mkdir,
    "rename": op_rename,
    "move": op_move,
    "checkwrite": op_checkwrite,
    "delete": op_delete,
    "search": op_search,
    "volume": op_volume,
    "logout": op_logout,
}


# ── HTTP plumbing ───────────────────────────────────────────────────────────


class Handler(BaseHTTPRequestHandler):
    server_version = "smbgate/1"
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *args):  # quiet; Node logs what matters
        return

    def address_string(self):
        return "unix"

    def fail(self, error):
        body = json.dumps({"code": error.code, "error": str(error)[:500], "ntstatus": error.ntstatus}).encode()
        try:
            self.send_response(error.status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception:  # noqa: BLE001 - client went away
            pass

    def ok(self, payload):
        body = json.dumps(payload, default=str).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def params(self):
        if not KEY or not hmac.compare_digest(self.headers.get("X-Gate-Key", ""), KEY):
            raise GateError(403, "GATE_FORBIDDEN", "Bad key")
        raw = self.headers.get("X-Gate", "")
        try:
            return json.loads(base64.b64decode(raw).decode("utf-8")) if raw else {}
        except Exception as exc:  # noqa: BLE001
            raise GateError(400, "BAD_REQUEST", "Bad parameters") from exc

    def do_GET(self):
        if self.path == "/health":
            self.ok({"ok": True, "pools": len(POOLS)})
            return
        self.fail(GateError(404, "NOT_FOUND", "Unknown"))

    def do_POST(self):
        op = self.path.strip("/")
        try:
            req = self.params()
            if op in JSON_OPS:
                length = int(self.headers.get("Content-Length") or 0)
                if length:
                    self.rfile.read(length)
                self.ok(JSON_OPS[op](req, None))
            elif op == "mkdirs":
                length = int(self.headers.get("Content-Length") or 0)
                if length > 4 * 1024 * 1024:
                    raise GateError(413, "TOO_LARGE", "Folder list too large")
                try:
                    body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
                except Exception as exc:  # noqa: BLE001
                    raise GateError(400, "BAD_REQUEST", "Bad folder list") from exc
                self.ok(op_mkdirs(req, body))
            elif op == "read":
                self.op_read(req)
            elif op == "write":
                self.op_write(req)
            elif op == "zip":
                self.op_zip(req)
            elif op == "thumb":
                self.op_thumb(req)
            else:
                raise GateError(404, "NOT_FOUND", "Unknown operation")
        except Exception as exc:  # noqa: BLE001 - everything becomes a coded error
            self.fail(translate(exc))

    # Streaming file read with an optional byte range.
    def op_read(self, req):
        kwargs = session_kwargs(req)
        target = unc(req)
        parts = clean_parts(req.get("path"))
        st = smbclient.stat(target, **kwargs)
        shape = stat_shape(parts[-1] if parts else "", st)
        if shape["dir"]:
            raise GateError(400, "IS_A_FOLDER", "Is a folder")
        size = shape["size"]
        start = int(req.get("start") or 0)
        end = req.get("end")
        end = size - 1 if end is None else min(int(end), size - 1)
        if start > end and size:
            raise GateError(416, "RANGE", "Bad range")
        length = max(0, end - start + 1) if size else 0
        # Others may keep the file open (Word, Excel): share read/write so we can still read it.
        with smbclient.open_file(target, mode="rb", share_access="rw", **kwargs) as handle:
            if start:
                handle.seek(start)
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(length))
            self.send_header("X-Size", str(size))
            self.send_header("X-Mtime", str(shape["mtime"] or ""))
            self.end_headers()
            remaining = length
            while remaining > 0:
                chunk = handle.read(min(CHUNK, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    # Upload: the body goes to a hidden temporary file that is renamed at the end,
    # so a broken upload never leaves a half-written document behind.
    def op_write(self, req):
        kwargs = session_kwargs(req)
        folder = unc(req)
        name = clean_name(req.get("name"))
        conflict = req.get("conflict") or "rename"
        length = int(self.headers.get("Content-Length") or 0)
        target_name = name
        exists = smbclient.path.exists(unc(req, extra=name), **kwargs)
        if exists:
            if conflict == "fail":
                raise GateError(409, "EXISTS", "Exists")
            if conflict == "rename":
                # Public-link visitors get "name (1).ext"; the drive itself keeps "name (2).ext".
                target_name = free_name(folder, name, kwargs, 1 if req.get("renameFrom") == 1 else 2)
        temp = unc(req, extra=f"{TEMP_PREFIX}{uuid.uuid4().hex[:12]}.tmp")
        written = 0
        try:
            with smbclient.open_file(temp, mode="xb", **kwargs) as handle:
                # A stalled upload (the portal lost its browser without telling us)
                # must not hold this thread and the temporary file forever. The
                # limit is per read, so slow but moving uploads are not affected.
                self.connection.settimeout(BODY_IDLE_TIMEOUT)
                try:
                    while written < length:
                        try:
                            chunk = self.rfile.read(min(CHUNK, length - written))
                        except (socket.timeout, TimeoutError) as exc:
                            # The rest of the body may still arrive: never reuse this connection.
                            self.close_connection = True
                            raise GateError(400, "UPLOAD_ABORTED", "Upload stalled") from exc
                        if not chunk:
                            self.close_connection = True
                            raise GateError(400, "UPLOAD_ABORTED", "Upload interrupted")
                        handle.write(chunk)
                        written += len(chunk)
                finally:
                    self.connection.settimeout(None)
            target = unc(req, extra=target_name)
            if exists and conflict == "replace":
                swap_into(temp, target, folder, kwargs)
            else:
                smbclient.rename(temp, target, **kwargs)
        except Exception:
            try:
                smbclient.remove(temp, **kwargs)
            except Exception:  # noqa: BLE001
                pass
            raise
        self.ok({"entry": stat_shape(target_name, smbclient.stat(unc(req, extra=target_name), **kwargs)), "replaced": exists and conflict == "replace"})

    # A folder (or a selection) as a ZIP stream. Unreadable files are skipped and listed.
    def op_zip(self, req):
        kwargs = session_kwargs(req)
        items = req.get("items") or [req.get("path")]
        max_bytes = int(req.get("maxBytes") or 4 * 1024**3)
        roots = []
        for item in items:
            parts = clean_parts(item)
            roots.append((parts, unc(req, path=item)))
        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Connection", "close")
        self.end_headers()

        class Sink(io.RawIOBase):
            def __init__(self, out):
                self.out = out
                self.pos = 0

            def writable(self):
                return True

            def write(self, data):
                self.out.write(data)
                self.pos += len(data)
                return len(data)

            def tell(self):
                return self.pos

        total = 0
        skipped = []
        with zipfile.ZipFile(Sink(self.wfile), mode="w", compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as archive:
            stack = []
            for parts, path in roots:
                label = parts[-1] if parts else (req.get("label") or "share")
                stack.append((label, path))
            while stack:
                arc, path = stack.pop()
                try:
                    entries = list(smbclient.scandir(path, **kwargs)) if smbclient.path.isdir(path, **kwargs) else None
                except Exception:  # noqa: BLE001
                    skipped.append(arc)
                    continue
                if entries is None:
                    entries = [None]
                for entry in entries:
                    if entry is None:
                        file_arc, file_path, info = arc, path, None
                    else:
                        if entry.name in (".", ".."):
                            continue
                        shape = entry_shape(entry.name, entry.smb_info)
                        if shape["name"].startswith("~$"):
                            continue
                        if shape["dir"]:
                            stack.append((f"{arc}/{entry.name}", f"{path}\\{entry.name}"))
                            archive.writestr(zipfile.ZipInfo(f"{arc}/{entry.name}/"), b"")
                            continue
                        file_arc, file_path, info = f"{arc}/{entry.name}", f"{path}\\{entry.name}", shape
                    try:
                        size = info["size"] if info else smbclient.stat(file_path, **kwargs).st_size
                        if total + size > max_bytes:
                            skipped.append(file_arc)
                            continue
                        mtime = time.localtime(info["mtime"]) if info and info["mtime"] else time.localtime()
                        zinfo = zipfile.ZipInfo(file_arc, date_time=tuple(max(1980, mtime[0]) if i == 0 else v for i, v in enumerate(mtime[:6])))
                        zinfo.compress_type = zipfile.ZIP_DEFLATED
                        with smbclient.open_file(file_path, mode="rb", share_access="rw", **kwargs) as source, archive.open(zinfo, "w", force_zip64=size > 2**31) as dest:
                            while True:
                                chunk = source.read(CHUNK)
                                if not chunk:
                                    break
                                dest.write(chunk)
                        total += size
                    except Exception:  # noqa: BLE001
                        skipped.append(file_arc)
            if skipped:
                archive.writestr("_skipped.txt", "\n".join(skipped))

    def op_thumb(self, req):
        kwargs = session_kwargs(req)
        target = unc(req)
        size = max(64, min(int(req.get("size") or 320), 1024))
        st = smbclient.stat(target, **kwargs)
        if st.st_size > 60 * 1024 * 1024:
            raise GateError(413, "TOO_LARGE", "Too large for a thumbnail")
        with smbclient.open_file(target, mode="rb", share_access="rw", **kwargs) as handle:
            data = handle.read()
        try:
            from PIL import Image, ImageOps

            image = Image.open(io.BytesIO(data))
            image = ImageOps.exif_transpose(image)
            image.thumbnail((size, size))
            if image.mode not in ("RGB", "L"):
                background = Image.new("RGB", image.size, (255, 255, 255))
                background.paste(image, mask=image.convert("RGBA").split()[-1])
                image = background
            out = io.BytesIO()
            image.save(out, "JPEG", quality=82, optimize=True)
        except Exception as exc:  # noqa: BLE001
            raise GateError(415, "NO_THUMBNAIL", "Not an image") from exc
        body = out.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


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
        self.server_name = "smbgate"
        self.server_port = 0

    def get_request(self):
        request, _ = self.socket.accept()
        return request, ("unix", 0)


def main():
    if len(sys.argv) < 2:
        print("usage: smbgate.py <socket>", file=sys.stderr)
        sys.exit(2)
    if not KEY:
        print("SMBGATE_KEY is required", file=sys.stderr)
        sys.exit(2)
    dc = os.environ.get("SMBGATE_DC")
    if dc:
        smbclient.ClientConfig(domain_controller=dc)
    threading.Thread(target=reaper, daemon=True).start()
    server = UnixHTTPServer(sys.argv[1], Handler)
    print(f"smbgate ready on {sys.argv[1]}", flush=True)

    # Exit with the parent: stdin closes when Node goes away.
    def watch_parent():
        try:
            sys.stdin.read()
        finally:
            os._exit(0)

    threading.Thread(target=watch_parent, daemon=True).start()
    server.serve_forever()


if __name__ == "__main__":
    main()
