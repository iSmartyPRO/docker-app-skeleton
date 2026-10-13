import { Router } from 'express';
import { query } from '../../config/database.js';
import { updateAdminSettings, getSettings, parseSettings } from '../../services/settings.js';
import { httpError, userShape } from '../shared/acl.js';
import { requestRegional } from '../../services/regional.js';
import { crmContext, crmSettings, modulesEnabled } from './access.js';
import { createClient, searchClients } from './clients.js';
import {
  addComment,
  board,
  bulk,
  changePipeline,
  copyDeal,
  createDeal,
  deleteDeal,
  getDeal,
  listDeals,
  listEvents,
  moveDeal,
  restoreDeal,
  stagePage,
  updateDeal,
} from './deals.js';
import { activityBoard, counters, createActivity, deleteActivity, listActivities, myActivities, updateActivity } from './activities.js';
import { createPipeline, deletePipeline, listPipelines, orderPipelines, requireAdmin, updatePipeline } from './pipelines.js';
import { calendar, createPreset, deletePreset, exportCsv, listPresets, updatePreset } from './views.js';

/** Like shared wrap(), plus 409 VERSION_CONFLICT answered with the fresh deal. */
const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT' && err.deal) {
      res.status(409).json({ success: false, code: err.code, error: err.message, deal: err.deal });
      return;
    }
    next(err);
  }
};

const ok = (res, payload = {}, status = 200) => res.status(status).json({ success: true, ...payload });

/** /api/app/crm — signed-in users; access is checked per deal (access.js). */
export function privateRoutes() {
  const router = Router();
  router.use(async (req, res, next) => {
    try {
      req.crm = crmContext(req, await crmSettings());
      // The person's zone and week start: "today", "this week", date filters, exports.
      req.crm.regional = await requestRegional(req);
      next();
    } catch (err) {
      next(err);
    }
  });

  // ── Meta ──
  router.get('/meta', wrap(async (req, res) => {
    const enabled = await modulesEnabled();
    ok(res, {
      settings: req.crm.settings,
      pipelines: await listPipelines(req.crm),
      me: { id: req.crm.userId, canAdmin: req.crm.canAdmin, canAll: req.crm.canAll },
      companiesEnabled: enabled.companies,
      chatEnabled: enabled.chat,
    });
  }));
  router.get('/settings', wrap(async (req, res) => {
    requireAdmin(req.crm);
    ok(res, { settings: req.crm.settings });
  }));
  // CRM administrators change the module's settings without the console's settings.modules permission.
  router.put('/settings', wrap(async (req, res) => {
    requireAdmin(req.crm);
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw httpError(400, 'Settings object expected', 'INVALID_SETTINGS');
    await updateAdminSettings({ modules: { crm: { settings: req.body } } });
    ok(res, { settings: parseSettings(await getSettings({ fresh: true })).modules.crm.settings });
  }));
  router.get('/users', wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users
       WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE ORDER BY LOWER(COALESCE(display_name, username)) LIMIT 2000`
    );
    ok(res, { users: rows.map(userShape) });
  }));

  // ── Clients (Companies module) ──
  router.get('/clients', wrap(async (req, res) => ok(res, await searchClients(req.query))));
  router.post('/clients', wrap(async (req, res) => ok(res, { client: await createClient(req.crm, req.body || {}) }, 201)));

  // ── Views over the filter ──
  router.get('/counters', wrap(async (req, res) => ok(res, await counters(req.crm, req.query))));
  router.get('/board', wrap(async (req, res) => ok(res, await board(req.crm, req.query))));
  router.get('/board/stage/:stageId', wrap(async (req, res) => ok(res, await stagePage(req.crm, req.params.stageId, req.query))));
  router.get('/activity-board', wrap(async (req, res) => ok(res, await activityBoard(req.crm, req.query))));
  router.get('/calendar', wrap(async (req, res) => ok(res, await calendar(req.crm, req.query))));
  router.get('/export.csv', wrap(async (req, res) => exportCsv(req.crm, req.query, res)));
  router.get('/trash', wrap(async (req, res) => ok(res, await listDeals(req.crm, req.query, { trash: true }))));

  // ── Deals ──
  router.get('/deals', wrap(async (req, res) => ok(res, await listDeals(req.crm, req.query))));
  router.post('/deals', wrap(async (req, res) => ok(res, { deal: await createDeal(req.crm, req.body || {}) }, 201)));
  router.post('/deals/bulk', wrap(async (req, res) => ok(res, await bulk(req.crm, req.body || {}))));
  router.get('/deals/:id', wrap(async (req, res) => ok(res, await getDeal(req.crm, req.params.id))));
  router.put('/deals/:id', wrap(async (req, res) => ok(res, { deal: await updateDeal(req.crm, req.params.id, req.body || {}) })));
  router.delete('/deals/:id', wrap(async (req, res) => {
    await deleteDeal(req.crm, req.params.id);
    ok(res);
  }));
  router.post('/deals/:id/move', wrap(async (req, res) => ok(res, { deal: await moveDeal(req.crm, req.params.id, req.body || {}) })));
  router.post('/deals/:id/pipeline', wrap(async (req, res) => ok(res, { deal: await changePipeline(req.crm, req.params.id, req.body || {}) })));
  router.post('/deals/:id/restore', wrap(async (req, res) => ok(res, { deal: await restoreDeal(req.crm, req.params.id) })));
  router.post('/deals/:id/copy', wrap(async (req, res) => ok(res, { deal: await copyDeal(req.crm, req.params.id) }, 201)));
  router.get('/deals/:id/events', wrap(async (req, res) => ok(res, await listEvents(req.crm, req.params.id, req.query))));
  router.post('/deals/:id/comments', wrap(async (req, res) => ok(res, { event: await addComment(req.crm, req.params.id, req.body || {}) }, 201)));

  // ── Activities ──
  router.get('/deals/:id/activities', wrap(async (req, res) => ok(res, { activities: await listActivities(req.crm, req.params.id) })));
  router.post('/deals/:id/activities', wrap(async (req, res) => ok(res, { activity: await createActivity(req.crm, req.params.id, req.body || {}) }, 201)));
  router.get('/activities', wrap(async (req, res) => ok(res, { activities: await myActivities(req.crm, req.query) })));
  router.put('/activities/:id', wrap(async (req, res) => ok(res, { activity: await updateActivity(req.crm, req.params.id, req.body || {}) })));
  router.delete('/activities/:id', wrap(async (req, res) => {
    await deleteActivity(req.crm, req.params.id);
    ok(res);
  }));

  // ── Presets (personal saved filters) ──
  router.get('/presets', wrap(async (req, res) => ok(res, { presets: await listPresets(req.crm) })));
  router.post('/presets', wrap(async (req, res) => ok(res, { preset: await createPreset(req.crm, req.body || {}) }, 201)));
  router.put('/presets/:id', wrap(async (req, res) => ok(res, { preset: await updatePreset(req.crm, req.params.id, req.body || {}) })));
  router.delete('/presets/:id', wrap(async (req, res) => {
    await deletePreset(req.crm, req.params.id);
    ok(res);
  }));

  // ── Pipelines ──
  router.get('/pipelines', wrap(async (req, res) => ok(res, { pipelines: await listPipelines(req.crm, { archived: req.query.archived === '1' }) })));
  router.post('/pipelines', wrap(async (req, res) => ok(res, { pipeline: await createPipeline(req.crm, req.body || {}) }, 201)));
  router.put('/pipelines/order', wrap(async (req, res) => ok(res, { pipelines: await orderPipelines(req.crm, req.body?.ids) })));
  router.put('/pipelines/:id', wrap(async (req, res) => ok(res, { pipeline: await updatePipeline(req.crm, req.params.id, req.body || {}) })));
  router.delete('/pipelines/:id', wrap(async (req, res) => {
    await deletePipeline(req.crm, req.params.id, req.query.moveTo ?? req.body?.moveTo);
    ok(res);
  }));

  return router;
}
