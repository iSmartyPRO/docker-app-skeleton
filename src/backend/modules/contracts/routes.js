import { Router } from 'express';
import { query } from '../../config/database.js';
import { getSettings, parseSettings, updateAdminSettings } from '../../services/settings.js';
import { listLegalEntities } from '../../services/legalEntities.js';
import { userShape } from '../shared/acl.js';
import { httpError } from './logic.js';
import { modulesEnabled } from './access.js';
import { calendar, changeStatus, counters, createContract, deleteContract, exportCsv, getContract, listContracts, listEvents, requestContext, updateContract } from './service.js';
import { addVersion, sendVersion, sendVersionPreview, updateVersion, uploadErrors, versionUploader } from './versions.js';
import { addRisk, deleteRisk, updateRisk } from './risks.js';
import { dealOptions, masterplanOptions } from './links.js';
import { runDaily } from './jobs.js';

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (err) {
    next(err);
  }
};
const ok = (res, payload = {}, status = 200) => res.status(status).json({ success: true, ...payload });

/** /api/app/contracts — signed-in users; access is checked per contract (access.js). */
export function privateRoutes() {
  const router = Router();
  router.use(wrap(async (req, _res, next) => {
    req.ctr = await requestContext(req);
    next();
  }));

  // ── Meta, settings, pickers ──
  router.get('/meta', wrap(async (req, res) => {
    const { settings } = req.ctr;
    ok(res, {
      settings,
      me: { id: req.ctr.userId, canCreate: req.ctr.canCreate, isLegal: req.ctr.isLegal, isAdmin: req.ctr.isAdmin, viewAll: req.ctr.viewAll },
      modules: await modulesEnabled(),
      legalEntities: await listLegalEntities(),
      today: req.ctr.today,
    });
  }));
  router.get('/users', wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users
       WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE ORDER BY LOWER(COALESCE(display_name, username)) LIMIT 2000`
    );
    ok(res, { users: rows.map(userShape) });
  }));
  // Contracts administrators change the module's settings without the console's settings.modules permission.
  router.put('/settings', wrap(async (req, res) => {
    if (!req.ctr.isAdmin) throw httpError(403, 'Only a contracts administrator changes the settings', 'FORBIDDEN');
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw httpError(400, 'Settings object expected', 'INVALID_SETTINGS');
    await updateAdminSettings({ modules: { contracts: { settings: req.body } } });
    ok(res, { settings: parseSettings(await getSettings({ fresh: true })).modules.contracts.settings });
  }));
  router.get('/link-options/deals', wrap(async (req, res) => ok(res, { items: await dealOptions(req.ctr, req.query.search) })));
  router.get('/link-options/masterplan', wrap(async (req, res) => ok(res, { items: await masterplanOptions(req.ctr, req.query.search) })));

  // ── Registry ──
  router.get('/contracts', wrap(async (req, res) => ok(res, await listContracts(req.ctr, req.query))));
  router.get('/counters', wrap(async (req, res) => ok(res, { counts: await counters(req.ctr, req.query) })));
  router.get('/export.csv', wrap(async (req, res) => exportCsv(req.ctr, req.query, res)));
  router.get('/calendar', wrap(async (req, res) => ok(res, await calendar(req.ctr, req.query))));
  router.post('/contracts', wrap(async (req, res) => ok(res, await createContract(req.ctr, req.body || {}), 201)));

  // ── One contract ──
  router.get('/contracts/:id', wrap(async (req, res) => ok(res, await getContract(req.ctr, req.params.id))));
  router.put('/contracts/:id', wrap(async (req, res) => ok(res, await updateContract(req.ctr, req.params.id, req.body || {}))));
  router.delete('/contracts/:id', wrap(async (req, res) => {
    await deleteContract(req.ctr, req.params.id);
    ok(res);
  }));
  router.post('/contracts/:id/status', wrap(async (req, res) => ok(res, await changeStatus(req.ctr, req.params.id, req.body || {}))));
  router.get('/contracts/:id/events', wrap(async (req, res) => ok(res, await listEvents(req.ctr, req.params.id, req.query))));

  // ── Versions ──
  router.post(
    '/contracts/:id/versions',
    (req, res, next) => versionUploader(req.ctr.settings.maxUploadMb || 50)(req, res, (err) => next(uploadErrors(err))),
    wrap(async (req, res) => ok(res, { version: await addVersion(req.ctr, req.params.id, req.file, req.body || {}) }, 201))
  );
  router.put('/versions/:id', wrap(async (req, res) => ok(res, { version: await updateVersion(req.ctr, req.params.id, req.body || {}) })));
  router.get('/versions/:id/file', wrap(async (req, res) => sendVersion(req.ctr, req.params.id, res, { download: req.query.download === '1' })));
  router.get('/versions/:id/preview.pdf', wrap(async (req, res) => sendVersionPreview(req.ctr, req.params.id, res)));

  // ── Risks ──
  router.post('/contracts/:id/risks', wrap(async (req, res) => ok(res, { risk: await addRisk(req.ctr, req.params.id, req.body || {}) }, 201)));
  router.put('/risks/:id', wrap(async (req, res) => ok(res, { risk: await updateRisk(req.ctr, req.params.id, req.body || {}) })));
  router.delete('/risks/:id', wrap(async (req, res) => {
    await deleteRisk(req.ctr, req.params.id);
    ok(res);
  }));

  // ── Maintenance: run the expiry job now (administrators; the scheduler runs it every 10 minutes) ──
  router.post('/jobs/daily', wrap(async (req, res) => {
    if (!req.ctr.isAdmin) throw httpError(403, 'Administrators only', 'FORBIDDEN');
    ok(res, await runDaily());
  }));

  return router;
}
