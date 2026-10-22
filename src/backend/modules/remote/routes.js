import { Router } from 'express';
import { listSubjects, wrap } from '../shared/acl.js';
import { requirePermission } from '../../middleware/auth.js';
import {
  bootstrap,
  deleteApp,
  deleteHost,
  endSession,
  importRdp,
  listApps,
  listHosts,
  listSessions,
  remoteContext,
  requireAdmin,
  saveApp,
  saveHost,
  startSession,
} from './service.js';
import { deleteCredential, listCredentials, saveCredential } from './credentials.js';
import { deletePassbolt, getPassbolt, listResources, passboltEnabled, savePassbolt, testPassbolt } from './passbolt.js';

/** /api/app/remote — mounted behind requireAuth; each route also checks a permission. */
export function privateRoutes() {
  const router = Router();
  router.use((req, res, next) => {
    req.remote_ctx = remoteContext(req);
    next();
  });

  const view = requirePermission('remote.view', 'remote.connect', 'remote.monitor', 'remote.admin');
  const operator = requirePermission('remote.connect', 'remote.monitor', 'remote.admin');

  router.get('/', view, wrap(async (req, res) => res.json({ success: true, ...(await bootstrap(req.remote_ctx)) })));
  router.get('/hosts', view, wrap(async (req, res) => res.json({ success: true, hosts: await listHosts(req.remote_ctx) })));
  router.get('/apps', view, wrap(async (req, res) => res.json({ success: true, apps: await listApps(req.remote_ctx) })));

  router.post('/sessions', operator, wrap(async (req, res) => res.json({ success: true, ...(await startSession(req.remote_ctx, req.body || {})) })));
  router.post('/sessions/:id/end', wrap(async (req, res) => res.json({ success: true, session: await endSession(req.remote_ctx, req.params.id, req.body || {}) })));
  router.get('/sessions', wrap(async (req, res) => res.json({ success: true, sessions: await listSessions(req.remote_ctx, { scope: req.query.scope, limit: Number(req.query.limit) || 200 }) })));

  // ── Password manager (any operator: own personal + shared) ──
  router.get('/credentials', operator, wrap(async (req, res) => res.json({ success: true, credentials: await listCredentials(req.remote_ctx) })));
  router.post('/credentials', operator, wrap(async (req, res) => res.json({ success: true, credential: await saveCredential(req.remote_ctx, req.body || {}) })));
  router.put('/credentials/:id', operator, wrap(async (req, res) => res.json({ success: true, credential: await saveCredential(req.remote_ctx, req.body || {}, req.params.id) })));
  router.delete('/credentials/:id', operator, wrap(async (req, res) => {
    await deleteCredential(req.remote_ctx, req.params.id);
    res.json({ success: true });
  }));

  // ── Passbolt (per person; only when the integration is on) ──
  const withPassbolt = (handler) => wrap(async (req, res) => {
    if (!(await passboltEnabled())) {
      res.status(409).json({ success: false, error: 'Passbolt is off', code: 'PASSBOLT_OFF' });
      return;
    }
    await handler(req, res);
  });
  router.get('/passbolt', operator, withPassbolt(async (req, res) => res.json({ success: true, passbolt: await getPassbolt(req.remote_ctx) })));
  router.put('/passbolt', operator, withPassbolt(async (req, res) => res.json({ success: true, passbolt: await savePassbolt(req.remote_ctx, req.body || {}) })));
  router.post('/passbolt/test', operator, withPassbolt(async (req, res) => res.json({ success: true, ...(await testPassbolt(req.remote_ctx)) })));
  router.delete('/passbolt', operator, withPassbolt(async (req, res) => {
    await deletePassbolt(req.remote_ctx);
    res.json({ success: true });
  }));
  router.get('/passbolt/resources', operator, withPassbolt(async (req, res) => res.json({ success: true, resources: await listResources(req.remote_ctx) })));

  // ── Admin: host catalogue and published apps ──
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

  router.get('/admin/apps', admin(async (req, res) => res.json({ success: true, apps: await listApps(req.remote_ctx, { hostId: req.query.hostId || null, all: true }) })));
  router.post('/admin/apps/import', admin(async (req, res) => res.json({ success: true, ...(await importRdp(req.remote_ctx, req.body?.rdp || '')) })));
  router.post('/admin/apps', admin(async (req, res) => res.json({ success: true, app: await saveApp(req.remote_ctx, req.body || {}) })));
  router.put('/admin/apps/:id', admin(async (req, res) => res.json({ success: true, app: await saveApp(req.remote_ctx, req.body || {}, req.params.id) })));
  router.delete('/admin/apps/:id', admin(async (req, res) => {
    await deleteApp(req.remote_ctx, req.params.id);
    res.json({ success: true });
  }));
  return router;
}
