import { test, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Database checks of the Contracts fixes from the code review: the refusal
 * deadline of a contract with a long notice period reaches «Ждёт меня»,
 * a lawyer's correction of the amount in approval re-plans the stages not
 * reached yet (the contract's people stay locked out), CSV dates follow the
 * person's regional settings. Needs a test database:
 *
 *   CONTRACTS_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/contracts-review.db.test.js
 */

const enabled = process.env.CONTRACTS_DB_TEST === '1';
const skip = enabled ? false : 'set CONTRACTS_DB_TEST=1 and a test database to run';

const TYPE = 'contracts.contract';
const tag = `ctrr${Date.now().toString(36)}`;
let db = null;
const created = { users: [], roles: [], contracts: [] };
const cleanup = [];

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
  await new Promise((resolve) => setTimeout(resolve, 1500));
  for (const fn of cleanup.reverse()) await fn();
  if (created.contracts.length) {
    await db.query(`DELETE FROM approval_processes WHERE type = $1 AND doc_id = ANY($2)`, [TYPE, created.contracts.map(String)]);
    await db.query(`DELETE FROM ctr_contracts WHERE id = ANY($1)`, [created.contracts]);
  }
  if (created.users.length) {
    await db.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [created.users]).catch(() => {});
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
  }
  if (created.roles.length) await db.query(`DELETE FROM app_roles WHERE id = ANY($1)`, [created.roles]);
  await db.closePool();
});

test('database: contracts review fixes', { skip }, async () => {
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
  const { addDays } = await import('../modules/contracts/logic.js');
  const { MODULE_CATALOG } = await import('../modules/catalog.js');
  const { formatDate } = await import('../services/datetime.js');
  const { inboxFor } = await import('../services/inbox.js');
  const settingsService = await import('../services/settings.js');
  const { requestAs } = await import('../api/events.js');

  const before = settingsService.parseSettings(await settingsService.getSettings({ fresh: true })).modules.contracts;
  await settingsService.updateAdminSettings({ modules: { contracts: { enabled: true } } });
  cleanup.push(() => settingsService.updateAdminSettings({ modules: { contracts: { enabled: before.enabled } } }));
  const savedRoute = (await db.query(`SELECT * FROM approval_routes WHERE type = $1`, [TYPE])).rows[0] || null;
  cleanup.push(async () => {
    await db.query(`DELETE FROM approval_routes WHERE type = $1`, [TYPE]);
    if (savedRoute) {
      await db.query(`INSERT INTO approval_routes (type, name, stages, restart_from, escalate_to, updated_by) VALUES ($1, $2, $3, $4, $5, $6)`, [TYPE, savedRoute.name, JSON.stringify(savedRoute.stages), savedRoute.restart_from, JSON.stringify(savedRoute.escalate_to), savedRoute.updated_by]);
    }
  });

  const createRole = await makeRole('create', ['contracts.create']);
  const legalRole = await makeRole('legal', ['contracts.legal']);
  const author = await makeUser('author', [createRole]);
  const lawyer = await makeUser('lawyer', [legalRole]);
  const owner = await makeUser('owner');
  const director = await makeUser('director');
  const cfo = await makeUser('cfo');
  const settings = { ...MODULE_CATALOG.find((m) => m.id === 'contracts').defaults, prefix: `R${tag.slice(-4).toUpperCase()}` };
  const ctxOf = async (id) => {
    const ctx = await service.requestContext(await requestAs(id));
    ctx.settings = settings;
    return ctx;
  };
  const [cAuthor, cLawyer, cOwner] = await Promise.all([author, lawyer, owner].map(ctxOf));
  const make = async (input) => {
    const card = await service.createContract(cAuthor, { title: `Аренда ${tag}`, ownerId: owner, lawyerId: lawyer, ...input });
    created.contracts.push(card.contract.id);
    return card.contract.id;
  };
  const today = cAuthor.today;

  // ── A7: a refusal deadline far from the end still reaches the inbox ──
  const longNotice = await make({ autoRenew: true, noticeDays: 90, startsOn: addDays(today, -270), endsOn: addDays(today, 95) });
  const quiet = await make({ autoRenew: true, noticeDays: 90, startsOn: addDays(today, -200), endsOn: addDays(today, 150) });
  const ending = await make({ autoRenew: false, startsOn: addDays(today, -100), endsOn: addDays(today, 5) });
  await db.query(`UPDATE ctr_contracts SET status = 'active' WHERE id = ANY($1)`, [[longNotice, quiet, ending]]);
  const items = (await inboxFor({ user: { id: owner } })).items.filter((item) => item.module === 'contracts');
  const refusal = items.find((item) => item.id === longNotice);
  assert.ok(refusal, 'the refusal deadline 5 days away is shown though the end is 95 days away');
  assert.equal(refusal.kind, 'refusal');
  assert.equal(refusal.meta.deadline, addDays(today, 5));
  assert.ok(!items.some((item) => item.id === quiet), 'a deadline 60 days away waits');
  assert.equal(items.find((item) => item.id === ending)?.kind, 'ending');

  // ── A5: a lawyer's correction in approval re-plans the stages ahead ──
  await engine.saveRoute({ system: true }, TYPE, {
    stages: [
      { id: 'director', name: 'Director', mode: 'any', approvers: [{ kind: 'user', id: director }] },
      { id: 'cfo', name: 'CFO', mode: 'any', approvers: [{ kind: 'user', id: cfo }], conditions: [{ field: 'amount', op: 'gte', value: 50000 }] },
    ],
  });
  const big = await make({ amount: 1000, currency: 'USD', concludedOn: '2026-03-05' });
  await db.query(`INSERT INTO ctr_versions (contract_id, no, name, ext, size, storage_key, created_by) VALUES ($1, 1, 'draft.pdf', 'pdf', 1, $2, $3)`, [big, `contracts/${tag}.pdf`, author]);
  let process = await api.startApproval(await requestAs(author), TYPE, String(big));
  assert.deepEqual(process.stages.map((s) => s.id), ['director']);
  await assert.rejects(service.updateContract(cOwner, big, { amount: 90000 }), (err) => err.code === 'LOCKED', 'the contract’s people are locked out in approval');
  await service.updateContract(cLawyer, big, { amount: 90000 });
  process = await api.getProcess(TYPE, String(big));
  assert.deepEqual(process.stages.map((s) => s.id), ['director', 'cfo']);
  await api.decide(await requestAs(director), process.id, { action: 'approve' });
  assert.equal((await api.getProcess(TYPE, String(big))).status, 'pending', 'the CFO still has to decide');

  // ── A15: CSV dates as the person reads them ──
  let csv = '';
  const res = { setHeader: () => {}, send: (body) => { csv = body; } };
  await service.exportCsv(cAuthor, { search: tag }, res);
  assert.ok(csv.includes(formatDate('2026-03-05', cAuthor.regional, 'ru')), 'concluded date in the regional format');
  if (formatDate('2026-03-05', cAuthor.regional, 'ru') !== '2026-03-05') assert.ok(!csv.includes('2026-03-05'));
});
