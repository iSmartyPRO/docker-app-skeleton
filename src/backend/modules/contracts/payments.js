import { query, withTransaction } from '../../config/database.js';
import { notify } from '../../services/notifications.js';
import { formatDate, isoDay } from '../../services/datetime.js';
import { requestRegional } from '../../services/regional.js';
import { extOf, originalName, removeBlob, sendBlob, storagePath, verifyContent } from '../shared/storage.js';
import { ARCHIVED, httpError } from './logic.js';
import { Params, canPlanPayments, contractsContext, contractsSettings, visibleSql } from './access.js';
import { actorNameOf, contractPeople, contractShape, contractUrl, csvCell, emitContract, loadRow, logEvent, requireContract } from './service.js';
import { contractMessage } from './messages.js';
import {
  DEPOSIT_HELD,
  allocate,
  buildSchedule,
  cleanDeposit,
  cleanDepositStatus,
  cleanPayment,
  cleanPlan,
  cleanScheduleRows,
  dueGroup,
  fromCents,
  payTotals,
  rowState,
  toCents,
} from './payLogic.js';

/*
 * The money side of a contract (docs/contracts.md "Deposit and payments"):
 * the deposit («Задаток» / «Аванс»), the payment schedule and the payments
 * received, the payments registry for finance and its dashboard numbers.
 * Everything is optional: a contract without a deposit, a schedule or
 * payments shows none of it.
 *
 * Every change locks the contract row, writes its history line and calls
 * recompute(): the payments (and the deposit while held) are allocated to the
 * schedule rows oldest first, and the totals land on ctr_contracts for the
 * registry chips. A linked Masterplan unit follows after the commit (mpSync.js).
 */

const soonDaysOf = (settings) => Number(settings?.paymentSoonDays) || 7;

const fileOf = (row, url) => (row.file_key ? { name: row.file_name, ext: row.file_ext || '', size: Number(row.file_size) || 0, url } : null);

export function depositShape(row, names = {}) {
  if (!row) return null;
  return {
    kind: row.kind,
    amount: Number(row.amount),
    currency: row.currency ? row.currency.trim() : null,
    dueOn: row.due_on || null,
    receivedOn: row.received_on || null,
    method: row.method || null,
    reference: row.reference || null,
    status: row.status,
    terms: row.terms || null,
    settledOn: row.settled_on || null,
    settledAmount: row.settled_amount === null || row.settled_amount === undefined ? null : Number(row.settled_amount),
    note: row.note || null,
    file: fileOf(row, `/api/app/contracts/payfiles/deposit/${row.contract_id}`),
    confirmedBy: row.confirmed_by ? { id: row.confirmed_by, name: names.confirmed || null } : null,
    confirmedAt: row.confirmed_at || null,
    updatedAt: row.updated_at,
  };
}

function paymentShape(row) {
  return {
    id: row.id,
    paidOn: row.paid_on,
    amount: Number(row.amount),
    method: row.method,
    reference: row.reference || null,
    note: row.note || null,
    file: fileOf(row, `/api/app/contracts/payfiles/payment/${row.id}`),
    author: row.created_by ? { id: row.created_by, name: row.author_name || null } : null,
    createdAt: row.created_at,
  };
}

const DEPOSIT_COLUMNS = `d.*, d.due_on::text AS due_on, d.received_on::text AS received_on, d.settled_on::text AS settled_on`;

async function loadDeposit(client, contractId) {
  const { rows } = await client.query(`SELECT ${DEPOSIT_COLUMNS}, COALESCE(u.display_name, u.username) AS confirmed_name FROM ctr_deposits d LEFT JOIN users u ON u.id = d.confirmed_by WHERE d.contract_id = $1`, [contractId]);
  return rows[0] || null;
}

async function loadRows(client, contractId) {
  const { rows } = await client.query(`SELECT id, no, due_on::text AS due_on, amount, purpose, note, paid FROM ctr_schedule WHERE contract_id = $1 ORDER BY due_on, no, id`, [contractId]);
  return rows.map((row) => ({ id: row.id, no: row.no, dueOn: row.due_on, amount: Number(row.amount), purpose: row.purpose, note: row.note || null, paid: Number(row.paid) }));
}

/** The deposit as a payment for the allocation: credited counts toward any row, received only toward «Задаток» rows. */
export function depositAsPayment(deposit, contractCurrency) {
  if (!deposit || !DEPOSIT_HELD.includes(deposit.status)) return null;
  const currency = deposit.currency ? deposit.currency.trim() : null;
  // A deposit in another currency is not mixed into the schedule.
  if (currency && contractCurrency && currency !== contractCurrency) return null;
  return deposit.status === 'credited' ? { amount: Number(deposit.amount) } : { amount: Number(deposit.amount), only: 'deposit' };
}

/**
 * Allocates the money to the rows again and stores the totals on the contract.
 * Runs inside the caller's transaction (contract row locked). → { total, paid, full, tracked }.
 */
export async function recompute(client, contractId) {
  const { rows: contracts } = await client.query(`SELECT currency, amount FROM ctr_contracts WHERE id = $1`, [contractId]);
  const currency = contracts[0]?.currency ? contracts[0].currency.trim() : null;
  const deposit = await loadDeposit(client, contractId);
  const rows = await loadRows(client, contractId);
  const { rows: pays } = await client.query(`SELECT amount FROM ctr_payments WHERE contract_id = $1`, [contractId]);
  const payments = pays.map((p) => ({ amount: Number(p.amount) }));
  const virtual = depositAsPayment(deposit, currency);
  if (virtual) payments.push(virtual);
  const result = allocate(rows, payments);
  for (const row of result.rows) {
    const before = rows.find((item) => item.id === row.id);
    if (before && toCents(before.paid) !== toCents(row.paid)) await client.query(`UPDATE ctr_schedule SET paid = $2 WHERE id = $1`, [row.id, row.paid]);
  }
  const tracked = Boolean(deposit || rows.length || pays.length);
  const total = rows.length ? fromCents(rows.reduce((sum, row) => sum + toCents(row.amount), 0)) : null;
  await client.query(`UPDATE ctr_contracts SET pay_tracked = $2, pay_total = $3, pay_paid = $4, deposit_status = $5 WHERE id = $1`, [contractId, tracked, total, tracked ? result.paid : null, deposit?.status || null]);
  const amount = contracts[0]?.amount === null || contracts[0]?.amount === undefined ? null : Number(contracts[0].amount);
  const full = total > 0 && toCents(result.paid) >= toCents(total) && (amount === null || toCents(result.paid) >= toCents(amount));
  return { total, paid: result.paid, full, tracked };
}

/** Locks the contract row for a money change. */
async function lockContract(client, id) {
  await client.query(`SELECT id FROM ctr_contracts WHERE id = $1 FOR UPDATE`, [id]);
}

function requireFinance(ctx) {
  if (!ctx.isFinance) throw httpError(403, 'Only finance confirms money', 'FORBIDDEN');
}

function requirePlanner(ctx, row) {
  if (!canPlanPayments(ctx, row)) throw httpError(403, 'You cannot plan the payments of this contract', 'FORBIDDEN');
}

/** Is the money side relevant for this contract (the tab shows)? Sales to clients, sale types, or anything already tracked. */
export const paymentsRelevant = (row) => Boolean(row.pay_tracked || row.direction === 'client' || ['sale', 'property_sale'].includes(row.type_key));

// ── The card's «Оплаты» tab ─────────────────────────────────────────────────

export async function paymentsOf(ctx, id) {
  const row = await requireContract(ctx, id);
  const [deposit, rows, pays] = await Promise.all([
    loadDeposit({ query }, row.id),
    loadRows({ query }, row.id),
    query(`SELECT p.*, p.paid_on::text AS paid_on, COALESCE(u.display_name, u.username) AS author_name FROM ctr_payments p LEFT JOIN users u ON u.id = p.created_by WHERE p.contract_id = $1 ORDER BY p.paid_on DESC, p.id DESC`, [row.id]),
  ]);
  const soonDays = soonDaysOf(ctx.settings);
  const currency = row.currency ? row.currency.trim() : null;
  const paid = row.pay_paid === null || row.pay_paid === undefined ? 0 : Number(row.pay_paid);
  const totals = payTotals(rows, paid, ctx.today, soonDays);
  const virtual = depositAsPayment(deposit, currency);
  // A received deposit with no «Задаток» row in the schedule is held, not counted yet.
  totals.depositHeld = Boolean(virtual?.only && !rows.some((r) => r.purpose === 'deposit'));
  const { unitInfo } = await import('./mpSync.js');
  return {
    today: ctx.today,
    soonDays,
    currency,
    amount: row.framework || row.amount === null ? null : Number(row.amount),
    relevant: paymentsRelevant(row),
    deposit: depositShape(deposit, { confirmed: deposit?.confirmed_name }),
    plan: row.pay_plan || null,
    schedule: rows.map((r) => ({ ...r, left: fromCents(Math.max(0, toCents(r.amount) - toCents(r.paid))), state: rowState(r, ctx.today, soonDays) })),
    payments: pays.rows.map(paymentShape),
    totals,
    can: { plan: canPlanPayments(ctx, row), finance: ctx.isFinance },
    masterplan: await unitInfo(ctx, row).catch(() => null),
  };
}

// ── Deposit ─────────────────────────────────────────────────────────────────

/** Creates or changes the deposit's terms (not its status). */
export async function saveDeposit(ctx, id, input = {}) {
  const row = await requireContract(ctx, id);
  requirePlanner(ctx, row);
  const data = cleanDeposit(input);
  const existing = await loadDeposit({ query }, row.id);
  if (!existing && data.amount === undefined) throw httpError(400, 'Enter the amount', 'BAD_AMOUNT', { field: 'amount' });
  // Received money is changed by finance only (its amount is what came in).
  if (existing && existing.status !== 'expected' && !ctx.isFinance && ('amount' in data || 'currency' in data)) throw httpError(403, 'Only finance changes a received deposit', 'FORBIDDEN');
  await withTransaction(async (client) => {
    await lockContract(client, row.id);
    if (!existing) {
      await client.query(
        `INSERT INTO ctr_deposits (contract_id, kind, amount, currency, due_on, terms, method, reference, created_by, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
        [row.id, data.kind || 'deposit', data.amount, data.currency || (row.currency ? row.currency.trim() : null), data.dueOn ?? null, data.terms ?? null, data.method ?? null, data.reference ?? null, ctx.userId]
      );
      await logEvent(client, row.id, 'deposit', { action: 'created', kind: data.kind || 'deposit', amount: data.amount, currency: data.currency || row.currency?.trim() || null, dueOn: data.dueOn || null }, ctx.userId);
    } else {
      const columns = { kind: 'kind', amount: 'amount', currency: 'currency', dueOn: 'due_on', terms: 'terms', method: 'method', reference: 'reference' };
      const keys = Object.keys(data).filter((key) => columns[key]);
      if (!keys.length) return;
      const changes = {};
      for (const key of keys) {
        const before = existing[columns[key]] ?? null;
        const now = data[key] ?? null;
        if (String(before === null ? '' : key === 'amount' ? Number(before) : String(before).trim()) !== String(now === null ? '' : now)) changes[key] = { from: before === null ? null : key === 'amount' ? Number(before) : String(before).trim(), to: now };
      }
      if (!Object.keys(changes).length) return;
      const sets = Object.keys(changes).map((key, i) => `${columns[key]} = $${i + 2}`);
      await client.query(`UPDATE ctr_deposits SET ${sets.join(', ')}, updated_by = $${sets.length + 2}, updated_at = NOW() WHERE contract_id = $1`, [row.id, ...Object.keys(changes).map((key) => data[key]), ctx.userId]);
      await logEvent(client, row.id, 'deposit', { action: 'updated', kind: data.kind || existing.kind, changes }, ctx.userId);
    }
    await recompute(client, row.id);
  });
  return paymentsOf(ctx, row.id);
}

/** Removes a deposit that never came (expected); its document goes too. */
export async function deleteDeposit(ctx, id) {
  const row = await requireContract(ctx, id);
  requirePlanner(ctx, row);
  const existing = await loadDeposit({ query }, row.id);
  if (!existing) throw httpError(404, 'No deposit', 'NOT_FOUND');
  if (existing.status !== 'expected') throw httpError(409, 'A received deposit is settled, not deleted', 'DEPOSIT_RECEIVED');
  await withTransaction(async (client) => {
    await lockContract(client, row.id);
    await client.query(`DELETE FROM ctr_deposits WHERE contract_id = $1`, [row.id]);
    await logEvent(client, row.id, 'deposit', { action: 'deleted', kind: existing.kind, amount: Number(existing.amount), currency: existing.currency?.trim() || null }, ctx.userId);
    await recompute(client, row.id);
  });
  if (existing.file_key) await removeBlob(existing.file_key);
  return paymentsOf(ctx, row.id);
}

/** Stores an uploaded document (multer put it on disk already); returns the file columns. */
async function takeFile(file) {
  if (!file) return null;
  const ext = extOf(originalName(file)).replace(/[^a-z0-9]/g, '');
  await verifyContent(file.path, ext);
  return { key: file.storageKey, name: originalName(file).slice(0, 255), ext: ext || null, size: file.size };
}

/**
 * Finance changes the deposit's status: received (confirm receipt), credited
 * (counted toward the price), returned, forfeited (retained), or back to
 * expected (a mistake). An optional document (payment order) comes with it.
 */
export async function depositStatus(ctx, id, input = {}, file = null) {
  let stored = null;
  let committed = false;
  try {
    const row = await requireContract(ctx, id);
    requireFinance(ctx);
    stored = await takeFile(file);
    const result = await withTransaction(async (client) => {
      await lockContract(client, row.id);
      const current = await loadDeposit(client, row.id);
      if (!current) throw httpError(404, 'No deposit', 'NOT_FOUND');
      const data = cleanDepositStatus(input, current, ctx.today);
      const sets = ['status = $2', 'received_on = $3', 'settled_on = $4', 'settled_amount = $5', 'note = COALESCE($6, note)', 'updated_by = $7', 'updated_at = NOW()'];
      const values = [row.id, data.status, data.receivedOn, data.settledOn, data.settledAmount, data.note, ctx.userId];
      if (data.method !== undefined) {
        values.push(data.method);
        sets.push(`method = $${values.length}`);
      }
      if (data.reference !== undefined) {
        values.push(data.reference);
        sets.push(`reference = $${values.length}`);
      }
      if (data.status === 'received' && current.status === 'expected') {
        values.push(ctx.userId);
        sets.push(`confirmed_by = $${values.length}`, 'confirmed_at = NOW()');
      }
      if (data.status === 'expected') sets.push('confirmed_by = NULL', 'confirmed_at = NULL');
      if (stored) {
        values.push(stored.key, stored.name, stored.ext, stored.size);
        sets.push(`file_key = $${values.length - 3}`, `file_name = $${values.length - 2}`, `file_ext = $${values.length - 1}`, `file_size = $${values.length}`);
      }
      await client.query(`UPDATE ctr_deposits SET ${sets.join(', ')} WHERE contract_id = $1`, values);
      await logEvent(client, row.id, 'deposit', { action: 'status', kind: current.kind, from: current.status, to: data.status, receivedOn: data.receivedOn, settledAmount: data.settledAmount, note: data.note || undefined }, ctx.userId);
      const totals = await recompute(client, row.id);
      return { from: current.status, to: data.status, oldFile: stored ? current.file_key : null, totals };
    });
    committed = true;
    if (result.oldFile) await removeBlob(result.oldFile);
    const fresh = await loadRow(row.id);
    const deposit = depositShape(await loadDeposit({ query }, row.id));
    const actor = await actorNameOf(ctx.userId);
    const sync = [];
    const mp = await import('./mpSync.js');
    if (result.to === 'received' && result.from === 'expected') {
      await notifyMoney(contractPeople(fresh), 'contracts.payment', 'depositReceived', { deposit, actor }, fresh, ctx.userId);
      emitContract('deposit.received', fresh, ctx.userId, { deposit });
      sync.push(await mp.syncDeposit(ctx, fresh).catch((err) => console.warn('[contracts] masterplan deposit sync:', err.message)));
    } else {
      await notifyMoney(contractPeople(fresh), 'contracts.payment', 'depositStatus', { deposit, actor }, fresh, ctx.userId);
    }
    sync.push(await mp.syncPaid(ctx, fresh, { full: result.totals.full }).catch((err) => console.warn('[contracts] masterplan paid sync:', err.message)));
    const out = await paymentsOf(ctx, row.id);
    out.masterplanSync = sync.filter(Boolean);
    return out;
  } catch (err) {
    if (!committed && stored) await removeBlob(stored.key);
    else if (!committed && file?.storageKey) await removeBlob(file.storageKey);
    throw err;
  }
}

/** Attaches (replaces) the deposit's document: the people who plan the money, or finance. */
export async function depositFile(ctx, id, file) {
  if (!file) throw httpError(400, 'Choose a file', 'NO_FILE');
  let stored = null;
  try {
    const row = await requireContract(ctx, id);
    requirePlanner(ctx, row);
    const current = await loadDeposit({ query }, row.id);
    if (!current) throw httpError(404, 'No deposit', 'NOT_FOUND');
    stored = await takeFile(file);
    await query(`UPDATE ctr_deposits SET file_key = $2, file_name = $3, file_ext = $4, file_size = $5, updated_by = $6, updated_at = NOW() WHERE contract_id = $1`, [row.id, stored.key, stored.name, stored.ext, stored.size, ctx.userId]);
    await logEvent({ query }, row.id, 'deposit', { action: 'file', kind: current.kind, name: stored.name }, ctx.userId);
    if (current.file_key) await removeBlob(current.file_key);
    stored = null;
    return paymentsOf(ctx, row.id);
  } catch (err) {
    await removeBlob(stored?.key || file.storageKey);
    throw err;
  }
}

// ── Schedule ────────────────────────────────────────────────────────────────

/** Rows a plan would give (nothing is saved): the card previews them before saving. */
export async function previewSchedule(ctx, id, input = {}) {
  const row = await requireContract(ctx, id);
  const plan = cleanPlan(input);
  const amount = input.total !== undefined && input.total !== null && input.total !== '' ? Number(input.total) : row.amount === null ? null : Number(row.amount);
  const deposit = await loadDeposit({ query }, row.id);
  const offsetDeposit = deposit && !['returned', 'forfeited'].includes(deposit.status) && depositSameCurrency(deposit, row) ? { amount: Number(deposit.amount), dueOn: deposit.due_on || deposit.received_on } : null;
  const rows = buildSchedule(amount, { ...plan, deposit: offsetDeposit, offset: plan.offset });
  return { plan, rows, total: fromCents(rows.reduce((sum, r) => sum + toCents(r.amount), 0)), amount };
}

const depositSameCurrency = (deposit, row) => {
  const a = deposit.currency ? deposit.currency.trim() : null;
  const b = row.currency ? row.currency.trim() : null;
  return !a || !b || a === b;
};

/**
 * Saves the schedule: `rows` as edited (rows with an id keep it, so reminders
 * already sent for them are not sent again), `plan` = what it was built from.
 * An empty list removes the schedule.
 */
export async function saveSchedule(ctx, id, input = {}) {
  const row = await requireContract(ctx, id);
  requirePlanner(ctx, row);
  const rows = cleanScheduleRows(input.rows || []);
  const plan = input.plan ? cleanPlan(input.plan) : null;
  const totals = await withTransaction(async (client) => {
    await lockContract(client, row.id);
    const existing = await loadRows(client, row.id);
    const keep = new Set();
    for (const r of rows) {
      const match = r.id && existing.find((item) => item.id === r.id && !keep.has(item.id));
      if (match) {
        keep.add(match.id);
        await client.query(`UPDATE ctr_schedule SET no = $2, due_on = $3, amount = $4, purpose = $5, note = $6 WHERE id = $1`, [match.id, r.no, r.dueOn, r.amount, r.purpose, r.note]);
      } else {
        const { rows: inserted } = await client.query(`INSERT INTO ctr_schedule (contract_id, no, due_on, amount, purpose, note) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [row.id, r.no, r.dueOn, r.amount, r.purpose, r.note]);
        keep.add(inserted[0].id);
      }
    }
    const gone = existing.filter((item) => !keep.has(item.id)).map((item) => item.id);
    if (gone.length) await client.query(`DELETE FROM ctr_schedule WHERE id = ANY($1::int[])`, [gone]);
    await client.query(`UPDATE ctr_contracts SET pay_plan = $2, updated_at = NOW() WHERE id = $1`, [row.id, rows.length ? JSON.stringify(plan || existingPlan(row)) : null]);
    const total = fromCents(rows.reduce((sum, r) => sum + toCents(r.amount), 0));
    await logEvent(client, row.id, 'schedule', { rows: rows.length, total, plan: plan ? { mode: plan.mode, firstPct: plan.firstPct, months: plan.months, source: plan.source || undefined } : undefined }, ctx.userId);
    return recompute(client, row.id);
  });
  const fresh = await loadRow(row.id);
  const { syncPaid } = await import('./mpSync.js');
  await syncPaid(ctx, fresh, { full: totals.full }).catch((err) => console.warn('[contracts] masterplan paid sync:', err.message));
  return paymentsOf(ctx, row.id);
}

const existingPlan = (row) => row.pay_plan || { mode: 'manual' };

// ── Payments (fact) ─────────────────────────────────────────────────────────

/** Registers a received payment (finance); it is allocated to the schedule rows oldest first. */
export async function addPayment(ctx, id, input = {}, file = null) {
  let stored = null;
  let committed = false;
  try {
    const row = await requireContract(ctx, id);
    requireFinance(ctx);
    const data = cleanPayment(input, ctx.today);
    stored = await takeFile(file);
    const { payment, totals } = await withTransaction(async (client) => {
      await lockContract(client, row.id);
      const { rows } = await client.query(
        `INSERT INTO ctr_payments (contract_id, paid_on, amount, method, reference, note, file_key, file_name, file_ext, file_size, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *, paid_on::text AS paid_on`,
        [row.id, data.paidOn, data.amount, data.method, data.reference, data.note, stored?.key || null, stored?.name || null, stored?.ext || null, stored?.size || null, ctx.userId]
      );
      await logEvent(client, row.id, 'payment', { amount: data.amount, paidOn: data.paidOn, method: data.method, reference: data.reference || undefined }, ctx.userId);
      return { payment: rows[0], totals: await recompute(client, row.id) };
    });
    committed = true;
    const fresh = await loadRow(row.id);
    const actor = await actorNameOf(ctx.userId);
    const shapeTotals = { total: totals.total ?? fresh.amount, paid: totals.paid, full: totals.full, percent: totals.total > 0 ? Math.min(100, Math.floor((totals.paid / totals.total) * 100)) : 0 };
    await notifyMoney(contractPeople(fresh), 'contracts.payment', 'paymentReceived', { payment: { amount: data.amount, paidOn: data.paidOn }, totals: shapeTotals, actor }, fresh, ctx.userId);
    emitContract('payment.received', fresh, ctx.userId, { payment: paymentShape(payment), totals: shapeTotals });
    const { syncPaid } = await import('./mpSync.js');
    const sync = await syncPaid(ctx, fresh, { full: totals.full }).catch((err) => console.warn('[contracts] masterplan paid sync:', err.message));
    const out = await paymentsOf(ctx, row.id);
    out.payment = paymentShape(payment);
    out.masterplanSync = sync ? [sync] : [];
    return out;
  } catch (err) {
    if (!committed) await removeBlob(stored?.key || file?.storageKey);
    throw err;
  }
}

/** Removes a payment registered by mistake (finance); the allocation is redone. */
export async function deletePayment(ctx, paymentId) {
  const n = Number(paymentId);
  if (!Number.isInteger(n) || n < 1) throw httpError(404, 'Payment not found', 'NOT_FOUND');
  const { rows } = await query(`SELECT *, paid_on::text AS paid_on FROM ctr_payments WHERE id = $1`, [n]);
  if (!rows[0]) throw httpError(404, 'Payment not found', 'NOT_FOUND');
  const row = await requireContract(ctx, rows[0].contract_id);
  requireFinance(ctx);
  const totals = await withTransaction(async (client) => {
    await lockContract(client, row.id);
    await client.query(`DELETE FROM ctr_payments WHERE id = $1`, [n]);
    await logEvent(client, row.id, 'payment_delete', { amount: Number(rows[0].amount), paidOn: rows[0].paid_on }, ctx.userId);
    return recompute(client, row.id);
  });
  if (rows[0].file_key) await removeBlob(rows[0].file_key);
  const { syncPaid } = await import('./mpSync.js');
  await syncPaid(ctx, await loadRow(row.id), { full: totals.full }).catch(() => null);
  return paymentsOf(ctx, row.id);
}

/** A deposit or payment document, after the contract's access check. */
export async function sendPayFile(ctx, kind, id, res, { download = false } = {}) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) throw httpError(404, 'File not found', 'NOT_FOUND');
  const { rows } = kind === 'deposit' ? await query(`SELECT contract_id, file_key, file_name, file_ext FROM ctr_deposits WHERE contract_id = $1`, [n]) : await query(`SELECT contract_id, file_key, file_name, file_ext FROM ctr_payments WHERE id = $1`, [n]);
  if (!rows[0]?.file_key) throw httpError(404, 'File not found', 'NOT_FOUND');
  await requireContract(ctx, rows[0].contract_id);
  await sendBlob(res, storagePath(rows[0].file_key), { name: rows[0].file_name, ext: rows[0].file_ext || extOf(rows[0].file_name), download });
}

// ── Prefill from Masterplan's price grid ────────────────────────────────────

/**
 * Payment plans of the linked unit's price grid (Masterplan pricing.js), as
 * the person may see them there (price.view): → { unit, currency, plans } or
 * { plans: [] } when there is no unit, no grid or no right.
 */
export async function planOptions(ctx, id) {
  const row = await requireContract(ctx, id);
  const { linkedUnit } = await import('./mpSync.js');
  const unit = await linkedUnit(row);
  if (!unit) return { plans: [] };
  try {
    const { mpContext, mpSettings } = await import('../masterplan/access.js');
    const { projectPricing, activeGrid, paymentOptions } = await import('../masterplan/pricing.js');
    const mctx = await mpContext(ctx.req || {}, await mpSettings());
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

// ── Payments registry (finance) ─────────────────────────────────────────────

function requireRegistry(ctx) {
  if (!ctx.isFinance && !ctx.viewAll) throw httpError(403, 'The payments registry is for finance', 'FORBIDDEN');
}

/**
 * What is expected: unpaid schedule rows and expected deposits of live
 * contracts, grouped by due day — overdue, today, this week, later (the
 * person's day) — with totals per currency of what is left.
 */
export async function registry(ctx, input = {}, { all = false } = {}) {
  requireRegistry(ctx);
  const p = new Params();
  const where = [await visibleSql(ctx, p), `c.pay_tracked`, `c.status <> ALL(${p.add(ARCHIVED)}::text[])`];
  const q = String(input.search ?? input.q ?? '').trim().slice(0, 100);
  if (q) {
    const like = p.add(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
    where.push(`(c.number ILIKE ${like} OR c.title ILIKE ${like} OR c.counterparty ILIKE ${like} OR c.ext_number ILIKE ${like})`);
  }
  const contractCols = `c.id AS contract_id, c.number, c.title, c.counterparty, c.currency, c.owner_id, c.status AS contract_status, COALESCE(o.display_name, o.username) AS owner_name`;
  const sql = `
    SELECT 'row' AS kind, s.id AS row_id, s.due_on::text AS due_on, s.amount, s.paid, s.purpose, ${contractCols}
    FROM ctr_schedule s JOIN ctr_contracts c ON c.id = s.contract_id LEFT JOIN users o ON o.id = c.owner_id
    WHERE ${where.join(' AND ')} AND s.paid < s.amount
      AND NOT (s.purpose = 'deposit' AND EXISTS (SELECT 1 FROM ctr_deposits dd WHERE dd.contract_id = c.id))
    UNION ALL
    SELECT 'deposit' AS kind, NULL AS row_id, d.due_on::text AS due_on, d.amount, 0 AS paid, d.kind AS purpose, ${contractCols}
    FROM ctr_deposits d JOIN ctr_contracts c ON c.id = d.contract_id LEFT JOIN users o ON o.id = c.owner_id
    WHERE ${where.join(' AND ')} AND d.status = 'expected'
    ORDER BY due_on NULLS LAST, number LIMIT 3000`;
  const { rows } = await query(sql, p.values);
  const soonDays = soonDaysOf(ctx.settings);
  const groups = { overdue: [], today: [], week: [], later: [] };
  for (const r of rows) {
    const amount = Number(r.amount);
    const paid = Number(r.paid);
    const currency = r.currency ? r.currency.trim() : '';
    const item = {
      key: r.kind === 'deposit' ? `d${r.contract_id}` : `r${r.row_id}`,
      kind: r.kind,
      rowId: r.row_id,
      purpose: r.purpose,
      dueOn: r.due_on,
      amount,
      paid,
      left: fromCents(toCents(amount) - toCents(paid)),
      currency,
      state: r.due_on ? rowState({ amount, paid, dueOn: r.due_on }, ctx.today, soonDays) : 'planned',
      contract: { id: r.contract_id, number: r.number, title: r.title, counterparty: r.counterparty || null, status: r.contract_status, owner: r.owner_id ? { id: r.owner_id, name: r.owner_name } : null, url: contractUrl(r.contract_id) },
    };
    groups[dueGroup(r.due_on, ctx.today)].push(item);
  }
  const totalsOf = (list) => {
    const map = new Map();
    for (const item of list) map.set(item.currency, (map.get(item.currency) || 0) + toCents(item.left));
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, cents]) => ({ currency, amount: fromCents(cents) }));
  };
  const every = Object.values(groups).flat();
  // «Позже» keeps one row per contract (its nearest payment, `more` = how many follow): a long
  // installment plan is not 24 rows of noise. The totals count every row; the CSV gets them all.
  const shown = (key, items) => {
    if (all || key !== 'later') return items;
    const first = new Map();
    for (const item of items) {
      const id = `${item.contract.id}:${item.kind}`;
      if (first.has(id)) first.get(id).more += 1;
      else first.set(id, { ...item, more: 0 });
    }
    return [...first.values()];
  };
  return {
    today: ctx.today,
    canPay: ctx.isFinance,
    groups: Object.entries(groups).map(([key, items]) => ({ key, items: shown(key, items), count: items.length, totals: totalsOf(items) })),
    totals: totalsOf(every),
    overdue: totalsOf(groups.overdue),
    count: every.length,
  };
}

const GROUP_TEXT = { overdue: ['Просрочено', 'Overdue'], today: ['Сегодня', 'Today'], week: ['На неделе', 'This week'], later: ['Позже', 'Later'] };
const PURPOSE_TEXT = {
  deposit: ['Задаток', 'Deposit'],
  advance: ['Аванс', 'Advance'],
  first: ['Первый взнос', 'First payment'],
  monthly: ['Ежемесячный платёж', 'Monthly payment'],
  rest: ['Остаток', 'Balance'],
  full: ['Полная оплата', 'Full payment'],
};

/** The registry as CSV (`;`, UTF-8 BOM, formula-guarded cells), dates in the person's format. */
export async function registryCsv(ctx, input, res) {
  const data = await registry(ctx, input, { all: true });
  const locale = input.lang === 'en' ? 'en' : 'ru';
  const ru = locale === 'ru' ? 0 : 1;
  const regional = ctx.regional || (await requestRegional(ctx.req));
  const header = ru === 0
    ? ['Группа', '№ договора', 'Договор', 'Контрагент', 'Назначение', 'Срок', 'Сумма', 'Оплачено', 'Остаток', 'Валюта', 'Ответственный']
    : ['Group', 'Contract No.', 'Contract', 'Counterparty', 'Purpose', 'Due', 'Amount', 'Paid', 'Left', 'Currency', 'Owner'];
  const num = (value) => String(value).replace('.', ru === 0 ? ',' : '.');
  const lines = [header.map(csvCell).join(';')];
  for (const group of data.groups) {
    for (const item of group.items) {
      lines.push(
        [GROUP_TEXT[group.key][ru], item.contract.number, item.contract.title, item.contract.counterparty, PURPOSE_TEXT[item.purpose]?.[ru] || item.purpose, item.dueOn ? formatDate(item.dueOn, regional, locale) : '', num(item.amount), num(item.paid), num(item.left), item.currency, item.contract.owner?.name]
          .map(csvCell)
          .join(';')
      );
    }
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="contract-payments-${ctx.today}.csv"`);
  res.send(`﻿${lines.join('\r\n')}\r\n`);
}

/** Dashboard «Поступления по договорам»: overdue and expected this week per currency, the nearest rows. */
export async function widget(ctx) {
  requireRegistry(ctx);
  const data = await registry(ctx, {});
  const group = (key) => data.groups.find((g) => g.key === key);
  const week = [...group('today').items, ...group('week').items];
  const sum = (list) => {
    const map = new Map();
    for (const item of list) map.set(item.currency, (map.get(item.currency) || 0) + toCents(item.left));
    return [...map.entries()].map(([currency, cents]) => ({ currency, amount: fromCents(cents) }));
  };
  return {
    today: data.today,
    overdue: { count: group('overdue').items.length, totals: group('overdue').totals },
    week: { count: week.length, totals: sum(week) },
    deposits: data.groups.flatMap((g) => g.items).filter((item) => item.kind === 'deposit').length,
    items: [...group('overdue').items, ...week].slice(0, 6),
  };
}

// ── Notifications, reminders, the inbox ─────────────────────────────────────

export async function notifyMoney(userIds, kind, message, params, row, actorId) {
  const ids = [...new Set(userIds.filter((id) => id && id !== actorId))];
  if (!ids.length) return;
  try {
    await notify({ userIds: ids, kind, module: 'contracts', link: `${contractUrl(row.id)}?tab=payments`, actorId, render: contractMessage(message, { contract: contractShape(row), ...params }) });
  } catch (err) {
    console.warn(`[contracts] notification ${kind} failed:`, err.message);
  }
}

/** Holders of contracts.finance (explicit; else administrators of the module), for overdue payments. */
export async function financePeople() {
  const { getAccessMap } = await import('../../services/rbac.js');
  const { rows } = await query(`SELECT id FROM users WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE`);
  const access = await getAccessMap(rows.map((row) => row.id));
  const explicit = [];
  const admins = [];
  for (const row of rows) {
    const perms = access.get(row.id)?.permissions || [];
    if (perms.includes('contracts.finance')) explicit.push(row.id);
    else if (perms.includes('contracts.admin')) admins.push(row.id);
  }
  return explicit.length ? explicit : admins;
}

/**
 * Payment reminders (job contracts:payments, the portal's day): before a row's
 * day to the business owner (the creator without one), and once when it is
 * overdue to the owner and finance, with the webhook contracts.payment.overdue.
 * (row, kind, days, due day) goes into ctr_pay_reminders by the statement that
 * decides to send, so each is sent once; a moved day makes a new reminder.
 */
export async function sendPaymentReminders(today, settings) {
  const { paymentReminders } = await import('./payLogic.js');
  const { rows } = await query(
    `SELECT s.id, s.contract_id, s.due_on::text AS due_on, s.amount, s.paid FROM ctr_schedule s JOIN ctr_contracts c ON c.id = s.contract_id
     WHERE s.paid < s.amount AND c.status <> ALL($1::text[]) AND s.due_on <= $2::date + 31 ORDER BY s.due_on, s.id LIMIT 5000`,
    [ARCHIVED, today]
  );
  let finance = null;
  let sent = 0;
  const days = Array.isArray(settings.paymentReminderDays) ? settings.paymentReminderDays : [3, 0];
  for (const r of rows) {
    const row = { id: r.id, dueOn: r.due_on, amount: Number(r.amount), paid: Number(r.paid) };
    for (const due of paymentReminders(row, today, days)) {
      const { rows: inserted } = await query(
        `INSERT INTO ctr_pay_reminders (row_id, kind, days, due_on) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING row_id`,
        [r.id, due.kind, due.days, r.due_on]
      );
      if (!inserted.length) continue;
      const contract = await loadRow(r.contract_id);
      if (!contract) continue;
      const left = fromCents(toCents(row.amount) - toCents(row.paid));
      const owner = contract.owner_id || contract.created_by;
      if (due.kind === 'due') {
        await notifyMoney([owner], 'contracts.payment_due', 'paymentDue', { row: { dueOn: row.dueOn, left }, left: due.left }, contract, null);
      } else {
        if (finance === null) finance = await financePeople();
        await notifyMoney([owner, ...finance], 'contracts.payment_overdue', 'paymentOverdue', { row: { dueOn: row.dueOn, left } }, contract, null);
        emitContract('payment.overdue', contract, null, { row: { id: r.id, dueOn: row.dueOn, amount: row.amount, paid: row.paid, left } });
      }
      sent += 1;
    }
  }
  return sent;
}

/** «Ждёт меня» for finance: contracts with overdue payments, one item each (the oldest day, what is overdue in total). */
export async function overdueInbox(ctx) {
  const req = ctx.req || ctx;
  const cctx = contractsContext(req, await contractsSettings());
  if (!cctx.isFinance || !cctx.userId) return [];
  const regional = await requestRegional(req);
  const today = isoDay(new Date(), regional.timeZone);
  const { rows } = await query(
    `SELECT c.id, c.number, c.title, c.counterparty, c.currency, MIN(s.due_on)::text AS since, SUM(s.amount - s.paid) AS overdue, COUNT(*)::int AS rows
     FROM ctr_schedule s JOIN ctr_contracts c ON c.id = s.contract_id
     WHERE s.paid < s.amount AND s.due_on < $1::date AND c.status <> ALL($2::text[])
     GROUP BY c.id ORDER BY MIN(s.due_on), c.id LIMIT 200`,
    [today, ARCHIVED]
  );
  return rows.map((row) => ({
    key: `contracts:payment:${row.id}`,
    module: 'contracts',
    kind: 'payment_overdue',
    id: row.id,
    title: row.counterparty ? `${row.title} · ${row.counterparty}` : row.title,
    number: row.number,
    amount: Math.round(Number(row.overdue) * 100) / 100,
    currency: row.currency ? row.currency.trim() : null,
    urgency: 'urgent',
    dueAt: null,
    overdue: true,
    url: `/app/contracts/payments?open=${row.id}`,
    actions: ['open'],
    meta: { since: row.since, rows: row.rows },
  }));
}
