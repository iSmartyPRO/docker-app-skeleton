import { Router } from 'express';
import { query } from '../../config/database.js';
import { getSettings, parseSettings, updateAdminSettings } from '../../services/settings.js';
import { userShape } from '../shared/acl.js';
import { modulesState, whContext } from './access.js';
import { BIN_KINDS, DOC_TYPES, FILE_KINDS, HOLDER_TYPES, INSTANCE_STATES, RESERVE_TARGETS, RIGHTS, STATUSES, TRACKING, USER_TYPES, WAREHOUSE_KINDS, WRITEOFF_REASONS, httpError, stripCost } from './logic.js';
import { addBarcode, archiveItem, canEditItems, createItem, deleteCategory, getItem, listCategories, listItems, removeBarcode, resolveCode, saveCategory, saveNorms, updateItem } from './items.js';
import { createBins, createWarehouse, getAccess, listBins, listWarehouses, saveAccess, updateBin, updateWarehouse } from './warehouses.js';
import { createReserve, hintsFor, listReserves, listStock, releaseReserve } from './stock.js';
import {
  addLine,
  confirmHandover,
  createDoc,
  declineHandover,
  deleteDoc,
  deleteLine,
  docCounters,
  getDoc,
  history,
  listDocs,
  postDoc,
  receiveDoc,
  requestDoc,
  shipDoc,
  signDoc,
  stornoDoc,
  updateDoc,
  updateLine,
} from './documents.js';
import { deleteFile, sendFile, uploadFiles, MAX_UPLOAD_MB } from './files.js';
import { getTool, handover, listTools, myTools, updateTool } from './tools.js';
import { byObject, itemMovement, reportCsv, toolsByHolder, turnover } from './reports.js';
import { importItems, importOpening } from './importer.js';
import { orderForWarehouse, orderShortage, receiptFromRequest } from './procurement.js';
import { lookup, widget } from './lookups.js';
import {
  activeSessions,
  addPeople,
  areaView,
  assignAreas,
  cancelSession,
  closeCounting,
  createSession,
  deleteSchedule,
  finishSession,
  getSession,
  listSchedules,
  listSessions,
  reconcileSession,
  reopenSession,
  requestRecount,
  saveSchedule,
  setFinal,
  startSession,
  syncOps,
} from './inventory.js';

/** /api/app/warehouse (signed-in; API tokens need the `warehouse` area). Spec: docs/warehouse.md#http-api. */

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

/**
 * Every JSON answer goes through here: without warehouse.cost on any
 * warehouse, sums are removed from the whole payload (spec §9 «суммы
 * скрываются на сервере во всех ответах»). Services also hide sums per
 * warehouse for people who see costs only on some.
 */
async function ok(req, res, data = {}, status = 200) {
  const ctx = await whContext(req);
  res.status(status).json({ success: true, ...(ctx.costAny ? data : stripCost(data)) });
}

function sendCsv(res, { csv, filename }) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]+/g, '_')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(csv);
}

async function requireAdmin(req) {
  const ctx = await whContext(req);
  if (!ctx.isAdmin) throw httpError(403, 'Warehouse administrators only', 'FORBIDDEN');
  return ctx;
}

export function privateRoutes() {
  const router = Router();

  router.get('/meta', wrap(async (req, res) => {
    const ctx = await whContext(req);
    const s = ctx.settings;
    const warehouses = await listWarehouses(req);
    ok(req, res, {
      settings: { currency: s.currency, currencies: s.currencies, rates: s.rates, units: s.units, approvalThreshold: s.approvalThreshold, approvalThresholdCurrency: s.approvalThresholdCurrency, approvalTypes: s.approvalTypes, closedUntil: s.closedUntil, expiryWarnDays: s.expiryWarnDays, serviceWarnDays: s.serviceWarnDays, staleDays: s.staleDays, numberPrefixes: s.numberPrefixes },
      warehouses,
      categories: await listCategories(),
      rights: {
        global: [...ctx.global],
        isAdmin: ctx.isAdmin,
        cost: ctx.costAny,
        canEditItems: canEditItems(ctx),
        canAdminAny: ctx.canAny('admin'),
        canOperateAny: ctx.canAny('operate'),
        canRequestAny: ctx.canAny('request'),
        canWriteoffAny: ctx.canAny('writeoff'),
        canInventoryAny: ctx.canAny('inventory'),
        mol: [...ctx.molOf],
      },
      modules: await modulesState(),
      enums: { types: USER_TYPES, allTypes: Object.keys(DOC_TYPES), statuses: STATUSES, reasons: WRITEOFF_REASONS, warehouseKinds: WAREHOUSE_KINDS, tracking: TRACKING, binKinds: BIN_KINDS, holderTypes: HOLDER_TYPES, instanceStates: INSTANCE_STATES, reserveTargets: RESERVE_TARGETS, rights: RIGHTS, fileKinds: FILE_KINDS },
      maxUploadMb: MAX_UPLOAD_MB,
      me: req.user.id,
    });
  }));

  router.get('/people', wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users
       WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE ORDER BY LOWER(COALESCE(display_name, username)) LIMIT 2000`
    );
    ok(req, res, { people: rows.map(userShape) });
  }));
  router.get('/groups', wrap(async (req, res) => {
    const { rows } = await query(`SELECT id, name FROM app_groups ORDER BY LOWER(name)`);
    ok(req, res, { groups: rows });
  }));

  // Scanning: what is this code?
  router.get('/resolve', wrap(async (req, res) => ok(req, res, await resolveCode(req, req.query.code, req.query))));

  // Nomenclature
  router.get('/items', wrap(async (req, res) => ok(req, res, await listItems(req, req.query))));
  router.post('/items', wrap(async (req, res) => ok(req, res, await createItem(req, req.body || {}), 201)));
  router.get('/items/:id', wrap(async (req, res) => ok(req, res, await getItem(req, req.params.id))));
  router.put('/items/:id', wrap(async (req, res) => ok(req, res, await updateItem(req, req.params.id, req.body || {}))));
  router.post('/items/:id/archive', wrap(async (req, res) => ok(req, res, await archiveItem(req, req.params.id, true))));
  router.post('/items/:id/restore', wrap(async (req, res) => ok(req, res, await archiveItem(req, req.params.id, false))));
  router.post('/items/:id/barcodes', wrap(async (req, res) => ok(req, res, await addBarcode(req, req.params.id, req.body || {}), 201)));
  router.delete('/barcodes/:id', wrap(async (req, res) => ok(req, res, await removeBarcode(req, req.params.id))));
  router.put('/items/:id/norms', wrap(async (req, res) => {
    await saveNorms(req, req.params.id, req.body?.norms || []);
    ok(req, res, await getItem(req, req.params.id));
  }));
  router.get('/categories', wrap(async (req, res) => ok(req, res, { categories: await listCategories() })));
  router.post('/categories', wrap(async (req, res) => ok(req, res, { categories: await saveCategory(req, null, req.body || {}) }, 201)));
  router.put('/categories/:id', wrap(async (req, res) => ok(req, res, { categories: await saveCategory(req, req.params.id, req.body || {}) })));
  router.delete('/categories/:id', wrap(async (req, res) => ok(req, res, { categories: await deleteCategory(req, req.params.id) })));

  // Warehouses, bins, zones of responsibility
  router.get('/warehouses', wrap(async (req, res) => ok(req, res, { warehouses: await listWarehouses(req, { archived: req.query.archived === '1' }) })));
  router.post('/warehouses', wrap(async (req, res) => ok(req, res, { warehouse: await createWarehouse(req, req.body || {}) }, 201)));
  router.put('/warehouses/:id', wrap(async (req, res) => ok(req, res, { warehouse: await updateWarehouse(req, req.params.id, req.body || {}) })));
  router.get('/warehouses/:id/bins', wrap(async (req, res) => ok(req, res, { bins: await listBins(req, req.params.id, { archived: req.query.archived === '1' }) })));
  router.post('/warehouses/:id/bins', wrap(async (req, res) => ok(req, res, { bins: await createBins(req, req.params.id, req.body || {}) }, 201)));
  router.put('/bins/:id', wrap(async (req, res) => ok(req, res, { bins: await updateBin(req, req.params.id, req.body || {}) })));
  router.get('/warehouses/:id/access', wrap(async (req, res) => ok(req, res, { entries: await getAccess(req, req.params.id) })));
  router.put('/warehouses/:id/access', wrap(async (req, res) => ok(req, res, { entries: await saveAccess(req, req.params.id, req.body?.entries || []) })));

  // Stock and reserves
  router.get('/stock', wrap(async (req, res) => ok(req, res, await listStock(req, req.query))));
  router.get('/stock/hints', wrap(async (req, res) => ok(req, res, { hints: await hintsFor(req, req.query) })));
  router.get('/reserves', wrap(async (req, res) => ok(req, res, { reserves: await listReserves(req, req.query) })));
  router.post('/reserves', wrap(async (req, res) => ok(req, res, { reserve: await createReserve(req, req.body || {}) }, 201)));
  router.post('/reserves/:id/release', wrap(async (req, res) => ok(req, res, { reserve: await releaseReserve(req, req.params.id) })));

  // Documents
  router.get('/documents', wrap(async (req, res) => ok(req, res, await listDocs(req, req.query))));
  router.get('/documents/counters', wrap(async (req, res) => ok(req, res, { counters: await docCounters(req, req.query) })));
  router.post('/documents', wrap(async (req, res) => ok(req, res, await createDoc(req, req.body || {}), 201)));
  router.post('/documents/from-procurement', wrap(async (req, res) => ok(req, res, await receiptFromRequest(req, req.body || {}), 201)));
  router.get('/documents/:id', wrap(async (req, res) => ok(req, res, await getDoc(req, req.params.id))));
  router.put('/documents/:id', wrap(async (req, res) => ok(req, res, await updateDoc(req, req.params.id, req.body || {}))));
  router.delete('/documents/:id', wrap(async (req, res) => {
    await deleteDoc(req, req.params.id);
    ok(req, res);
  }));
  router.get('/documents/:id/history', wrap(async (req, res) => ok(req, res, { history: await history(req, req.params.id) })));
  router.post('/documents/:id/lines', wrap(async (req, res) => ok(req, res, await addLine(req, req.params.id, req.body || {}), 201)));
  router.put('/documents/:id/lines/:lineId', wrap(async (req, res) => ok(req, res, await updateLine(req, req.params.id, req.params.lineId, req.body || {}))));
  router.delete('/documents/:id/lines/:lineId', wrap(async (req, res) => ok(req, res, await deleteLine(req, req.params.id, req.params.lineId))));
  router.post('/documents/:id/post', wrap(async (req, res) => ok(req, res, await postDoc(req, req.params.id, req.body || {}))));
  router.post('/documents/:id/request', wrap(async (req, res) => ok(req, res, await requestDoc(req, req.params.id))));
  router.post('/documents/:id/ship', wrap(async (req, res) => ok(req, res, await shipDoc(req, req.params.id))));
  router.post('/documents/:id/receive', wrap(async (req, res) => ok(req, res, await receiveDoc(req, req.params.id, req.body || {}))));
  router.post('/documents/:id/storno', wrap(async (req, res) => ok(req, res, await stornoDoc(req, req.params.id, req.body || {}))));
  router.post('/documents/:id/confirm', wrap(async (req, res) => ok(req, res, await confirmHandover(req, req.params.id))));
  router.post('/documents/:id/decline', wrap(async (req, res) => ok(req, res, await declineHandover(req, req.params.id, req.body || {}))));
  router.post('/documents/:id/signature', wrap(async (req, res) => ok(req, res, await signDoc(req, req.params.id, req.body || {}))));
  router.post('/documents/:id/order-shortage', wrap(async (req, res) => ok(req, res, await orderShortage(req, req.params.id), 201)));
  router.post('/procurement/order', wrap(async (req, res) => ok(req, res, await orderForWarehouse(req, req.body || {}), 201)));

  // Attachments: items, instances, documents
  router.post('/:owner(items|documents|tools)/:id/files', wrap(async (req, res) => {
    const owner = { items: 'item', documents: 'doc', tools: 'instance' }[req.params.owner];
    ok(req, res, { files: await uploadFiles(req, res, owner, req.params.id) }, 201);
  }));
  router.get('/files/:id/file', wrap(async (req, res) => sendFile(req, res, req.params.id, req.query.download === '1')));
  router.delete('/files/:id', wrap(async (req, res) => ok(req, res, { files: await deleteFile(req, req.params.id) })));

  // Tools
  router.get('/tools', wrap(async (req, res) => ok(req, res, await listTools(req, req.query))));
  router.get('/tools/mine', wrap(async (req, res) => ok(req, res, await myTools(req))));
  router.post('/tools/handover', wrap(async (req, res) => ok(req, res, await handover(req, req.body || {}), 201)));
  router.get('/tools/:id', wrap(async (req, res) => ok(req, res, await getTool(req, req.params.id))));
  router.put('/tools/:id', wrap(async (req, res) => ok(req, res, await updateTool(req, req.params.id, req.body || {}))));

  // Reports (+ CSV for Excel)
  router.get('/reports/turnover', wrap(async (req, res) => ok(req, res, await turnover(req, req.query))));
  router.get('/reports/movement', wrap(async (req, res) => ok(req, res, await itemMovement(req, req.query))));
  router.get('/reports/by-object', wrap(async (req, res) => ok(req, res, await byObject(req, req.query))));
  router.get('/reports/tools', wrap(async (req, res) => ok(req, res, await toolsByHolder(req, req.query))));
  router.get('/reports/:kind.csv', wrap(async (req, res) => sendCsv(res, await reportCsv(req, req.params.kind, req.query))));

  // Import
  router.post('/import/items', wrap(async (req, res) => ok(req, res, await importItems(req, req.body || {}))));
  router.post('/import/opening', wrap(async (req, res) => ok(req, res, await importOpening(req, req.body || {}))));

  // Inventory sessions (docs/warehouse.md#inventory-sessions)
  router.get('/inventory', wrap(async (req, res) => ok(req, res, await listSessions(req, req.query))));
  router.get('/inventory/active', wrap(async (req, res) => ok(req, res, await activeSessions(req, req.query))));
  router.get('/inventory/schedules', wrap(async (req, res) => ok(req, res, await listSchedules(req, req.query))));
  router.post('/inventory/schedules', wrap(async (req, res) => ok(req, res, await saveSchedule(req, null, req.body || {}), 201)));
  router.put('/inventory/schedules/:id', wrap(async (req, res) => ok(req, res, await saveSchedule(req, req.params.id, req.body || {}))));
  router.delete('/inventory/schedules/:id', wrap(async (req, res) => ok(req, res, await deleteSchedule(req, req.params.id))));
  router.post('/inventory', wrap(async (req, res) => ok(req, res, await createSession(req, req.body || {}), 201)));
  router.get('/inventory/:id', wrap(async (req, res) => ok(req, res, await getSession(req, req.params.id))));
  router.post('/inventory/:id/start', wrap(async (req, res) => ok(req, res, await startSession(req, req.params.id))));
  router.post('/inventory/:id/close', wrap(async (req, res) => ok(req, res, await closeCounting(req, req.params.id))));
  router.post('/inventory/:id/reopen', wrap(async (req, res) => ok(req, res, await reopenSession(req, req.params.id))));
  router.post('/inventory/:id/cancel', wrap(async (req, res) => ok(req, res, await cancelSession(req, req.params.id))));
  router.put('/inventory/:id/assign', wrap(async (req, res) => ok(req, res, await assignAreas(req, req.params.id, req.body || {}))));
  router.post('/inventory/:id/people', wrap(async (req, res) => ok(req, res, await addPeople(req, req.params.id, req.body || {}))));
  router.get('/inventory/:id/area', wrap(async (req, res) => ok(req, res, await areaView(req, req.params.id, req.query))));
  router.post('/inventory/:id/sync', wrap(async (req, res) => ok(req, res, await syncOps(req, req.params.id, req.body || {}))));
  router.get('/inventory/:id/reconcile', wrap(async (req, res) => ok(req, res, await reconcileSession(req, req.params.id, req.query))));
  router.post('/inventory/:id/recount', wrap(async (req, res) => ok(req, res, await requestRecount(req, req.params.id, req.body || {}))));
  router.put('/inventory/:id/final', wrap(async (req, res) => ok(req, res, await setFinal(req, req.params.id, req.body || {}))));
  router.post('/inventory/:id/finish', wrap(async (req, res) => ok(req, res, await finishSession(req, req.params.id, req.body || {}))));

  // Pickers and the dashboard
  router.get('/lookup/:kind', wrap(async (req, res) => ok(req, res, { items: await lookup(req, req.params.kind, req.query) })));
  router.get('/widget', wrap(async (req, res) => ok(req, res, await widget(req))));

  // Settings (warehouse.admin, without the console's settings.modules)
  router.get('/settings', wrap(async (req, res) => {
    const ctx = await requireAdmin(req);
    ok(req, res, { settings: ctx.settings });
  }));
  router.put('/settings', wrap(async (req, res) => {
    await requireAdmin(req);
    await updateAdminSettings({ modules: { warehouse: { settings: req.body || {} } } });
    ok(req, res, { settings: parseSettings(await getSettings({ fresh: true })).modules.warehouse.settings });
  }));

  return router;
}
