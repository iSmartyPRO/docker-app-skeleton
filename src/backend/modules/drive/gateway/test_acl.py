"""Unit tests for ntacl (security descriptors, SDDL, inheritance, propagation). No SMB server needed."""

import sys
import unittest

# The gateway's __pycache__ is tracked in git: never write bytecode from a test run
# (run as: cd src/backend/modules/drive/gateway && PYTHONDONTWRITEBYTECODE=1 python3 test_acl.py).
sys.dont_write_bytecode = True

import ntacl  # noqa: E402
from ntacl import CI, ID, IO, NP, OI, SE_DACL_AUTO_INHERITED, SE_DACL_PROTECTED

SYSTEM = "S-1-5-18"
ADMINS = "S-1-5-32-544"
USERS = "S-1-5-32-545"
DOM = "S-1-5-21-1111-2222-3333"
ACCT_FULL = DOM + "-4001"
ACCT_READ = DOM + "-4002"
ALICE = DOM + "-1105"
BOB = DOM + "-1106"
MODIFY = 0x1301BF
RX = 0x1200A9


def A(sid, mask, flags=0):
    return ntacl.ace("allow", sid, mask, flags)


def D(sid, mask, flags=0):
    return ntacl.ace("deny", sid, mask, flags)


class SidTests(unittest.TestCase):
    def test_round_trip(self):
        for sid in (SYSTEM, ADMINS, "S-1-1-0", "S-1-3-0", ALICE, "S-1-5-21-3623811015-3361044348-30300820-1013"):
            raw = ntacl.sid_to_bytes(sid)
            self.assertEqual(ntacl.sid_from_bytes(raw), (sid, len(raw)))

    def test_alias_and_bad(self):
        self.assertEqual(ntacl.normalize_sid("BA"), ADMINS)
        for bad in ("", "S-1", "X-1-5", "S-1-5-abc", "S-2-5-18"):
            with self.assertRaises(ntacl.AclError):
                ntacl.sid_to_bytes(bad)


class DescriptorTests(unittest.TestCase):
    def test_build_parse_round_trip(self):
        aces = [D(BOB, 0x10000), A(SYSTEM, ntacl.FILE_ALL, OI | CI), A(ALICE, MODIFY, OI | CI | ID), A("S-1-3-0", ntacl.GENERIC_ALL, OI | CI | IO | ID)]
        raw = ntacl.build_sd(owner=ADMINS, group=SYSTEM, dacl=aces, control=SE_DACL_PROTECTED | SE_DACL_AUTO_INHERITED)
        sd = ntacl.parse_sd(raw)
        self.assertEqual(sd["owner"], ADMINS)
        self.assertEqual(sd["group"], SYSTEM)
        self.assertTrue(sd["control"] & SE_DACL_PROTECTED)
        self.assertTrue(ntacl.same_aces(sd["dacl"], aces))
        self.assertEqual(ntacl.build_sd(sd["owner"], sd["group"], sd["dacl"], sd["control"]), raw)

    def test_dacl_only_has_no_owner(self):
        raw = ntacl.build_sd(dacl=[A(SYSTEM, ntacl.FILE_ALL)])
        sd = ntacl.parse_sd(raw)
        self.assertIsNone(sd["owner"])
        self.assertIsNone(sd["group"])
        self.assertEqual(len(sd["dacl"]), 1)

    def test_other_ace_kept_verbatim(self):
        # An ACCESS_ALLOWED_CALLBACK ACE (type 9) with some application data.
        body = (0x1200A9).to_bytes(4, "little") + ntacl.sid_to_bytes(ALICE) + b"artx\x01\x02\x03\x04"
        other = {"type": "other", "aceType": 9, "flags": OI, "raw": body.hex()}
        raw = ntacl.build_sd(dacl=[A(SYSTEM, ntacl.FILE_ALL), other])
        sd = ntacl.parse_sd(raw)
        self.assertEqual(sd["dacl"][1]["type"], "other")
        self.assertEqual(sd["dacl"][1]["raw"], body.hex())
        self.assertEqual(ntacl.build_sd(dacl=sd["dacl"]), raw)

    def test_truncated(self):
        raw = ntacl.build_sd(dacl=[A(SYSTEM, ntacl.FILE_ALL)])
        with self.assertRaises(ntacl.AclError):
            ntacl.parse_sd(raw[:-3])

    def test_revision_changes_with_content(self):
        one = ntacl.build_sd(dacl=[A(SYSTEM, ntacl.FILE_ALL)])
        two = ntacl.build_sd(dacl=[A(SYSTEM, MODIFY)])
        self.assertNotEqual(ntacl.revision_of(one), ntacl.revision_of(two))
        self.assertEqual(ntacl.revision_of(one), ntacl.revision_of(bytes(one)))

    def test_json_shape(self):
        raw = ntacl.build_sd(owner=ADMINS, dacl=[A(ALICE, MODIFY, OI | CI | ID), A(SYSTEM, ntacl.FILE_ALL)], control=SE_DACL_AUTO_INHERITED)
        out = ntacl.sd_json(raw, True)
        self.assertFalse(out["canonical"])
        self.assertEqual(out["aces"][0]["flagNames"], ["OI", "CI", "INHERITED"])
        self.assertTrue(out["aces"][0]["inherited"])
        self.assertTrue(out["autoInherited"])
        self.assertEqual(len(out["revision"]), 32)


class SddlTests(unittest.TestCase):
    SAMPLE = "O:BAG:SYD:PAI(D;OICI;0x10000;;;S-1-5-21-1111-2222-3333-1106)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)" "(A;OICI;0x1301bf;;;S-1-5-21-1111-2222-3333-4001)(A;CIIO;GA;;;CO)(A;OICIID;0x1200a9;;;BU)"

    def test_parse_render_round_trip(self):
        sd, raw = ntacl.sddl_to_sd(self.SAMPLE)
        self.assertEqual(sd["owner"], ADMINS)
        self.assertEqual(ntacl.sd_to_sddl(raw), self.SAMPLE)
        parsed = ntacl.parse_sd(raw)
        self.assertTrue(parsed["control"] & SE_DACL_PROTECTED)
        self.assertEqual(parsed["dacl"][4]["mask"], ntacl.GENERIC_ALL)
        self.assertEqual(parsed["dacl"][4]["flags"], CI | IO)

    def test_tokens(self):
        self.assertEqual(ntacl.parse_rights("FA"), ntacl.FILE_ALL)
        self.assertEqual(ntacl.parse_rights("GRGX"), ntacl.GENERIC_READ | ntacl.GENERIC_EXECUTE)
        self.assertEqual(ntacl.parse_rights("0x1200a9"), RX)
        self.assertEqual(ntacl.rights_sddl(RX), "0x1200a9")
        self.assertEqual(ntacl.rights_sddl(ntacl.FILE_GENERIC_READ), "FR")

    def test_unsupported(self):
        for bad in ("D:(OA;;CC;;;BA)", "S:(AU;SA;FA;;;WD)", "D:NO_ACCESS_CONTROL", "D:X(A;;FA;;;SY)", "garbage"):
            with self.assertRaises(ntacl.AclError, msg=bad):
                ntacl.sddl_to_sd(bad)


class OrderTests(unittest.TestCase):
    def test_canonical(self):
        inh_deny = D(BOB, 1, ID)
        inh_allow = A(USERS, RX, OI | CI | ID)
        aces = [A(ALICE, MODIFY), inh_allow, D(BOB, 0x10000), inh_deny, A(SYSTEM, ntacl.FILE_ALL)]
        out = ntacl.canonical(aces)
        self.assertEqual([e["sid"] for e in out], [BOB, ALICE, SYSTEM, USERS, BOB])
        # Inherited ACEs keep their own order (parent generations).
        self.assertIs(out[3], inh_allow)
        self.assertIs(out[4], inh_deny)
        self.assertTrue(ntacl.is_canonical(out))
        self.assertFalse(ntacl.is_canonical(aces))


class InheritanceTests(unittest.TestCase):
    def test_container_and_object_flags(self):
        parent = [
            A(ACCT_FULL, MODIFY, OI | CI),  # this folder, subfolders, files
            A(ACCT_READ, RX, CI),  # this folder and subfolders (list folder)
            A(ALICE, RX, OI),  # this folder and files
            A(BOB, MODIFY, OI | CI | NP),  # one level only
            A(USERS, RX, OI | NP),  # files of the immediate folder only
            A(SYSTEM, ntacl.FILE_ALL),  # this folder only: never inherited
        ]
        folder = ntacl.inherit_aces(parent, True)
        self.assertEqual(
            [(e["sid"], e["flags"]) for e in folder],
            [(ACCT_FULL, OI | CI | ID), (ACCT_READ, CI | ID), (ALICE, OI | IO | ID), (BOB, ID)],
        )
        files = ntacl.inherit_aces(parent, False)
        self.assertEqual([(e["sid"], e["flags"]) for e in files], [(ACCT_FULL, ID), (ALICE, ID), (BOB, ID), (USERS, ID)])
        # Second generation: the inherit-only OI copy reaches files below, NP stopped BOB.
        grand_folder = ntacl.inherit_aces(folder, True)
        self.assertEqual([(e["sid"], e["flags"]) for e in grand_folder], [(ACCT_FULL, OI | CI | ID), (ACCT_READ, CI | ID), (ALICE, OI | IO | ID)])
        grand_file = ntacl.inherit_aces(folder, False)
        self.assertEqual([e["sid"] for e in grand_file], [ACCT_FULL, ALICE])

    def test_inherit_only_parent_ace(self):
        parent = [A(ACCT_FULL, MODIFY, OI | CI | IO)]  # subfolders and files only
        self.assertEqual(ntacl.inherit_aces(parent, True)[0]["flags"], OI | CI | ID)
        self.assertEqual(ntacl.inherit_aces(parent, False)[0]["flags"], ID)

    def test_creator_owner_split(self):
        parent = [A("S-1-3-0", ntacl.GENERIC_ALL, OI | CI | IO), A("S-1-3-1", ntacl.GENERIC_READ, OI | NP | IO)]
        folder = ntacl.inherit_aces(parent, True, owner=ALICE, group=USERS)
        self.assertEqual(
            [(e["sid"], e["mask"], e["flags"]) for e in folder],
            [(ALICE, ntacl.FILE_ALL, ID), ("S-1-3-0", ntacl.GENERIC_ALL, OI | CI | IO | ID)],
        )
        files = ntacl.inherit_aces(parent, False, owner=BOB, group=USERS)
        self.assertEqual(
            [(e["sid"], e["mask"], e["flags"]) for e in files],
            [(BOB, ntacl.FILE_ALL, ID), (USERS, ntacl.FILE_GENERIC_READ, ID)],
        )

    def test_generic_rights_split(self):
        folder = ntacl.inherit_aces([A(USERS, ntacl.GENERIC_READ | ntacl.GENERIC_EXECUTE, OI | CI)], True)
        self.assertEqual(
            [(e["mask"], e["flags"]) for e in folder],
            [(ntacl.FILE_GENERIC_READ | ntacl.FILE_GENERIC_EXECUTE, ID), (ntacl.GENERIC_READ | ntacl.GENERIC_EXECUTE, OI | CI | IO | ID)],
        )

    def test_child_dacl_keeps_or_replaces_explicit(self):
        current = {"dacl": [A(USERS, RX, OI | CI | ID), A(BOB, MODIFY), D(ALICE, 0x10000)], "owner": ALICE, "group": None}
        parent = [A(ACCT_FULL, MODIFY, OI | CI)]
        kept = ntacl.child_dacl(parent, current, True)
        self.assertEqual([(e["type"], e["sid"], e["flags"]) for e in kept], [("deny", ALICE, 0), ("allow", BOB, 0), ("allow", ACCT_FULL, OI | CI | ID)])
        replaced = ntacl.child_dacl(parent, current, True, "replace")
        self.assertEqual([e["sid"] for e in replaced], [ACCT_FULL])


# ── Propagation over a fake file system ─────────────────────────────────────


class Denied(Exception):
    pass


class Gone(Exception):
    pass


class FakeFs:
    def __init__(self):
        self.nodes = {}  # "a/b" -> {"dir": bool, "sd": bytes}
        self.writes = []
        self.deny_read = set()
        self.deny_write = set()
        self.gone_at = None

    def add(self, path, is_dir, aces, control=SE_DACL_AUTO_INHERITED, owner=ADMINS):
        self.nodes[path] = {"dir": is_dir, "sd": ntacl.build_sd(owner=owner, group=SYSTEM, dacl=aces, control=control)}

    def key(self, parts):
        return "/".join(parts)

    def read(self, parts):
        key = self.key(parts)
        if key in self.deny_read:
            raise Denied(key)
        node = self.nodes[key]
        return node["sd"], node["dir"]

    def write(self, parts, raw):
        key = self.key(parts)
        if self.gone_at == key:
            raise Gone(key)
        if key in self.deny_write:
            raise Denied(key)
        new = ntacl.parse_sd(raw)
        old = ntacl.parse_sd(self.nodes[key]["sd"])
        self.assertDaclOnly(new)
        self.nodes[key]["sd"] = ntacl.build_sd(old["owner"], old["group"], new["dacl"], new["control"])
        self.writes.append(key)

    @staticmethod
    def assertDaclOnly(sd):
        assert sd["owner"] is None and sd["group"] is None and sd["dacl"] is not None

    def list(self, parts):
        prefix = self.key(parts)
        out = []
        for path, node in self.nodes.items():
            head, _, name = path.rpartition("/")
            if head == prefix and path != prefix:
                out.append((name, node["dir"], False))
        return out

    def classify(self, exc):
        if isinstance(exc, Gone):
            return "AUTH_FAILED", True
        return "ACCESS_DENIED", False

    def dacl(self, path):
        return ntacl.parse_sd(self.nodes[path]["sd"])["dacl"]

    def control(self, path):
        return ntacl.parse_sd(self.nodes[path]["sd"])["control"]


def tree():
    fs = FakeFs()
    root_aces = [A(SYSTEM, ntacl.FILE_ALL, OI | CI), A(ADMINS, ntacl.FILE_ALL, OI | CI), A(ACCT_FULL, MODIFY, OI | CI), A("S-1-3-0", ntacl.GENERIC_ALL, OI | CI | IO)]
    old = [A(USERS, RX, OI | CI | ID)]  # stale inherited ACE everywhere
    fs.add("Dept", True, root_aces, owner=ADMINS)
    fs.add("Dept/A", True, [A(BOB, MODIFY, OI | CI)] + old, owner=ALICE)
    fs.add("Dept/A/f.txt", False, [A(USERS, RX, ID)], owner=BOB)
    fs.add("Dept/A/Sub", True, old)
    fs.add("Dept/A/Sub/g.txt", False, [A(USERS, RX, ID)])
    fs.add("Dept/B", True, [A(ALICE, MODIFY, OI | CI)], control=SE_DACL_PROTECTED | SE_DACL_AUTO_INHERITED)
    fs.add("Dept/B/x.txt", False, [A(ALICE, MODIFY, ID)])
    fs.add("Dept/C", True, old)
    fs.add("Dept/C/y.txt", False, [A(USERS, RX, ID)])
    fs.add("Dept/root.txt", False, [A(USERS, RX, ID)])
    return fs


class PropagationTests(unittest.TestCase):
    def test_inherit_mode(self):
        fs = tree()
        events = []
        result = ntacl.Propagation(fs, on_event=events.append).run(["Dept"])
        self.assertEqual(result["failed"], 0)
        self.assertEqual(result["protectedList"], ["Dept/B"])
        self.assertNotIn("Dept/B", fs.writes)
        self.assertNotIn("Dept/B/x.txt", fs.writes)
        self.assertEqual(result["done"], 7)
        # Folder A keeps its explicit ACE, gets the new inherited ones, CREATOR OWNER -> owner ALICE.
        a = fs.dacl("Dept/A")
        self.assertEqual(
            [(e["sid"], e["mask"], e["flags"]) for e in a],
            [
                (BOB, MODIFY, OI | CI),
                (SYSTEM, ntacl.FILE_ALL, OI | CI | ID),
                (ADMINS, ntacl.FILE_ALL, OI | CI | ID),
                (ACCT_FULL, MODIFY, OI | CI | ID),
                (ALICE, ntacl.FILE_ALL, ID),
                ("S-1-3-0", ntacl.GENERIC_ALL, OI | CI | IO | ID),
            ],
        )
        self.assertTrue(fs.control("Dept/A") & SE_DACL_AUTO_INHERITED)
        # A file two levels down: explicit BOB from A is inherited, CREATOR OWNER -> file owner.
        g = fs.dacl("Dept/A/Sub/g.txt")
        self.assertEqual([(e["sid"], e["flags"]) for e in g], [(BOB, ID), (SYSTEM, ID), (ADMINS, ID), (ACCT_FULL, ID), (ADMINS, ID)])
        self.assertTrue(all(e["sid"] != USERS for path in fs.writes for e in fs.dacl(path)))
        # Pre-order, names sorted: the resume marker is the last object.
        self.assertEqual(fs.writes, ["Dept/A", "Dept/A/f.txt", "Dept/A/Sub", "Dept/A/Sub/g.txt", "Dept/C", "Dept/C/y.txt", "Dept/root.txt"])
        self.assertEqual(result["marker"], "Dept/root.txt")
        self.assertTrue(any(e["type"] == "protected" for e in events))
        # Second run: nothing to change.
        fs.writes.clear()
        again = ntacl.Propagation(fs).run(["Dept"])
        self.assertEqual(fs.writes, [])
        self.assertEqual(again["unchanged"], 7)

    def test_replace_mode_and_dry_run(self):
        fs = tree()
        before = dict((k, v["sd"]) for k, v in fs.nodes.items())
        dry = ntacl.Propagation(fs, mode="replace", dry_run=True).run(["Dept"])
        self.assertEqual(fs.writes, [])
        self.assertEqual({k: v["sd"] for k, v in fs.nodes.items()}, before)
        self.assertEqual(dry["withExplicit"], 1)  # only A has explicit ACEs (B is protected)
        self.assertEqual(dry["explicitRemoved"], 1)
        result = ntacl.Propagation(fs, mode="replace").run(["Dept"])
        self.assertEqual(result["explicitRemoved"], 1)
        self.assertFalse(any(not e["flags"] & ID for e in fs.dacl("Dept/A")))
        self.assertEqual([e["sid"] for e in fs.dacl("Dept/A/Sub/g.txt")], [SYSTEM, ADMINS, ACCT_FULL, ADMINS])
        self.assertEqual(fs.dacl("Dept/B")[0]["sid"], ALICE)  # protected: untouched even in replace mode

    def test_per_object_errors_skip_subtree(self):
        fs = tree()
        fs.deny_write.add("Dept/A")
        fs.deny_read.add("Dept/C/y.txt")
        result = ntacl.Propagation(fs).run(["Dept"])
        self.assertEqual(
            [(f["path"], f["stage"]) for f in result["failedList"]],
            [("Dept/A", "write"), ("Dept/C/y.txt", "read")],
        )
        self.assertEqual(result["failed"], 2)
        # A's subtree was not walked (its DACL on disk was not updated).
        self.assertNotIn("Dept/A/Sub", fs.writes)
        self.assertIn("Dept/C", fs.writes)
        self.assertIn("Dept/root.txt", fs.writes)
        # Retry only the failed folder once it is writable.
        fs.deny_write.clear()
        fs.writes.clear()
        retry = ntacl.Propagation(fs).run(["Dept"], retry=["Dept/A"])
        self.assertEqual(fs.writes, ["Dept/A", "Dept/A/f.txt", "Dept/A/Sub", "Dept/A/Sub/g.txt"])
        self.assertEqual(retry["failed"], 0)

    def test_fatal_error_aborts(self):
        fs = tree()
        fs.gone_at = "Dept/A/Sub"
        with self.assertRaises(Gone):
            ntacl.Propagation(fs).run(["Dept"])

    def test_stop_and_resume(self):
        fs = tree()
        count = {"n": 0}

        def stop():
            count["n"] += 1
            return count["n"] > 3

        first = ntacl.Propagation(fs, should_stop=stop).run(["Dept"])
        self.assertTrue(first["stopped"])
        self.assertEqual(fs.writes, ["Dept/A", "Dept/A/f.txt", "Dept/A/Sub"])
        self.assertEqual(first["marker"], "Dept/A/Sub")
        fs.writes.clear()
        second = ntacl.Propagation(fs, marker=first["marker"].split("/")).run(["Dept"])
        self.assertFalse(second["stopped"])
        self.assertEqual(fs.writes, ["Dept/A/Sub/g.txt", "Dept/C", "Dept/C/y.txt", "Dept/root.txt"])
        # Same end state as one uninterrupted run.
        ref = tree()
        ntacl.Propagation(ref).run(["Dept"])
        for path in ref.nodes:
            self.assertEqual(fs.nodes[path]["sd"], ref.nodes[path]["sd"], path)

    def test_position(self):
        m = ["Dept", "B", "x"]
        self.assertEqual(ntacl.position(["Dept", "A", "z"], m), "before")
        self.assertEqual(ntacl.position(["Dept", "b"], m), "ancestor")
        self.assertEqual(ntacl.position(["Dept", "B", "x"], m), "ancestor")
        self.assertEqual(ntacl.position(["Dept", "B", "x", "1"], m), "after")
        self.assertEqual(ntacl.position(["Dept", "C"], m), "after")
        self.assertEqual(ntacl.position(["Dept", "B", "y"], None), "after")

    # ── Safety of the walk (review #2) ──

    def test_refuses_null_or_non_inheritable_source(self):
        for aces, label in (
            (None, "NULL DACL"),
            ([A(SYSTEM, ntacl.FILE_ALL, OI | CI), A(ACCT_FULL, MODIFY, OI | CI)], "no Administrators"),
            ([A(SYSTEM, ntacl.FILE_ALL), A(ADMINS, ntacl.FILE_ALL)], "this folder only"),
            ([A(SYSTEM, ntacl.FILE_ALL, CI), A(ADMINS, ntacl.FILE_ALL, CI)], "folders only, files would get nothing"),
        ):
            fs = tree()
            fs.add("Dept", True, aces)
            with self.assertRaises(ntacl.AclError, msg=label) as caught:
                ntacl.Propagation(fs).run(["Dept"])
            self.assertEqual((caught.exception.code, caught.exception.status), ("UNSAFE_SOURCE", 422), label)
            self.assertEqual(fs.writes, [], label)

    def test_never_writes_an_empty_dacl(self):
        fs = tree()
        # NP: the children get the ACEs, the grandchildren nothing.
        fs.add("Dept", True, [A(SYSTEM, ntacl.FILE_ALL, OI | CI | NP), A(ADMINS, ntacl.FILE_ALL, OI | CI | NP)])
        result = ntacl.Propagation(fs).run(["Dept"])
        failed = {f["path"]: (f["code"], f["stage"]) for f in result["failedList"]}
        self.assertEqual(failed, {"Dept/C/y.txt": ("EMPTY_DACL", "compute")})
        self.assertIn("Dept/C", fs.writes)  # SYSTEM / Administrators on C itself
        self.assertNotIn("Dept/C/y.txt", fs.writes)
        self.assertTrue(all(fs.dacl(path) for path in fs.writes))
        # Dry runs report it too.
        dry = ntacl.Propagation(tree_with_np(), dry_run=True).run(["Dept"])
        self.assertIn(("Dept/C/y.txt", "EMPTY_DACL"), [(f["path"], f["code"]) for f in dry["failedList"]])

    def test_replace_mode_does_not_lock_out_guarded(self):
        fs = tree()
        # Source passes only Modify to Administrators; a child had Full Control explicitly.
        fs.add("Dept", True, [A(SYSTEM, ntacl.FILE_ALL, OI | CI), A(ADMINS, MODIFY, OI | CI)])
        fs.add("Dept/C", True, [A(ADMINS, ntacl.FILE_ALL, OI | CI)])
        result = ntacl.Propagation(fs, mode="replace").run(["Dept"])
        self.assertIn(("Dept/C", "PROTECTED_PRINCIPAL", "compute"), [(f["path"], f["code"], f["stage"]) for f in result["failedList"]])
        self.assertEqual(fs.dacl("Dept/C"), [A(ADMINS, ntacl.FILE_ALL, OI | CI)])
        self.assertNotIn("Dept/C/y.txt", fs.writes)  # subtree of a failed folder is skipped

    def test_retry_with_unsafe_parent_is_skipped(self):
        fs = tree()
        fs.add("Dept/A", True, [A(BOB, MODIFY)], control=SE_DACL_PROTECTED | SE_DACL_AUTO_INHERITED)
        result = ntacl.Propagation(fs).run(["Dept"], retry=["Dept/A/Sub"])
        self.assertEqual([(f["path"], f["code"]) for f in result["failedList"]], [("Dept/A/Sub", "UNSAFE_SOURCE")])
        self.assertEqual(fs.writes, [])

    def test_failed_folder_does_not_advance_marker(self):
        fs = tree()
        del fs.nodes["Dept/root.txt"]  # Dept/C is the last object of the walk
        fs.deny_write.add("Dept/C")
        first = ntacl.Propagation(fs).run(["Dept"])
        self.assertEqual([(f["path"], f["stage"]) for f in first["failedList"]], [("Dept/C", "write")])
        self.assertEqual(first["marker"], "Dept/B")  # the protected folder, not the failed one
        # Resume once C is writable: C and its file are processed from the new DACL.
        fs.deny_write.clear()
        fs.writes.clear()
        second = ntacl.Propagation(fs, marker=first["marker"].split("/")).run(["Dept"])
        self.assertEqual(fs.writes, ["Dept/C", "Dept/C/y.txt"])
        self.assertEqual(second["failed"], 0)
        ref = tree()
        del ref.nodes["Dept/root.txt"]
        ntacl.Propagation(ref).run(["Dept"])
        for path in ref.nodes:
            self.assertEqual(fs.nodes[path]["sd"], ref.nodes[path]["sd"], path)

    def test_resume_ancestor_with_unsafe_dacl_is_skipped(self):
        fs = tree()
        fs.add("Dept/A", True, [A(BOB, MODIFY, OI | CI)])  # on disk: nothing for SYSTEM / Administrators
        result = ntacl.Propagation(fs, marker=["Dept", "A", "f.txt"]).run(["Dept"])
        self.assertIn(("Dept/A", "UNSAFE_SOURCE"), [(f["path"], f["code"]) for f in result["failedList"]])
        self.assertNotIn("Dept/A/Sub", fs.writes)
        self.assertIn("Dept/C", fs.writes)


def tree_with_np():
    fs = tree()
    fs.add("Dept", True, [A(SYSTEM, ntacl.FILE_ALL, OI | CI | NP), A(ADMINS, ntacl.FILE_ALL, OI | CI | NP)])
    return fs


EVERYONE = "S-1-1-0"
AUTH_USERS = "S-1-5-11"
DOMAIN_USERS = DOM + "-513"
DOMAIN_COMPUTERS = DOM + "-515"


class GuardTests(unittest.TestCase):
    BASE = [A(SYSTEM, ntacl.FILE_ALL, OI | CI), A(ADMINS, ntacl.FILE_ALL, OI | CI), A(ACCT_FULL, MODIFY, OI | CI)]

    def codes(self, before, after, is_dir=True):
        return sorted({(p["code"], p.get("sid")) for p in ntacl.guard_problems(before, after, is_dir)})

    def test_plain_change_passes(self):
        self.assertEqual(ntacl.guard_problems(self.BASE, self.BASE + [A(ACCT_READ, RX, OI | CI)]), [])

    def test_umbrella_denies_count(self):
        for sid in (EVERYONE, AUTH_USERS, USERS, DOMAIN_USERS):
            after = [D(sid, ntacl.FILE_ALL, OI | CI)] + self.BASE
            self.assertEqual(self.codes(self.BASE, after), [("PROTECTED_PRINCIPAL", SYSTEM), ("PROTECTED_PRINCIPAL", ADMINS)], sid)
        for sid in (SYSTEM, ADMINS):
            self.assertEqual(self.codes(self.BASE, [D(sid, 0x10000, CI)] + self.BASE), [("PROTECTED_PRINCIPAL", sid)], sid)
        # A deny for an unrelated group (or one admins are not always in) is fine.
        for sid in (ALICE, DOMAIN_COMPUTERS):
            self.assertEqual(ntacl.guard_problems(self.BASE, [D(sid, ntacl.FILE_ALL, OI | CI)] + self.BASE), [], sid)
        # Generic rights in a deny are mapped.
        self.assertTrue(ntacl.guard_problems(self.BASE, [D(EVERYONE, ntacl.GENERIC_WRITE, OI | CI)] + self.BASE))

    def test_null_dacl_before_counts_as_everyone_full(self):
        self.assertEqual(
            self.codes(None, [A(ACCT_FULL, MODIFY, OI | CI), A(ACCT_READ, RX, OI | CI)]),
            [("PROTECTED_PRINCIPAL", SYSTEM), ("PROTECTED_PRINCIPAL", ADMINS)],
        )
        self.assertEqual(ntacl.guard_problems(None, self.BASE), [])

    def test_empty_dacl_is_never_allowed(self):
        self.assertEqual(ntacl.guard_problems(self.BASE, []), [{"code": "EMPTY_DACL"}])
        self.assertEqual(ntacl.guard_problems([], []), [{"code": "EMPTY_DACL"}])
        self.assertEqual(ntacl.guard_problems([A(ALICE, MODIFY)], []), [{"code": "EMPTY_DACL"}])

    def test_everyone_allow_counts_both_ways(self):
        before = [A(EVERYONE, ntacl.FILE_ALL, OI | CI)]
        self.assertEqual(ntacl.guard_problems(before, before + [A(ALICE, MODIFY, OI | CI)]), [])
        self.assertTrue(ntacl.guard_problems(before, [A(ALICE, MODIFY, OI | CI)]))

    def test_files_only_this_scope(self):
        self.assertEqual(ntacl.guard_problems(None, [A(SYSTEM, ntacl.FILE_ALL), A(ADMINS, ntacl.FILE_ALL)], is_dir=False), [])
        self.assertTrue(ntacl.guard_problems(None, [A(SYSTEM, ntacl.FILE_ALL), A(ADMINS, ntacl.FILE_ALL)], is_dir=True))

    def test_source_problems(self):
        self.assertEqual(ntacl.source_problems(self.BASE), [])
        self.assertEqual(ntacl.source_problems(None), [{"code": "NULL_DACL"}])
        self.assertEqual(ntacl.source_problems([A(EVERYONE, ntacl.FILE_ALL, OI | CI)]), [])
        problems = ntacl.source_problems([A(SYSTEM, ntacl.FILE_ALL, OI | CI | IO), A(ADMINS, ntacl.FILE_ALL, OI)])
        self.assertEqual([(p["sid"], p["scope"]) for p in problems], [(ADMINS, "subfolders")])
        self.assertTrue(ntacl.source_problems(self.BASE + [D(DOMAIN_USERS, ntacl.FILE_ALL, OI | CI)]))

    def test_refuse_unsafe_codes(self):
        ntacl.refuse_unsafe([])
        for problems, code in (
            ([{"code": "EMPTY_DACL"}], "EMPTY_DACL"),
            ([{"code": "PROTECTED_PRINCIPAL", "sid": SYSTEM}], "PROTECTED_PRINCIPAL"),
            ([{"code": "NULL_DACL"}], "UNSAFE_SOURCE"),
        ):
            with self.assertRaises(ntacl.AclError) as caught:
                ntacl.refuse_unsafe(problems)
            self.assertEqual((caught.exception.code, caught.exception.status), (code, 422))


# ── Gateway (smbgate) without a server: write path, pools ───────────────────

try:
    import smbgate
except Exception:  # noqa: BLE001 - smbprotocol missing outside the image
    smbgate = None


class FakeHandle:
    def __init__(self, store, access):
        self.store = store
        self.access = access
        self.file_attributes = 0x10  # directory

    def close(self):
        pass


@unittest.skipIf(smbgate is None, "smbprotocol not installed")
class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.store = {"sd": ntacl.build_sd(owner=ADMINS, group=SYSTEM, dacl=GuardTests.BASE, control=SE_DACL_AUTO_INHERITED)}
        self.opened = []
        self.written = []
        self.saved = {}
        store = self.store

        def sd_open(_target, _kwargs, access):
            handle = FakeHandle(store, access)
            self.opened.append(access)
            return handle

        def sd_set(_handle, raw, info):
            self.written.append((raw, info))
            new = ntacl.parse_sd(raw)
            old = ntacl.parse_sd(store["sd"])
            store["sd"] = ntacl.build_sd(new["owner"] or old["owner"], old["group"], new["dacl"], new["control"])

        patches = {
            "session_kwargs": lambda req: {},
            "unc": lambda req, path=None, extra=None: "\\\\srv\\share\\" + (path if path is not None else str(req.get("path") or "")),
            "sd_open": sd_open,
            "sd_query": lambda handle, info=None: store["sd"],
            "sd_set": sd_set,
            "sd_read": lambda target, kwargs: (store["sd"], True),
        }
        for name, value in patches.items():
            self.saved[name] = getattr(smbgate, name)
            setattr(smbgate, name, value)

    def tearDown(self):
        for name, value in self.saved.items():
            setattr(smbgate, name, value)

    def req(self):
        return {"path": "Dept"}

    def test_set_refuses_guard_break_without_writing(self):
        rev = ntacl.revision_of(self.store["sd"])
        for aces, code in (
            ([D(EVERYONE, ntacl.FILE_ALL, OI | CI)] + GuardTests.BASE, "PROTECTED_PRINCIPAL"),
            ([A(ACCT_FULL, MODIFY, OI | CI)], "PROTECTED_PRINCIPAL"),
            ([], "EMPTY_DACL"),
        ):
            body = {"revision": rev, "aces": aces, "protected": True}
            with self.assertRaises(ntacl.AclError) as caught:
                smbgate.op_acl_set(self.req(), body)
            self.assertEqual(caught.exception.code, code)
            self.assertEqual(smbgate.translate(caught.exception).status, 422)
            # A dry run answers with the guard problems instead.
            dry = smbgate.op_acl_set(self.req(), dict(body, dryRun=True))
            self.assertEqual(dry["guard"][0]["code"], code)
        self.assertEqual(self.written, [])
        ok = smbgate.op_acl_set(self.req(), {"revision": rev, "aces": GuardTests.BASE + [A(ACCT_READ, RX, OI | CI)], "protected": True})
        self.assertEqual(len(self.written), 1)
        self.assertEqual(ok["acl"]["aces"][-1]["sid"], ACCT_READ)

    def test_null_dacl_folder_cannot_be_narrowed(self):
        raw = bytearray(ntacl.build_sd(owner=ADMINS, group=SYSTEM, dacl=None))
        raw[2] |= ntacl.SE_DACL_PRESENT  # DACL present, offset 0: a NULL DACL
        self.store["sd"] = bytes(raw)
        self.assertTrue(ntacl.sd_json(self.store["sd"])["nullDacl"])
        with self.assertRaises(ntacl.AclError) as caught:
            smbgate.op_acl_set(self.req(), {"aces": [A(ACCT_FULL, MODIFY, OI | CI)], "protected": True})
        self.assertEqual(caught.exception.code, "PROTECTED_PRINCIPAL")
        self.assertEqual(self.written, [])

    def test_restore_goes_through_the_guards(self):
        bad = ntacl.build_sd(owner=ADMINS, group=SYSTEM, dacl=[D(EVERYONE, ntacl.FILE_ALL, OI | CI)] + GuardTests.BASE)
        import base64

        with self.assertRaises(ntacl.AclError) as caught:
            smbgate.op_acl_restore(self.req(), {"sd": base64.b64encode(bad).decode()})
        self.assertEqual(caught.exception.code, "PROTECTED_PRINCIPAL")
        empty = ntacl.build_sd(owner=ADMINS, group=SYSTEM, dacl=[])
        with self.assertRaises(ntacl.AclError) as caught:
            smbgate.op_acl_restore(self.req(), {"sd": base64.b64encode(empty).decode()})
        self.assertEqual(caught.exception.code, "EMPTY_DACL")
        self.assertEqual(self.written, [])

    def test_restore_owner_requests_write_owner_only_when_it_changes(self):
        import base64

        same = ntacl.build_sd(owner=ADMINS, group=SYSTEM, dacl=GuardTests.BASE + [A(ACCT_READ, RX, OI | CI)])
        smbgate.op_acl_restore(self.req(), {"sd": base64.b64encode(same).decode(), "owner": True})
        self.assertFalse(self.opened[-1] & smbgate.WRITE_OWNER)
        self.assertTrue(self.opened[-1] & smbgate.WRITE_DAC)
        self.assertEqual(self.written[-1][1], ntacl.DACL_INFO)
        other = ntacl.build_sd(owner=ALICE, group=SYSTEM, dacl=GuardTests.BASE)
        smbgate.op_acl_restore(self.req(), {"sd": base64.b64encode(other).decode(), "owner": True})
        self.assertTrue(self.opened[-1] & smbgate.WRITE_OWNER)
        self.assertEqual(self.written[-1][1], ntacl.DACL_INFO | ntacl.OWNER_INFO)
        self.assertEqual(ntacl.parse_sd(self.store["sd"])["owner"], ALICE)

    def test_restore_keeps_the_current_inherited_part(self):
        import base64

        old_group = DOM + "-7777"
        inherited = [A(SYSTEM, ntacl.FILE_ALL, OI | CI | ID), A(ADMINS, ntacl.FILE_ALL, OI | CI | ID)]
        # Now: an explicit read entry; the parent's entries as they are today.
        self.store["sd"] = ntacl.build_sd(owner=ADMINS, group=SYSTEM, dacl=[A(ACCT_READ, RX, OI | CI)] + inherited, control=SE_DACL_AUTO_INHERITED)
        # Saved a month ago: another explicit entry, and an inherited sg_old the parent has dropped since.
        saved = ntacl.build_sd(owner=ADMINS, group=SYSTEM, dacl=[A(ACCT_FULL, MODIFY, OI | CI)] + inherited + [A(old_group, RX, OI | CI | ID)], control=SE_DACL_AUTO_INHERITED)
        dry = smbgate.op_acl_restore(self.req(), {"sd": base64.b64encode(saved).decode(), "dryRun": True})
        self.assertEqual([(e["sid"], e["inherited"]) for e in dry["acl"]["aces"]], [(ACCT_FULL, False), (SYSTEM, True), (ADMINS, True)])
        self.assertEqual(self.written, [])
        smbgate.op_acl_restore(self.req(), {"sd": base64.b64encode(saved).decode()})
        now = ntacl.parse_sd(self.store["sd"])
        self.assertNotIn(old_group, [e["sid"] for e in now["dacl"]])
        self.assertFalse(now["control"] & SE_DACL_PROTECTED)

    def test_restore_of_a_protected_dacl_is_verbatim(self):
        import base64

        saved_dacl = [A(ACCT_FULL, MODIFY, OI | CI)] + GuardTests.BASE[:2]
        saved = ntacl.build_sd(owner=ADMINS, group=SYSTEM, dacl=saved_dacl, control=SE_DACL_PROTECTED | SE_DACL_AUTO_INHERITED)
        smbgate.op_acl_restore(self.req(), {"sd": base64.b64encode(saved).decode()})
        now = ntacl.parse_sd(self.store["sd"])
        self.assertTrue(now["control"] & SE_DACL_PROTECTED)
        self.assertTrue(ntacl.same_aces(now["dacl"], saved_dacl))

    def test_restore_into_a_protected_folder_recomputes_from_the_parent(self):
        import base64

        parent = ntacl.build_sd(owner=ADMINS, group=SYSTEM, dacl=[A(SYSTEM, ntacl.FILE_ALL, OI | CI), A(ADMINS, ntacl.FILE_ALL, OI | CI)])
        self.store["sd"] = ntacl.build_sd(owner=ADMINS, group=SYSTEM, dacl=GuardTests.BASE, control=SE_DACL_PROTECTED | SE_DACL_AUTO_INHERITED)
        store = self.store
        smbgate.sd_read = lambda target, kwargs: (parent if target.endswith("share\\") else store["sd"], True)
        stale = [A(SYSTEM, ntacl.FILE_ALL, OI | CI | ID), A(ADMINS, ntacl.FILE_ALL, OI | CI | ID), A(DOM + "-7777", RX, OI | CI | ID)]
        saved = ntacl.build_sd(owner=ADMINS, group=SYSTEM, dacl=[A(ACCT_FULL, MODIFY, OI | CI)] + stale, control=SE_DACL_AUTO_INHERITED)
        smbgate.op_acl_restore(self.req(), {"sd": base64.b64encode(saved).decode()})
        now = ntacl.parse_sd(self.store["sd"])
        self.assertFalse(now["control"] & SE_DACL_PROTECTED)
        self.assertEqual([(e["sid"], bool(e["flags"] & ID)) for e in now["dacl"]], [(ACCT_FULL, False), (SYSTEM, True), (ADMINS, True)])

    def test_busy_pool_is_not_reaped(self):
        resets = []
        saved = smbgate.smbclient.reset_connection_cache
        smbgate.smbclient.reset_connection_cache = lambda **kw: resets.append(kw["connection_cache"])
        try:
            with smbgate.POOLS_LOCK:
                smbgate.POOLS.clear()
                del smbgate.RETIRED[:]
            walking, idle = smbgate.Pool(), smbgate.Pool()
            smbgate.POOLS["walk"], smbgate.POOLS["idle"] = walking, idle
            old = smbgate.Pool()
            smbgate.RETIRED.append(old)
            later = smbgate.time.monotonic() + smbgate.MAX_AGE_SECONDS + 3600 + smbgate.IDLE_SECONDS + 10
            with smbgate.hold_pool(walking), smbgate.hold_pool(old):
                smbgate.reap_once(later)
                self.assertIn("walk", smbgate.POOLS)
                self.assertNotIn("idle", smbgate.POOLS)
                self.assertIn(old, smbgate.RETIRED)
                # Every SMB call of the walk marks the pool as used.
                walking.used = 0
                tree_ = smbgate.SmbTree(self.req(), {}, walking)
                tree_.read(["Dept"])
                self.assertGreater(walking.used, 0)
            self.assertEqual(walking.active, 0)
            smbgate.reap_once(later + smbgate.IDLE_SECONDS + 10)
            self.assertNotIn("walk", smbgate.POOLS)
            self.assertNotIn(old, smbgate.RETIRED)
        finally:
            smbgate.smbclient.reset_connection_cache = saved
            with smbgate.POOLS_LOCK:
                smbgate.POOLS.clear()
                del smbgate.RETIRED[:]


if __name__ == "__main__":
    unittest.main()
