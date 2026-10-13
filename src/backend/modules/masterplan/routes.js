import { Router } from 'express';
import { query } from '../../config/database.js';
import { getSettings, parseSettings, updateAdminSettings } from '../../services/settings.js';
import { getAccessMap } from '../../services/rbac.js';
import { notify } from '../../services/notifications.js';
import { httpError, userShape } from '../shared/acl.js';
import { STATUSES, ROLES, FINISHINGS, PAYMENT_FORMS, PROJECT_CLASSES, PROJECT_STATUSES, MEDIA_KINDS, TYPE_CATEGORIES } from './constants.js';
import { modulesEnabled, mpContext, mpSettings, requireAdmin, requireProject } from './access.js';
import { createPlan, createProject, deletePlan, deleteProject, getProject, listProjects, listTeam, projectMap, saveContours, saveTeam, updatePlan, updateProject } from './projects.js';
import { bulkCreate, createNode, deleteNode, getNode, moveNode, nodeCard, nodeEvents, updateNode } from './nodes.js';
import { assignManager, bulkPrice, bulkStatus, changeStatus, extendBooking, listBookings } from './sales.js';
import { exportCsv, importUnits, listUnits } from './units.js';
import { constructionList, createReport, deleteReport, listReports, listStages, reportById, reviewReport, saveStageSet, setReadiness, updateNodeStage } from './construction.js';
import { deleteMedia, mediaUploader, sendMedia, storeMedia } from './media.js';
import { listTypes, saveTypes, ICONS } from './directory.js';
import { dashboard } from './dashboard.js';
import { dealUnits } from './crmLink.js';
import { openStream } from './realtime.js';
import { mpMessage } from './messages.js';
import { userName } from './util.js';

/** Like shared wrap(); a unique-code race becomes 409 CODE_TAKEN. */
const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    if (err.code === '23505') {
      next(httpError(409, 'This code is taken', 'CODE_TAKEN'));
      return;
    }
    next(err);
  }
};

const ok = (res, payload = {}, status = 200) => res.status(status).json({ success: true, ...payload });

/** Settings everyone in the module may read (no secrets in this module's settings, but keep it explicit). */
function publicSettings(settings) {
  const keys = ['currency', 'currencies', 'rates', 'statusColors', 'reserveHours', 'bookingDays', 'managerExtensions', 'reserveLimit', 'warnHours', 'requireDeal', 'fixPriceOnBooking', 'salesHeadMaxCutPct', 'staleReportDays', 'delayAlertDays', 'maxUploadMb'];
  return Object.fromEntries(keys.map((key) => [key, settings[key]]));
}

function runUpload(upload, req, res) {
  return new Promise((done, fail) => {
    upload(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') fail(httpError(413, 'File is too large', 'FILE_TOO_LARGE'));
      else if (err) fail(err);
      else done(req.files || {});
    });
  });
}

/** /api/app/masterplan — signed-in users; rights are checked per project and node (access.js, rules.js). */
export function privateRoutes() {
  const router = Router();
  router.use(async (req, res, next) => {
    try {
      req.mp = await mpContext(req, await mpSettings());
      req.mp.request = req;
      next();
    } catch (err) {
      next(err);
    }
  });

  // ── Meta, settings, people ──
  router.get('/meta', wrap(async (req, res) => {
    const enabled = await modulesEnabled();
    const [projects, types, stages] = await Promise.all([listProjects(req.mp), listTypes(), listStages()]);
    ok(res, {
      settings: publicSettings(req.mp.settings),
      statuses: STATUSES,
      roles: ROLES,
      finishings: FINISHINGS,
      paymentForms: PAYMENT_FORMS,
      projectClasses: PROJECT_CLASSES,
      projectStatuses: PROJECT_STATUSES,
      mediaKinds: MEDIA_KINDS,
      categories: TYPE_CATEGORIES,
      icons: ICONS,
      projects,
      types,
      stages,
      me: { id: req.mp.userId, roles: [...req.mp.globalRoles], isAdmin: req.mp.isAdmin, hasAccess: req.mp.globalRoles.size > 0 || req.mp.assignments.length > 0 },
      crmEnabled: enabled.crm,
      companiesEnabled: enabled.companies,
    });
  }));
  router.get('/settings', wrap(async (req, res) => {
    requireAdmin(req.mp);
    ok(res, { settings: req.mp.settings });
  }));
  router.put('/settings', wrap(async (req, res) => {
    requireAdmin(req.mp);
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw httpError(400, 'Settings object expected', 'INVALID_SETTINGS');
    await updateAdminSettings({ modules: { masterplan: { settings: req.body } } });
    ok(res, { settings: parseSettings(await getSettings({ fresh: true })).modules.masterplan.settings });
  }));
  router.get('/users', wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE ORDER BY LOWER(COALESCE(display_name, username)) LIMIT 2000`
    );
    ok(res, { users: rows.map(userShape) });
  }));
  router.get('/groups', wrap(async (req, res) => {
    const { rows } = await query(`SELECT id, name FROM app_groups ORDER BY LOWER(name)`);
    ok(res, { groups: rows });
  }));
  // "Доступ ещё не выдан" → the module's administrators get a notification (spec §11.1, adapted).
  router.post('/access-request', wrap(async (req, res) => {
    const { rows: active } = await query(`SELECT id FROM users WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE`);
    const map = await getAccessMap(active.map((row) => row.id));
    let admins = [...map].filter(([, access]) => (access.permissions || []).includes('masterplan.admin')).map(([id]) => id);
    if (!admins.length) admins = [...map].filter(([, access]) => (access.permissions || []).includes('*')).map(([id]) => id);
    const actor = await userName(req.mp.userId);
    await notify({ userIds: admins, kind: 'masterplan.access', module: 'masterplan', link: '/app/masterplan', actorId: req.mp.userId, render: mpMessage('accessRequest', { actor, note: String(req.body?.note || '').slice(0, 300) }) });
    ok(res, { sent: admins.filter((id) => id !== req.mp.userId).length });
  }));

  // ── Directories ──
  router.get('/types', wrap(async (req, res) => ok(res, { types: await listTypes({ archived: req.query.archived === '1' }) })));
  router.put('/types', wrap(async (req, res) => ok(res, { types: await saveTypes(req.mp, req.body?.types) })));
  router.get('/stages', wrap(async (req, res) => ok(res, { stages: await listStages() })));
  router.put('/stages/:set', wrap(async (req, res) => ok(res, { stages: await saveStageSet(req.mp, req.params.set, req.body?.stages) })));

  // ── Projects ──
  router.get('/projects', wrap(async (req, res) => ok(res, { projects: await listProjects(req.mp, { archived: req.query.archived === '1' }) })));
  router.post('/projects', wrap(async (req, res) => ok(res, { project: await createProject(req.mp, req.body || {}) }, 201)));
  router.get('/projects/:id', wrap(async (req, res) => ok(res, { project: await getProject(req.mp, req.params.id) })));
  router.put('/projects/:id', wrap(async (req, res) => ok(res, { project: await updateProject(req.mp, req.params.id, req.body || {}) })));
  router.delete('/projects/:id', wrap(async (req, res) => {
    await deleteProject(req.mp, req.params.id);
    ok(res);
  }));
  router.get('/projects/:id/map', wrap(async (req, res) => ok(res, await projectMap(req.mp, req.params.id, { presentation: req.query.presentation === '1' }))));
  router.get('/projects/:id/team', wrap(async (req, res) => ok(res, { team: await listTeam(req.mp, req.params.id) })));
  router.put('/projects/:id/team', wrap(async (req, res) => ok(res, { team: await saveTeam(req.mp, req.params.id, req.body?.team) })));
  router.get('/projects/:id/construction', wrap(async (req, res) => ok(res, await constructionList(req.mp, req.params.id, req.query))));
  router.get('/projects/:id/dashboard', wrap(async (req, res) => ok(res, await dashboard(req.mp, req.params.id))));
  router.post('/projects/:id/plans', wrap(async (req, res) => ok(res, { plan: await createPlan(req.mp, req.params.id, req.body || {}) }, 201)));
  router.put('/plans/:id', wrap(async (req, res) => ok(res, { plan: await updatePlan(req.mp, req.params.id, req.body || {}) })));
  router.delete('/plans/:id', wrap(async (req, res) => {
    await deletePlan(req.mp, req.params.id);
    ok(res);
  }));
  router.put('/plans/:id/contours', wrap(async (req, res) => ok(res, await saveContours(req.mp, req.params.id, req.body || {}))));
  // Live updates of a project's plan (SSE).
  router.get('/stream', wrap(async (req, res) => {
    const project = await requireProject(req.mp, req.query.project);
    openStream(req, res, project.id);
  }));

  // ── Tree ──
  router.post('/nodes', wrap(async (req, res) => ok(res, { node: await createNode(req.mp, req.body || {}) }, 201)));
  router.post('/nodes/bulk', wrap(async (req, res) => ok(res, await bulkCreate(req.mp, req.body || {}), 201)));
  router.get('/nodes/:id', wrap(async (req, res) => ok(res, await nodeCard(req.mp, req.params.id, { presentation: req.query.presentation === '1' }))));
  router.put('/nodes/:id', wrap(async (req, res) => ok(res, { node: await updateNode(req.mp, req.params.id, req.body || {}) })));
  router.delete('/nodes/:id', wrap(async (req, res) => {
    await deleteNode(req.mp, req.params.id);
    ok(res);
  }));
  router.post('/nodes/:id/move', wrap(async (req, res) => ok(res, { node: await moveNode(req.mp, req.params.id, req.body || {}) })));
  router.get('/nodes/:id/events', wrap(async (req, res) => ok(res, await nodeEvents(req.mp, req.params.id, req.query))));
  router.put('/nodes/:id/stages/:stageId', wrap(async (req, res) => ok(res, await updateNodeStage(req.mp, req.params.id, req.params.stageId, req.body || {}))));
  router.put('/nodes/:id/readiness', wrap(async (req, res) => ok(res, await setReadiness(req.mp, req.params.id, req.body || {}))));

  // ── Units: registry, sales ──
  router.get('/units', wrap(async (req, res) => ok(res, await listUnits(req.mp, req.query))));
  router.get('/units/export.csv', wrap(async (req, res) => exportCsv(req.mp, req.query, res)));
  router.post('/units/import', wrap(async (req, res) => ok(res, await importUnits(req.mp, req.body || {}))));
  router.post('/units/bulk-price', wrap(async (req, res) => ok(res, await bulkPrice(req.mp, req.body || {}))));
  router.post('/units/bulk-status', wrap(async (req, res) => ok(res, await bulkStatus(req.mp, req.body || {}))));
  router.get('/units/:id', wrap(async (req, res) => ok(res, { node: await getNode(req.mp, req.params.id, { presentation: req.query.presentation === '1' }) })));
  router.post('/units/:id/status', wrap(async (req, res) => ok(res, { node: await changeStatus(req.mp, req.params.id, req.body || {}) })));
  router.post('/units/:id/extend', wrap(async (req, res) => ok(res, await extendBooking(req.mp, req.params.id, req.body || {}))));
  router.post('/units/:id/manager', wrap(async (req, res) => ok(res, { node: await assignManager(req.mp, req.params.id, req.body || {}) })));
  router.get('/bookings', wrap(async (req, res) => ok(res, { bookings: await listBookings(req.mp, req.query) })));
  router.get('/deals/:dealId/units', wrap(async (req, res) => ok(res, await dealUnits(req.mp, req.params.dealId))));

  // ── Construction journal ──
  router.get('/reports', wrap(async (req, res) => ok(res, await listReports(req.mp, req.query))));
  router.post('/reports', wrap(async (req, res) => ok(res, { report: await createReport(req.mp, req.body || {}) }, 201)));
  router.get('/reports/:id', wrap(async (req, res) => ok(res, { report: await reportById(req.mp, req.params.id) })));
  router.post('/reports/:id/review', wrap(async (req, res) => ok(res, { report: await reviewReport(req.mp, req.params.id, req.body || {}) })));
  router.delete('/reports/:id', wrap(async (req, res) => {
    await deleteReport(req.mp, req.params.id);
    ok(res);
  }));

  // ── Media ──
  router.post('/media', wrap(async (req, res) => {
    const files = await runUpload(mediaUploader(req.mp.settings.maxUploadMb || 50), req, res);
    ok(res, { media: await storeMedia(req.mp, req.body || {}, files) }, 201);
  }));
  router.get('/media/:id', wrap(async (req, res) => sendMedia(req.mp, req.params.id, res, { thumb: req.query.thumb === '1', download: req.query.download === '1' })));
  router.delete('/media/:id', wrap(async (req, res) => {
    await deleteMedia(req.mp, req.params.id);
    ok(res);
  }));

  return router;
}
