import { query } from '../../config/database.js';
import { modulesEnabled, mpContext, mpSettings, requireNode } from './access.js';
import { actCaps, has, readCaps } from './rules.js';
import { changeStatus } from './sales.js';
import { unitsChanged } from './realtime.js';
import { logEvent as mpEvent } from './util.js';
import { activeGrid, paymentOptions, projectPricing } from './pricing.js';

/*
 * Contracts → Masterplan (docs/contracts.md "Masterplan"), on Masterplan's
 * side: it follows the events Contracts emits (platform/events.js) — Contracts
 * does not know Masterplan. Only while both modules are on and the contract is
 * linked to a sellable object (a node with an mp_units row):
 *
 *   contract.deposit_received   the unit in «Резерв» / «Бронь» → «Задаток»
 *   contract.signed             «Задаток» → «Договор» with the number, date and amount
 *                               (a unit already in «Договор» gets them copied)
 *   contract.paid               payments changed: the unit's paid amount = payments + the deposit held;
 *                               paid in full (`full`) → «Договор» → «Продано»
 *
 * Payload: { contract: { id, number, extNumber, concludedOn, amount, framework, payTracked, mpNodeId },
 *            paid (money received for the unit), full, actor: { userId, req } }.
 *
 * Status moves go through Masterplan's own sales service (changeStatus) with
 * the rights of the person who did it in Contracts, so the transition rules,
 * zones, field hiding, notifications and the CRM deal line stay Masterplan's.
 * A move Masterplan refuses never fails the contract action: the handler
 * returns { result, logs } — `result` is what the contract card shows, `logs`
 * the notes Contracts keeps in its history (ctr_events 'mp_sync'); a refusal
 * is also written to the unit's history (mp_events 'contract'). The paid
 * amount is derived data and is written without a Masterplan right.
 */

const TAKEN = ['deposit', 'contract', 'sold', 'handed'];

/** The linked unit of a node: the node with its mp_units row, or null (modules off, no object, not a sellable object). */
export async function linkedUnit(nodeId) {
  if (!nodeId) return null;
  const enabled = await modulesEnabled();
  if (!enabled.masterplan || !enabled.contracts) return null;
  const { rows } = await query(
    `SELECT n.id, n.project_id, n.path, n.code, n.name, u.status, u.version, u.paid_amount, u.contract_number, u.contract_date, u.contract_amount
     FROM mp_nodes n JOIN mp_units u ON u.node_id = n.id WHERE n.id = $1`,
    [nodeId]
  );
  return rows[0] || null;
}

async function masterplanCtx(actor) {
  const mctx = await mpContext(actor?.req || {}, await mpSettings());
  mctx.request = actor?.req || null;
  return mctx;
}

const unitLabel = (unit) => unit.code || unit.name || `#${unit.id}`;
const unitRef = (unit) => ({ id: unit.id, code: unitLabel(unit) });

/** The handler's answer: the card's result and the note for the contract's history (unless `quiet`). */
async function answer(actor, contract, unit, entry, { quiet = false, showUnitEvent = false } = {}) {
  const log = quiet
    ? null
    : (() => {
        const data = { action: entry.action, result: entry.result, code: entry.code || undefined, from: entry.from, to: entry.to, unit: { id: unit.id, projectId: unit.project_id, code: unitLabel(unit) } };
        if (entry.paid !== undefined) data.paid = entry.paid;
        return data;
      })();
  if (!quiet && (entry.result !== 'applied' || entry.unitEvent)) {
    await mpEvent(null, {
      projectId: unit.project_id,
      nodeId: unit.id,
      kind: 'contract',
      data: { contractId: contract.id, number: contract.number, action: entry.action, result: entry.result, code: entry.code || undefined, to: entry.to, paid: entry.paid, contract: entry.contract },
      authorId: actor?.userId || null,
    }).catch((err) => console.warn('[masterplan] contract note on the unit:', err.message));
  }
  const { unitEvent, ...rest } = entry;
  return { result: { ...(showUnitEvent ? entry : rest), unit: unitRef(unit) }, logs: log ? [log] : [] };
}

/** Moves the unit with the person's Masterplan rights; never throws. */
async function move(actor, contract, unit, action, to, input = {}) {
  const from = unit.status;
  try {
    const mctx = await masterplanCtx(actor);
    await changeStatus(mctx, unit.id, { to, reason: input.reason, ...input });
    return answer(actor, contract, unit, { action, result: 'applied', from, to });
  } catch (err) {
    return answer(actor, contract, unit, { action, result: 'refused', code: err.code || 'ERROR', from, to, message: err.message });
  }
}

/** contract.deposit_received: «Резерв» / «Бронь» → «Задаток». */
export async function onDeposit({ contract, paid, actor }) {
  const unit = await linkedUnit(contract?.mpNodeId);
  if (!unit) return null;
  if (TAKEN.includes(unit.status)) return answer(actor, contract, unit, { action: 'deposit', result: 'skipped', from: unit.status }, { quiet: true });
  if (!['reserve', 'booking'].includes(unit.status)) return answer(actor, contract, unit, { action: 'deposit', result: 'refused', code: 'NOT_HELD', from: unit.status, to: 'deposit' });
  return move(actor, contract, unit, 'deposit', 'deposit', { reason: `Договор ${contract.number}: задаток получен`, paidAmount: paid });
}

/** contract.signed: «Задаток» → «Договор» (number, date, amount); a unit already in «Договор» gets them copied. */
export async function onSigned({ contract, paid, actor }) {
  const unit = await linkedUnit(contract?.mpNodeId);
  if (!unit) return null;
  const terms = {
    number: String(contract.extNumber || contract.number).slice(0, 60),
    date: contract.concludedOn || null,
    amount: contract.framework || contract.amount === null || contract.amount === undefined ? null : Number(contract.amount),
  };
  if (['sold', 'handed'].includes(unit.status)) return answer(actor, contract, unit, { action: 'signed', result: 'skipped', from: unit.status }, { quiet: true });
  if (unit.status === 'contract') {
    // The unit was moved by hand: copy the contract's data when the person may contract units there.
    try {
      const mctx = await masterplanCtx(actor);
      const node = await requireNode(mctx, unit.id);
      if (!has(actCaps(mctx, node), 'status.contract')) throw Object.assign(new Error('No right to contract units'), { code: 'FORBIDDEN' });
      await query(
        `UPDATE mp_units SET contract_number = $2, contract_date = COALESCE($3, contract_date), contract_amount = COALESCE($4, contract_amount), version = version + 1, updated_by = $5, updated_at = NOW() WHERE node_id = $1`,
        [unit.id, terms.number, terms.date, terms.amount, actor?.userId]
      );
      unitsChanged(unit.project_id, [unit.id]);
      return answer(actor, contract, unit, { action: 'signed', result: 'applied', from: 'contract', to: 'contract', contract: terms, unitEvent: true }, { showUnitEvent: true });
    } catch (err) {
      return answer(actor, contract, unit, { action: 'signed', result: 'refused', code: err.code || 'ERROR', from: 'contract', to: 'contract' });
    }
  }
  const input = { reason: `Договор ${contract.number} подписан`, contractNumber: terms.number, contractDate: terms.date };
  if (terms.amount !== null) input.contractAmount = terms.amount;
  if (contract.payTracked) input.paidAmount = paid;
  return move(actor, contract, unit, 'signed', 'contract', input);
}

/**
 * contract.paid — payments changed: the unit's paid amount follows; paid in
 * full moves «Договор» → «Продано» with the person's rights. `full` = the
 * schedule is paid in full (and covers the contract amount).
 */
export async function onPaid({ contract, paid, full = false, actor }) {
  const unit = await linkedUnit(contract?.mpNodeId);
  if (!unit || !TAKEN.includes(unit.status)) return null;
  let result = null;
  if (Number(unit.paid_amount ?? -1) !== paid) {
    await query(`UPDATE mp_units SET paid_amount = $2, version = version + 1, updated_by = $3, updated_at = NOW() WHERE node_id = $1`, [unit.id, paid, actor?.userId || null]);
    unitsChanged(unit.project_id, [unit.id]);
    result = await answer(actor, contract, unit, { action: 'paid', result: 'applied', paid, unitEvent: true });
  }
  if (full && unit.status === 'contract') {
    const sold = await move(actor, contract, unit, 'sold', 'sold', { reason: `Договор ${contract.number}: оплачен полностью` });
    // «Продано» marks paid = the contract amount; keep the money really received.
    if (sold.result.result === 'applied') await query(`UPDATE mp_units SET paid_amount = $2 WHERE node_id = $1`, [unit.id, paid]);
    // The card shows the move; the history keeps both notes.
    return { result: sold.result, logs: [...(result?.logs || []), ...sold.logs] };
  }
  return result;
}

/** The unit as a contract card shows it: status only with the person's status.view; null without a linked unit. */
export async function contractUnit(req, nodeId) {
  const unit = await linkedUnit(nodeId);
  if (!unit) return null;
  let status = null;
  let visible = false;
  try {
    const mctx = await masterplanCtx({ req });
    const caps = readCaps(mctx, unit.project_id);
    visible = caps.size > 0;
    if (has(caps, 'status.view')) status = unit.status;
  } catch {
    /* no Masterplan context: the unit stays anonymous */
  }
  return {
    id: unit.id,
    code: visible ? unitLabel(unit) : null,
    status,
    visible,
    url: visible ? `/app/masterplan/p/${unit.project_id}/plan?node=${unit.id}` : null,
  };
}

/**
 * Payment plans of the linked unit's price grid, as the person may see them
 * (price.view): { unit, currency, effectiveFrom, plans } or { plans: [] } when
 * there is no unit, no grid or no right.
 */
export async function unitPaymentPlans(req, nodeId) {
  const unit = await linkedUnit(nodeId);
  if (!unit) return { plans: [] };
  try {
    const mctx = await mpContext(req || {}, await mpSettings());
    const pricing = await projectPricing(mctx, unit.project_id);
    if (!pricing?.grids?.length) return { plans: [], unit: { code: unit.code || unit.name } };
    const { rows } = await query(`SELECT u.price, u.currency, u.area_total, u.area_plot, n.type_id FROM mp_units u JOIN mp_nodes n ON n.id = u.node_id WHERE u.node_id = $1`, [unit.id]);
    const u = rows[0];
    const grid = activeGrid(pricing.grids, u.type_id, pricing.today);
    const options = paymentOptions({ price: Number(u.price) || 0, areaTotal: Number(u.area_total) || 0, areaPlot: Number(u.area_plot) || 0, currency: (u.currency || '').trim() || null }, grid);
    return {
      unit: { code: unit.code || unit.name, price: Number(u.price) || null, currency: (u.currency || '').trim() || null },
      currency: options?.currency || null,
      effectiveFrom: options?.effectiveFrom || null,
      plans: (options?.plans || []).map((plan) => ({ key: plan.key, name: plan.name, total: plan.total, firstPct: plan.firstPct, first: plan.first, months: plan.months, monthly: plan.monthly, last: plan.last })),
    };
  } catch {
    return { plans: [] };
  }
}

/** Subscribes Masterplan to the contract events (index.js register()). */
export function registerContractSync(events) {
  events.on('contract.deposit_received', onDeposit);
  events.on('contract.signed', onSigned);
  events.on('contract.paid', onPaid);
}

// ── Catching up with Contracts ─────────────────────────────────────────────

/*
 * Events Contracts emitted while Masterplan was not installed (the core was deployed before the
 * package) or switched off went to nobody. resyncFromContracts() replays what they would have said,
 * from the contracts' current state (Contracts' public API: linkedObjectStates), in their natural
 * order per contract — deposit received → signed → paid — through the same handlers, so the
 * transition rules, notes and notifications are the usual ones:
 *
 *   - the deposit is held and the unit is in «Резерв» / «Бронь» → «Задаток»;
 *   - the contract is signed and the unit is not yet «Договор» or later → «Договор» with its number,
 *     date and amount (a unit in «Договор» without a contract number gets them);
 *   - the paid amount follows the money received; paid in full moves «Договор» → «Продано».
 *
 * Nothing moves backwards and units in other states are left alone without a refusal note (a unit
 * changed by hand on purpose stays as it is). `actor`: whose Masterplan rights the moves use — the
 * administrator who asked (Settings → Masterplan → «Сверить с договорами»), or SYSTEM_ACTOR (super
 * administrator rights, no person) for the automatic run after an install. Returns
 * { checked, applied, refused, skipped, results: [{ contractId, unit, action, result, code }] }.
 */
export const SYSTEM_ACTOR = Object.freeze({ userId: null, req: { access: { permissions: ['*'], groupIds: [] }, user: null } });

export async function resyncFromContracts(contractsApi, { actor = SYSTEM_ACTOR } = {}) {
  const summary = { checked: 0, applied: 0, refused: 0, skipped: 0, results: [] };
  if (!contractsApi?.linkedObjectStates) return { ...summary, unavailable: true };
  const enabled = await modulesEnabled();
  if (!enabled.masterplan || !enabled.contracts) return { ...summary, unavailable: true };
  const states = await contractsApi.linkedObjectStates();
  for (const state of states) {
    const { contract, paid } = state;
    const unit = await linkedUnit(contract.mpNodeId);
    if (!unit) continue;
    summary.checked += 1;
    const answers = [];
    if (state.depositHeld && ['reserve', 'booking'].includes(unit.status)) answers.push(['deposit', await onDeposit({ contract, paid, actor })]);
    if (state.signed) {
      const now = await linkedUnit(contract.mpNodeId);
      // Held for a sale (reserve, booking, deposit) → «Договор»; «Договор» without the contract's data gets it.
      if (now && (['reserve', 'booking', 'deposit'].includes(now.status) || (now.status === 'contract' && !now.contract_number))) answers.push(['signed', await onSigned({ contract, paid, actor })]);
    }
    answers.push(['paid', await onPaid({ contract, paid, full: state.full, actor })]);
    for (const [action, answered] of answers) {
      if (!answered?.result) continue;
      const result = answered.result.result;
      if (result === 'applied') summary.applied += 1;
      else if (result === 'refused') summary.refused += 1;
      else summary.skipped += 1;
      summary.results.push({ contractId: contract.id, unit: answered.result.unit, action: answered.result.action || action, result, code: answered.result.code || undefined });
      if (answered.logs?.length && contractsApi.recordSyncNotes) await contractsApi.recordSyncNotes(contract.id, answered.logs.map((log) => ({ ...log, resync: true })), actor?.userId || null);
    }
  }
  return summary;
}

/*
 * Automatic catch-up once per install of the package: the first start after an install (the
 * installed_modules row's installed_at, ctx.installedAt — not an update, not a restart) runs
 * resyncFromContracts with SYSTEM_ACTOR a little after the boot, and records it in app_settings
 * (masterplan_contract_resync: { at, installedAt, checked, applied, refused }). While Masterplan or
 * Contracts is off nothing is recorded, so the next start tries again (or an administrator runs it).
 */
const RESYNC_FLAG = 'masterplan_contract_resync';

export async function autoResync(ctx) {
  if (!ctx?.installedAt) return null;
  const installedAt = new Date(ctx.installedAt).toISOString();
  const { rows } = await query(`SELECT value FROM app_settings WHERE key = $1`, [RESYNC_FLAG]);
  let flag = null;
  try {
    flag = rows[0] ? JSON.parse(rows[0].value) : null;
  } catch {
    flag = null;
  }
  if (flag?.installedAt === installedAt) return null;
  const summary = await resyncFromContracts(ctx.modules?.loaded?.('contracts')?.api || null, { actor: SYSTEM_ACTOR });
  if (summary.unavailable) return summary;
  const record = { at: new Date().toISOString(), installedAt, checked: summary.checked, applied: summary.applied, refused: summary.refused };
  await query(`INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [RESYNC_FLAG, JSON.stringify(record)]);
  console.log(`[masterplan] caught up with Contracts after the install: ${summary.checked} linked units checked, ${summary.applied} changes, ${summary.refused} refused`);
  return summary;
}

/** register(ctx): the automatic catch-up, MASTERPLAN_RESYNC_DELAY_MS (20 s) after the boot (outside the boot's settle window). */
export function scheduleContractResync(ctx, { delayMs = Number(process.env.MASTERPLAN_RESYNC_DELAY_MS ?? 20_000) } = {}) {
  if (!ctx?.installedAt) return null;
  const timer = setTimeout(() => autoResync(ctx).catch((err) => console.warn('[masterplan] catching up with Contracts failed:', err.message)), Math.max(0, delayMs || 0));
  timer.unref?.();
  return timer;
}
