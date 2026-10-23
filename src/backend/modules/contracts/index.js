import { query } from '../../config/database.js';
import { registerInboxProvider } from '../../services/inbox.js';
import { decide } from '../../api/scopes.js';
import { portalRegional } from '../../services/regional.js';
import { wallToInstant } from '../../services/datetime.js';
import { createContractsSchema, startContracts } from './schema.js';
import { privateRoutes } from './routes.js';
import { registerContractApproval } from './approval.js';
import { RUNNING, addDays, daysBetween, noticeDeadline } from './logic.js';
import { contractShape, portalToday } from './service.js';
import { sanitizeSettings, upgradeSettings } from './settings.js';
import * as api from './api.js';
// Demo data (Settings → Modules → Demo data): registerDemo at import time.
import './demo.js';

/*
 * Contracts (spec §6, docs/contracts.md): a registry of contracts with file
 * versions, the lawyer's risks, a conversation, links, statuses driven by the
 * approvals service and by dates, expiry reminders and a calendar.
 *
 * Distributed as a module package (docs/module-packages.md), not built into the
 * core: scripts/build-module.mjs bundles this file into server/index.js,
 * module.json holds the manifest facts, settings.js the settings defaults,
 * sanitizer and upgrade. It requires Approvals (core); CRM, Masterplan, Chat,
 * Counterparties and Procurement are optional links reached through the
 * registry at call time (packages load in any order).
 */

/** End of a calendar day in the portal's zone, as a moment (inbox deadlines). */
async function endOfDay(day) {
  const zone = (await portalRegional()).timeZone;
  const [year, month, d] = day.split('-').map(Number);
  return wallToInstant({ year, month, day: d, hour: 23, minute: 59 }, zone);
}

/**
 * «Ждёт меня»: decisions on contracts I own or handle as the lawyer —
 * a refusal deadline of an auto-prolonged contract within two weeks, or the
 * end of one that does not prolong within a week. Approvals of contracts
 * come through the approvals provider.
 */
async function deadlinesInbox(ctx) {
  const userId = ctx.user?.id;
  if (!userId) return [];
  // An API token sees these only with the contracts area in its scope.
  const policy = ctx.apiToken?.policy || ctx.req?.apiToken?.policy;
  if (policy && !decide(policy, 'GET', '/app/contracts/contracts').ok) return [];
  const today = await portalToday();
  const { rows } = await query(
    `SELECT id, number, title, counterparty, amount, currency, framework, status, auto_renew, notice_days,
            starts_on::text AS starts_on, ends_on::text AS ends_on, owner_id, lawyer_id, created_by
     FROM ctr_contracts
     WHERE status = ANY($1::text[]) AND (owner_id = $2 OR lawyer_id = $2) AND ends_on IS NOT NULL
       AND (
         -- the refusal deadline (end − notice period), however long the notice period is
         (COALESCE(auto_renew, FALSE) AND COALESCE(notice_days, 0) > 0 AND ends_on - notice_days BETWEEN $3::date AND $3::date + 14)
         OR (NOT COALESCE(auto_renew, FALSE) AND ends_on BETWEEN $3::date AND $3::date + 7)
       )`,
    [RUNNING, userId, today]
  );
  const items = [];
  for (const row of rows) {
    const contract = contractShape(row);
    const notice = noticeDeadline(contract);
    let kind = null;
    let day = null;
    if (notice && notice >= today && daysBetween(today, notice) <= 14) {
      kind = 'refusal';
      day = notice;
    } else if (!contract.autoRenew && daysBetween(today, contract.endsOn) <= 7) {
      kind = 'ending';
      day = contract.endsOn;
    }
    if (!kind) continue;
    items.push({
      key: `contracts:${kind}:${row.id}`,
      module: 'contracts',
      kind,
      id: row.id,
      title: row.counterparty ? `${row.title} · ${row.counterparty}` : row.title,
      number: row.number,
      amount: row.framework ? null : row.amount,
      currency: row.currency ? row.currency.trim() : null,
      urgency: daysBetween(today, day) <= 3 ? 'urgent' : 'normal',
      dueAt: await endOfDay(day),
      overdue: false,
      url: `/app/contracts/${row.id}`,
      actions: ['open'],
      meta: { deadline: day, kind, endsOn: contract.endsOn, startsNext: kind === 'refusal' ? addDays(contract.endsOn, 1) : null },
    });
  }
  return items;
}

/** «Ждёт меня» for finance (contracts.finance): contracts with overdue payments — «Платёж просрочен». */
async function paymentsInbox(ctx) {
  const policy = ctx.apiToken?.policy || ctx.req?.apiToken?.policy;
  if (policy && !decide(policy, 'GET', '/app/contracts/contracts').ok) return [];
  const { overdueInbox } = await import('./payments.js');
  return overdueInbox(ctx);
}

export default {
  id: 'contracts',
  // 001 is the schema Contracts had while built into the core: CREATE … IF NOT EXISTS, so on a portal
  // that already has the ctr_* tables it changes nothing. Later changes: migrations/NNN_name.sql|js.
  migrations: [{ id: '001_init', up: createContractsSchema }],
  routes: privateRoutes,
  api,
  sanitizeSettings,
  upgradeSettings,
  register(ctx) {
    // The document type 'contracts.contract' of the approvals service (core), «Ждёт меня» items,
    // daily status / reminder jobs, contract conversations (Chat entity rooms).
    registerContractApproval();
    registerInboxProvider('contracts.deadlines', deadlinesInbox, { module: 'contracts' });
    registerInboxProvider('contracts.payments', paymentsInbox, { module: 'contracts' });
    startContracts();
    // «Поступления по договорам» on the dashboard: finance and those who see every contract.
    ctx.registerWidget({ type: 'contractsPayments', anyPermission: ['contracts.finance', 'contracts.view_all', 'contracts.legal', 'contracts.admin'] });
    ctx.registerLinkProvider(api.contractLinkProvider);
  },
};
