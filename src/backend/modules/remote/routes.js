import { Router } from 'express';
import { listSubjects, wrap } from '../shared/acl.js';
import { requirePermission } from '../../middleware/auth.js';
import {
  bootstrap,
  deleteHost,
  endSession,
  listHosts,
  listSessions,
  remoteContext,
  requireAdmin,
  saveHost,
  startSession,
} from './service.js';

/*
 * /api/app/remote — the module is mounted behind requireAuth; each route also
 * checks a permission. The live tunnel to guacd is a later phase: startSession
 * records and notifies, and answers tunnel: 'GUACD_OFF' until guacd is wired.
 */
export function privateRoutes() {
  const router = Router();
  router.use((req, res, next) => {
    req.remote_ctx = remoteContext(req);
    next();
  });

  const view = requirePermission('remote.view', 'remote.connect', 'remote.monitor', 'remote.admin');

  router.get('/', view, wrap(async (req, res) => res.json({ success: true, ...(await bootstrap(req.remote_ctx)) })));
  router.get('/hosts', view, wrap(async (req, res) => res.json({ success: true, hosts: await listHosts(req.remote_ctx) })));

  // Connect / monitor: the service enforces the permission per mode, records and notifies.
  router.post('/sessions', requirePermission('remote.connect', 'remote.monitor', 'remote.admin'), wrap(async (req, res) =>
    res.json({ success: true, ...(await startSession(req.remote_ctx, req.body || {})) })
  ));
  router.post('/sessions/:id/end', wrap(async (req, res) => res.json({ success: true, session: await endSession(req.remote_ctx, req.params.id, req.body || {}) })));

  // The journal: mine (anyone) or all (admins).
  router.get('/sessions', wrap(async (req, res) => res.json({ success: true, sessions: await listSessions(req.remote_ctx, { scope: req.query.scope, limit: Number(req.query.limit) || 200 }) })));

  // Host catalogue management (remote.admin).
  const admin = (handler) => wrap(async (req, res) => {
    requireAdmin(req.remote_ctx);
    await handler(req, res);
  });
  router.get('/subjects', admin(async (req, res) => res.json({ success: true, ...(await listSubjects()) })));
  router.post('/hosts', admin(async (req, res) => res.json({ success: true, host: await saveHost(req.remote_ctx, req.body || {}) })));
  router.put('/hosts/:id', admin(async (req, res) => res.json({ success: true, host: await saveHost(req.remote_ctx, req.body || {}, req.params.id) })));
  router.delete('/hosts/:id', admin(async (req, res) => {
    await deleteHost(req.remote_ctx, req.params.id);
    res.json({ success: true });
  }));
  return router;
}
