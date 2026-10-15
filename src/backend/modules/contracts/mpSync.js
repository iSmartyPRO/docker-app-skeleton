import { query } from '../../config/database.js';
import { modulesEnabled } from './access.js';
import { logEvent } from './service.js';
import { DEPOSIT_HELD } from './payLogic.js';

/*
 * Contracts → Masterplan (docs/contracts.md "Masterplan"). Only while both
 * modules are on and the contract is linked to a sellable object (a node with
 * an mp_units row):
 *
 *   deposit received   the unit in «Резерв» / «Бронь» → «Задаток»
 *   contract signed    «Задаток» → «Договор» with the number, date and amount
 *                      (a unit already in «Договор» gets them copied)
 *   payments           the unit's paid amount = payments + the deposit held
 *   paid in full       «Договор» → «Продано»
 *
 * Status moves go through Masterplan's own sales service (sales.js
 * changeStatus) with the rights of the person who did it in Contracts, so the
 * transition rules, zones, field hiding, notifications and the CRM deal line
 * stay Masterplan's. A move Masterplan refuses never fails the contract
 * action: it is recorded as a note on both sides (ctr_events 'mp_sync',
 * mp_events 'contract') and shown in the card. The paid amount is derived
 * data and is written without a Masterplan right.
 */

const TAKEN = ['deposit', 'contract', 'sold', 'handed'];

/** The linked unit: { node, unit } or null (modules off, no object, not a sellable object). */
export async function linkedUnit(row) {
  if (!row?.mp_node_id) return null;
  const enabled = await modulesEnabled();
  if (!enabled.masterplan || !enabled.contracts) return null;
  const { rows } = await query(
    `SELECT n.id, n.project_id, n.path, n.code, n.name, u.status, u.version, u.paid_amount, u.contract_number, u.contract_date, u.contract_amount
     FROM mp_nodes n JOIN mp_units u ON u.node_id = n.id WHERE n.id = $1`,
    [row.mp_node_id]
  );
  return rows[0] || null;
}

async function masterplanCtx(ctx) {
  const { mpContext, mpSettings } = await import('../masterplan/access.js');
  const mctx = await mpContext(ctx.req || {}, await mpSettings());
  mctx.request = ctx.req || null;
  return mctx;
}

const unitLabel = (unit) => unit.code || unit.name || `#${unit.id}`;

/** History on both sides; a refused move is also visible on the unit. */
async function record(ctx, row, unit, entry) {
  const data = { action: entry.action, result: entry.result, code: entry.code || undefined, from: entry.from, to: entry.to, unit: { id: unit.id, projectId: unit.project_id, code: unitLabel(unit) } };
  if (entry.paid !== undefined) data.paid = entry.paid;
  await logEvent({ query }, row.id, 'mp_sync', data, ctx.userId || null);
  if (entry.result !== 'applied' || entry.unitEvent) {
    const { logEvent: mpEvent } = await import('../masterplan/util.js');
    await mpEvent(null, {
      projectId: unit.project_id,
      nodeId: unit.id,
      kind: 'contract',
      data: { contractId: row.id, number: row.number, action: entry.action, result: entry.result, code: entry.code || undefined, to: entry.to, paid: entry.paid, contract: entry.contract },
      authorId: ctx.userId || null,
    });
  }
}

/** Moves the unit with the person's Masterplan rights; never throws. */
async function move(ctx, row, unit, action, to, input = {}) {
  const from = unit.status;
  try {
    const mctx = await masterplanCtx(ctx);
    const { changeStatus } = await import('../masterplan/sales.js');
    await changeStatus(mctx, unit.id, { to, reason: input.reason, ...input });
    const entry = { action, result: 'applied', from, to };
    await record(ctx, row, unit, entry);
    return { ...entry, unit: { id: unit.id, code: unitLabel(unit) } };
  } catch (err) {
    const entry = { action, result: 'refused', code: err.code || 'ERROR', from, to };
    await record(ctx, row, unit, entry).catch(() => {});
    return { ...entry, message: err.message, unit: { id: unit.id, code: unitLabel(unit) } };
  }
}

/** Money received on the contract for the unit: payments + the deposit while it is held. */
async function unitPaid(contractId) {
  const { rows } = await query(
    `SELECT COALESCE((SELECT SUM(amount) FROM ctr_payments WHERE contract_id = $1), 0)
          + COALESCE((SELECT amount FROM ctr_deposits WHERE contract_id = $1 AND status = ANY($2::text[])), 0) AS paid`,
    [contractId, DEPOSIT_HELD]
  );
  return Math.round(Number(rows[0].paid) * 100) / 100;
}

/** Deposit confirmed: «Резерв» / «Бронь» → «Задаток». */
export async function syncDeposit(ctx, row) {
  const unit = await linkedUnit(row);
  if (!unit) return null;
  if (TAKEN.includes(unit.status)) return { action: 'deposit', result: 'skipped', from: unit.status, unit: { id: unit.id, code: unitLabel(unit) } };
  if (!['reserve', 'booking'].includes(unit.status)) {
    const entry = { action: 'deposit', result: 'refused', code: 'NOT_HELD', from: unit.status, to: 'deposit' };
    await record(ctx, row, unit, entry);
    return { ...entry, unit: { id: unit.id, code: unitLabel(unit) } };
  }
  return move(ctx, row, unit, 'deposit', 'deposit', { reason: `Договор ${row.number}: задаток получен`, paidAmount: await unitPaid(row.id) });
}

/** Contract signed: «Задаток» → «Договор» (number, date, amount); a unit already in «Договор» gets them copied. */
export async function syncSigned(ctx, row) {
  const unit = await linkedUnit(row);
  if (!unit) return null;
  const contract = {
    number: String(row.ext_number || row.number).slice(0, 60),
    date: row.concluded_on || null,
    amount: row.framework || row.amount === null ? null : Number(row.amount),
  };
  if (['sold', 'handed'].includes(unit.status)) return { action: 'signed', result: 'skipped', from: unit.status, unit: { id: unit.id, code: unitLabel(unit) } };
  if (unit.status === 'contract') {
    // The unit was moved by hand: copy the contract's data when the person may contract units there.
    try {
      const mctx = await masterplanCtx(ctx);
      const { requireNode } = await import('../masterplan/access.js');
      const { actCaps, has } = await import('../masterplan/rules.js');
      const node = await requireNode(mctx, unit.id);
      if (!has(actCaps(mctx, node), 'status.contract')) throw Object.assign(new Error('No right to contract units'), { code: 'FORBIDDEN' });
      await query(
        `UPDATE mp_units SET contract_number = $2, contract_date = COALESCE($3, contract_date), contract_amount = COALESCE($4, contract_amount), version = version + 1, updated_by = $5, updated_at = NOW() WHERE node_id = $1`,
        [unit.id, contract.number, contract.date, contract.amount, ctx.userId]
      );
      const { unitsChanged } = await import('../masterplan/realtime.js');
      unitsChanged(unit.project_id, [unit.id]);
      const entry = { action: 'signed', result: 'applied', from: 'contract', to: 'contract', contract, unitEvent: true };
      await record(ctx, row, unit, entry);
      return { ...entry, unit: { id: unit.id, code: unitLabel(unit) } };
    } catch (err) {
      const entry = { action: 'signed', result: 'refused', code: err.code || 'ERROR', from: 'contract', to: 'contract' };
      await record(ctx, row, unit, entry).catch(() => {});
      return { ...entry, unit: { id: unit.id, code: unitLabel(unit) } };
    }
  }
  const input = { reason: `Договор ${row.number} подписан`, contractNumber: contract.number, contractDate: contract.date };
  if (contract.amount !== null) input.contractAmount = contract.amount;
  if (row.pay_tracked) input.paidAmount = await unitPaid(row.id);
  return move(ctx, row, unit, 'signed', 'contract', input);
}

/**
 * Payments changed: the unit's paid amount follows; paid in full moves
 * «Договор» → «Продано» with the person's rights. `full` = the schedule is
 * paid in full (and covers the contract amount).
 */
export async function syncPaid(ctx, row, { full = false } = {}) {
  const unit = await linkedUnit(row);
  if (!unit || !TAKEN.includes(unit.status)) return null;
  const paid = await unitPaid(row.id);
  let result = null;
  if (Number(unit.paid_amount ?? -1) !== paid) {
    await query(`UPDATE mp_units SET paid_amount = $2, version = version + 1, updated_by = $3, updated_at = NOW() WHERE node_id = $1`, [unit.id, paid, ctx.userId || null]);
    const { unitsChanged } = await import('../masterplan/realtime.js');
    unitsChanged(unit.project_id, [unit.id]);
    await record(ctx, row, unit, { action: 'paid', result: 'applied', paid, unitEvent: true });
    result = { action: 'paid', result: 'applied', paid, unit: { id: unit.id, code: unitLabel(unit) } };
  }
  if (full && unit.status === 'contract') {
    const sold = await move(ctx, row, unit, 'sold', 'sold', { reason: `Договор ${row.number}: оплачен полностью` });
    // «Продано» marks paid = the contract amount; keep the money really received.
    if (sold.result === 'applied') await query(`UPDATE mp_units SET paid_amount = $2 WHERE node_id = $1`, [unit.id, paid]);
    return sold;
  }
  return result;
}

/** The unit as the card shows it (status only with the person's status.view) and the last refused moves. */
export async function unitInfo(ctx, row) {
  const unit = await linkedUnit(row);
  if (!unit) return null;
  let status = null;
  let visible = false;
  try {
    const mctx = await masterplanCtx(ctx);
    const { readCaps, has } = await import('../masterplan/rules.js');
    const caps = readCaps(mctx, unit.project_id);
    visible = caps.size > 0;
    if (has(caps, 'status.view')) status = unit.status;
  } catch {
    /* no Masterplan context: the unit stays anonymous */
  }
  // The latest result per action; a refusal stays a note until a later attempt is applied.
  const { rows } = await query(
    `SELECT DISTINCT ON (data->>'action') data, created_at FROM ctr_events WHERE contract_id = $1 AND kind = 'mp_sync' ORDER BY data->>'action', id DESC`,
    [row.id]
  );
  const notes = rows
    .filter((event) => event.data?.result === 'refused')
    .map((event) => ({ action: event.data.action, code: event.data.code, from: visible ? event.data.from : null, to: event.data.to, at: event.created_at }));
  return {
    id: unit.id,
    code: visible ? unitLabel(unit) : null,
    status,
    url: visible ? `/app/masterplan/p/${unit.project_id}/plan?node=${unit.id}` : null,
    notes,
  };
}
