import { Router } from 'express';
import { query } from '../../config/database.js';
import { getSettings, parseSettings, updateAdminSettings } from '../../services/settings.js';
import { archiveLegalEntity, createLegalEntity, listLegalEntities, updateLegalEntity } from '../../services/legalEntities.js';
import { userShape } from '../shared/acl.js';
import { PAYMENT_METHODS, DOC_KINDS, PAYMENT_TERMS, STATUSES, httpError } from './logic.js';
import { modulesState } from './access.js';
import {
  board,
  cancelRequest,
  chipCounters,
  closeRequest,
  contextOf,
  createRequest,
  deleteRequest,
  duplicateRequest,
  getRequest,
  history,
  listRequests,
  reopenRequest,
  submitRequest,
  updateRequest,
  withdrawRequest,
} from './service.js';
import { deleteDocument, linkDocument, sendDocument, updateDocument, uploadDocuments, MAX_UPLOAD_MB } from './files.js';
import { addDelivery, addPayment, deleteDelivery, deletePayment } from './money.js';
import { EXPORT_COLUMNS, listCsv, registry, registryCsv, summary, widget } from './reports.js';
import { lookup } from './lookups.js';

/** /api/app/procurement (signed-in; API tokens need the `procurement` area). Spec: docs/procurement.md#http-api. */

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};
const ok = (res, data = {}, status = 200) => res.status(status).json({ success: true, ...data });

async function requireAdmin(req) {
  const ctx = await contextOf(req);
  if (!ctx.canAdmin) throw httpError(403, 'Procurement administrators only', 'FORBIDDEN');
  return ctx;
}

function sendCsv(res, { csv, filename }) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(csv);
}

export function privateRoutes() {
  const router = Router();

  router.get('/meta', wrap(async (req, res) => {
    const ctx = await contextOf(req);
    const s = ctx.settings;
    ok(res, {
      settings: { categories: s.categories, currencies: s.currencies, currency: s.currency, units: s.units, invoiceRequired: s.invoiceRequired, numberPrefix: s.numberPrefix, reminderDays: s.reminderDays },
      legalEntities: await listLegalEntities(),
      rights: { canCreate: ctx.canCreate, canPay: ctx.canPay, canAdmin: ctx.canAdmin, canViewAll: ctx.canViewAll },
      modules: await modulesState(),
      statuses: STATUSES,
      paymentTerms: PAYMENT_TERMS,
      paymentMethods: PAYMENT_METHODS,
      docKinds: DOC_KINDS,
      exportColumns: Object.keys(EXPORT_COLUMNS),
      maxUploadMb: MAX_UPLOAD_MB,
      me: req.user.id,
    });
  }));

  router.get('/people', wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users
       WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE ORDER BY LOWER(COALESCE(display_name, username)) LIMIT 2000`
    );
    ok(res, { people: rows.map(userShape) });
  }));

  // Requests
  router.get('/requests', wrap(async (req, res) => ok(res, await listRequests(req, req.query))));
  router.get('/counters', wrap(async (req, res) => ok(res, { counters: await chipCounters(req, req.query) })));
  router.get('/board', wrap(async (req, res) => ok(res, await board(req, req.query))));
  router.get('/export.csv', wrap(async (req, res) => sendCsv(res, await listCsv(req, req.query))));
  router.post('/requests', wrap(async (req, res) => ok(res, await createRequest(req, req.body || {}), 201)));
  router.get('/requests/:id', wrap(async (req, res) => ok(res, await getRequest(req, req.params.id))));
  router.put('/requests/:id', wrap(async (req, res) => ok(res, await updateRequest(req, req.params.id, req.body || {}))));
  router.delete('/requests/:id', wrap(async (req, res) => {
    await deleteRequest(req, req.params.id);
    ok(res);
  }));
  router.get('/requests/:id/history', wrap(async (req, res) => ok(res, { history: await history(req, req.params.id) })));
  router.post('/requests/:id/submit', wrap(async (req, res) => ok(res, await submitRequest(req, req.params.id, req.body || {}))));
  router.post('/requests/:id/withdraw', wrap(async (req, res) => ok(res, await withdrawRequest(req, req.params.id, req.body || {}))));
  router.post('/requests/:id/cancel', wrap(async (req, res) => ok(res, await cancelRequest(req, req.params.id, req.body || {}))));
  router.post('/requests/:id/close', wrap(async (req, res) => ok(res, await closeRequest(req, req.params.id, req.body || {}))));
  router.post('/requests/:id/reopen', wrap(async (req, res) => ok(res, await reopenRequest(req, req.params.id, req.body || {}))));
  router.post('/requests/:id/duplicate', wrap(async (req, res) => ok(res, await duplicateRequest(req, req.params.id), 201)));

  // Documents
  router.post('/requests/:id/documents', wrap(async (req, res) => ok(res, { documents: await uploadDocuments(req, res, req.params.id) }, 201)));
  router.post('/requests/:id/documents/link', wrap(async (req, res) => ok(res, { documents: await linkDocument(req, req.params.id, req.body || {}) }, 201)));
  router.get('/documents/:id/file', wrap(async (req, res) => sendDocument(req, res, req.params.id, req.query.download === '1')));
  router.put('/documents/:id', wrap(async (req, res) => ok(res, { documents: await updateDocument(req, req.params.id, req.body || {}) })));
  router.delete('/documents/:id', wrap(async (req, res) => ok(res, { documents: await deleteDocument(req, req.params.id) })));

  // Payments and deliveries
  router.post('/requests/:id/payments', wrap(async (req, res) => ok(res, await addPayment(req, res, req.params.id), 201)));
  router.delete('/payments/:id', wrap(async (req, res) => ok(res, await deletePayment(req, req.params.id))));
  router.post('/requests/:id/deliveries', wrap(async (req, res) => ok(res, await addDelivery(req, res, req.params.id), 201)));
  router.delete('/deliveries/:id', wrap(async (req, res) => ok(res, await deleteDelivery(req, req.params.id))));

  // Accounting and management
  router.get('/registry', wrap(async (req, res) => ok(res, await registry(req, req.query))));
  router.get('/registry.csv', wrap(async (req, res) => sendCsv(res, await registryCsv(req, req.query))));
  router.get('/summary', wrap(async (req, res) => ok(res, await summary(req, req.query))));
  router.get('/widget', wrap(async (req, res) => ok(res, await widget(req))));

  // Pickers for links to other modules
  router.get('/lookup/:kind', wrap(async (req, res) => ok(res, { items: await lookup(req, req.params.kind, req.query) })));

  // Saved views (filter + chip + layout), per person
  router.get('/views', wrap(async (req, res) => {
    const { rows } = await query(`SELECT id, name, filter FROM proc_views WHERE user_id = $1 ORDER BY id`, [req.user.id]);
    ok(res, { views: rows });
  }));
  router.post('/views', wrap(async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) throw httpError(400, 'Name the view', 'NAME_REQUIRED');
    const filter = req.body?.filter && typeof req.body.filter === 'object' ? req.body.filter : {};
    if (JSON.stringify(filter).length > 4000) throw httpError(400, 'The view is too large', 'TOO_LARGE');
    const count = (await query(`SELECT COUNT(*)::int AS n FROM proc_views WHERE user_id = $1`, [req.user.id])).rows[0].n;
    if (count >= 30) throw httpError(400, 'Too many saved views', 'LIMIT');
    const { rows } = await query(`INSERT INTO proc_views (user_id, name, filter) VALUES ($1, $2, $3) RETURNING id, name, filter`, [req.user.id, name, JSON.stringify(filter)]);
    ok(res, { view: rows[0] }, 201);
  }));
  router.delete('/views/:id', wrap(async (req, res) => {
    await query(`DELETE FROM proc_views WHERE id = $1 AND user_id = $2`, [Number(req.params.id) || 0, req.user.id]);
    ok(res);
  }));

  // Settings and directories (procurement.admin, without the console's settings.modules)
  router.get('/settings', wrap(async (req, res) => {
    const ctx = await requireAdmin(req);
    ok(res, { settings: ctx.settings });
  }));
  router.put('/settings', wrap(async (req, res) => {
    await requireAdmin(req);
    await updateAdminSettings({ modules: { procurement: { settings: req.body || {} } } });
    ok(res, { settings: parseSettings(await getSettings({ fresh: true })).modules.procurement.settings });
  }));
  router.get('/legal-entities', wrap(async (req, res) => ok(res, { entities: await listLegalEntities({ includeArchived: req.query.archived === '1' }) })));
  router.post('/legal-entities', wrap(async (req, res) => {
    await requireAdmin(req);
    ok(res, { entity: await createLegalEntity(req.body || {}) }, 201);
  }));
  router.put('/legal-entities/:id', wrap(async (req, res) => {
    await requireAdmin(req);
    ok(res, { entity: await updateLegalEntity(req.params.id, req.body || {}) });
  }));
  router.delete('/legal-entities/:id', wrap(async (req, res) => {
    await requireAdmin(req);
    ok(res, { entity: await archiveLegalEntity(req.params.id) });
  }));

  return router;
}
