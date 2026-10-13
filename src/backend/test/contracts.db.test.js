import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'fs/promises';

/*
 * Database integration of the Contracts module: numbering, visibility per
 * role, versions, risks, the approvals integration (start → question →
 * answer → approve), server-enforced transitions, the expiry job and its
 * reminders (each once). Needs a test database (never production!):
 *
 *   CONTRACTS_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/contracts.db.test.js
 *
 * Without CONTRACTS_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.CONTRACTS_DB_TEST === '1';
const skip = enabled ? false : 'set CONTRACTS_DB_TEST=1 and a test database to run';

const TYPE = 'contracts.contract';
const tag = `ctrt${Date.now().toString(36)}`;
let db = null;
const created = { users: [], roles: [], groups: [], contracts: [] };
let savedRoute = null;

async function makeUser(name, roleIds = []) {
  const { rows } = await db.query(`INSERT INTO users (username, password_hash, display_name) VALUES ($1, '!', $2) RETURNING id`, [`${tag}.${name}`, `${name} ${tag}`]);
  created.users.push(rows[0].id);
  for (const roleId of roleIds) await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [rows[0].id, roleId]);
  return rows[0].id;
}

async function makeRole(key, permissions) {
  const { rows } = await db.query(`INSERT INTO app_roles (key, name, permissions) VALUES ($1, $2, $3) RETURNING id`, [`${tag}_${key}`, `${key} ${tag}`, permissions]);
  created.roles.push(rows[0].id);
  return rows[0].id;
}

after(async () => {
  if (!db) return;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  if (created.contracts.length) {
    await db.query(`DELETE FROM approval_processes WHERE type = $1 AND doc_id = ANY($2)`, [TYPE, created.contracts.map(String)]);
    const blobs = await db.query(`SELECT storage_key FROM ctr_versions WHERE contract_id = ANY($1)`, [created.contracts]);
    const { removeBlob } = await import('../modules/shared/storage.js');
    for (const row of blobs.rows) await removeBlob(row.storage_key);
    await db.query(`DELETE FROM ctr_contracts WHERE id = ANY($1)`, [created.contracts]);
  }
  if (savedRoute) await db.query(`UPDATE approval_routes SET stages = $2, restart_from = $3, escalate_to = $4 WHERE type = $1`, [TYPE, JSON.stringify(savedRoute.stages), savedRoute.restart_from, JSON.stringify(savedRoute.escalate_to)]);
  else await db.query(`DELETE FROM approval_routes WHERE type = $1`, [TYPE]);
  if (created.users.length) {
    await db.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [created.users]).catch(() => {});
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
  }
  if (created.roles.length) await db.query(`DELETE FROM app_roles WHERE id = ANY($1)`, [created.roles]);
  if (created.groups.length) await db.query(`DELETE FROM app_groups WHERE id = ANY($1)`, [created.groups]);
  await db.closePool();
});

test('database: contracts end to end', { skip }, async () => {
  db = await import('../config/database.js');
  const { ensureApprovalsSchema } = await import('../modules/approvals/schema.js');
  const { ensureLegalEntitiesTable } = await import('../services/legalEntities.js');
  await ensureApprovalsSchema();
  await ensureLegalEntitiesTable();
  await import('../modules/approvals/index.js');
  const contractsModule = (await import('../modules/contracts/index.js')).default;
  await contractsModule.schema();
  const api = await import('../modules/approvals/api.js');
  const engine = await import('../modules/approvals/engine.js');
  const service = await import('../modules/contracts/service.js');
  const versions = await import('../modules/contracts/versions.js');
  const risks = await import('../modules/contracts/risks.js');
  const { runDaily } = await import('../modules/contracts/jobs.js');
  const { addDays } = await import('../modules/contracts/logic.js');
  const { MODULE_CATALOG } = await import('../modules/catalog.js');
  const { requestAs } = await import('../api/events.js');
  const { newStorageKey, storagePath } = await import('../modules/shared/storage.js');

  savedRoute = (await db.query(`SELECT * FROM approval_routes WHERE type = $1`, [TYPE])).rows[0] || null;

  // People: an author (create), the lawyer (legal), the business owner, a colleague of the author
  // (same group), a stranger, management (view_all), the director (approver role).
  const createRole = await makeRole('create', ['contracts.create']);
  const legalRole = await makeRole('legal', ['contracts.legal']);
  const allRole = await makeRole('all', ['contracts.view_all']);
  const directorRole = await makeRole('director', []);
  const author = await makeUser('author', [createRole]);
  const lawyer = await makeUser('lawyer', [legalRole]);
  const owner = await makeUser('owner');
  const colleague = await makeUser('colleague');
  const stranger = await makeUser('stranger', [createRole]);
  const boss = await makeUser('boss', [allRole]);
  const director = await makeUser('director', [directorRole]);
  const group = await db.query(`INSERT INTO app_groups (key, name) VALUES ($1, $2) RETURNING id`, [`${tag}_dept`, `Dept ${tag}`]);
  created.groups.push(group.rows[0].id);
  await db.query(`INSERT INTO user_group_members (user_id, group_id) VALUES ($1, $3), ($2, $3)`, [author, colleague, group.rows[0].id]);

  const settings = { ...MODULE_CATALOG.find((m) => m.id === 'contracts').defaults, prefix: `T${tag.slice(-4).toUpperCase()}` };
  const ctxOf = async (id) => {
    const req = await requestAs(id);
    const ctx = await service.requestContext(req);
    ctx.settings = settings;
    return ctx;
  };
  const [cAuthor, cLawyer, cOwner, cColleague, cStranger, cBoss, cDirector] = await Promise.all([author, lawyer, owner, colleague, stranger, boss, director].map(ctxOf));

  // ── Create & numbering ──
  await assert.rejects(service.createContract(cOwner, { title: 'x' }), (err) => err.code === 'FORBIDDEN', 'no contracts.create');
  const first = await service.createContract(cAuthor, { title: `Поставка ${tag}`, typeKey: 'supply', direction: 'supplier', counterparty: 'ОсОО «Тест»', amount: 12000, currency: 'USD', lawyerId: lawyer, ownerId: owner });
  created.contracts.push(first.contract.id);
  assert.equal(first.contract.status, 'draft');
  assert.match(first.contract.number, new RegExp(`^${settings.prefix}-\\d{4,}$`));
  assert.equal(first.contract.owner.id, owner);
  // Two at once get different, consecutive numbers.
  const [a, b] = await Promise.all([service.createContract(cAuthor, { title: `A ${tag}` }), service.createContract(cAuthor, { title: `B ${tag}` })]);
  created.contracts.push(a.contract.id, b.contract.id);
  const seqs = [a.contract.number, b.contract.number].map((n) => Number(n.split('-').pop())).sort((x, y) => x - y);
  assert.equal(seqs[1] - seqs[0], 1);
  assert.notEqual(a.contract.number, b.contract.number);
  const id = first.contract.id;

  // ── Visibility per role ──
  await assert.rejects(service.getContract(cStranger, id), (err) => err.statusCode === 404);
  assert.ok(await service.getContract(cColleague, id), 'same (non-default) group as the author');
  assert.ok(await service.getContract(cBoss, id), 'view_all');
  assert.ok(await service.getContract(cLawyer, id), 'legal');
  assert.ok(await service.getContract(cOwner, id), 'owner');
  await assert.rejects(service.getContract(cDirector, id), (err) => err.statusCode === 404, 'not an approver yet');
  // The Procurement picker: an empty search is no filter (regression: the count query got the ORDER BY parameters).
  for (const c of [cBoss, cLawyer, cOwner, cStranger]) {
    const picked = await service.listContracts(c, { search: '', pageSize: 20 });
    assert.ok(picked.total >= picked.items.length && picked.pageSize === 20);
    for (const sort of ['number', 'endsOn', undefined]) await service.listContracts(c, { search: '', sort, order: 'desc' });
  }
  assert.ok((await service.listContracts(cBoss, { search: '', pageSize: 20 })).items.some((c) => c.id === id && c.number && c.title));
  const strangerList = await service.listContracts(cStranger, { search: tag });
  assert.equal(strangerList.items.length, 0);
  const ownerList = await service.listContracts(cOwner, { search: tag, view: 'mine' });
  assert.deepEqual(ownerList.items.map((c) => c.id), [id]);

  // ── Approval needs a file version ──
  await engine.saveRoute({ system: true, user: { id: author } }, TYPE, { stages: [{ id: 'director', name: 'Директор', mode: 'any', approvers: [{ kind: 'role', id: directorRole }] }] });
  await assert.rejects(api.startApproval(cAuthor.req, TYPE, id), (err) => err.code === 'VERSION_REQUIRED');

  // ── Versions: the lawyer uploads, the owner uploads a new version with a comment ──
  const fakeUpload = async (name, body) => {
    const storageKey = await newStorageKey('pdf', 'contracts');
    const path = storagePath(storageKey);
    await writeFile(path, body);
    return { path, storageKey, size: body.length, originalname: name };
  };
  await assert.rejects(versions.addVersion(cStranger, id, await fakeUpload('x.pdf', Buffer.from('%PDF-1.4 x'))), (err) => err.statusCode === 404);
  await assert.rejects(versions.addVersion(cLawyer, id, await fakeUpload('fake.pdf', Buffer.from('not a pdf at all'))), (err) => err.code === 'FILE_CONTENT');
  const v1 = await versions.addVersion(cLawyer, id, await fakeUpload('Договор.pdf', Buffer.from('%PDF-1.4 version one')), { comment: 'Первая редакция' });
  assert.equal(v1.no, 1);
  // ── Risks: three by the lawyer; the owner may not ──
  await assert.rejects(risks.addRisk(cOwner, id, { text: 'x' }), (err) => err.statusCode === 403);
  const r1 = await risks.addRisk(cLawyer, id, { text: 'Штраф 1 % в день без ограничения', clause: '7.2', importance: 'high' });
  await risks.addRisk(cLawyer, id, { text: 'Нет срока приёмки', clause: '4.1', importance: 'medium' });
  await risks.addRisk(cLawyer, id, { text: 'Подсудность по месту поставщика', importance: 'low' });
  assert.equal(r1.no, 1);
  const v2 = await versions.addVersion(cOwner, id, await fakeUpload('Договор v2.pdf', Buffer.from('%PDF-1.4 version two')), { comment: 'Исправлен п. 7.2' });
  assert.equal(v2.no, 2);
  let card = await service.getContract(cColleague, id);
  assert.equal(card.versions.length, 2);
  assert.equal(card.contract.currentVersionId, v2.id, 'the newest version is current');
  assert.equal(card.versions[0].comment, 'Исправлен п. 7.2');
  assert.equal(card.risks.length, 3);
  assert.equal(card.risks[0].importance, 'high', 'open high risks first');
  assert.equal(card.can.risks, false, 'a colleague sees but does not edit risks');
  await versions.updateVersion(cOwner, v1.id, { current: true });
  assert.equal((await service.getContract(cOwner, id)).contract.currentVersionId, v1.id);

  // ── Approvals: start → question → answer → approve ──
  await assert.rejects(api.startApproval(cStranger.req, TYPE, id), (err) => [403, 404].includes(err.statusCode));
  let process = await api.startApproval(cAuthor.req, TYPE, id, { urgency: 'urgent' });
  assert.equal(process.status, 'pending');
  card = await service.getContract(cAuthor, id);
  assert.equal(card.contract.status, 'approval');
  // Fields are locked while in approval; risks and versions are not.
  await assert.rejects(service.updateContract(cAuthor, id, { title: 'new' }), (err) => err.code === 'LOCKED');
  // The director now sees it (participant), and it waits for them.
  assert.ok(await service.getContract(cDirector, id));
  const waiting = await service.listContracts(cDirector, { view: 'waiting' });
  assert.deepEqual(waiting.items.map((c) => c.id), [id]);
  const counts = await service.counters(cDirector, { search: tag });
  assert.equal(counts.waiting, 1);
  assert.equal(counts.urgent, 1, 'urgent approval counts as «Срочные»');
  process = await api.decide(cDirector.req, process.id, { action: 'question', comment: 'Что с п. 7.2?' });
  assert.equal((await service.getContract(cAuthor, id)).contract.status, 'question');
  await service.updateContract(cOwner, id, { paymentTerms: 'Постоплата 30 дней' });
  process = await api.answer(cOwner.req, process.id, { comment: 'Исправили в версии 2' });
  assert.equal((await service.getContract(cAuthor, id)).contract.status, 'approval');
  process = await api.decide(cDirector.req, process.id, { action: 'approve' });
  assert.equal(process.status, 'approved');
  card = await service.getContract(cAuthor, id);
  assert.equal(card.contract.status, 'approved');

  // ── Manual transitions are enforced on the server ──
  await assert.rejects(service.changeStatus(cOwner, id, { to: 'signed' }), (err) => err.code === 'FORBIDDEN');
  await assert.rejects(service.changeStatus(cLawyer, id, { to: 'completed' }), (err) => err.code === 'BAD_TRANSITION');
  const unsigned = await service.counters(cLawyer, { search: tag });
  assert.ok(unsigned.unsigned >= 1, 'approved without a signed version');
  const today = cLawyer.today;
  await service.updateContract(cLawyer, id, { startsOn: addDays(today, -10), endsOn: addDays(today, 200), autoRenew: false });
  card = await service.changeStatus(cLawyer, id, { to: 'signed', signedVersionId: v2.id });
  assert.equal(card.contract.status, 'active', 'signed with a start in the past → in force at once');
  assert.equal(card.contract.signedVersionId, v2.id);
  assert.ok(card.versions.find((v) => v.id === v2.id).signed);
  assert.equal(card.contract.concludedOn, today);

  // ── The expiry job: «Истекает» N days before the end, reminders once ──
  await db.query(`UPDATE ctr_contracts SET ends_on = $2::date + 25 WHERE id = $1`, [id, today]);
  let result = await runDaily({ today, settings, ids: [id] });
  assert.equal(result.changed, 1);
  assert.equal(result.reminders, 1, 'the 30-day reminder');
  card = await service.getContract(cOwner, id);
  assert.equal(card.contract.status, 'expiring');
  const expiring = await service.listContracts(cOwner, { view: 'expiring', search: tag });
  assert.deepEqual(expiring.items.map((c) => c.id), [id]);
  result = await runDaily({ today, settings, ids: [id] });
  assert.equal(result.reminders, 0, 'never twice');
  result = await runDaily({ today: addDays(today, 19), settings, ids: [id] });
  assert.equal(result.reminders, 1, 'the 7-day reminder');
  const sent = await db.query(`SELECT kind, days FROM ctr_reminders WHERE contract_id = $1 ORDER BY days DESC`, [id]);
  assert.deepEqual(sent.rows.map((r) => `${r.kind}:${r.days}`), ['end:30', 'end:7']);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const notes = await db.query(`SELECT user_id FROM notifications WHERE kind = 'contracts.reminder' AND user_id = ANY($1)`, [[owner, lawyer]]);
  assert.equal(notes.rows.length, 4, 'owner and lawyer, two reminders each');
  // After the end: completed.
  result = await runDaily({ today: addDays(today, 26), settings, ids: [id] });
  assert.equal((await service.getContract(cOwner, id)).contract.status, 'completed');
  await assert.rejects(versions.addVersion(cOwner, id, await fakeUpload('late.pdf', Buffer.from('%PDF-1.4 late'))), (err) => err.statusCode === 403, 'archive is read-only');

  // ── Auto-prolongation ──
  const lease = await service.createContract(cLawyer, { title: `Аренда ${tag}`, startsOn: addDays(today, -365), endsOn: addDays(today, -1), autoRenew: true, noticeDays: 30, ownerId: owner });
  created.contracts.push(lease.contract.id);
  await db.query(`UPDATE ctr_contracts SET status = 'active' WHERE id = $1`, [lease.contract.id]);
  await runDaily({ today, settings, ids: [lease.contract.id] });
  card = await service.getContract(cLawyer, lease.contract.id);
  assert.equal(card.contract.status, 'active');
  assert.equal(card.contract.startsOn, today);
  assert.ok(card.contract.endsOn > addDays(today, 300));

  // ── Termination needs a reason; drafts can be deleted ──
  await db.query(`UPDATE ctr_contracts SET status = 'active' WHERE id = $1`, [lease.contract.id]);
  await assert.rejects(service.changeStatus(cLawyer, lease.contract.id, { to: 'terminated' }), (err) => err.code === 'COMMENT_REQUIRED');
  card = await service.changeStatus(cLawyer, lease.contract.id, { to: 'terminated', comment: 'По соглашению сторон' });
  assert.equal(card.contract.status, 'terminated');
  assert.equal(card.contract.terminatedReason, 'По соглашению сторон');
  await assert.rejects(service.deleteContract(cStranger, a.contract.id), (err) => err.statusCode === 404);
  await service.deleteContract(cAuthor, a.contract.id);
  await assert.rejects(service.getContract(cAuthor, a.contract.id), (err) => err.statusCode === 404);

  // ── History ──
  const history = await service.listEvents(cOwner, id);
  const kinds = history.events.map((e) => e.kind);
  for (const kind of ['created', 'version', 'risk', 'status', 'updated']) assert.ok(kinds.includes(kind), kind);
});
