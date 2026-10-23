import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { activateAll } from './helpers/modules.js';

// Modules reach each other through the core registry, as at server start (no-op without a database).
await activateAll();

/*
 * Database checks of the Procurement fixes from the code review: the
 * default group does not open everyone's requests, only the request's
 * people send it (also through the approvals API) and never unready (also
 * when no stage applies), the responsible person sends a returned request
 * again and cancels one in approval, editing the amount while answering a
 * question re-plans the route, links are checked against their modules,
 * the invoice keeps its kind during approval. Needs a test database:
 *
 *   PROCUREMENT_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/procurement-review.db.test.js
 */

const enabled = process.env.PROCUREMENT_DB_TEST === '1';
const skip = enabled ? false : 'set PROCUREMENT_DB_TEST=1 and a test database to run';

const TYPE = 'procurement.request';
const tag = `prcr${Date.now().toString(36)}`;
let db = null;
const created = { users: [], roles: [], groups: [], requests: [] };
let restore = null;

async function makeUser(name) {
  const { rows } = await db.query(`INSERT INTO users (username, password_hash, display_name) VALUES ($1, '!', $2) RETURNING id`, [`${tag}.${name}`, `${name} ${tag}`]);
  created.users.push(rows[0].id);
  return rows[0].id;
}

after(async () => {
  if (!db) return;
  await new Promise((resolve) => setTimeout(resolve, 2000));
  if (restore) await restore();
  if (created.requests.length) {
    await db.query(`DELETE FROM approval_processes WHERE type = $1 AND doc_id = ANY($2::text[])`, [TYPE, created.requests.map(String)]);
    await db.query(`DELETE FROM proc_requests WHERE id = ANY($1)`, [created.requests]);
  }
  if (created.users.length) await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
  if (created.roles.length) await db.query(`DELETE FROM app_roles WHERE id = ANY($1)`, [created.roles]);
  if (created.groups.length) await db.query(`DELETE FROM app_groups WHERE id = ANY($1)`, [created.groups]);
  await db.closePool();
});

test('database: procurement review fixes', { skip }, async () => {
  db = await import('../config/database.js');
  const { ensureLegalEntitiesTable } = await import('../services/legalEntities.js');
  await ensureLegalEntitiesTable();
  const { ensureApprovalsSchema } = await import('../modules/approvals/schema.js');
  await ensureApprovalsSchema();
  const { ensureProcurementSchema } = await import('../modules/procurement/schema.js');
  await ensureProcurementSchema();
  await import('../modules/procurement/index.js');
  const settingsService = await import('../services/settings.js');
  const engine = await import('../modules/approvals/engine.js');
  const api = await import('../modules/approvals/api.js');
  const svc = await import('../modules/procurement/service.js');
  const files = await import('../modules/procurement/files.js');
  const { requestAs } = await import('../api/events.js');

  const before = settingsService.parseSettings(await settingsService.getSettings({ fresh: true })).modules.procurement;
  await settingsService.updateAdminSettings({ modules: { procurement: { enabled: true, settings: { invoiceRequired: false, groupVisibility: true, anyoneCanCreate: true } } } });
  const savedRoute = (await db.query(`SELECT * FROM approval_routes WHERE type = $1`, [TYPE])).rows[0] || null;
  restore = async () => {
    await settingsService.updateAdminSettings({ modules: { procurement: { enabled: before.enabled, settings: before.settings } } });
    await db.query(`DELETE FROM approval_routes WHERE type = $1`, [TYPE]);
    if (savedRoute) {
      await db.query(`INSERT INTO approval_routes (type, name, stages, restart_from, escalate_to, updated_by) VALUES ($1, $2, $3, $4, $5, $6)`, [TYPE, savedRoute.name, JSON.stringify(savedRoute.stages), savedRoute.restart_from, JSON.stringify(savedRoute.escalate_to), savedRoute.updated_by]);
    }
  };

  const author = await makeUser('author');
  const responsible = await makeUser('responsible');
  const head = await makeUser('head');
  const cfo = await makeUser('cfo');
  const stranger = await makeUser('stranger');
  const boss = await makeUser('boss');
  const { rows: roleRows } = await db.query(`INSERT INTO app_roles (key, name, permissions) VALUES ($1, $2, '{procurement.view_all}') RETURNING id`, [`${tag}_all`, `All ${tag}`]);
  created.roles.push(roleRows[0].id);
  await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [boss, roleRows[0].id]);
  // The default group (everyone is in it): the author and the stranger both.
  let defaultGroup = (await db.query(`SELECT id FROM app_groups WHERE is_default = TRUE LIMIT 1`)).rows[0]?.id;
  if (!defaultGroup) {
    defaultGroup = (await db.query(`INSERT INTO app_groups (key, name, is_default) VALUES ($1, $2, TRUE) RETURNING id`, [`${tag}_def`, `Default ${tag}`])).rows[0].id;
    created.groups.push(defaultGroup);
  }
  await db.query(`INSERT INTO user_group_members (user_id, group_id) VALUES ($1, $3), ($2, $3) ON CONFLICT DO NOTHING`, [author, stranger, defaultGroup]);
  const as = (id) => requestAs(id);

  const route = {
    stages: [
      { id: 'head', name: 'Head', mode: 'any', approvers: [{ kind: 'user', id: head }] },
      { id: 'cfo', name: 'CFO', mode: 'any', approvers: [{ kind: 'user', id: cfo }], conditions: [{ field: 'amount', op: 'gte', value: 5000 }] },
    ],
  };
  await engine.saveRoute({ system: true }, TYPE, route);
  const make = async (input = {}, by = author) => {
    const card = await svc.createRequest(await as(by), { title: 'Бумага', amount: 300, currency: 'USD', ...input });
    created.requests.push(card.request.id);
    return card.request;
  };

  // ── A1: the default group is not "a group in common" ──
  const r1 = await make();
  await svc.submitRequest(await as(author), r1.id);
  await assert.rejects(svc.getRequest(await as(stranger), r1.id), (err) => err.statusCode === 404);
  assert.ok(!(await svc.listRequests(await as(stranger), {})).items.some((item) => item.id === r1.id));

  // ── A3: only the request's people send it, also through the approvals API ──
  const r2 = await make();
  await assert.rejects(api.startApproval(await as(boss), TYPE, String(r2.id)), (err) => err.code === 'FORBIDDEN', 'view_all may see but not send');
  assert.equal((await svc.getRequest(await as(author), r2.id)).request.status, 'draft');
  // A route where no stage applies approves at once: the request must still be ready.
  await engine.saveRoute({ system: true }, TYPE, { stages: [route.stages[1]] });
  const r3 = await make({ amount: 0 });
  await assert.rejects(api.startApproval(await as(author), TYPE, String(r3.id)), (err) => err.code === 'AMOUNT_REQUIRED');
  assert.equal((await svc.getRequest(await as(author), r3.id)).request.status, 'draft');
  await engine.saveRoute({ system: true }, TYPE, route);

  // ── A4: the responsible person sends a returned request again and cancels one in approval ──
  const r4 = await make({ responsibleId: responsible });
  let card = await svc.submitRequest(await as(author), r4.id);
  await api.decide(await as(head), card.process.id, { action: 'return', comment: 'Добавьте спецификацию' });
  assert.equal((await svc.getRequest(await as(responsible), r4.id)).request.status, 'returned');
  card = await svc.submitRequest(await as(responsible), r4.id);
  assert.equal(card.request.status, 'pending');
  assert.equal(card.process.round, 2);
  assert.equal(card.process.my.canManage, false, 'the process is shown as the person sees it');
  card = await svc.cancelRequest(await as(responsible), r4.id, { comment: 'Не нужно' });
  assert.equal(card.request.status, 'cancelled');
  assert.equal((await api.getProcess(TYPE, String(r4.id))).status, 'withdrawn');

  // ── A5: the amount raised while answering a question adds the CFO stage ──
  const r5 = await make();
  card = await svc.submitRequest(await as(author), r5.id);
  assert.deepEqual(card.process.stages.map((s) => s.id), ['head']);
  await api.decide(await as(head), card.process.id, { action: 'question', comment: 'Точно 300?' });
  await svc.updateRequest(await as(author), r5.id, { amount: 9000 });
  let process = await api.getProcess(TYPE, String(r5.id));
  assert.deepEqual(process.stages.map((s) => s.id), ['head', 'cfo']);
  assert.equal(process.amount, 9000);
  await api.answer(await as(author), process.id, { comment: '9000' });
  await api.decide(await as(head), process.id, { action: 'approve' });
  assert.equal((await svc.getRequest(await as(author), r5.id)).request.status, 'pending', 'the CFO still has to decide');
  await api.decide(await as(cfo), process.id, { action: 'approve' });
  assert.equal((await svc.getRequest(await as(author), r5.id)).request.status, 'to_pay');

  // ── A8: links must point at something the person may see ──
  const r7 = await make();
  await assert.rejects(svc.updateRequest(await as(author), r7.id, { projectId: 987654321, projectLabel: 'Чужой' }), (err) => err.code === 'BAD_PROJECT');
  await assert.rejects(svc.updateRequest(await as(author), r7.id, { contractId: 987654321 }), (err) => err.code === 'BAD_CONTRACT');
  await assert.rejects(svc.updateRequest(await as(author), r7.id, { dealId: 987654321 }), (err) => err.code === 'BAD_DEAL');
  const free = await svc.updateRequest(await as(author), r7.id, { projectLabel: 'Склад №2' });
  assert.equal(free.request.project.label, 'Склад №2', 'a free-text link without an id stays');
  // A duplicate quietly leaves out what the person cannot open.
  await db.query(`UPDATE proc_requests SET contract_id = 987654321, contract_label = 'X' WHERE id = $1`, [r7.id]);
  const copy = await svc.duplicateRequest(await as(author), r7.id);
  created.requests.push(copy.request.id);
  assert.equal(copy.request.contract?.id ?? null, null);

  // ── A10: the invoice keeps its kind while the request is in approval ──
  const r6 = await make();
  const { newStorageKey, storagePath } = await import('../modules/shared/storage.js');
  const { writeFile } = await import('fs/promises');
  const key = await newStorageKey('pdf', 'procurement');
  await writeFile(storagePath(key), '%PDF-1.4\n%%EOF\n');
  await db.withTransaction((client) => files.insertDocuments(client, { id: r6.id }, author, [{ name: 'invoice.pdf', size: 15, storageKey: key }], { kind: 'invoice' }));
  await svc.submitRequest(await as(author), r6.id);
  const doc = (await svc.getRequest(await as(author), r6.id)).documents[0];
  await assert.rejects(files.updateDocument(await as(author), doc.id, { kind: 'other' }), (err) => err.code === 'LOCKED');
  await assert.rejects(files.deleteDocument(await as(author), doc.id), (err) => err.code === 'LOCKED');
});
