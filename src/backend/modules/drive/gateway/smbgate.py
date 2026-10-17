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
from smbprotocol.file_info import FileAttributes, InfoType
from smbprotocol.open import (
    CreateDisposition,
    FilePipePrinterAccessMask,
    ImpersonationLevel,
    Open,
    ShareAccess,
    SMB2QueryInfoRequest,
    SMB2QueryInfoResponse,
    SMB2SetInfoRequest,
)

import ntacl

KEY = os.environ.get("SMBGATE_KEY", "")
IDLE_SECONDS = int(os.environ.get("SMBGATE_IDLE", "300"))
# Sessions are renewed after this age so AD group changes apply (like a new logon).
MAX_AGE_SECONDS = int(os.environ.get("SMBGATE_MAX_AGE", "900"))
CHUNK = 1024 * 1024
# Parallel SMB read calls (stat, open, one chunk read, close) per SMB session.
# Phones open a PDF with a burst of range requests; past the server's SMB
# credit grant smbprotocol fails them with "Request requires N credits but
# only 0 credits are available". The slot covers one SMB call, never the
# write of a chunk to the client, so slow clients don't block others and a
# pool shared by many users (service account, public links) streams any
# number of files at once: they just take turns on the wire.
READS_PER_POOL = max(1, int(os.environ.get("SMBGATE_READS", "4")))
READ_WAIT_SECONDS = 30
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
    0xC0000061: (403, "ACCESS_DENIED"),  # privilege not held (e.g. taking ownership)
    0xC0000077: (400, "BAD_ACL"),
    0xC0000078: (400, "BAD_ACL"),
    0xC0000079: (400, "BAD_ACL"),
    0xC000005A: (400, "INVALID_OWNER"),
}


class GateError(Exception):
    def __init__(self, status, code, message="", ntstatus=None):
        super().__init__(message or code)
        self.status = status
        self.code = code
        self.ntstatus = ntstatus


def is_credit_exhaustion(text):
    """smbprotocol's "Request requires N credits but only M credits are available"."""
    text = str(text or "").lower()
    return "credits" in text and "available" in text


def translate(exc):
    """Maps any SMB / network failure to (http status, code, message)."""
    if isinstance(exc, GateError):
        return exc
    if isinstance(exc, ntacl.AclError):
        return GateError(getattr(exc, "status", 400) or 400, exc.code, str(exc))
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
    if isinstance(exc, SMBException) and is_credit_exhaustion(text):
        # The session is momentarily out of SMB credits: busy, not broken.
        return GateError(503, "SMB_BUSY", text)
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
        # Long operations (acl_propagate) that hold the sessions: the reaper
        # leaves the pool alone while > 0 (see hold_pool).
        self.active = 0
        # Bounds parallel streaming reads on these sessions (see READS_PER_POOL).
        self.reads = threading.BoundedSemaphore(READS_PER_POOL)

    def touch(self):
        self.used = time.monotonic()

    def busy(self):
        return self.active > 0


class hold_pool:
    """`with hold_pool(pool):` keeps the pool (and its SMB sessions) from being reaped."""

    def __init__(self, pool):
        self.pool = pool

    def __enter__(self):
        with POOLS_LOCK:
            self.pool.active += 1
            self.pool.touch()
        return self.pool

    def __exit__(self, *_exc):
        with POOLS_LOCK:
            self.pool.active = max(0, self.pool.active - 1)
            self.pool.touch()
        return False


class read_slot:
    """`with read_slot(pool):` one SMB read call; 503 SMB_BUSY after READ_WAIT_SECONDS."""

    def __init__(self, pool):
        self.pool = pool

    def __enter__(self):
        if not self.pool.reads.acquire(timeout=READ_WAIT_SECONDS):
            raise GateError(503, "SMB_BUSY", "Too many parallel reads on this file server session")
        return self.pool

    def __exit__(self, *_exc):
        self.pool.reads.release()
        return False


def close_quietly(handle, slot):
    """Closes a read handle inside a slot; a busy pool or a dead session must not leak an error."""
    try:
        with slot():
            handle.close()
    except GateError:
        try:
            handle.close()  # no slot in time: close anyway rather than leak the handle
        except Exception:  # noqa: BLE001
            pass
    except Exception:  # noqa: BLE001 - the session is gone; the server drops the handle
        pass


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
        reap_once(time.monotonic())


def reap_once(now):
    """Closes idle pools and expired retired ones; pools held by a running walk stay."""
    with POOLS_LOCK:
        stale = [key for key, pool in POOLS.items() if now - pool.used > IDLE_SECONDS and not pool.busy()]
        dropped = [POOLS.pop(key) for key in stale]
        expired = [pool for pool in RETIRED if now - pool.created > MAX_AGE_SECONDS + 3600 and not pool.busy()]
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
        if pool.busy():
            # A propagation still walks on these sessions: the reaper closes them after it ends.
            RETIRED.append(pool)
            return
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
    return session(req)[0]


def session(req):
    """(smbclient kwargs, pool) for the request's server + credential."""
    server = req.get("server") or {}
    cred = req.get("cred") or {}
    pool = pool_for(server, cred)
    pool.touch()
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
    return kwargs, pool


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


# ── NTFS permissions (security descriptors) ────────────────────────────────
# Read: open with READ_CONTROL, SMB2 QUERY_INFO (SECURITY, OWNER|GROUP|DACL).
# Write: open with WRITE_DAC (+ WRITE_OWNER when the owner changes), re-read on
# the same handle and refuse with STALE when the descriptor is not the one the
# caller saw, then SET_INFO with DACL (+ OWNER) only. The SACL is never touched.
# The servers do not propagate inheritance over SMB: acl_propagate does it.

READ_CONTROL = 0x00020000
WRITE_DAC = 0x00040000
WRITE_OWNER = 0x00080000
SD_INFO = ntacl.OWNER_INFO | ntacl.GROUP_INFO | ntacl.DACL_INFO
REPARSE = FileAttributes.FILE_ATTRIBUTE_REPARSE_POINT
SD_BUFFER = 65536


def sd_open(target, kwargs, access):
    tree, fd_path = _pool.get_smb_tree(target, **kwargs)
    handle = Open(tree, fd_path)
    handle.create(
        ImpersonationLevel.Impersonation,
        access,
        0,
        ShareAccess.FILE_SHARE_READ | ShareAccess.FILE_SHARE_WRITE | ShareAccess.FILE_SHARE_DELETE,
        CreateDisposition.FILE_OPEN,
        0,
    )
    return handle


def sd_is_dir(handle):
    attrs = getattr(handle, "file_attributes", None)
    return None if attrs is None else bool(int(attrs) & DIRECTORY)


def sd_query(handle, info=SD_INFO):
    request = SMB2QueryInfoRequest()
    request["info_type"] = InfoType.SMB2_0_INFO_SECURITY
    request["output_buffer_length"] = SD_BUFFER
    request["additional_information"] = info
    request["file_id"] = handle.file_id
    sent = handle.connection.send(request, handle.tree_connect.session.session_id, handle.tree_connect.tree_connect_id)
    response = handle.connection.receive(sent)
    parsed = SMB2QueryInfoResponse()
    parsed.unpack(response["data"].get_value())
    return bytes(parsed["buffer"].get_value())


def sd_set(handle, raw, info):
    request = SMB2SetInfoRequest()
    request["info_type"] = InfoType.SMB2_0_INFO_SECURITY
    request["additional_information"] = info
    request["file_id"] = handle.file_id
    request["buffer"] = raw
    sent = handle.connection.send(request, handle.tree_connect.session.session_id, handle.tree_connect.tree_connect_id)
    handle.connection.receive(sent)


def sd_read(target, kwargs):
    handle = sd_open(target, kwargs, READ_CONTROL)
    try:
        return sd_query(handle), sd_is_dir(handle)
    finally:
        handle.close()


def acl_payload(raw, is_dir, path):
    out = ntacl.sd_json(raw, is_dir)
    out["path"] = path
    return out


def acl_aces(value):
    """Explicit ACEs from the caller: [{type allow|deny|other, sid, mask, flags}] without INHERITED."""
    if not isinstance(value, list) or len(value) > 1000:
        raise GateError(400, "BAD_ACL", "Bad ACE list")
    out = []
    for item in value:
        if not isinstance(item, dict):
            raise GateError(400, "BAD_ACL", "Bad ACE")
        flags = ntacl.flags_from(item.get("flags", 0))
        if flags & ntacl.ID:
            raise GateError(400, "BAD_ACL", "Inherited ACEs cannot be written as explicit")
        if item.get("type") == "other":
            out.append({"type": "other", "aceType": int(item["aceType"]), "flags": flags, "raw": str(item.get("raw") or "")})
        elif item.get("type") in ("allow", "deny"):
            mask = int(item.get("mask") or 0)
            if not mask:
                raise GateError(400, "BAD_ACL", "Empty access mask")
            out.append(ntacl.ace(item["type"], item.get("sid"), mask, flags))
        else:
            raise GateError(400, "BAD_ACL", "Unknown ACE type")
    return out


def write_sd(req, body, compose):
    """
    Shared write path of acl_set / acl_restore. `compose(current, is_dir)`
    returns (new dacl aces, control, owner or None). Returns the previous
    descriptor (undo) and the new state. With body.dryRun nothing is written
    (and only READ_CONTROL is needed): "before" and the predicted "acl" come
    back for the confirmation screen and the guards.
    """
    kwargs = session_kwargs(req)
    target = unc(req)
    path = "/".join(clean_parts(req.get("path")))
    dry = bool(body.get("dryRun"))
    wanted_owner = ntacl.normalize_sid(body["owner"]) if body.get("owner") else None
    owner_change = False
    if wanted_owner and not dry:
        # WRITE_OWNER only when the owner really changes: people with just
        # "Change permissions" can still restore a descriptor with the same owner.
        owner_change = wanted_owner != ntacl.parse_sd(sd_read(target, kwargs)[0])["owner"]
    access = READ_CONTROL if dry else READ_CONTROL | WRITE_DAC | (WRITE_OWNER if owner_change else 0)
    handle = sd_open(target, kwargs, access)
    try:
        raw = sd_query(handle)
        expected = body.get("revision")
        if expected and expected != ntacl.revision_of(raw):
            raise GateError(409, "STALE", "The permissions changed since they were read")
        current = ntacl.parse_sd(raw)
        is_dir = sd_is_dir(handle)
        aces, control, owner = compose(current, is_dir)
        info = ntacl.DACL_INFO
        if owner and owner != current["owner"]:
            if not dry and not owner_change:
                raise GateError(409, "STALE", "The owner changed since it was read")
            info |= ntacl.OWNER_INFO
        else:
            owner = None
        # SYSTEM / Administrators keep their access, never an empty DACL (also
        # for restores: a saved descriptor is written back only when it passes).
        problems = ntacl.guard_problems(current["dacl"], aces, is_dir)
        if dry:
            predicted = ntacl.build_sd(owner=owner or current["owner"], group=current["group"], dacl=aces, control=control)
        else:
            ntacl.refuse_unsafe(problems)
            sd_set(handle, ntacl.build_sd(owner=owner, dacl=aces, control=control), info)
            after = sd_query(handle)
    finally:
        handle.close()
    previous = {"sd": base64.b64encode(raw).decode("ascii"), "sddl": ntacl.sd_to_sddl(raw), "revision": ntacl.revision_of(raw)}
    if dry:
        shape = acl_payload(predicted, is_dir, path)
        shape["revision"] = None
        return {"dryRun": True, "previous": previous, "before": acl_payload(raw, is_dir, path), "acl": shape, "guard": problems}
    return {"previous": previous, "acl": acl_payload(after, is_dir, path)}


def op_acl_get(req, _body):
    """{path} -> owner, group, control flags, ACEs, SDDL, base64 descriptor, revision token."""
    kwargs = session_kwargs(req)
    raw, is_dir = sd_read(unc(req), kwargs)
    return acl_payload(raw, is_dir, "/".join(clean_parts(req.get("path"))))


def inherited_part(req, current, is_dir, inherit, owner=None, fallback=None):
    """
    The inherited ACEs of a DACL that is not protected: the current ones
    ("keep"), or recomputed from the parent folder ("parent", and with "auto"
    when the folder is protected now). At the share root there is no parent:
    `fallback` when given, else NO_PARENT.
    """
    was_protected = bool(current["control"] & ntacl.SE_DACL_PROTECTED)
    if inherit == "parent" or (inherit == "auto" and was_protected):
        parts = clean_parts(req.get("path"))
        if not parts:
            if fallback is not None:
                return list(fallback)
            raise GateError(409, "NO_PARENT", "The share root has no parent folder to inherit from")
        parent_raw, _ = sd_read(unc(req, path="/".join(parts[:-1])), session_kwargs(req))
        parent = ntacl.parse_sd(parent_raw)
        return ntacl.inherit_aces(parent["dacl"] or [], bool(is_dir), owner or current["owner"], current["group"])
    return [e for e in (current["dacl"] or []) if e.get("flags", 0) & ntacl.ID]


def op_acl_set(req, body):
    """
    body: {revision, aces: explicit ACEs, protected: bool, owner?: sid,
           inherit?: "auto" | "keep" | "parent"}
    The inherited part is not taken from the caller: with protection on there
    is none; otherwise the current inherited ACEs are kept, or recomputed from
    the parent folder ("parent", and always when protection is turned off).
    """
    body = body or {}
    explicit = acl_aces(body.get("aces"))
    protected = bool(body.get("protected"))
    inherit = body.get("inherit") or "auto"
    owner = ntacl.normalize_sid(body["owner"]) if body.get("owner") else None

    def compose(current, is_dir):
        inherited = [] if protected else inherited_part(req, current, is_dir, inherit, owner)
        control = ntacl.SE_DACL_AUTO_INHERITED | (ntacl.SE_DACL_PROTECTED if protected else 0)
        return ntacl.canonical(explicit) + inherited, control, owner

    return write_sd(req, body, compose)


def op_acl_restore(req, body):
    """
    body: {sd: base64 | sddl: text, revision?: expected current revision, owner?: bool,
           inherit?: "auto" | "keep" | "parent"}
    Writes the DACL (+ owner) of the blob back. A protected saved DACL is
    written as it was. One that inherits gets its explicit entries and
    protection back, while the inherited part is the folder's current one
    (or recomputed from the parent, as for acl_set): the saved inherited copies
    may be out of date (the parent changed and was propagated since).
    """
    body = body or {}
    inherit = body.get("inherit") or "auto"
    if body.get("sd"):
        try:
            blob = base64.b64decode(str(body["sd"]), validate=True)
        except Exception as exc:  # noqa: BLE001
            raise GateError(400, "BAD_ACL", "Bad descriptor") from exc
        saved = ntacl.parse_sd(blob)
    elif body.get("sddl"):
        saved, _ = ntacl.sddl_to_sd(body["sddl"])
    else:
        raise GateError(400, "BAD_ACL", "Nothing to restore")
    if saved["dacl"] is None:
        raise GateError(400, "BAD_ACL", "The saved descriptor has no DACL")
    restore_owner = bool(body.get("owner")) and saved.get("owner")
    write_body = dict(body, owner=saved["owner"] if restore_owner else None)

    def compose(current, is_dir):
        control = saved["control"] & (ntacl.SE_DACL_PROTECTED | ntacl.SE_DACL_AUTO_INHERITED | ntacl.SE_DACL_AUTO_INHERIT_REQ)
        owner = saved["owner"] if restore_owner else None
        if control & ntacl.SE_DACL_PROTECTED:
            return saved["dacl"], control, owner
        explicit = [e for e in saved["dacl"] if not e.get("flags", 0) & ntacl.ID]
        saved_inherited = [e for e in saved["dacl"] if e.get("flags", 0) & ntacl.ID]
        return explicit + inherited_part(req, current, is_dir, inherit, owner, fallback=saved_inherited), control, owner

    return write_sd(req, write_body, compose)


class SmbTree:
    """ntacl.Propagation adapter over one SMB session."""

    def __init__(self, req, kwargs, pool=None):
        self.req = req
        self.kwargs = kwargs
        self.pool = pool

    def touch(self):
        if self.pool is not None:
            self.pool.touch()

    def unc(self, parts):
        return unc(self.req, path="/".join(parts))

    def read(self, parts):
        self.touch()
        return sd_read(self.unc(parts), self.kwargs)

    def write(self, parts, raw):
        self.touch()
        handle = sd_open(self.unc(parts), self.kwargs, WRITE_DAC)
        try:
            sd_set(handle, raw, ntacl.DACL_INFO)
        finally:
            handle.close()

    def list(self, parts):
        self.touch()
        out = []
        for entry in smbclient.scandir(self.unc(parts), **self.kwargs):
            if entry.name in (".", ".."):
                continue
            attrs = int(entry.smb_info.file_attributes)
            out.append((entry.name, bool(attrs & DIRECTORY), bool(attrs & REPARSE)))
        return out

    def classify(self, exc):
        mapped = translate(exc)
        return mapped.code, mapped.status == 401 or mapped.code in ("SERVER_UNREACHABLE", "SHARE_NOT_FOUND", "GATE_ERROR")


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
    "acl_get": op_acl_get,
}

# Operations with a JSON request body (ACE lists and descriptors do not fit a header).
BODY_OPS = {
    "mkdirs": op_mkdirs,
    "acl_set": op_acl_set,
    "acl_restore": op_acl_restore,
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
            elif op in BODY_OPS:
                self.ok(BODY_OPS[op](req, self.json_body()))
            elif op == "acl_propagate":
                self.op_acl_propagate(req, self.json_body())
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

    def json_body(self, limit=4 * 1024 * 1024):
        length = int(self.headers.get("Content-Length") or 0)
        if length > limit:
            raise GateError(413, "TOO_LARGE", "Request body too large")
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except Exception as exc:  # noqa: BLE001
            raise GateError(400, "BAD_REQUEST", "Bad request body") from exc
        return body if isinstance(body, dict) else {}

    # "Replace all child object permissions with inheritable permissions from
    # this folder": a long walk that streams NDJSON lines —
    #   {"type":"progress","path",done,changed,unchanged,failed,protected,...} (throttled)
    #   {"type":"failed","path","code","stage"}  {"type":"protected","path"}
    #   {"type":"result",...stats, marker, stopped, failedList, protectedList}
    #   {"type":"error","code","error"} when the walk had to stop (auth, server gone).
    # params: path (the source folder), mode inherit|replace, dryRun, marker
    # (resume after this share-relative path); body: {"retry": [paths]}.
    # The walk stops when Node closes the connection (cancel).
    def op_acl_propagate(self, req, body):
        kwargs, pool = session(req)
        with hold_pool(pool):
            self.propagate(req, body, kwargs, pool)

    def propagate(self, req, body, kwargs, pool):
        root = clean_parts(req.get("path"))
        marker = clean_parts(req.get("marker")) if req.get("marker") else None
        retry = [p for p in (body.get("retry") or []) if isinstance(p, str)][:5000]
        for item in retry:
            clean_parts(item)
        state = {"gone": False, "last": 0.0}

        def send(event):
            if state["gone"]:
                return
            try:
                self.wfile.write((json.dumps(event, default=str) + "\n").encode("utf-8"))
                self.wfile.flush()
            except Exception:  # noqa: BLE001 - Node went away: cancel
                state["gone"] = True

        def on_event(event):
            if event["type"] == "progress":
                now = time.monotonic()
                if now - state["last"] < 0.5:
                    return
                state["last"] = now
            send(event)

        walker = ntacl.Propagation(
            SmbTree(req, kwargs, pool),
            mode=req.get("mode") or "inherit",
            dry_run=bool(req.get("dryRun")),
            marker=marker,
            on_event=on_event,
            should_stop=lambda: state["gone"],
        )
        # Check the source before answering 200 so plain errors stay plain:
        # readable, and safe to pass down (no NULL DACL, SYSTEM and
        # Administrators get inheritable access) unless only retrying.
        source_raw, source_dir = sd_read(unc(req), kwargs)
        if not retry and source_dir is not False:
            ntacl.refuse_unsafe(ntacl.source_problems(ntacl.parse_sd(source_raw)["dacl"]), "propagation")
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        try:
            result = walker.run(root, retry=retry or None)
        except Exception as exc:  # noqa: BLE001 - after the headers errors travel as a line
            mapped = translate(exc)
            send({**walker.result(), "type": "error", "code": mapped.code, "error": str(mapped)[:500]})
            return
        send(result)

    # Streaming file read with an optional byte range.
    def op_read(self, req):
        kwargs, pool = session(req)
        self.read_file(req, kwargs, lambda: read_slot(pool))

    def read_file(self, req, kwargs, slot):
        target = unc(req)
        parts = clean_parts(req.get("path"))
        with slot():
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
        with slot():
            handle = smbclient.open_file(target, mode="rb", share_access="rw", **kwargs)
        try:
            if start:
                handle.seek(start)  # local: only moves the offset of the next read
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(length))
            self.send_header("X-Size", str(size))
            self.send_header("X-Mtime", str(shape["mtime"] or ""))
            self.end_headers()
            remaining = length
            while remaining > 0:
                with slot():
                    chunk = handle.read(min(CHUNK, remaining))
                if not chunk:
                    break
                # Outside the slot: a slow client only holds its own stream.
                self.wfile.write(chunk)
                remaining -= len(chunk)
        except Exception:
            # Headers may be out already: never reuse this connection for an error body.
            self.close_connection = True
            raise
        finally:
            close_quietly(handle, slot)

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
