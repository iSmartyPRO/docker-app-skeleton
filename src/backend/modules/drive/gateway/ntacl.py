"""
NTFS security descriptors for the SMB gateway (no SMB code here, so it can be
unit-tested on its own).

  * parse / build of self-relative SECURITY_DESCRIPTOR blobs ([MS-DTYP] 2.4.6)
    with the DACL ACEs the file system uses (ACCESS_ALLOWED / ACCESS_DENIED);
    any other ACE type is kept byte for byte ("other") so nothing is lost;
  * SDDL rendering and parsing for the subset files need: O:, G:, D: with the
    P / AI / AR flags and (A|D;flags;rights;;;sid) ACE strings;
  * canonical ordering (explicit deny, explicit allow, inherited);
  * Windows-style inheritance: what a child folder or file receives from its
    parent's DACL (OI/CI/NP/IO, CREATOR OWNER / CREATOR GROUP substitution,
    generic rights mapping);
  * the propagation walk behind "Replace all child object permission entries
    with inheritable permission entries from this object" over an abstract
    file-system adapter.

Undo format: the exact binary descriptor (base64) is the undo blob; the SDDL
rendering is for people (it is lossless too unless an "other" ACE is present).
"""

import base64
import hashlib
import re
import struct

# ── Constants ───────────────────────────────────────────────────────────────

ACCESS_ALLOWED = 0x00
ACCESS_DENIED = 0x01

OI = 0x01  # OBJECT_INHERIT_ACE
CI = 0x02  # CONTAINER_INHERIT_ACE
NP = 0x04  # NO_PROPAGATE_INHERIT_ACE
IO = 0x08  # INHERIT_ONLY_ACE
ID = 0x10  # INHERITED_ACE
FLAG_NAMES = ((OI, "OI"), (CI, "CI"), (NP, "NP"), (IO, "IO"), (ID, "INHERITED"))

SE_OWNER_DEFAULTED = 0x0001
SE_GROUP_DEFAULTED = 0x0002
SE_DACL_PRESENT = 0x0004
SE_DACL_DEFAULTED = 0x0008
SE_SACL_PRESENT = 0x0010
SE_DACL_AUTO_INHERIT_REQ = 0x0100
SE_DACL_AUTO_INHERITED = 0x0400
SE_DACL_PROTECTED = 0x1000
SE_SELF_RELATIVE = 0x8000

OWNER_INFO = 0x1
GROUP_INFO = 0x2
DACL_INFO = 0x4

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
GENERIC_EXECUTE = 0x20000000
GENERIC_ALL = 0x10000000
GENERIC_BITS = GENERIC_READ | GENERIC_WRITE | GENERIC_EXECUTE | GENERIC_ALL
FILE_ALL = 0x1F01FF
FILE_GENERIC_READ = 0x120089
FILE_GENERIC_WRITE = 0x120116
FILE_GENERIC_EXECUTE = 0x1200A0

CREATOR_OWNER = "S-1-3-0"
CREATOR_GROUP = "S-1-3-1"


class AclError(ValueError):
    """A malformed descriptor, an unsupported SDDL construct, or a refused (unsafe) DACL."""

    def __init__(self, message, code="BAD_ACL", status=400):
        super().__init__(message)
        self.code = code
        self.status = status


# ── SIDs ────────────────────────────────────────────────────────────────────


def sid_from_bytes(data, offset=0):
    """Returns (sid string, byte length)."""
    if offset + 8 > len(data):
        raise AclError("Truncated SID")
    revision, count = data[offset], data[offset + 1]
    if revision != 1 or count > 15 or offset + 8 + 4 * count > len(data):
        raise AclError("Bad SID")
    authority = int.from_bytes(data[offset + 2 : offset + 8], "big")
    subs = struct.unpack_from("<%dI" % count, data, offset + 8)
    auth = str(authority) if authority < 2**32 else "0x%012X" % authority
    return "S-1-" + auth + "".join("-%d" % s for s in subs), 8 + 4 * count


def sid_to_bytes(sid):
    text = SDDL_SID_ALIASES.get(str(sid).upper(), str(sid)) if len(str(sid)) == 2 else str(sid)
    parts = text.strip().split("-")
    if len(parts) < 3 or parts[0].upper() != "S" or parts[1] != "1":
        raise AclError("Bad SID: %s" % sid)
    try:
        authority = int(parts[2], 16) if parts[2].lower().startswith("0x") else int(parts[2])
        subs = [int(p) for p in parts[3:]]
    except ValueError as exc:
        raise AclError("Bad SID: %s" % sid) from exc
    if len(subs) > 15 or authority >= 2**48 or any(s < 0 or s >= 2**32 for s in subs):
        raise AclError("Bad SID: %s" % sid)
    return bytes([1, len(subs)]) + authority.to_bytes(6, "big") + struct.pack("<%dI" % len(subs), *subs)


def normalize_sid(sid):
    return sid_from_bytes(sid_to_bytes(sid))[0]


# ── ACEs and ACLs ───────────────────────────────────────────────────────────


def flag_names(flags):
    return [name for bit, name in FLAG_NAMES if flags & bit]


def flags_from(value):
    """Accepts a number or a list of names (OI, CI, NP, IO, INHERITED / ID)."""
    if isinstance(value, int):
        return value & 0xFF
    out = 0
    names = {name: bit for bit, name in FLAG_NAMES}
    names["ID"] = ID
    for name in value or []:
        bit = names.get(str(name).upper())
        if bit is None:
            raise AclError("Unknown ACE flag %s" % name)
        out |= bit
    return out


def ace(kind, sid, mask, flags=0):
    return {"type": kind, "sid": normalize_sid(sid), "mask": int(mask) & 0xFFFFFFFF, "flags": flags_from(flags)}


def parse_acl(data, offset):
    if offset + 8 > len(data):
        raise AclError("Truncated ACL")
    revision, _sbz, size, count, _sbz2 = struct.unpack_from("<BBHHH", data, offset)
    end = offset + size
    if end > len(data) or size < 8:
        raise AclError("Bad ACL size")
    pos = offset + 8
    aces = []
    for _ in range(count):
        if pos + 4 > end:
            raise AclError("Truncated ACE")
        ace_type, flags, ace_size = struct.unpack_from("<BBH", data, pos)
        if ace_size < 4 or pos + ace_size > end:
            raise AclError("Bad ACE size")
        body = data[pos + 4 : pos + ace_size]
        if ace_type in (ACCESS_ALLOWED, ACCESS_DENIED) and len(body) >= 12:
            mask = struct.unpack_from("<I", body, 0)[0]
            sid, _ = sid_from_bytes(body, 4)
            aces.append({"type": "allow" if ace_type == ACCESS_ALLOWED else "deny", "sid": sid, "mask": mask, "flags": flags})
        else:
            # Kept verbatim (callback / object / audit ACEs): mask and SID best effort for display.
            entry = {"type": "other", "aceType": ace_type, "flags": flags, "raw": body.hex()}
            if len(body) >= 4:
                entry["mask"] = struct.unpack_from("<I", body, 0)[0]
            aces.append(entry)
        pos += ace_size
    return {"revision": revision, "aces": aces}


def ace_bytes(entry):
    flags = flags_from(entry.get("flags", 0))
    if entry.get("type") in ("allow", "deny"):
        body = struct.pack("<I", int(entry["mask"]) & 0xFFFFFFFF) + sid_to_bytes(entry["sid"])
        ace_type = ACCESS_ALLOWED if entry["type"] == "allow" else ACCESS_DENIED
    elif entry.get("type") == "other":
        body = bytes.fromhex(entry.get("raw") or "")
        ace_type = int(entry["aceType"]) & 0xFF
    else:
        raise AclError("Unknown ACE type %s" % entry.get("type"))
    body += b"\0" * ((4 - len(body) % 4) % 4)
    return struct.pack("<BBH", ace_type, flags, 4 + len(body)) + body


def build_acl(aces, revision=2):
    blobs = [ace_bytes(entry) for entry in aces]
    if any(entry.get("type") == "other" and 0x05 <= int(entry.get("aceType", 0)) <= 0x08 for entry in aces):
        revision = max(revision, 4)
    size = 8 + sum(len(b) for b in blobs)
    if size > 0xFFFF:
        raise AclError("The ACL is too large", "ACL_TOO_LARGE")
    return struct.pack("<BBHHH", revision, 0, size, len(blobs), 0) + b"".join(blobs)


# ── Security descriptors ────────────────────────────────────────────────────


def parse_sd(raw):
    if len(raw) < 20:
        raise AclError("Truncated security descriptor")
    revision, _sbz, control, o_owner, o_group, o_sacl, o_dacl = struct.unpack_from("<BBHIIII", raw, 0)
    if revision != 1 or not control & SE_SELF_RELATIVE:
        raise AclError("Unsupported security descriptor")
    owner = sid_from_bytes(raw, o_owner)[0] if o_owner else None
    group = sid_from_bytes(raw, o_group)[0] if o_group else None
    dacl = None
    dacl_revision = 2
    if control & SE_DACL_PRESENT and o_dacl:
        parsed = parse_acl(raw, o_dacl)
        dacl, dacl_revision = parsed["aces"], parsed["revision"]
    return {"control": control, "owner": owner, "group": group, "dacl": dacl, "daclRevision": dacl_revision}


def build_sd(owner=None, group=None, dacl=None, control=0, dacl_revision=2):
    """Self-relative descriptor. `dacl` None leaves the DACL out (not a NULL DACL)."""
    control = (control | SE_SELF_RELATIVE) & ~SE_SACL_PRESENT
    parts = []
    offset = 20
    o_owner = o_group = o_dacl = 0
    if dacl is not None:
        control |= SE_DACL_PRESENT
        blob = build_acl(dacl, dacl_revision)
        o_dacl, offset = offset, offset + len(blob)
        parts.append(blob)
    else:
        control &= ~(SE_DACL_PRESENT | SE_DACL_PROTECTED | SE_DACL_AUTO_INHERITED | SE_DACL_AUTO_INHERIT_REQ)
    if owner:
        blob = sid_to_bytes(owner)
        o_owner, offset = offset, offset + len(blob)
        parts.append(blob)
    if group:
        blob = sid_to_bytes(group)
        o_group, offset = offset, offset + len(blob)
        parts.append(blob)
    return struct.pack("<BBHIIII", 1, 0, control, o_owner, o_group, 0, o_dacl) + b"".join(parts)


def revision_of(raw):
    """Stale-write token: a hash of the descriptor exactly as the server returned it."""
    return hashlib.sha256(raw).hexdigest()[:32]


def ace_json(entry):
    out = dict(entry)
    out["flagNames"] = flag_names(entry.get("flags", 0))
    out["inherited"] = bool(entry.get("flags", 0) & ID)
    return out


def sd_json(raw, is_dir=None):
    sd = parse_sd(raw)
    aces = sd["dacl"]
    return {
        "owner": sd["owner"],
        "group": sd["group"],
        "control": sd["control"],
        "protected": bool(sd["control"] & SE_DACL_PROTECTED),
        "autoInherited": bool(sd["control"] & SE_DACL_AUTO_INHERITED),
        "nullDacl": aces is None,
        "aces": [ace_json(entry) for entry in (aces or [])],
        "canonical": is_canonical(aces or []),
        "sddl": sd_to_sddl(sd),
        "sd": base64.b64encode(raw).decode("ascii"),
        "revision": revision_of(raw),
        "isDir": is_dir,
    }


# ── SDDL ────────────────────────────────────────────────────────────────────

SDDL_SID_ALIASES = {
    "SY": "S-1-5-18",
    "LS": "S-1-5-19",
    "NS": "S-1-5-20",
    "BA": "S-1-5-32-544",
    "BU": "S-1-5-32-545",
    "BG": "S-1-5-32-546",
    "PU": "S-1-5-32-547",
    "AO": "S-1-5-32-548",
    "SO": "S-1-5-32-549",
    "PO": "S-1-5-32-550",
    "BO": "S-1-5-32-551",
    "RD": "S-1-5-32-555",
    "WD": "S-1-1-0",
    "AU": "S-1-5-11",
    "AN": "S-1-5-7",
    "IU": "S-1-5-4",
    "NU": "S-1-5-2",
    "SU": "S-1-5-6",
    "PS": "S-1-5-10",
    "RC": "S-1-5-12",
    "ED": "S-1-5-9",
    "CO": "S-1-3-0",
    "CG": "S-1-3-1",
    "OW": "S-1-3-4",
}
SID_TO_ALIAS = {v: k for k, v in SDDL_SID_ALIASES.items()}

RIGHT_TOKENS = {
    "GA": GENERIC_ALL,
    "GR": GENERIC_READ,
    "GW": GENERIC_WRITE,
    "GX": GENERIC_EXECUTE,
    "FA": FILE_ALL,
    "FR": FILE_GENERIC_READ,
    "FW": FILE_GENERIC_WRITE,
    "FX": FILE_GENERIC_EXECUTE,
    "SD": 0x10000,
    "RC": 0x20000,
    "WD": 0x40000,
    "WO": 0x80000,
    "CC": 0x1,
    "DC": 0x2,
    "LC": 0x4,
    "SW": 0x8,
    "RP": 0x10,
    "WP": 0x20,
    "DT": 0x40,
    "LO": 0x80,
    "CR": 0x100,
}
ACE_FLAG_TOKENS = {"OI": OI, "CI": CI, "NP": NP, "IO": IO, "ID": ID, "SA": 0x40, "FA": 0x80}


def sid_sddl(sid):
    return SID_TO_ALIAS.get(sid, sid)


def rights_sddl(mask):
    for token in ("FA", "FR", "FW", "FX"):
        if mask == RIGHT_TOKENS[token]:
            return token
    if mask and not mask & ~GENERIC_BITS:
        return "".join(t for t in ("GA", "GR", "GW", "GX") if mask & RIGHT_TOKENS[t])
    return "0x%x" % mask


def ace_sddl(entry):
    flags = "".join(t for t, bit in ACE_FLAG_TOKENS.items() if entry["flags"] & bit)
    if entry["type"] == "other":
        # Not representable in this subset; the binary blob is the authoritative copy.
        return "(?%02X;%s;%s;;;?)" % (entry["aceType"], flags, rights_sddl(entry.get("mask", 0)))
    return "(%s;%s;%s;;;%s)" % ("A" if entry["type"] == "allow" else "D", flags, rights_sddl(entry["mask"]), sid_sddl(entry["sid"]))


def sd_to_sddl(sd):
    if isinstance(sd, (bytes, bytearray)):
        sd = parse_sd(bytes(sd))
    out = ""
    if sd.get("owner"):
        out += "O:" + sid_sddl(sd["owner"])
    if sd.get("group"):
        out += "G:" + sid_sddl(sd["group"])
    control = sd.get("control", 0)
    if sd.get("dacl") is None:
        if control & SE_DACL_PRESENT:
            out += "D:NO_ACCESS_CONTROL"
        return out
    out += "D:"
    if control & SE_DACL_PROTECTED:
        out += "P"
    if control & SE_DACL_AUTO_INHERIT_REQ:
        out += "AR"
    if control & SE_DACL_AUTO_INHERITED:
        out += "AI"
    return out + "".join(ace_sddl(entry) for entry in sd["dacl"])


def parse_rights(text):
    text = text.strip()
    if not text:
        return 0
    if text.lower().startswith("0x"):
        return int(text, 16) & 0xFFFFFFFF
    if text.isdigit():
        return int(text) & 0xFFFFFFFF
    if len(text) % 2:
        raise AclError("Bad rights %s" % text)
    mask = 0
    for i in range(0, len(text), 2):
        token = text[i : i + 2].upper()
        if token not in RIGHT_TOKENS:
            raise AclError("Unsupported right %s" % token)
        mask |= RIGHT_TOKENS[token]
    return mask


def parse_ace_sddl(text):
    fields = text.split(";")
    if len(fields) != 6:
        raise AclError("Bad ACE %s" % text)
    kind, flags_text, rights, object_guid, inherit_guid, sid = fields
    if kind.upper() not in ("A", "D") or object_guid or inherit_guid:
        raise AclError("Unsupported ACE %s" % text)
    if len(flags_text) % 2:
        raise AclError("Bad ACE flags %s" % flags_text)
    flags = 0
    for i in range(0, len(flags_text), 2):
        token = flags_text[i : i + 2].upper()
        if token not in ACE_FLAG_TOKENS:
            raise AclError("Unsupported ACE flag %s" % token)
        flags |= ACE_FLAG_TOKENS[token]
    sid = SDDL_SID_ALIASES.get(sid.upper(), sid) if len(sid) == 2 else sid
    return ace("allow" if kind.upper() == "A" else "deny", sid, parse_rights(rights), flags)


def sddl_to_sd(text):
    """SDDL (O:, G:, D: subset) → (parsed dict, self-relative bytes)."""
    text = re.sub(r"\s+", "", str(text or ""))
    marks = list(re.finditer(r"([OGDS]):", text))
    if not marks or marks[0].start() != 0:
        raise AclError("Bad SDDL")
    sections = {}
    for i, mark in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        sections[mark.group(1)] = text[mark.end() : end]
    if "S" in sections:
        raise AclError("SACLs are not supported")

    def sid_of(value):
        value = SDDL_SID_ALIASES.get(value.upper(), value) if len(value) == 2 else value
        return normalize_sid(value)

    owner = sid_of(sections["O"]) if sections.get("O") else None
    group = sid_of(sections["G"]) if sections.get("G") else None
    control = 0
    dacl = None
    if "D" in sections:
        body = sections["D"]
        if body.upper() == "NO_ACCESS_CONTROL":
            raise AclError("NULL DACLs are not supported")
        head, _, rest = body.partition("(")
        rest = "(" + rest if rest or body.endswith("(") else ""
        head_upper = head.upper()
        while head_upper:
            if head_upper.startswith("P"):
                control |= SE_DACL_PROTECTED
                head_upper = head_upper[1:]
            elif head_upper.startswith("AI"):
                control |= SE_DACL_AUTO_INHERITED
                head_upper = head_upper[2:]
            elif head_upper.startswith("AR"):
                control |= SE_DACL_AUTO_INHERIT_REQ
                head_upper = head_upper[2:]
            else:
                raise AclError("Unsupported DACL flag %s" % head)
        dacl = []
        for match in re.finditer(r"\(([^()]*)\)|([^()]+)", rest):
            if match.group(2):
                raise AclError("Bad SDDL near %s" % match.group(2)[:20])
            dacl.append(parse_ace_sddl(match.group(1)))
    sd = {"owner": owner, "group": group, "dacl": dacl, "control": control | (SE_DACL_PRESENT if dacl is not None else 0)}
    return sd, build_sd(owner, group, dacl, control)


# ── Canonical order ─────────────────────────────────────────────────────────


def ace_rank(entry):
    if entry.get("flags", 0) & ID:
        return 2
    return 0 if entry.get("type") == "deny" else 1


def canonical(aces):
    """Explicit deny, explicit allow (and other explicit), inherited; stable inside each group."""
    return sorted(aces, key=ace_rank)


def is_canonical(aces):
    ranks = [ace_rank(entry) for entry in aces]
    return ranks == sorted(ranks)


def same_aces(a, b):
    key = lambda e: (e.get("type"), e.get("sid"), e.get("mask"), e.get("flags", 0), e.get("aceType"), e.get("raw"))  # noqa: E731
    return [key(x) for x in a] == [key(x) for x in b]


# ── Inheritance ─────────────────────────────────────────────────────────────


def map_generic(mask):
    out = mask & ~GENERIC_BITS
    if mask & GENERIC_ALL:
        out |= FILE_ALL
    if mask & GENERIC_READ:
        out |= FILE_GENERIC_READ
    if mask & GENERIC_WRITE:
        out |= FILE_GENERIC_WRITE
    if mask & GENERIC_EXECUTE:
        out |= FILE_GENERIC_EXECUTE
    return out


def inherit_aces(parent_aces, is_container, owner=None, group=None):
    """
    The inherited part of a child's DACL, computed from the parent's DACL the
    way Windows does it (CreatePrivateObjectSecurityEx with auto-inheritance):

      container child: CI -> effective; CI without NP also keeps OI/CI for its
                       own children; OI only (no NP) -> inherit-only OI copy;
      file child:      OI -> effective, no inheritance flags;
      NP:              stops after this child (flags dropped);
      CREATOR OWNER / CREATOR GROUP and generic rights: the effective ACE gets
                       the child's owner/group and specific rights; when the
                       ACE is also passed further down, an inherit-only copy
                       keeps the original SID and mask.
    Every resulting ACE carries INHERITED. Parent order is preserved.
    """
    out = []
    for entry in parent_aces or []:
        flags = entry.get("flags", 0)
        if is_container:
            if flags & CI:
                effective = True
                passes = None if flags & NP else flags & (OI | CI)
            elif flags & OI and not flags & NP:
                effective = False
                passes = OI
            else:
                continue
        else:
            if not flags & OI:
                continue
            effective, passes = True, None

        base = {k: v for k, v in entry.items() if k not in ("flagNames", "inherited")}
        if base.get("type") == "other":
            # No SID / generic handling for opaque ACEs: flags only.
            if effective:
                out.append(dict(base, flags=(passes or 0) | ID))
            elif passes:
                out.append(dict(base, flags=passes | IO | ID))
            continue

        sid = base["sid"]
        mask = base["mask"]
        target_sid = sid
        if sid == CREATOR_OWNER and owner:
            target_sid = owner
        elif sid == CREATOR_GROUP and group:
            target_sid = group
        special = target_sid != sid or bool(mask & GENERIC_BITS) or sid in (CREATOR_OWNER, CREATOR_GROUP)
        if effective and passes and not special:
            out.append(dict(base, flags=passes | ID))
            continue
        if effective:
            out.append(dict(base, sid=target_sid, mask=map_generic(mask), flags=ID))
        if passes:
            out.append(dict(base, sid=sid, mask=mask, flags=passes | IO | ID))
    return out


def child_dacl(parent_aces, current, is_container, mode="inherit"):
    """New DACL for a non-protected child: its explicit ACEs (none in "replace" mode) + recomputed inherited."""
    explicit = [] if mode == "replace" else [e for e in (current["dacl"] or []) if not e.get("flags", 0) & ID]
    return canonical(explicit) + inherit_aces(parent_aces, is_container, current.get("owner"), current.get("group"))


# ── Guards: SYSTEM and Administrators keep their access ─────────────────────
#
# Rights of the guarded SIDs per scope (this object, subfolders, files):
#   allow  ACEs naming the SID itself, or Everyone / Authenticated Users (both
#          are always in the token of SYSTEM and of every administrator);
#   deny   ACEs naming the SID itself or any "umbrella" group an administrator
#          may be in: Everyone, Authenticated Users, Users, Domain Users (RID 513).
# A NULL DACL grants everything (Everyone: Full Control). Membership is not
# expanded beyond that, so the check errs on the safe side for denies.

SYSTEM_SID = "S-1-5-18"
ADMINISTRATORS_SID = "S-1-5-32-544"
GUARDED_SIDS = (SYSTEM_SID, ADMINISTRATORS_SID)
EVERYONE_SID = "S-1-1-0"
AUTHENTICATED_USERS_SID = "S-1-5-11"
USERS_SID = "S-1-5-32-545"
ALLOW_UMBRELLA = (EVERYONE_SID, AUTHENTICATED_USERS_SID)
DENY_UMBRELLA = (EVERYONE_SID, AUTHENTICATED_USERS_SID, USERS_SID)
DOMAIN_USERS_RE = re.compile(r"^S-1-5-21-\d+-\d+-\d+-513$")
SCOPES = ("this", "subfolders", "files")


def is_deny_umbrella(sid):
    return sid in DENY_UMBRELLA or bool(DOMAIN_USERS_RE.match(str(sid or "")))


def ace_scopes(flags):
    out = []
    if not flags & IO:
        out.append("this")
    if flags & CI:
        out.append("subfolders")
    if flags & OI:
        out.append("files")
    return out


def guarded_rights(dacl):
    """{sid: {scope: effective mask}} for SYSTEM and Administrators. `dacl` None = NULL DACL."""
    if dacl is None:
        return {sid: {scope: FILE_ALL for scope in SCOPES} for sid in GUARDED_SIDS}
    out = {}
    for sid in GUARDED_SIDS:
        allow = dict.fromkeys(SCOPES, 0)
        deny = dict.fromkeys(SCOPES, 0)
        for entry in dacl:
            kind = entry.get("type")
            if kind not in ("allow", "deny"):
                continue
            other = entry.get("sid")
            if kind == "allow" and other != sid and other not in ALLOW_UMBRELLA:
                continue
            if kind == "deny" and other != sid and not is_deny_umbrella(other):
                continue
            mask = map_generic(int(entry.get("mask") or 0))
            target = allow if kind == "allow" else deny
            for scope in ace_scopes(entry.get("flags", 0)):
                target[scope] |= mask
        out[sid] = {scope: allow[scope] & ~deny[scope] & 0xFFFFFFFF for scope in SCOPES}
    return out


def guard_problems(before_dacl, after_dacl, is_dir=True):
    """
    Why `after_dacl` may not replace `before_dacl` (None = NULL DACL), as
    [{code, sid?, scope?, lost?}]: EMPTY_DACL (nobody would have access), or
    PROTECTED_PRINCIPAL when SYSTEM / Administrators lose any right they had
    (in any scope; for a file only the file itself counts).
    """
    if after_dacl is not None and not [e for e in after_dacl if e.get("type") in ("allow", "deny", "other")]:
        return [{"code": "EMPTY_DACL"}]
    before = guarded_rights(before_dacl)
    after = guarded_rights(after_dacl)
    scopes = SCOPES if is_dir is not False else ("this",)
    out = []
    for sid in GUARDED_SIDS:
        for scope in scopes:
            lost = before[sid][scope] & ~after[sid][scope]
            if lost:
                out.append({"code": "PROTECTED_PRINCIPAL", "sid": sid, "scope": scope, "lost": lost})
    return out


def source_problems(dacl):
    """
    Why a folder's DACL may not be propagated to its children: a NULL DACL
    (children would get empty DACLs), or no inheritable allow reaching both
    child folders and files for SYSTEM and for Administrators.
    """
    if dacl is None:
        return [{"code": "NULL_DACL"}]
    rights = guarded_rights(dacl)
    return [
        {"code": "NOT_INHERITABLE", "sid": sid, "scope": scope}
        for sid in GUARDED_SIDS
        for scope in ("subfolders", "files")
        if not rights[sid][scope]
    ]


def refuse_unsafe(problems, what="change"):
    """Raises the AclError (422) a guard problem list stands for."""
    if not problems:
        return
    codes = {p["code"] for p in problems}
    if "EMPTY_DACL" in codes:
        raise AclError("The %s would leave an empty DACL (nobody could open the object)" % what, "EMPTY_DACL", 422)
    if codes & {"NULL_DACL", "NOT_INHERITABLE"}:
        raise AclError(
            "The folder has no inheritable permissions for SYSTEM and Administrators; its children would lose their access",
            "UNSAFE_SOURCE",
            422,
        )
    raise AclError("SYSTEM and Administrators must keep their access", "PROTECTED_PRINCIPAL", 422)


# ── Propagation walk ────────────────────────────────────────────────────────


def path_key(parts):
    return [p.casefold() for p in parts]


def position(parts, marker):
    """Where `parts` sits relative to the resume marker in the walk order (pre-order, names sorted)."""
    if marker is None:
        return "after"
    a, b = path_key(parts), path_key(marker)
    if b[: len(a)] == a:
        return "ancestor"  # includes the marker itself
    for x, y in zip(a, b):
        if x != y:
            return "before" if x < y else "after"
    return "after"  # a descendant of the marker


class Propagation:
    """
    Walks the tree below `root` and rewrites every descendant's inherited ACEs.

    fs adapter:
      read(parts) -> (raw sd bytes with owner+group+dacl, is_dir)
      write(parts, raw sd bytes)         # DACL only
      list(parts) -> [(name, is_dir, is_reparse)]
      classify(exc) -> (code, fatal)     # fatal errors abort the whole walk

    Protected children (SE_DACL_PROTECTED) and their subtrees are left alone
    and listed. Per-object errors are collected; a folder that cannot be read,
    listed or written is not descended into (its children would otherwise get
    ACEs computed from a DACL that is not on disk). Reparse points (junctions)
    are updated but not followed. `marker` (the last finished path) resumes a
    stopped walk; `should_stop()` stops it between objects. A failed object
    never becomes the marker.

    Safety: the walk refuses to start (AclError UNSAFE_SOURCE, 422) when the
    source has a NULL DACL or passes no access down to SYSTEM and
    Administrators; a computed DACL that is empty, or takes access away from
    SYSTEM / Administrators, is not written (failed: EMPTY_DACL /
    PROTECTED_PRINCIPAL, stage "compute"); a retry parent or a resume
    ancestor whose DACL on disk is unsafe is skipped (failed: UNSAFE_SOURCE).
    """

    def __init__(self, fs, mode="inherit", dry_run=False, marker=None, on_event=None, should_stop=None, max_failed=1000):
        if mode not in ("inherit", "replace"):
            raise AclError("Unknown mode %s" % mode)
        self.fs = fs
        self.mode = mode
        self.dry_run = dry_run
        self.marker = list(marker) if marker else None
        self.on_event = on_event or (lambda event: None)
        self.should_stop = should_stop or (lambda: False)
        self.max_failed = max_failed
        self.stats = {"done": 0, "changed": 0, "unchanged": 0, "failed": 0, "protected": 0, "withExplicit": 0, "explicitRemoved": 0}
        self.failed = []
        self.protected = []
        self.last = None
        self.stopped = False

    def emit(self, event):
        self.on_event(event)

    def fail(self, parts, exc, stage):
        code, fatal = self.fs.classify(exc)
        if fatal:
            raise exc
        self.fail_code(parts, code, stage)

    def fail_code(self, parts, code, stage):
        """A per-object refusal of the engine itself (no exception from the file system)."""
        self.stats["failed"] += 1
        item = {"path": "/".join(parts), "code": code, "stage": stage}
        if len(self.failed) < self.max_failed:
            self.failed.append(item)
        self.emit(dict(item, type="failed"))

    def read(self, parts):
        raw, is_dir = self.fs.read(parts)
        return parse_sd(raw), is_dir

    def run(self, root, retry=None):
        """Propagates below `root`; with `retry` (paths below root), only those objects and their subtrees."""
        root = list(root)
        if retry:
            for path in retry:
                parts = [p for p in str(path).replace("\\", "/").split("/") if p]
                if len(parts) <= len(root) or path_key(parts[: len(root)]) != path_key(root):
                    continue
                try:
                    # The parent's DACL as it is on disk (protected or not, it passes its inheritable ACEs down).
                    parent, _ = self.read(parts[:-1])
                except Exception as exc:  # noqa: BLE001
                    self.fail(parts, exc, "read")
                    continue
                if source_problems(parent["dacl"]):
                    self.fail_code(parts, "UNSAFE_SOURCE", "read")
                    continue
                try:
                    _, is_dir = self.fs.read(parts)
                except Exception as exc:  # noqa: BLE001
                    self.fail(parts, exc, "read")
                    continue
                self.walk([(parts, bool(is_dir), False, parent["dacl"])], ignore_marker=True)
                if self.stopped:
                    break
            return self.result()
        source, is_dir = self.read(root)
        if not is_dir:
            return self.result()
        refuse_unsafe(source_problems(source["dacl"]), "propagation")
        self.walk(self.children(root, source["dacl"]) or [])
        return self.result()

    def children(self, parts, aces):
        try:
            entries = self.fs.list(parts)
        except Exception as exc:  # noqa: BLE001
            self.fail(parts, exc, "list")
            return None
        entries = sorted(entries, key=lambda e: e[0].casefold())
        return [(parts + [name], is_dir, reparse, aces) for name, is_dir, reparse in entries]

    def walk(self, items, ignore_marker=False):
        stack = list(reversed(items))
        while stack:
            if self.should_stop():
                self.stopped = True
                return
            parts, is_dir, reparse, parent_aces = stack.pop()
            where = "after" if ignore_marker else position(parts, self.marker)
            if where == "before":
                continue
            if where == "ancestor":
                # Finished in an earlier run: its DACL on disk is the parent for what follows.
                if is_dir and not reparse:
                    try:
                        current, _ = self.read(parts)
                    except Exception as exc:  # noqa: BLE001
                        self.fail(parts, exc, "read")
                        continue
                    if not current["control"] & SE_DACL_PROTECTED:
                        if source_problems(current["dacl"]):
                            self.fail_code(parts, "UNSAFE_SOURCE", "read")
                            continue
                        kids = self.children(parts, current["dacl"])
                        stack.extend(reversed(kids or []))
                continue
            status, new_aces = self.process(parts, is_dir, parent_aces)
            if status != "failed":
                # A failed object does not advance the resume marker: a resumed
                # walk processes it (and its subtree) again instead of treating
                # its stale on-disk DACL as finished.
                self.last = parts
            if new_aces is not None and is_dir and not reparse:
                kids = self.children(parts, new_aces)
                stack.extend(reversed(kids or []))

    def process(self, parts, is_dir, parent_aces):
        path = "/".join(parts)
        try:
            current, actual_dir = self.read(parts)
        except Exception as exc:  # noqa: BLE001
            self.fail(parts, exc, "read")
            return "failed", None
        is_dir = actual_dir if actual_dir is not None else is_dir
        if current["control"] & SE_DACL_PROTECTED:
            self.stats["protected"] += 1
            if len(self.protected) < self.max_failed:
                self.protected.append(path)
            self.emit({"type": "protected", "path": path})
            return "protected", None
        explicit = [e for e in (current["dacl"] or []) if not e.get("flags", 0) & ID]
        if explicit:
            self.stats["withExplicit"] += 1
        new_aces = child_dacl(parent_aces or [], current, is_dir, self.mode)
        problems = guard_problems(current["dacl"], new_aces, is_dir)
        if problems:
            # Never write an empty DACL or one that locks SYSTEM / Administrators out.
            self.fail_code(parts, problems[0]["code"], "compute")
            return "failed", None
        unchanged = current["dacl"] is not None and same_aces(current["dacl"], new_aces) and current["control"] & SE_DACL_AUTO_INHERITED
        if unchanged:
            self.stats["unchanged"] += 1
        else:
            if not self.dry_run:
                try:
                    self.fs.write(parts, build_sd(dacl=new_aces, control=SE_DACL_AUTO_INHERITED))
                except Exception as exc:  # noqa: BLE001
                    self.fail(parts, exc, "write")
                    return "failed", None
            self.stats["changed"] += 1
            if self.mode == "replace" and explicit:
                self.stats["explicitRemoved"] += 1
        self.stats["done"] += 1
        self.emit({"type": "progress", "path": path, **self.stats})
        return "ok", new_aces

    def result(self):
        return {
            "type": "result",
            **self.stats,
            "dryRun": self.dry_run,
            "mode": self.mode,
            "stopped": self.stopped,
            "marker": "/".join(self.last) if self.last else ("/".join(self.marker) if self.marker else None),
            "failedList": self.failed,
            "protectedList": self.protected,
        }
