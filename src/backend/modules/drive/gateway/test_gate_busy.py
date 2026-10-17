"""Unit tests for the gateway's parallel-read limit and SMB credit errors. No SMB server needed.

Run as: cd src/backend/modules/drive/gateway && PYTHONDONTWRITEBYTECODE=1 python3 test_gate_busy.py
(needs smbprotocol, like the gateway itself).
"""

import io
import sys
import threading
import types
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
        pool = smbgate.Pool()
        handler = make_handler()
        original = (smbgate.session, smbgate.smbclient.stat)
        smbgate.session = lambda req: ({"k": 1}, pool)
        calls = []

        def missing(target, **kwargs):
            calls.append(target)
            raise smbgate.GateError(404, "NOT_FOUND")

        smbgate.smbclient.stat = missing
        try:
            for _ in range(smbgate.READS_PER_POOL + 2):
                with self.assertRaises(smbgate.GateError):
                    handler.op_read(READ_REQ)
        finally:
            smbgate.session, smbgate.smbclient.stat = original
        self.assertEqual(len(calls), smbgate.READS_PER_POOL + 2)
        # Every slot came back.
        self.assertTrue(all(pool.reads.acquire(timeout=0.01) for _ in range(smbgate.READS_PER_POOL)))

    def test_busy_when_no_slot_frees_up(self):
        pool = smbgate.Pool()
        for _ in range(smbgate.READS_PER_POOL):
            pool.reads.acquire()
        handler = make_handler()
        original_session, original_wait = smbgate.session, smbgate.READ_WAIT_SECONDS
        smbgate.session = lambda req: ({}, pool)
        smbgate.READ_WAIT_SECONDS = 0.05
        try:
            with self.assertRaises(smbgate.GateError) as ctx:
                handler.op_read(READ_REQ)
            self.assertEqual((ctx.exception.status, ctx.exception.code), (503, "SMB_BUSY"))
        finally:
            smbgate.session, smbgate.READ_WAIT_SECONDS = original_session, original_wait


READ_REQ = {"server": {"host": "fs"}, "share": "s", "path": "dir/file.bin"}


def make_handler(out=None):
    handler_cls = next(v for v in vars(smbgate).values() if isinstance(v, type) and hasattr(v, "op_read"))
    handler = handler_cls.__new__(handler_cls)
    handler.wfile = out or io.BytesIO()
    handler.request_version = "HTTP/1.0"
    handler.requestline = "POST /read HTTP/1.0"
    handler.command = "POST"
    handler.close_connection = False
    return handler


class FakeFile:
    """An SMB file of `size` bytes whose reads are counted against the pool."""

    def __init__(self, pool, size, log):
        self.pool, self.size, self.pos, self.log, self.closed = pool, size, 0, log, False

    def seek(self, pos):
        self.pos = pos

    def read(self, n):
        self.log.append(("read", self.pool.reads._value))
        data = b"x" * max(0, min(n, self.size - self.pos))
        self.pos += len(data)
        return data

    def close(self):
        self.closed = True


class BlockingClient(io.RawIOBase):
    """A client socket whose writes block until `go` is set (a slow phone)."""

    def __init__(self, go, writing):
        self.go, self.writing, self.got = go, writing, 0

    def writable(self):
        return True

    def write(self, data):
        self.writing.set()
        self.go.wait(5)
        self.got += len(data)
        return len(data)


class SlotOnlyAroundSmbCalls(unittest.TestCase):
    def setUp(self):
        self.original = (smbgate.session, smbgate.smbclient.stat, smbgate.smbclient.open_file, smbgate.READ_WAIT_SECONDS)
        self.pool = smbgate.Pool()
        self.log = []
        self.files = []
        size = smbgate.CHUNK * 2 + 10
        smbgate.session = lambda req: ({}, self.pool)
        smbgate.READ_WAIT_SECONDS = 0.5

        def stat(target, **kwargs):
            self.log.append(("stat", self.pool.reads._value))
            return types.SimpleNamespace(st_size=size, st_mtime=0, st_mode=0o100644, st_file_attributes=0)

        def open_file(target, **kwargs):
            self.log.append(("open", self.pool.reads._value))
            handle = FakeFile(self.pool, size, self.log)
            self.files.append(handle)
            return handle

        smbgate.smbclient.stat = stat
        smbgate.smbclient.open_file = open_file
        self.size = size

    def tearDown(self):
        smbgate.session, smbgate.smbclient.stat, smbgate.smbclient.open_file, smbgate.READ_WAIT_SECONDS = self.original

    def test_every_smb_call_holds_a_slot_and_the_stream_completes(self):
        out = io.BytesIO()
        make_handler(out).op_read(READ_REQ)
        body = out.getvalue().split(b"\r\n\r\n", 1)[1]
        self.assertEqual(len(body), self.size)
        # One slot taken during each SMB call, all back afterwards.
        self.assertTrue(all(free == smbgate.READS_PER_POOL - 1 for _, free in self.log), self.log)
        self.assertEqual(self.pool.reads._value, smbgate.READS_PER_POOL)
        self.assertTrue(self.files[0].closed)

    def test_slow_clients_do_not_block_other_readers(self):
        # READS_PER_POOL + 2 streams stuck writing to slow clients on one shared pool.
        go = threading.Event()
        stuck = []
        threads = []
        for _ in range(smbgate.READS_PER_POOL + 2):
            writing = threading.Event()
            client = BlockingClient(go, writing)
            handler = make_handler(io.BufferedWriter(client, buffer_size=1))
            thread = threading.Thread(target=handler.op_read, args=(READ_REQ,), daemon=True)
            thread.start()
            threads.append(thread)
            stuck.append(writing)
        try:
            for writing in stuck:
                self.assertTrue(writing.wait(5), "every stream reached the client write")
            # No slot is held while they wait on their clients...
            self.assertEqual(self.pool.reads._value, smbgate.READS_PER_POOL)
            # ...so one more reader goes straight through.
            out = io.BytesIO()
            make_handler(out).op_read(READ_REQ)
            self.assertEqual(len(out.getvalue().split(b"\r\n\r\n", 1)[1]), self.size)
        finally:
            go.set()
            for thread in threads:
                thread.join(5)
        self.assertEqual(self.pool.reads._value, smbgate.READS_PER_POOL)

    def test_failed_chunk_read_closes_the_handle_and_the_connection(self):
        def broken(n):
            raise smbgate.GateError(502, "SMB_ERROR", "gone")

        original_open = smbgate.smbclient.open_file

        def open_broken(target, **kwargs):
            handle = original_open(target, **kwargs)
            handle.read = broken
            return handle

        smbgate.smbclient.open_file = open_broken
        handler = make_handler()
        with self.assertRaises(smbgate.GateError):
            handler.op_read(READ_REQ)
        self.assertTrue(self.files[0].closed)
        self.assertTrue(handler.close_connection)
        self.assertEqual(self.pool.reads._value, smbgate.READS_PER_POOL)


if __name__ == "__main__":
    unittest.main()
