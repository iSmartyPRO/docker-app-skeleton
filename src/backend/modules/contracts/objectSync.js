import { query } from '../../config/database.js';
import { emit } from '../../platform/events.js';
import { modules } from '../../platform/registry.js';
import { logEvent } from './service.js';
import { DEPOSIT_HELD } from './payLogic.js';

/*
 * The object a contract sells follows the contract (docs/contracts.md
 * "Masterplan"). Contracts only announces what happened — it does not know
 * who keeps the object (today Masterplan follows, modules/masterplan/
 * contractSync.js):
 *
 *   contract.deposit_received   the deposit was confirmed
 *   contract.signed             the contract was signed
 *   contract.paid               payments changed (`full`: paid in full)
 *
 * Payload: { contract: { id, number, extNumber, concludedOn, amount, framework, payTracked, mpNodeId },
 *            paid, full, actor: { userId, req } } — `paid` is the money received for the object
 * (payments + the deposit while it is held). Followers answer { result, logs }: the results are
 * shown in the card («the unit moved to Договор» / refused), the logs kept in the contract's
 * history (ctr_events 'mp_sync'). Only contracts linked to an object (mp_node_id) are announced;
 * a follower that fails never fails the contract action.
 */

/** Money received on the contract for its object: payments + the deposit while it is held. */
async function objectPaid(contractId) {
  const { rows } = await query(
    `SELECT COALESCE((SELECT SUM(amount) FROM ctr_payments WHERE contract_id = $1), 0)
          + COALESCE((SELECT amount FROM ctr_deposits WHERE contract_id = $1 AND status = ANY($2::text[])), 0) AS paid`,
    [contractId, DEPOSIT_HELD]
  );
  return Math.round(Number(rows[0].paid) * 100) / 100;
}

const contractFacts = (row) => ({
  id: row.id,
  number: row.number,
  extNumber: row.ext_number || null,
  concludedOn: row.concluded_on || null,
  amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
  framework: Boolean(row.framework),
  payTracked: Boolean(row.pay_tracked),
  mpNodeId: row.mp_node_id,
});

/** Announces `name`; records the followers' notes; resolves to their results for the card ([] when nobody follows). */
async function announce(name, ctx, row, extra = {}) {
  if (!row?.mp_node_id) return [];
  const answers = await emit(name, { contract: contractFacts(row), paid: await objectPaid(row.id), actor: { userId: ctx.userId || null, req: ctx.req || null }, ...extra });
  const results = [];
  for (const answer of answers) {
    for (const log of answer.logs || []) await logEvent({ query }, row.id, 'mp_sync', log, ctx.userId || null).catch((err) => console.warn(`[contracts] ${name} note:`, err.message));
    if (answer.result) results.push(answer.result);
  }
  return results;
}

/** Deposit confirmed. */
export async function syncDeposit(ctx, row) {
  return (await announce('contract.deposit_received', ctx, row))[0] || null;
}

/** Contract signed. */
export async function syncSigned(ctx, row) {
  return (await announce('contract.signed', ctx, row))[0] || null;
}

/** Payments changed; `full` = the schedule is paid in full (and covers the contract amount). */
export async function syncPaid(ctx, row, { full = false } = {}) {
  return (await announce('contract.paid', ctx, row, { full }))[0] || null;
}

/** The linked object as the card shows it, with the last refused moves; null without one (or while its module is off). */
export async function unitInfo(ctx, row) {
  const masterplan = modules.loaded('masterplan')?.api;
  const unit = row?.mp_node_id && masterplan ? await masterplan.contractUnit(ctx.req || {}, row.mp_node_id) : null;
  if (!unit) return null;
  // The latest result per action; a refusal stays a note until a later attempt is applied.
  const { rows } = await query(
    `SELECT DISTINCT ON (data->>'action') data, created_at FROM ctr_events WHERE contract_id = $1 AND kind = 'mp_sync' ORDER BY data->>'action', id DESC`,
    [row.id]
  );
  const notes = rows
    .filter((event) => event.data?.result === 'refused')
    .map((event) => ({ action: event.data.action, code: event.data.code, from: unit.visible ? event.data.from : null, to: event.data.to, at: event.created_at }));
  return { id: unit.id, code: unit.code, status: unit.status, url: unit.url, notes };
}

/** Payment plans of the linked object's price grid (Masterplan), as the person may see them: { plans: [] } when none. */
export async function objectPlans(ctx, row) {
  const masterplan = modules.loaded('masterplan')?.api;
  if (!row?.mp_node_id || !masterplan) return { plans: [] };
  return masterplan.unitPaymentPlans(ctx.req || {}, row.mp_node_id);
}
