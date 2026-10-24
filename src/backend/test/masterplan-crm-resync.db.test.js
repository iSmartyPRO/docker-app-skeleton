import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { activateAll } from './helpers/modules.js';

await activateAll();

/*
 * Masterplan catching up with the CRM after it was absent (crmLink.js resyncCrmDeals / autoCrmResync):
 * status changes and expiries of units with a deal made while the CRM was not installed become lines in
 * the deal's history (only those newer than the deal's last «masterplan» line), the deal amount follows
 * the units it holds (syncDealAmount); a second run writes nothing; once per CRM install; nothing is
 * recorded while the CRM is off. A test database only (never production!):
 *
 *   MASTERPLAN_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/masterplan-crm-resync.db.test.js
 */

const enabled = process.env.MASTERPLAN_DB_TEST === '1';
const skip = enabled ? false : 'set MASTERPLAN_DB_TEST=1 and a test database to run';

let db = null;
const cleanup = [];

after(async () => {
  if (!db) return;
  for (const fn of cleanup.reverse()) await fn().catch((err) => console.warn('cleanup:', err.message));
  await db.closePool();
});

test('database: deal history and amount missed while the CRM was absent are replayed once per CRM install', { skip }, async () => {
  db = await import('../config/database.js');
  await (await import('../modules/masterplan/schema.js')).ensureMasterplanSchema();
  await (await import('../modules/crm/schema.js')).ensureCrmSchema();
  const settings = await import('../services/settings.js');
  const before = settings.parseSettings(await settings.getSettings({ fresh: true })).modules;
  await settings.updateAdminSettings({ modules: { masterplan: { enabled: true, settings: { syncDealAmount: true } }, crm: { enabled: true } } });
  cleanup.push(() =>
    settings.updateAdminSettings({
      modules: {
        masterplan: { enabled: before.masterplan?.enabled || false, settings: { syncDealAmount: Boolean(before.masterplan?.settings?.syncDealAmount) } },
        crm: { enabled: before.crm?.enabled || false },
      },
    })
  );
  const flagBefore = (await db.query(`SELECT value FROM app_settings WHERE key = 'masterplan_crm_resync'`)).rows[0]?.value ?? null;
  cleanup.push(async () => {
    if (flagBefore === null) await db.query(`DELETE FROM app_settings WHERE key = 'masterplan_crm_resync'`);
    else await db.query(`UPDATE app_settings SET value = $1 WHERE key = 'masterplan_crm_resync'`, [flagBefore]);
  });
  const crmApi = await import('../modules/crm/api.js');
  const { resyncCrmDeals, autoCrmResync } = await import('../modules/masterplan/crmLink.js');
  const { mpSettings } = await import('../modules/masterplan/access.js');
  const { createProject } = await import('../modules/masterplan/projects.js');
  const { createNode, bulkCreate } = await import('../modules/masterplan/nodes.js');

  const mp = await mpSettings();
  const admin = { userId: null, globalRoles: new Set(['admin']), isAdmin: true, assignments: [], settings: { ...mp, reserveLimit: 0 }, request: null };
  const project = await createProject(admin, { name: `DBTEST-CRMRESYNC ${Date.now()}`, currency: 'USD' });
  cleanup.push(() => db.query(`DELETE FROM mp_projects WHERE id = $1`, [project.id]));
  const { rows: types } = await db.query(`SELECT id FROM mp_types WHERE key = 'cottage'`);
  const sector = await createNode(admin, { projectId: project.id, kind: 'level', levelKey: 'sector', code: 'C' });
  await bulkCreate(admin, { projectId: project.id, parentId: sector.id, kind: 'object', typeId: types[0].id, prefix: 'C', from: 1, count: 2, pad: 0, unit: { price: 100000, areaTotal: 80, status: 'free' } });
  const node = async (code) => (await db.query(`SELECT id FROM mp_nodes WHERE project_id = $1 AND code = $2`, [project.id, code])).rows[0].id;
  const c1 = await node('C1');
  const c2 = await node('C2');

  const stage = (await db.query(`SELECT id, pipeline_id FROM crm_stages ORDER BY id LIMIT 1`)).rows[0];
  const deal = (await db.query(`INSERT INTO crm_deals (pipeline_id, stage_id, title, amount, currency) VALUES ($1, $2, 'resync deal', 0, 'KGS') RETURNING id`, [stage.pipeline_id, stage.id])).rows[0].id;
  const other = (await db.query(`INSERT INTO crm_deals (pipeline_id, stage_id, title) VALUES ($1, $2, 'untouched deal') RETURNING id`, [stage.pipeline_id, stage.id])).rows[0].id;
  cleanup.push(() => db.query(`DELETE FROM crm_deals WHERE id = ANY($1)`, [[deal, other]]));

  const ago = (hours) => new Date(Date.now() - hours * 3600_000);
  const event = (nodeId, kind, data, at) =>
    db.query(`INSERT INTO mp_events (project_id, node_id, kind, data, created_at) VALUES ($1, $2, $3, $4, $5)`, [project.id, nodeId, kind, JSON.stringify(data), at]);
  // Before the CRM went away: a change with its line in the deal's history (written live).
  await event(c1, 'status', { from: 'free', to: 'reserve', deal: { id: deal } }, ago(3));
  await db.query(`INSERT INTO crm_events (deal_id, kind, body, data, created_at) VALUES ($1, 'masterplan', 'live line', '{}', $2)`, [deal, ago(2.5)]);
  // While it was absent (marked crmPending by sales.js): C1 booked and contracted, C2's reserve expired — no lines.
  await event(c1, 'status', { crmPending: true, from: 'reserve', to: 'booking', deal: { id: deal }, reason: 'клиент внёс бронь' }, ago(2));
  await event(c1, 'status', { crmPending: true, from: 'booking', to: 'contract', deal: { id: deal } }, ago(1));
  await event(c2, 'expired', { crmPending: true, from: 'reserve', to: 'free', deal: { id: deal } }, ago(0.5));
  // Not marked (written while the CRM was there, or by the demo directly): never replayed.
  await event(c2, 'status', { from: 'free', to: 'reserve', deal: { id: deal } }, ago(0.45));
  // A deal id the CRM does not have (deleted meanwhile) is skipped.
  await event(c2, 'status', { crmPending: true, from: 'free', to: 'reserve', deal: { id: 2147483000 } }, ago(0.4));
  await db.query(`UPDATE mp_units SET status = 'contract', deal_id = $2, currency = 'USD', contract_amount = 95000 WHERE node_id = $1`, [c1, deal]);

  const lines = async () => (await db.query(`SELECT body, data FROM crm_events WHERE deal_id = $1 AND kind = 'masterplan' AND data->>'resync' = 'true' ORDER BY id`, [deal])).rows;
  const first = await resyncCrmDeals(crmApi);
  assert.deepEqual([first.deals, first.lines, first.amounts], [1, 3, 1]);
  const written = await lines();
  assert.deepEqual(written.map((row) => [row.data.to, Boolean(row.data.expired)]), [['booking', false], ['contract', false], ['free', true]]);
  assert.ok(written.every((row) => row.data.at && row.data.event), 'the time of the change and its event are kept');
  assert.match(written[0].body, /C1/);
  const amount = (await db.query(`SELECT amount, currency FROM crm_deals WHERE id = $1`, [deal])).rows[0];
  assert.deepEqual([Number(amount.amount), amount.currency.trim()], [95000, 'USD']);
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM crm_events WHERE deal_id = $1`, [other])).rows[0].n, 0);

  // Idempotent: the lines are there, nothing more to write.
  const second = await resyncCrmDeals(crmApi);
  assert.deepEqual([second.deals, second.lines, second.amounts], [0, 0, 0]);
  assert.equal((await lines()).length, 3);

  // A status change while the CRM is not installed is marked; one while it is installed is not.
  const registry = await import('../platform/registry.js');
  const crmEntry = registry.modules.loaded('crm');
  assert.ok(crmEntry, 'the CRM is loaded from its source');
  const { changeStatus } = await import('../modules/masterplan/sales.js');
  const mark = async () => (await db.query(`SELECT data FROM mp_events WHERE node_id = $1 AND kind = 'status' ORDER BY id DESC LIMIT 1`, [c2])).rows[0].data;
  await db.query(`UPDATE mp_units SET status = 'reserve', deal_id = $2 WHERE node_id = $1`, [c2, deal]);
  registry.unregisterModule('crm');
  try {
    await changeStatus(admin, c2, { to: 'free', reason: 'test' });
  } finally {
    registry.registerModule(crmEntry.module);
  }
  const marked = await mark();
  assert.deepEqual([marked.crmPending, marked.deal?.id, marked.to], [true, deal, 'free']);
  await db.query(`UPDATE mp_units SET status = 'reserve', deal_id = $2 WHERE node_id = $1`, [c2, deal]);
  await changeStatus(admin, c2, { to: 'free', reason: 'test' });
  assert.equal((await mark()).crmPending, undefined);
  const third = await resyncCrmDeals(crmApi);
  assert.equal(third.lines, 0, 'the CRM was there for the live change: its line is newer than the marked one');

  // Once per CRM install.
  await db.query(`DELETE FROM app_settings WHERE key = 'masterplan_crm_resync'`);
  const installedAt = '2026-10-23T10:00:00.000Z';
  assert.ok(await autoCrmResync(crmApi, { installedAt }), 'first start after the CRM install');
  assert.equal(await autoCrmResync(crmApi, { installedAt }), null, 'already done for this install');
  const flag = JSON.parse((await db.query(`SELECT value FROM app_settings WHERE key = 'masterplan_crm_resync'`)).rows[0].value);
  assert.equal(flag.crmInstalledAt, installedAt);
  // The CRM switched off at the next install: nothing recorded, so a later try runs it.
  await settings.updateAdminSettings({ modules: { crm: { enabled: false } } });
  const off = await autoCrmResync(crmApi, { installedAt: '2026-10-24T10:00:00.000Z' });
  assert.equal(off.unavailable, true);
  assert.equal(JSON.parse((await db.query(`SELECT value FROM app_settings WHERE key = 'masterplan_crm_resync'`)).rows[0].value).crmInstalledAt, installedAt);
  await settings.updateAdminSettings({ modules: { crm: { enabled: true } } });
  const again = await autoCrmResync(crmApi, { installedAt: '2026-10-24T10:00:00.000Z' });
  assert.equal(again.lines, 0);
  // Without the CRM's API (not installed): unavailable.
  assert.equal((await resyncCrmDeals(null)).unavailable, true);
  // The CRM built into the core (no package row): never absent, nothing to do.
  assert.equal(await autoCrmResync(crmApi), null);
});
