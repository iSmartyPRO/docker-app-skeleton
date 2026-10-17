"""Unit tests for the gateway's parallel-read limit and SMB credit errors. No SMB server needed.

Run as: cd src/backend/modules/drive/gateway && PYTHONDONTWRITEBYTECODE=1 python3 test_gate_busy.py
(needs smbprotocol, like the gateway itself).
"""

import sys
import unittest

sys.dont_write_bytecode = True

from smbprotocol.exceptions import SMBException  # noqa: E402

import smbgate  # noqa: E402


class CreditErrors(unittest.TestCase):
    def test_credit_exhaustion_is_busy_not_broken(self):
        exc = SMBException("Request requires 1 credits but only 0 credits are available")
        mapped = smbgate.translate(exc)
        self.assertEqual(mapped.status, 503)
        self.assertEqual(mapped.code, "SMB_BUSY")

    def test_other_smb_errors_unchanged(self):
        mapped = smbgate.translate(SMBException("Something else failed"))
        self.assertEqual((mapped.status, mapped.code), (502, "SMB_ERROR"))


class ParallelReads(unittest.TestCase):
    def test_pool_bounds_parallel_reads(self):
        pool = smbgate.Pool()
        taken = [pool.reads.acquire(timeout=0.01) for _ in range(smbgate.READS_PER_POOL)]
        self.assertTrue(all(taken))
        self.assertFalse(pool.reads.acquire(timeout=0.01), "one more read waits")
        pool.reads.release()
        self.assertTrue(pool.reads.acquire(timeout=0.01))

    def test_op_read_releases_the_slot_on_error(self):
        handler_cls = next(v for v in vars(smbgate).values() if isinstance(v, type) and hasattr(v, "op_read"))
        pool = smbgate.Pool()
        handler = handler_cls.__new__(handler_cls)
        calls = []

        def boom(req, kwargs):
            calls.append(kwargs)
            raise smbgate.GateError(404, "NOT_FOUND")

        handler.read_file = boom
        original = smbgate.session
        smbgate.session = lambda req: ({"k": 1}, pool)
        try:
            for _ in range(smbgate.READS_PER_POOL + 2):
                with self.assertRaises(smbgate.GateError):
                    handler.op_read({})
        finally:
            smbgate.session = original
        self.assertEqual(len(calls), smbgate.READS_PER_POOL + 2)
        # Every slot came back.
        self.assertTrue(all(pool.reads.acquire(timeout=0.01) for _ in range(smbgate.READS_PER_POOL)))

    def test_busy_when_no_slot_frees_up(self):
        handler_cls = next(v for v in vars(smbgate).values() if isinstance(v, type) and hasattr(v, "op_read"))
        pool = smbgate.Pool()
        for _ in range(smbgate.READS_PER_POOL):
            pool.reads.acquire()
        handler = handler_cls.__new__(handler_cls)
        handler.read_file = lambda req, kwargs: None
        original_session, original_wait = smbgate.session, smbgate.READ_WAIT_SECONDS
        smbgate.session = lambda req: ({}, pool)
        smbgate.READ_WAIT_SECONDS = 0.05
        try:
            with self.assertRaises(smbgate.GateError) as ctx:
                handler.op_read({})
            self.assertEqual((ctx.exception.status, ctx.exception.code), (503, "SMB_BUSY"))
        finally:
            smbgate.session, smbgate.READ_WAIT_SECONDS = original_session, original_wait


if __name__ == "__main__":
    unittest.main()
