import { Router } from 'express';
import { refuseImpersonation } from '../../middleware/auth.js';
import { updateAdminSettings } from '../../services/settings.js';
import { employeesSettings } from './access.js';
import { assertAdmin, rightsOf } from './access.js';
import {
  celebrations,
  counters,
  createEmployee,
  deleteEmployee,
  deletePosition,
  deleteSkill,
  exportCsv,
  getEmployee,
  listEmployees,
  listPositions,
  meta,
  saveSkill,
  savePosition,
  terminateEmployee,
  updateEmployee,
} from './service.js';
import { blockAccount, createAccount, linkAccount, suggestUsername, unlinkAccount, unlinkedAccounts } from './accounts.js';
import { deleteDocument, removePhoto, sendDocument, sendPhoto, uploadDocuments, uploadPhoto } from './files.js';
import { importEmployees } from './importer.js';

/*
 * /api/app/employees (signed-in people; tokens need the `employees` area).
 * docs/employees.md → HTTP API. Visibility is decided by the service for
 * every answer; routes only parse input.
 */

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};
const ok = (res, body, status = 200) => res.status(status).json({ success: true, ...body });

export function privateRoutes() {
  const router = Router();

  router.get('/meta', wrap(async (req, res) => ok(res, await meta(req))));
  router.get('/counters', wrap(async (req, res) => ok(res, { counters: await counters(req) })));
  router.get('/widget/celebrations', wrap(async (req, res) => ok(res, await celebrations(req, { days: req.query.days }))));

  router.get('/employees', wrap(async (req, res) => ok(res, await listEmployees(req, req.query || {}))));
  router.get('/employees/export.csv', wrap(async (req, res) => {
    const { csv, filename } = await exportCsv(req, req.query || {}, req.locale);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(csv);
  }));
  router.post('/employees', wrap(async (req, res) => ok(res, await createEmployee(req, req.body || {}), 201)));
  router.post('/employees/import', wrap(async (req, res) => ok(res, { report: await importEmployees(req, req.body || {}) })));
  router.get('/employees/:id', wrap(async (req, res) => ok(res, await getEmployee(req, req.params.id))));
  router.put('/employees/:id', wrap(async (req, res) => ok(res, await updateEmployee(req, req.params.id, req.body || {}))));
  router.post('/employees/:id/terminate', wrap(async (req, res) => ok(res, await terminateEmployee(req, req.params.id, req.body || {}))));
  router.delete('/employees/:id', wrap(async (req, res) => ok(res, await deleteEmployee(req, req.params.id))));

  router.get('/employees/:id/photo', wrap(async (req, res) => sendPhoto(req, res, req.params.id)));
  router.post('/employees/:id/photo', wrap(async (req, res) => ok(res, await uploadPhoto(req, res, req.params.id))));
  router.delete('/employees/:id/photo', wrap(async (req, res) => ok(res, await removePhoto(req, req.params.id))));
  router.post('/employees/:id/documents', wrap(async (req, res) => ok(res, await uploadDocuments(req, res, req.params.id))));
  router.get('/files/:fileId', wrap(async (req, res) => sendDocument(req, res, req.params.fileId, req.query.download === '1')));
  router.delete('/files/:fileId', wrap(async (req, res) => ok(res, await deleteDocument(req, req.params.fileId))));

  router.post('/employees/:id/skills', wrap(async (req, res) => ok(res, await saveSkill(req, req.params.id, null, req.body || {}))));
  router.put('/employees/:id/skills/:skillId', wrap(async (req, res) => ok(res, await saveSkill(req, req.params.id, req.params.skillId, req.body || {}))));
  router.delete('/employees/:id/skills/:skillId', wrap(async (req, res) => ok(res, await deleteSkill(req, req.params.id, req.params.skillId))));

  // Portal accounts. A «sign in as» session cannot create, link or block accounts.
  router.get('/accounts/unlinked', wrap(async (req, res) => ok(res, { accounts: await unlinkedAccounts(req, req.query.q) })));
  router.get('/employees/:id/account/suggest', wrap(async (req, res) => {
    const { getEmployee: get } = await import('./service.js');
    const card = await get(req, req.params.id);
    ok(res, { username: suggestUsername({ last_name: card.employee.lastName, first_name: card.employee.firstName }) });
  }));
  router.post('/employees/:id/account', refuseImpersonation, wrap(async (req, res) => ok(res, await createAccount(req, req.params.id, req.body || {}), 201)));
  router.put('/employees/:id/account', refuseImpersonation, wrap(async (req, res) => ok(res, await linkAccount(req, req.params.id, req.body || {}))));
  router.delete('/employees/:id/account', refuseImpersonation, wrap(async (req, res) => ok(res, await unlinkAccount(req, req.params.id))));
  router.post('/employees/:id/account/block', refuseImpersonation, wrap(async (req, res) => ok(res, await blockAccount(req, req.params.id, { blocked: req.body?.blocked !== false }))));

  // Positions directory.
  router.get('/positions', wrap(async (req, res) => ok(res, { positions: await listPositions(req, { includeArchived: req.query.archived === '1' }) })));
  router.post('/positions', wrap(async (req, res) => ok(res, { position: await savePosition(req, null, req.body || {}) }, 201)));
  router.put('/positions/:id', wrap(async (req, res) => ok(res, { position: await savePosition(req, req.params.id, req.body || {}) })));
  router.delete('/positions/:id', wrap(async (req, res) => ok(res, await deletePosition(req, req.params.id))));

  // Settings of the module live in Settings → Modules → Employees (PUT /api/admin/settings);
  // this read is for the in-module settings page of employees.admin.
  router.get('/settings', wrap(async (req, res) => {
    const rights = await rightsOf(req);
    assertAdmin(rights);
    ok(res, { settings: rights.settings });
  }));
  router.put('/settings', wrap(async (req, res) => {
    const rights = await rightsOf(req);
    assertAdmin(rights);
    const body = req.body || {};
    const patch = {};
    for (const key of ['everyoneCanView', 'birthdays', 'anniversaries', 'clearanceWarnDays', 'notifyEmployee', 'notifyManager']) if (body[key] !== undefined) patch[key] = body[key];
    await updateAdminSettings({ modules: { employees: { settings: patch } } });
    ok(res, { settings: await employeesSettings() });
  }));

  return router;
}
