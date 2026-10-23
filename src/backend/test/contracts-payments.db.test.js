import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { activateAll } from './helpers/modules.js';

// Modules reach each other through the core registry, as at server start (no-op without a database).
await activateAll();

/*
 * Database integration of the money side of contracts: deposit, schedule,
 * payments (partial, allocation), finance rights, the payments registry, its
 * CSV guard, the inbox, reminders sent once; and with Masterplan: deposit →
 * «Задаток», signed → «Договор», paid in full → «Продано», a refused move is
 * a note, not a failure. A test database only (never production!):
 *
 *   CONTRACTS_DB_TEST=1 [MASTERPLAN_DB_TEST=1] ENV_FILE_PATH=/path/to/test.env node --test test/contracts-payments.db.test.js
 */

const contractsOn = process.env.CONTRACTS_DB_TEST === '1';
const masterplanOn = contractsOn && process.env.MASTERPLAN_DB_TEST === '1';
const skip = contractsOn ? false : 'set CONTRACTS_DB_TEST=1 and a test database to run';
const skipMp = masterplanOn ? false : 'set CONTRACTS_DB_TEST=1 MASTERPLAN_DB_TEST=1 and a test database to run';

const tag = `ctrp${Date.now().toString(36)}`;
let db = null;
const created = { users: [], roles: [], contracts: [], projects: [] };
const restore = [];

async function setup() {
  if (db) return db;
  db = await import('../config/database.js');
  const { ensureApprovalsSchema } = await import('../modules/approvals/schema.js');
  const { ensureLegalEntitiesTable } = await import('../services/legalEntities.js');
  await ensureApprovalsSchema();
  await ensureLegalEntitiesTable();
  await import('../modules/approvals/index.js');
  await (await import('../modules/contracts/index.js')).default.schema();
  const settings = await import('../services/settings.js');
  const before = settings.parseSettings(await settings.getSettings({ fresh: true })).modules;
  await settings.updateAdminSettings({ modules: { contracts: { enabled: true } } });
  restore.push(() => settings.updateAdminSettings({ modules: { contracts: { enabled: before.contracts.enabled } } }));
  if (masterplanOn) {
    const { ensureMasterplanSchema } = await import('../modules/masterplan/schema.js');
    await ensureMasterplanSchema();
    await settings.updateAdminSettings({ modules: { masterplan: { enabled: true } } });
    restore.push(() => settings.updateAdminSettings({ modules: { masterplan: { enabled: before.masterplan?.enabled || false } } }));
  }
  return db;
}

async function makeRole(key, permissions) {
  const { rows } = await db.query(`INSERT INTO app_roles (key, name, permissions) VALUES ($1, $2, $3) RETURNING id`, [`${tag}_${key}`, `${key} ${tag}`, permissions]);
  created.roles.push(rows[0].id);
  return rows[0].id;
}

async function makeUser(name, roleIds = []) {
  const { rows } = await db.query(`INSERT INTO users (username, password_hash, display_name) VALUES ($1, '!', $2) RETURNING id`, [`${tag}.${name}`, `${name} ${tag}`]);
  created.users.push(rows[0].id);
  for (const roleId of roleIds) await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [rows[0].id, roleId]);
  return rows[0].id;
}

async function contexts(ids) {
  const service = await import('../modules/contracts/service.js');
  const { requestAs } = await import('../api/events.js');
  const { MODULE_CATALOG } = await import('../modules/catalog.js');
  const settings = { ...MODULE_CATALOG.find((m) => m.id === 'contracts').defaults, prefix: `P${tag.slice(-4).toUpperCase()}` };
  return Promise.all(
    ids.map(async (id) => {
      const ctx = await service.requestContext(await requestAs(id));
      ctx.settings = settings;
      return ctx;
    })
  );
}

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** A fake response for the CSV export. */
function captureRes() {
  const res = { headers: {}, body: '' };
  res.setHeader = (key, value) => {
    res.headers[key] = value;
  };
  res.send = (body) => {
    res.body = body;
  };
  return res;
}

after(async () => {
  if (!db) return;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  for (const fn of restore.reverse()) await fn().catch(() => {});
  if (created.contracts.length) {
    const { removeBlob } = await import('../modules/shared/storage.js');
    const blobs = await db.query(`SELECT file_key FROM ctr_payments WHERE contract_id = ANY($1) AND file_key IS NOT NULL UNION ALL SELECT file_key FROM ctr_deposits WHERE contract_id = ANY($1) AND file_key IS NOT NULL`, [created.contracts]);
    for (const row of blobs.rows) await removeBlob(row.file_key);
    await db.query(`DELETE FROM ctr_contracts WHERE id = ANY($1)`, [created.contracts]);
  }
  for (const id of created.projects) await db.query(`DELETE FROM mp_projects WHERE id = $1`, [id]).catch(() => {});
  if (created.users.length) {
    await db.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [created.users]).catch(() => {});
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
  }
  if (created.roles.length) await db.query(`DELETE FROM app_roles WHERE id = ANY($1)`, [created.roles]);
  await db.closePool();
});

test('database: deposit, schedule, partial payments, finance rights, registry, reminders', { skip }, async () => {
  await setup();
  const service = await import('../modules/contracts/service.js');
  const pay = await import('../modules/contracts/payments.js');
  const { runPaymentReminders } = await import('../modules/contracts/jobs.js');

  const seller = await makeUser('seller', [await makeRole('create', ['contracts.create'])]);
  const fin = await makeUser('fin', [await makeRole('finance', ['contracts.finance'])]);
  const lawyer = await makeUser('lawyer', [await makeRole('legal', ['contracts.legal'])]);
  const stranger = await makeUser('stranger');
  const [cSeller, cFin, cLawyer, cStranger] = await contexts([seller, fin, lawyer, stranger]);
  const today = cSeller.today;

  const made = await service.createContract(cSeller, { title: `Продажа коттеджа ${tag}`, typeKey: 'property_sale', direction: 'client', counterparty: '=HYPERLINK("http://evil")', amount: 100000, currency: 'USD' });
  const id = made.contract.id;
  created.contracts.push(id);
  assert.equal(made.contract.payments, null, 'nothing tracked yet');
  assert.equal(made.can.planPayments, true);
  assert.equal(made.can.finance, false);

  // Finance does not see a contract without money; the stranger never.
  await assert.rejects(pay.paymentsOf(cFin, id), { statusCode: 404 });
  await assert.rejects(pay.paymentsOf(cStranger, id), { statusCode: 404 });
  let data = await pay.paymentsOf(cSeller, id);
  assert.equal(data.relevant, true);
  assert.equal(data.deposit, null);

  // ── Deposit: planned by the seller, confirmed by finance only ──
  data = await pay.saveDeposit(cSeller, id, { kind: 'deposit', amount: 5000, dueOn: addDays(today, -75), terms: 'При отказе покупателя задаток остаётся у продавца' });
  assert.equal(data.deposit.status, 'expected');
  assert.equal(data.deposit.currency, 'USD');
  data = await pay.paymentsOf(cFin, id);
  assert.equal(data.can.finance, true, 'finance now sees the contract (it has money)');
  await assert.rejects(pay.saveDeposit(cStranger, id, { amount: 1 }), { statusCode: 404 });
  await assert.rejects(pay.depositStatus(cSeller, id, { status: 'received' }), { code: 'FORBIDDEN' });
  await assert.rejects(pay.depositStatus(cLawyer, id, { status: 'received' }), { code: 'FORBIDDEN' }, 'a lawyer is not finance');
  let counts = await service.counters(cSeller, { search: tag });
  assert.equal(counts.deposit_wait, 1, '«Ждут задаток»');

  // ── Schedule: 30 % first (deposit offset), 10 months; dates partly in the past ──
  const firstOn = addDays(today, -70);
  const preview = await pay.previewSchedule(cSeller, id, { mode: 'installments', firstPct: 30, months: 10, firstOn, day: Number(firstOn.slice(8, 10)) });
  assert.equal(preview.rows[0].purpose, 'deposit');
  assert.equal(preview.rows[1].amount, 25000, 'the deposit is counted toward the first payment');
  assert.equal(preview.total, 100000);
  data = await pay.saveSchedule(cSeller, id, { rows: preview.rows, plan: preview.plan });
  assert.equal(data.schedule.length, 12);
  assert.equal(data.totals.total, 100000);
  assert.equal(data.totals.paid, 0);
  assert.ok(data.schedule.filter((row) => row.state === 'overdue').length >= 2, 'rows due before today are overdue');
  counts = await service.counters(cSeller, { search: tag });
  assert.equal(counts.pay_overdue, 1, '«Просрочены платежи»');

  // ── Finance confirms the deposit: it covers the «Задаток» row ──
  data = await pay.depositStatus(cFin, id, { status: 'received', method: 'cash', reference: 'ПКО-1' });
  assert.equal(data.deposit.status, 'received');
  assert.equal(data.deposit.confirmedBy.id, fin);
  assert.equal(data.schedule[0].paid, 5000);
  assert.equal(data.totals.paid, 5000);
  const { rows: depEvents } = await db.query(`SELECT data FROM ctr_events WHERE contract_id = $1 AND kind = 'deposit' ORDER BY id`, [id]);
  assert.deepEqual(depEvents.map((e) => e.data.action), ['created', 'status']);

  // ── Partial payments, oldest first ──
  await assert.rejects(pay.addPayment(cSeller, id, { amount: 100 }), { code: 'FORBIDDEN' });
  data = await pay.addPayment(cFin, id, { amount: 20000, paidOn: today, method: 'bank', reference: 'ПП-10' });
  assert.deepEqual(data.schedule.slice(0, 3).map((r) => r.paid), [5000, 20000, 0]);
  data = await pay.addPayment(cFin, id, { amount: 12000 });
  assert.equal(data.schedule[1].paid, 25000);
  assert.equal(data.schedule[2].paid, 7000);
  assert.equal(data.totals.paid, 37000);
  assert.equal(data.totals.percent, 37);
  // A payment entered by mistake is removed and the allocation redone.
  const wrong = await pay.addPayment(cFin, id, { amount: 1 });
  await assert.rejects(pay.deletePayment(cSeller, wrong.payment.id), { code: 'FORBIDDEN' });
  data = await pay.deletePayment(cFin, wrong.payment.id);
  assert.equal(data.totals.paid, 37000);

  // ── Registry, inbox, CSV ──
  await assert.rejects(pay.registry(cSeller, {}), { code: 'FORBIDDEN' });
  const reg = await pay.registry(cFin, { search: tag });
  const overdue = reg.groups.find((g) => g.key === 'overdue');
  assert.ok(overdue.items.length >= 1 && overdue.items.every((item) => item.contract.id === id));
  assert.ok(!reg.groups.flatMap((g) => g.items).some((item) => item.purpose === 'deposit'), 'the deposit row is not listed twice');
  assert.equal(reg.totals[0].currency, 'USD');
  assert.equal(reg.totals[0].amount, 63000);
  const inbox = await pay.overdueInbox({ req: cFin.req, user: cFin.req.user });
  assert.ok(inbox.some((item) => item.id === id && item.kind === 'payment_overdue'));
  assert.equal((await pay.overdueInbox({ req: cSeller.req, user: cSeller.req.user })).length, 0, 'only finance');
  const res = captureRes();
  await pay.registryCsv(cFin, { search: tag }, res);
  assert.match(res.body, /^﻿/);
  assert.ok(res.body.includes(`"'=HYPERLINK(""http://evil"")"`), 'formula guard');

  // ── Reminders: each (row, kind, day) once ──
  const first = await runPaymentReminders({ today, settings: cFin.settings });
  assert.ok(first.reminders >= 1);
  const second = await runPaymentReminders({ today, settings: cFin.settings });
  assert.equal(second.reminders, 0, 'nothing twice');
  const { rows: notes } = await db.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'contracts.payment_overdue'`, [fin]);
  assert.ok(notes[0].n >= 1, 'finance hears about overdue payments');

  // ── Paid in full; the archive of money stays ──
  data = await pay.addPayment(cFin, id, { amount: 63000 });
  assert.equal(data.totals.full, true);
  assert.ok(data.schedule.every((row) => row.state === 'paid'));
  counts = await service.counters(cSeller, { search: tag });
  assert.equal(counts.paid, 1, '«Оплачены»');
  assert.equal(counts.pay_overdue, 0);
  await assert.rejects(pay.deleteDeposit(cSeller, id), { code: 'DEPOSIT_RECEIVED' });
  await assert.rejects(service.deleteContract(cSeller, id), { code: 'HAS_PAYMENTS' });
  // Credit the deposit to the price: still 100 %.
  data = await pay.depositStatus(cFin, id, { status: 'credited' });
  assert.equal(data.totals.paid, 100000);
  const card = await service.getContract(cSeller, id);
  assert.equal(card.contract.payments.percent, 100);
});

test('database: Masterplan — deposit → «Задаток», signed → «Договор», paid → «Продано», refused move → note', { skip: skipMp }, async () => {
  await setup();
  const service = await import('../modules/contracts/service.js');
  const pay = await import('../modules/contracts/payments.js');
  const { mpSettings } = await import('../modules/masterplan/access.js');
  const { createProject } = await import('../modules/masterplan/projects.js');
  const { createNode, bulkCreate, nodeEvents } = await import('../modules/masterplan/nodes.js');
  const { migrateUnit } = await import('../modules/masterplan/migration.js');

  const mpSet = await mpSettings();
  const adminRole = await makeRole('mpadmin', ['masterplan.admin']);
  const mpAdmin = await makeUser('mpadmin', [adminRole]);
  const admin = { userId: mpAdmin, globalRoles: new Set(['admin']), isAdmin: true, assignments: [], settings: { ...mpSet, reserveLimit: 0 }, request: null };
  const project = await createProject(admin, { name: `DBTEST-CTR ${tag}`, currency: 'USD' });
  created.projects.push(project.id);
  const { rows: types } = await db.query(`SELECT id FROM mp_types WHERE key = 'cottage'`);
  const sector = await createNode(admin, { projectId: project.id, kind: 'level', levelKey: 'sector', code: 'A' });
  await bulkCreate(admin, { projectId: project.id, parentId: sector.id, kind: 'object', typeId: types[0].id, prefix: 'C', from: 1, count: 2, pad: 0, unit: { price: 100000, areaTotal: 100, status: 'free' } });
  const byCode = async (code) => (await db.query(`SELECT id FROM mp_nodes WHERE project_id = $1 AND code = $2`, [project.id, code])).rows[0].id;
  const c1 = await byCode('C1');
  const c2 = await byCode('C2');
  await migrateUnit(admin, c1, { to: 'booking', reason: 'test', clientName: 'Покупатель 1' });
  await migrateUnit(admin, c2, { to: 'reserve', reason: 'test', clientName: 'Покупатель 2' });
  const unit = async (nodeId) => (await db.query(`SELECT status, paid_amount, contract_number, contract_date::text AS contract_date, contract_amount FROM mp_units WHERE node_id = $1`, [nodeId])).rows[0];

  // People: a seller (contracts + sales), finance (both modules), the lawyer (both modules).
  const seller = await makeUser('mpseller', [await makeRole('mpsell', ['contracts.create', 'masterplan.sales'])]);
  const fin = await makeUser('mpfin', [await makeRole('mpfin', ['contracts.finance', 'masterplan.finance'])]);
  const lawyer = await makeUser('mplawyer', [await makeRole('mplegal', ['contracts.legal', 'masterplan.legal'])]);
  const [cSeller, cFin, cLawyer] = await contexts([seller, fin, lawyer]);
  const today = cSeller.today;

  // ── Unit in «Бронь»: the deposit moves it to «Задаток» ──
  const made = await service.createContract(cSeller, { title: `Коттедж C1 ${tag}`, typeKey: 'property_sale', direction: 'client', counterparty: 'Покупатель 1', amount: 100000, currency: 'USD', mpNodeId: c1 });
  const id = made.contract.id;
  created.contracts.push(id);
  // Schedule prefilled from the grid would come from payment-plans; here 100 % with the deposit.
  await pay.saveDeposit(cSeller, id, { amount: 10000, dueOn: today });
  const preview = await pay.previewSchedule(cSeller, id, { mode: 'full', firstOn: addDays(today, 30) });
  assert.deepEqual(preview.rows.map((r) => [r.purpose, r.amount]), [['deposit', 10000], ['rest', 90000]]);
  await pay.saveSchedule(cSeller, id, { rows: preview.rows, plan: preview.plan });
  let data = await pay.depositStatus(cFin, id, { status: 'received' });
  assert.equal(data.masterplanSync[0].result, 'applied');
  assert.equal((await unit(c1)).status, 'deposit');
  assert.equal(Number((await unit(c1)).paid_amount), 10000);
  assert.equal(data.masterplan.status, 'deposit');
  assert.deepEqual(data.masterplan.notes, []);

  // ── Signed → «Договор» with the number, date and amount ──
  await db.query(`UPDATE ctr_contracts SET status = 'approved' WHERE id = $1`, [id]);
  const signed = await service.changeStatus(cLawyer, id, { to: 'signed', signedOn: today });
  assert.equal(signed.masterplanSync.result, 'applied');
  const afterSign = await unit(c1);
  assert.equal(afterSign.status, 'contract');
  assert.equal(afterSign.contract_number, made.contract.number);
  assert.equal(afterSign.contract_date, today);
  assert.equal(Number(afterSign.contract_amount), 100000);

  // ── Payments update the paid amount; 100 % → «Продано» ──
  await pay.addPayment(cFin, id, { amount: 40000 });
  assert.equal(Number((await unit(c1)).paid_amount), 50000);
  assert.equal((await unit(c1)).status, 'contract');
  data = await pay.addPayment(cFin, id, { amount: 50000 });
  assert.equal(data.totals.full, true);
  assert.equal(data.masterplanSync[0].result, 'applied');
  assert.equal((await unit(c1)).status, 'sold');
  assert.equal(Number((await unit(c1)).paid_amount), 100000);
  // History on both sides.
  const { rows: syncEvents } = await db.query(`SELECT data FROM ctr_events WHERE contract_id = $1 AND kind = 'mp_sync' ORDER BY id`, [id]);
  assert.deepEqual(syncEvents.filter((e) => e.data.action !== 'paid').map((e) => [e.data.action, e.data.result]), [['deposit', 'applied'], ['signed', 'applied'], ['sold', 'applied']]);
  const { events } = await nodeEvents(admin, c1);
  assert.ok(events.some((e) => e.kind === 'status' && e.data.to === 'sold' && /оплачен полностью/.test(e.data.reason || '')));
  assert.ok(events.some((e) => e.kind === 'contract' && e.data.action === 'paid'));

  // ── Unit in «Резерв»: «Задаток» is not an allowed move — a note, the deposit is confirmed anyway ──
  const other = await service.createContract(cSeller, { title: `Коттедж C2 ${tag}`, direction: 'client', counterparty: 'Покупатель 2', amount: 100000, currency: 'USD', mpNodeId: c2 });
  created.contracts.push(other.contract.id);
  await pay.saveDeposit(cSeller, other.contract.id, { amount: 3000 });
  data = await pay.depositStatus(cFin, other.contract.id, { status: 'received' });
  assert.equal(data.deposit.status, 'received');
  assert.equal(data.masterplanSync[0].result, 'refused');
  assert.equal(data.masterplanSync[0].code, 'INVALID_TRANSITION');
  assert.equal((await unit(c2)).status, 'reserve');
  assert.deepEqual(data.masterplan.notes.map((n) => [n.action, n.code]), [['deposit', 'INVALID_TRANSITION']]);
  const { events: c2Events } = await nodeEvents(admin, c2);
  assert.ok(c2Events.some((e) => e.kind === 'contract' && e.data.result === 'refused'), 'the unit shows the refused move');
  // Without Masterplan rights (a seller confirming would need finance anyway): finance without masterplan.finance is refused, not failed.
  const finOnly = await makeUser('finonly', [await makeRole('finonly', ['contracts.finance'])]);
  const [cFinOnly] = await contexts([finOnly]);
  const third = await service.createContract(cSeller, { title: `Коттедж C2 bis ${tag}`, direction: 'client', amount: 1000, currency: 'USD', mpNodeId: c2 });
  created.contracts.push(third.contract.id);
  await migrateUnit(admin, c2, { to: 'booking', reason: 'test', clientName: 'Покупатель 2' });
  await pay.saveDeposit(cSeller, third.contract.id, { amount: 100 });
  data = await pay.depositStatus(cFinOnly, third.contract.id, { status: 'received' });
  assert.equal(data.deposit.status, 'received');
  assert.equal(data.masterplanSync[0].result, 'refused');
  assert.equal((await unit(c2)).status, 'booking');
});
