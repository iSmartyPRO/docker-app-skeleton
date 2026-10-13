import { Router } from 'express';
import { query } from '../../config/database.js';
import { updateAdminSettings } from '../../services/settings.js';
import { inboxAct, inboxFor } from '../../services/inbox.js';
import { isoDay } from '../../services/datetime.js';
import { requestRegional } from '../../services/regional.js';
import { listSubjects, wrap } from '../shared/acl.js';
import { getApprovalType, requireApprovalType } from './registry.js';
import { httpError } from './logic.js';
import {
  ADMIN_PERMISSION,
  answer,
  approvalSettings,
  canManageType,
  canSeeProcess,
  decide,
  decidedByMe,
  fieldOptions,
  getProcess,
  getProcessById,
  isApprovalsAdmin,
  myProcesses,
  previewRoute,
  resetRoute,
  restart,
  routeFor,
  tokenAllowsType,
  routeView,
  saveRoute,
  startApproval,
  typesFor,
  withdraw,
} from './engine.js';
import { createSubstitute, deleteSubstitute, listSubstitutes } from './substitutes.js';

const ok = (res, payload = {}, status = 200) => res.status(status).json({ success: true, ...payload });

/** Counters for the header badge and the page: total, overdue, due today, per module. */
async function inboxCounts(req, items) {
  const regional = await requestRegional(req);
  const today = isoDay(new Date(), regional.timeZone);
  const byModule = {};
  let overdue = 0;
  let dueToday = 0;
  for (const item of items) {
    byModule[item.module] = (byModule[item.module] || 0) + 1;
    if (item.overdue) overdue += 1;
    else if (item.dueAt && isoDay(item.dueAt, regional.timeZone) === today) dueToday += 1;
  }
  return { total: items.length, overdue, today: dueToday, byModule };
}

const COUNT_TTL_MS = 20_000;
const countCache = new Map();

function rememberCount(key, value) {
  countCache.delete(key);
  countCache.set(key, { at: Date.now(), value });
  // Oldest first (insertion order): keep the map small.
  while (countCache.size > 2000) countCache.delete(countCache.keys().next().value);
}

/** /api/app/approvals — signed-in people; access is checked per process and per type. */
export function privateRoutes() {
  const router = Router();

  router.get(
    '/meta',
    wrap(async (req, res) => {
      const settings = await approvalSettings();
      const types = await typesFor(req);
      ok(res, {
        settings: {
          urgencies: settings.urgencies,
          defaultUrgency: settings.defaultUrgency,
          soonHours: settings.soonHours,
          reminderPercent: settings.reminderPercent,
          escalation: settings.escalation,
        },
        types,
        canAdmin: isApprovalsAdmin(req),
        canManageRoutes: isApprovalsAdmin(req) || types.some((type) => type.manageable),
      });
    })
  );

  // ── «Ждёт меня» ───────────────────────────────────────────────────────────
  router.get(
    '/inbox',
    wrap(async (req, res) => {
      const { items, failed } = await inboxFor(req);
      const counts = await inboxCounts(req, items);
      const shown = req.query.module ? items.filter((item) => item.module === String(req.query.module)) : items;
      ok(res, { items: shown, failed, counts });
    })
  );

  // The header badge polls this every minute and on window focus: answers
  // from a short per-person cache (shared by parallel tabs); `?fresh=1`
  // (after the person's own decision) skips it.
  router.get(
    '/inbox/count',
    wrap(async (req, res) => {
      const key = `${req.user.id}:${req.apiToken?.id || 's'}`;
      const cached = req.query.fresh === '1' ? null : countCache.get(key);
      if (cached && Date.now() - cached.at < COUNT_TTL_MS) return ok(res, await cached.value);
      const value = (async () => {
        const { items } = await inboxFor(req);
        const counts = await inboxCounts(req, items);
        return { total: counts.total, overdue: counts.overdue, today: counts.today };
      })();
      rememberCount(key, value);
      try {
        ok(res, await value);
      } catch (err) {
        countCache.delete(key);
        throw err;
      }
    })
  );

  router.post(
    '/inbox/act',
    wrap(async (req, res) => {
      const body = req.body || {};
      const result = await inboxAct(req, String(body.provider || ''), body.id, String(body.action || ''), {
        comment: body.comment,
        to: body.to,
        round: body.round,
        stage: body.stage,
      });
      ok(res, { result: result ?? null });
    })
  );

  // Several approvals at once («Согласовать выбранные»); each is its own transaction.
  router.post(
    '/inbox/bulk',
    wrap(async (req, res) => {
      const list = Array.isArray(req.body?.items) ? req.body.items.slice(0, 100) : [];
      if (!list.length) throw httpError(400, 'Nothing selected', 'EMPTY');
      const results = [];
      for (const item of list) {
        try {
          await decide(req, Number(item.id), { action: 'approve', round: item.round, stage: item.stage, comment: req.body?.comment });
          results.push({ id: Number(item.id), ok: true });
        } catch (err) {
          results.push({ id: Number(item.id), ok: false, code: err.code || 'ERROR', error: err.statusCode && err.statusCode < 500 ? err.message : 'Server error' });
        }
      }
      ok(res, { results, approved: results.filter((r) => r.ok).length });
    })
  );

  router.get('/mine', wrap(async (req, res) => ok(res, { items: await myProcesses(req, { includeFinished: req.query.finished === '1' }) })));
  router.get('/decided', wrap(async (req, res) => ok(res, await decidedByMe(req, { before: req.query.before, limit: req.query.limit }))));

  // ── Processes ─────────────────────────────────────────────────────────────
  router.get('/processes/:id', wrap(async (req, res) => ok(res, { process: await getProcessById(req.params.id, req) })));
  router.post('/processes/:id/decide', wrap(async (req, res) => ok(res, { process: await decide(req, Number(req.params.id), req.body || {}) })));
  router.post('/processes/:id/answer', wrap(async (req, res) => ok(res, { process: await answer(req, Number(req.params.id), req.body || {}) })));

  /** The process of a document, for <ApprovalPath type docId />. `process: null` when it never went to approval. */
  router.get(
    '/process/:type/:docId',
    wrap(async (req, res) => {
      const type = requireApprovalType(req.params.type);
      const process = await getProcess(type.key, req.params.docId, req);
      if (process) {
        const { rows } = await query(`SELECT * FROM approval_processes WHERE id = $1`, [process.id]);
        if (!(await canSeeProcess(req, rows[0]))) throw httpError(404, 'Approval not found', 'NOT_FOUND');
      } else if (!tokenAllowsType(req, type, 'read') || (!canManageType(req, type) && !(await type.canView(req, String(req.params.docId))))) {
        throw httpError(404, 'Approval not found', 'NOT_FOUND');
      }
      ok(res, { process });
    })
  );
  router.post('/process/:type/:docId/start', wrap(async (req, res) => ok(res, { process: await startApproval(req, req.params.type, req.params.docId, req.body || {}) }, 201)));
  router.post('/process/:type/:docId/withdraw', wrap(async (req, res) => ok(res, { process: await withdraw(req, req.params.type, req.params.docId, req.body || {}) })));
  router.post('/process/:type/:docId/restart', wrap(async (req, res) => ok(res, { process: await restart(req, req.params.type, req.params.docId, req.body || {}) })));

  // People, roles and groups for pickers (question target, delegate, route builder).
  router.get('/subjects', wrap(async (req, res) => ok(res, await listSubjects())));

  // ── Routes (approvals.admin or the type module's admin) ─────────────────
  router.get(
    '/routes',
    wrap(async (req, res) => {
      const types = (await typesFor(req)).filter((type) => type.manageable);
      const out = [];
      for (const item of types) {
        const type = getApprovalType(item.key);
        const route = await routeFor(type);
        out.push({ ...item, stages: route.stages.length, saved: Boolean(route.saved), isDefault: Boolean(route.isDefault), fallback: Boolean(route.fallback), updatedAt: route.updatedAt || null });
      }
      ok(res, { types: out });
    })
  );
  router.get(
    '/routes/:type',
    wrap(async (req, res) => {
      const type = requireApprovalType(req.params.type);
      if (!canManageType(req, type)) throw httpError(403, 'You cannot see this route', 'FORBIDDEN');
      ok(res, { route: await routeView(type, await routeFor(type)) });
    })
  );
  router.put('/routes/:type', wrap(async (req, res) => ok(res, { route: await saveRoute(req, req.params.type, req.body || {}) })));
  router.delete('/routes/:type', wrap(async (req, res) => ok(res, { route: await resetRoute(req, req.params.type) })));
  router.post('/routes/:type/preview', wrap(async (req, res) => ok(res, await previewRoute(req, req.params.type, req.body?.values || {}, req.body?.draft || null))));
  router.get('/routes/:type/fields/:field/options', wrap(async (req, res) => ok(res, { options: await fieldOptions(req, req.params.type, req.params.field) })));

  // ── Settings (urgency levels, reminders, escalation) ─────────────────────
  router.put(
    '/settings',
    wrap(async (req, res) => {
      if (!isApprovalsAdmin(req)) throw httpError(403, `Requires ${ADMIN_PERMISSION}`, 'FORBIDDEN');
      const body = req.body || {};
      const patch = {};
      for (const key of ['urgencies', 'defaultUrgency', 'soonHours', 'reminderPercent', 'escalation']) if (body[key] !== undefined) patch[key] = body[key];
      await updateAdminSettings({ modules: { approvals: { settings: patch } } });
      ok(res, { settings: await approvalSettings() });
    })
  );

  // ── Substitutes ───────────────────────────────────────────────────────────
  router.get('/substitutes', wrap(async (req, res) => ok(res, await listSubstitutes(req, { all: req.query.all === '1' }))));
  router.post('/substitutes', wrap(async (req, res) => ok(res, { id: await createSubstitute(req, req.body || {}) }, 201)));
  router.delete(
    '/substitutes/:id',
    wrap(async (req, res) => {
      await deleteSubstitute(req, req.params.id);
      ok(res);
    })
  );

  return router;
}
