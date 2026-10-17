/**
 * GET /ready for load balancers and container health checks (server.js):
 * 503 `shutting_down` while draining after SIGTERM (so no new work is sent
 * here), 503 `not_ready` without the database or the schema, else 200.
 * When the database is back but the delayed bootstrap has not run yet, it is
 * tried at once. Dependencies are passed in so the states are unit-tested
 * (test/readiness.test.js).
 */
export function readyHandler({ draining, connect, bootstrapped, bootstrapLate }) {
  return async (req, res) => {
    if (draining()) return res.status(503).json({ status: 'shutting_down' });
    const db = await connect();
    // SIGTERM may have arrived while waiting for the database.
    if (draining()) return res.status(503).json({ status: 'shutting_down' });
    if (!db.ok) return res.status(503).json({ status: 'not_ready', database: false, schema: bootstrapped() });
    if (!bootstrapped()) await bootstrapLate().catch(() => {});
    if (!bootstrapped()) return res.status(503).json({ status: 'not_ready', database: true, schema: false });
    return res.json({ status: 'ready', database: true, schema: true });
  };
}
