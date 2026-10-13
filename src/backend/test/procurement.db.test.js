import { test, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Database integration of the Procurement module: numbering under
 * concurrency, the approval integration (approve → «К оплате», reject,
 * question → answer, return → resubmit), the invoice guard, payments
 * (partial, full, overpaid, removed), transitions, visibility per role,
 * deadline reminders sent once, the contract filter used by Contracts.
 * Needs a test database (never production!):
 *
 *   PROCUREMENT_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/procurement.db.test.js
 *
 * Without PROCUREMENT_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.PROCUREMENT_DB_TEST === '1';
const skip = enabled ? false : 'set PROCUREMENT_DB_TEST=1 and a test database to run';

const TYPE = 'procurement.request';
const tag = `prct${Date.now().toString(36)}`;
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
  // Effects after commit (notifications, webhooks) finish before the pool closes.
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

test('database: procurement end to end', { skip }, async () => {
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
  const money = await import('../modules/procurement/money.js');
  const { runDeadlines } = await import('../modules/procurement/reminders.js');
  const { inboxFor } = await import('../services/inbox.js');
  const { requestAs } = await import('../api/events.js');

  // Module on, invoices required, group visibility on; restored afterwards.
  const before = settingsService.parseSettings(await settingsService.getSettings({ fresh: true })).modules.procurement;
  await settingsService.updateAdminSettings({ modules: { procurement: { enabled: true, settings: { invoiceRequired: true, groupVisibility: true, anyoneCanCreate: true, reminderDays: 1 } } } });
  const savedRoute = (await db.query(`SELECT * FROM approval_routes WHERE type = $1`, [TYPE])).rows[0] || null;
  restore = async () => {
    await settingsService.updateAdminSettings({ modules: { procurement: { enabled: before.enabled, settings: before.settings } } });
    await db.query(`DELETE FROM approval_routes WHERE type = $1`, [TYPE]);
    if (savedRoute) {
      await db.query(`INSERT INTO approval_routes (type, name, stages, restart_from, escalate_to, updated_by) VALUES ($1, $2, $3, $4, $5, $6)`, [TYPE, savedRoute.name, JSON.stringify(savedRoute.stages), savedRoute.restart_from, JSON.stringify(savedRoute.escalate_to), savedRoute.updated_by]);
    }
  };

  // People: author + colleague (same group), director, accountant, viewer (view_all), stranger, procurement admin.
  const author = await makeUser('author');
  const colleague = await makeUser('colleague');
  const director = await makeUser('director');
  const accountant = await makeUser('accountant');
  const boss = await makeUser('boss');
  const stranger = await makeUser('stranger');
  const padmin = await makeUser('padmin');
  const role = async (perms) => {
    const { rows } = await db.query(`INSERT INTO app_roles (key, name, permissions) VALUES ($1, $2, $3) RETURNING id`, [`${tag}_${created.roles.length}`, `R ${tag} ${created.roles.length}`, perms]);
    created.roles.push(rows[0].id);
    return rows[0].id;
  };
  const payRole = await role(['procurement.pay']);
  const allRole = await role(['procurement.view_all']);
  const adminRole = await role(['procurement.admin']);
  await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2), ($3, $4), ($5, $6)`, [accountant, payRole, boss, allRole, padmin, adminRole]);
  const group = await db.query(`INSERT INTO app_groups (key, name) VALUES ($1, $2) RETURNING id`, [`${tag}_team`, `Team ${tag}`]);
  created.groups.push(group.rows[0].id);
  await db.query(`INSERT INTO user_group_members (user_id, group_id) VALUES ($1, $3), ($2, $3)`, [author, colleague, group.rows[0].id]);
  // A fresh request-like context per call (contexts cache settings).
  const as = (id) => requestAs(id);

  // Route: one stage, the director.
  await engine.saveRoute(await as(padmin), TYPE, { stages: [{ id: 'director', name: 'Директор', mode: 'any', approvers: [{ kind: 'user', id: director }] }] });

  const pdfFile = async (requestId) => {
    const { newStorageKey, storagePath } = await import('../modules/shared/storage.js');
    const { writeFile } = await import('fs/promises');
    const key = await newStorageKey('pdf', 'procurement');
    await writeFile(storagePath(key), '%PDF-1.4\n%%EOF\n');
    await db.withTransaction(async (client) => {
      const { insertDocuments } = await import('../modules/procurement/files.js');
      await insertDocuments(client, { id: requestId }, author, [{ name: 'invoice.pdf', size: 15, storageKey: key }], { kind: 'invoice' });
    });
  };
  const make = async (input = {}, by = author) => {
    const card = await svc.createRequest(await as(by), { title: 'Ноутбуки', amount: 1000, currency: 'USD', ...input });
    created.requests.push(card.request.id);
    return card.request;
  };

  // ── Numbering under concurrency ──
  const many = await Promise.all(Array.from({ length: 8 }, (_, i) => make({ title: `Параллельная ${i}` })));
  const numbers = many.map((item) => item.number);
  assert.equal(new Set(numbers).size, 8, 'no duplicate numbers');
  assert.ok(numbers.every((number) => /^ЗК-\d{4,}$/.test(number)));

  // ── Invoice guard: our endpoint and the approvals API alike ──
  const r1 = await make({ title: 'Бумага', amount: 300, payBy: '2020-01-01' });
  await assert.rejects(svc.submitRequest(await as(author), r1.id), (err) => err.code === 'INVOICE_REQUIRED' && err.info.missing.includes('INVOICE_REQUIRED'));
  await assert.rejects(api.startApproval(await as(author), TYPE, String(r1.id), {}), (err) => err.code === 'INVOICE_REQUIRED');
  assert.equal((await db.query(`SELECT status FROM proc_requests WHERE id = $1`, [r1.id])).rows[0].status, 'draft', 'the aborted start left the draft alone');
  await pdfFile(r1.id);

  // ── Visibility of a draft: author only (+ view_all, admin) ──
  await assert.rejects(svc.getRequest(await as(colleague), r1.id), (err) => err.statusCode === 404, 'a colleague does not see drafts');
  await assert.rejects(svc.getRequest(await as(director), r1.id), (err) => err.statusCode === 404);
  assert.ok(await svc.getRequest(await as(boss), r1.id));

  // ── Submit → question → answer → approve → «К оплате» ──
  const sent = await svc.submitRequest(await as(author), r1.id, { urgency: 'urgent' });
  assert.equal(sent.request.status, 'pending');
  assert.equal(sent.process.status, 'pending');
  const card = await svc.getRequest(await as(director), r1.id);
  assert.equal(card.request.status, 'pending', 'the approver sees it (isParticipant)');
  assert.ok((await svc.getRequest(await as(colleague), r1.id)).request, 'a colleague of the same group sees it once sent');
  await assert.rejects(svc.getRequest(await as(stranger), r1.id), (err) => err.statusCode === 404);
  await assert.rejects(svc.getRequest(await as(accountant), r1.id), (err) => err.statusCode === 404, 'accounting sees approved requests only');
  const waiting = await svc.listRequests(await as(director), { chip: 'waiting' });
  assert.ok(waiting.items.some((item) => item.id === r1.id), '«Ждут меня» of the director');
  const proc = sent.process;
  await api.decide(await as(director), proc.id, { action: 'question', comment: 'Почему не Dell?' });
  assert.equal((await svc.getRequest(await as(author), r1.id)).request.status, 'question');
  // The author may edit while answering.
  await svc.updateRequest(await as(author), r1.id, { description: 'Dell дороже на 20 %' });
  await api.answer(await as(author), proc.id, { comment: 'Dell дороже' });
  assert.equal((await svc.getRequest(await as(author), r1.id)).request.status, 'pending');
  const fresh = await api.getProcess(TYPE, String(r1.id));
  await api.decide(await as(director), fresh.id, { action: 'approve', round: fresh.round, stage: fresh.currentStage });
  const approved = await svc.getRequest(await as(author), r1.id);
  assert.equal(approved.request.status, 'to_pay');
  assert.ok(approved.request.approvedAt);
  await assert.rejects(svc.updateRequest(await as(author), r1.id, { amount: 5 }), (err) => err.code === 'LOCKED', 'money is locked after approval');

  // Accounting: sees it now, «Ждёт меня» item, notification (after the commit).
  assert.ok(await svc.getRequest(await as(accountant), r1.id));
  const payInbox = await inboxFor({ user: { id: accountant }, req: await as(accountant) });
  const item = payInbox.items.find((entry) => entry.key === `procurement.pay:${r1.id}`);
  assert.ok(item, 'the request is in the accountant’s inbox');
  assert.equal(item.overdue, true, 'pay-by in the past is overdue');
  await new Promise((resolve) => setTimeout(resolve, 900));
  const toPay = await db.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'procurement.to_pay' AND link LIKE $2`, [accountant, `%open=${r1.id}`]);
  assert.equal(toPay.rows.length, 1, 'accounting was told once');

  // ── Payments: partial, overpaid, by whom, full ──
  const payBody = (fields) => {
    const req = { body: fields, headers: { 'content-type': 'application/json' }, is: () => false };
    return req;
  };
  const pay = async (userId, fields) => {
    const req = Object.assign(await as(userId), payBody(fields));
    return money.addPayment(req, {}, r1.id);
  };
  await assert.rejects(pay(author, { amount: 100 }), (err) => err.statusCode === 403, 'the author cannot mark payments');
  const p1 = await pay(accountant, { amount: 100, reference: 'П-1', paidOn: '2026-10-10' });
  assert.equal(p1.request.status, 'partially_paid');
  assert.equal(p1.request.paid, 100);
  await assert.rejects(pay(accountant, { amount: 250 }), (err) => err.code === 'OVERPAID');
  const p2 = await pay(accountant, { amount: 200, method: 'cash' });
  assert.equal(p2.request.status, 'paid');
  assert.equal(p2.request.remaining, 0);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const paidNote = await db.query(`SELECT title FROM notifications WHERE user_id = $1 AND kind = 'procurement.paid' ORDER BY id`, [author]);
  assert.equal(paidNote.rows.length, 2, 'the author hears about each payment');
  // A mistaken payment removed: back to partially paid.
  const back = await money.deletePayment(await as(accountant), p2.payments[1].id);
  assert.equal(back.request.status, 'partially_paid');
  await pay(accountant, { amount: 200 });

  // ── Delivery (partial, then full) and closing ──
  const deliver = async (userId, fields) => money.addDelivery(Object.assign(await as(userId), payBody(fields)), {}, r1.id);
  await assert.rejects(deliver(accountant, {}), (err) => err.statusCode === 403);
  assert.equal((await deliver(author, { partial: true })).request.status, 'paid');
  assert.equal((await deliver(author, { partial: false })).request.status, 'delivered');
  await assert.rejects(svc.cancelRequest(await as(author), r1.id), (err) => err.code === 'BAD_TRANSITION');
  assert.equal((await svc.closeRequest(await as(author), r1.id)).request.status, 'closed');
  assert.equal((await svc.reopenRequest(await as(padmin), r1.id)).request.status, 'delivered', 'reopen derives the status');
  const history = await svc.history(await as(author), r1.id);
  for (const action of ['created', 'status', 'payment_added', 'payment_removed', 'delivered', 'closed', 'reopened', 'question', 'answer', 'approved']) {
    assert.ok(history.some((event) => event.action === action), `history has ${action}`);
  }

  // ── Reject ──
  const r2 = await make({ title: 'Кофемашина', amount: 900 });
  await pdfFile(r2.id);
  const s2 = await svc.submitRequest(await as(author), r2.id);
  await assert.rejects(api.decide(await as(director), s2.process.id, { action: 'reject' }), (err) => err.code === 'COMMENT_REQUIRED' || err.statusCode === 400);
  await api.decide(await as(director), s2.process.id, { action: 'reject', comment: 'Не в этом году' });
  assert.equal((await svc.getRequest(await as(author), r2.id)).request.status, 'rejected');
  await assert.rejects(svc.submitRequest(await as(author), r2.id), (err) => err.code === 'BAD_TRANSITION', 'rejected is final');
  await assert.rejects(api.startApproval(await as(author), TYPE, String(r2.id), {}), (err) => err.code === 'BAD_TRANSITION', 'also through the approvals API');

  // ── Return → edit → resubmit; withdraw; cancel ──
  const r3 = await make({ title: 'Стулья', amount: 400 });
  await pdfFile(r3.id);
  const s3 = await svc.submitRequest(await as(author), r3.id);
  await api.decide(await as(director), s3.process.id, { action: 'return', comment: 'Нужно второе КП' });
  assert.equal((await svc.getRequest(await as(author), r3.id)).request.status, 'returned');
  await svc.updateRequest(await as(author), r3.id, { amount: 350 });
  const again = await svc.submitRequest(await as(author), r3.id);
  assert.equal(again.request.status, 'pending');
  assert.equal(again.process.round, 2);
  assert.equal(Number(again.process.amount), 350, 'the approval sees the new amount');
  assert.equal((await svc.withdrawRequest(await as(author), r3.id)).request.status, 'draft');
  await assert.rejects(svc.deleteRequest(await as(author), r3.id), (err) => err.code === 'BAD_TRANSITION', 'a draft that was sent cannot be deleted');
  assert.equal((await svc.cancelRequest(await as(author), r3.id)).request.status, 'cancelled');
  // A cancel while in approval withdraws first.
  const r4 = await make({ title: 'Принтер', amount: 200 });
  await pdfFile(r4.id);
  await svc.submitRequest(await as(author), r4.id);
  assert.equal((await svc.cancelRequest(await as(author), r4.id)).request.status, 'cancelled');
  assert.equal((await api.getProcess(TYPE, String(r4.id))).status, 'withdrawn');
  // A never-sent draft can be deleted by its author only.
  const r5 = await make({ title: 'Черновик' });
  await assert.rejects(svc.deleteRequest(await as(stranger), r5.id), (err) => err.statusCode === 404);
  await svc.deleteRequest(await as(author), r5.id);
  assert.equal((await db.query(`SELECT 1 FROM proc_requests WHERE id = $1`, [r5.id])).rows.length, 0);

  // ── Lists per role, counters, contract filter ──
  const ids = (list) => new Set(list.items.map((entry) => entry.id));
  const strangerList = await svc.listRequests(await as(stranger), { pageSize: 200 });
  assert.ok(!created.requests.some((id) => ids(strangerList).has(id)), 'a stranger sees none of them');
  const accList = ids(await svc.listRequests(await as(accountant), { pageSize: 200 }));
  assert.ok(accList.has(r1.id) && !accList.has(r2.id) && !accList.has(many[0].id), 'accounting: approved only');
  const dirList = ids(await svc.listRequests(await as(director), { pageSize: 200 }));
  assert.ok(dirList.has(r1.id) && dirList.has(r2.id) && dirList.has(r3.id) && !dirList.has(many[0].id), 'the director: what they approved');
  const colList = ids(await svc.listRequests(await as(colleague), { pageSize: 200 }));
  assert.ok(colList.has(r2.id) && !colList.has(many[0].id), 'a colleague: the group’s non-drafts');
  const bossList = ids(await svc.listRequests(await as(boss), { pageSize: 200 }));
  assert.ok(created.requests.filter((id) => id !== r5.id).every((id) => bossList.has(id)), 'view_all: everything');
  const counters = await svc.chipCounters(await as(author), {});
  assert.ok(counters.mine >= 12 && counters.finished >= 3);
  await db.query(`UPDATE proc_requests SET contract_id = 987654 WHERE id = $1`, [r2.id]);
  const byContract = await svc.listRequests(await as(author), { contract: '987654' });
  assert.deepEqual(byContract.items.map((entry) => entry.id), [r2.id]);
  assert.equal((await svc.listRequests(await as(stranger), { contract: '987654' })).total, 0, 'the contract filter keeps visibility');

  // ── Deadline reminders: once each ──
  const r6 = await make({ title: 'Цемент', amount: 50 });
  await pdfFile(r6.id);
  const s6 = await svc.submitRequest(await as(author), r6.id);
  await api.decide(await as(director), s6.process.id, { action: 'approve' });
  await db.query(`UPDATE proc_requests SET pay_by = CURRENT_DATE - 3, deliver_by = CURRENT_DATE + 1 WHERE id = $1`, [r6.id]);
  const first = await runDeadlines();
  assert.ok(first.payOverdue >= 1 && first.deliverSoon >= 1);
  const second = await runDeadlines();
  const mineAgain = await db.query(`SELECT pay_overdue_at, deliver_soon_at, pay_soon_at FROM proc_requests WHERE id = $1`, [r6.id]);
  assert.ok(mineAgain.rows[0].pay_overdue_at && mineAgain.rows[0].deliver_soon_at && mineAgain.rows[0].pay_soon_at);
  const overdueNotes = await db.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'procurement.overdue' AND link = $2`, [author, `/app/procurement/requests/${r6.id}`]);
  assert.equal(overdueNotes.rows[0].n, 1, 'the overdue reminder went once');
  assert.ok(second.sent <= first.sent);
  // A new date re-arms the reminder.
  await svc.updateRequest(await as(author), r6.id, { deliverBy: '2099-01-01' });
  assert.equal((await db.query(`SELECT deliver_soon_at FROM proc_requests WHERE id = $1`, [r6.id])).rows[0].deliver_soon_at, null);
});
