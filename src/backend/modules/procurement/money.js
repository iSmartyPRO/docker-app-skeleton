import { query, withTransaction } from '../../config/database.js';
import { notify } from '../../services/notifications.js';
import { removeBlob } from '../shared/storage.js';
import { rolesOn } from './access.js';
import { acceptedFiles, discardUploads, insertDocuments, runUpload } from './files.js';
import { PAYMENT_METHODS, actionError, cents, day, deliveryStateOf, deriveStatus, httpError, money } from './logic.js';
import { procurementMessage } from './messages.js';
import { docOf, getRequest, logEvent, requestUrl, todayFor, usersByIds, visibleRow, webhook } from './service.js';

/*
 * Payments (spec §5.2): date, amount, method, payment order number and file;
 * several partial ones; «Оплачено» when they reach the amount of the request.
 * Delivery: confirmed by the responsible person or the author (partial
 * allowed), with waybills and acts. Every change recomputes the status in
 * one transaction holding the request row lock.
 */

const text = (value, max) => {
  const out = String(value ?? '').trim().slice(0, max);
  return out || null;
};

/** Recomputes paid amount, delivery state and status (only after approval, not when closed). */
async function recompute(client, requestId) {
  const { rows } = await client.query(`SELECT * FROM proc_requests WHERE id = $1`, [requestId]);
  const row = rows[0];
  const paid = cents((await client.query(`SELECT COALESCE(SUM(amount), 0) AS s FROM proc_payments WHERE request_id = $1`, [requestId])).rows[0].s);
  const deliveries = (await client.query(`SELECT partial FROM proc_deliveries WHERE request_id = $1`, [requestId])).rows;
  const deliveryState = deliveryStateOf(deliveries);
  const status = ['to_pay', 'partially_paid', 'paid', 'delivered'].includes(row.status) ? deriveStatus({ total: row.amount, paid, deliveryState }) : row.status;
  await client.query(
    `UPDATE proc_requests SET paid_amount = $2, delivery_state = $3::text, status = $4::text,
       paid_at = CASE WHEN $4::text IN ('paid', 'delivered') THEN COALESCE(paid_at, NOW()) ELSE NULL END,
       delivered_at = CASE WHEN $3::text = 'full' THEN COALESCE(delivered_at, NOW()) ELSE NULL END,
       updated_at = NOW()
     WHERE id = $1`,
    [requestId, paid, deliveryState, status]
  );
  return { before: row.status, status, paid, deliveryState };
}

async function lockRequest(client, id) {
  const { rows } = await client.query(`SELECT * FROM proc_requests WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0];
}

/** POST /requests/:id/payments (multipart: paidOn, amount, method, reference, note, files[]). */
export async function addPayment(req, res, id) {
  const files = await runUpload(req, res);
  let ctx;
  let row;
  let input;
  try {
    ({ ctx, row } = await visibleRow(req, id));
    const error = actionError('pay', row.status, rolesOn(ctx, row));
    if (error === 'FORBIDDEN') throw httpError(403, 'Only accounting can mark payments', 'FORBIDDEN');
    if (error) throw httpError(409, 'The request is not waiting for payment', 'BAD_TRANSITION', { status: row.status });
    const body = req.body || {};
    const amount = money(body.amount);
    if (!amount || amount <= 0) throw httpError(400, 'Enter the amount', 'AMOUNT_REQUIRED');
    const paidOn = body.paidOn ? day(body.paidOn) : await todayFor(req);
    if (!paidOn) throw httpError(400, 'Invalid date', 'BAD_DATE');
    input = { amount, paidOn, method: PAYMENT_METHODS.includes(body.method) ? body.method : 'bank', reference: text(body.reference, 80), note: text(body.note, 500) };
  } catch (err) {
    await discardUploads(files);
    throw err;
  }
  const accepted = await acceptedFiles(files);
  let result;
  try {
    result = await withTransaction(async (client) => {
      const current = await lockRequest(client, row.id);
      if (!['to_pay', 'partially_paid'].includes(current.status)) throw httpError(409, 'The request has changed, reload it', 'STALE');
      const remaining = cents(Number(current.amount) - Number(current.paid_amount));
      if (input.amount > remaining + 0.001) throw httpError(400, 'The payment is larger than what is left to pay', 'OVERPAID', { remaining });
      const { rows } = await client.query(
        `INSERT INTO proc_payments (request_id, paid_on, amount, method, reference, note, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [row.id, input.paidOn, input.amount, input.method, input.reference, input.note, ctx.userId]
      );
      const paymentId = rows[0].id;
      if (accepted.length) await insertDocuments(client, row, ctx.userId, accepted, { kind: 'payment', paymentId });
      const next = await recompute(client, row.id);
      await logEvent(client, row.id, ctx.userId, 'payment_added', { amount: input.amount, currency: row.currency, paidOn: input.paidOn, method: input.method, reference: input.reference, status: next.status });
      return next;
    });
  } catch (err) {
    for (const file of accepted) await removeBlob(file.storageKey);
    throw err;
  }
  const fresh = (await query(`SELECT * FROM proc_requests WHERE id = $1`, [row.id])).rows[0];
  const full = ['paid', 'delivered'].includes(result.status);
  // Spec §5.5: the author hears that the request was paid (partial payments too).
  const actor = (await usersByIds([ctx.userId])).get(ctx.userId)?.name || '';
  notify({
    userIds: [fresh.author_id, fresh.responsible_id],
    kind: 'procurement.paid',
    module: 'procurement',
    link: requestUrl(row.id),
    actorId: ctx.userId,
    render: procurementMessage('paid', { doc: docOf(fresh), payment: input, full, actor }),
  }).catch((err) => console.warn('[procurement] notify paid:', err.message));
  webhook('procurement.payment', fresh, ctx.userId, { payment: { amount: input.amount, paidOn: input.paidOn, method: input.method, reference: input.reference } });
  if (full) webhook('procurement.paid', fresh, ctx.userId);
  return getRequest(req, row.id);
}

/** DELETE /payments/:id: a mistake by accounting; the status follows. */
export async function deletePayment(req, paymentId) {
  const n = Number(paymentId);
  const { rows } = await query(`SELECT * FROM proc_payments WHERE id = $1`, [Number.isInteger(n) ? n : 0]);
  const payment = rows[0];
  if (!payment) throw httpError(404, 'Payment not found', 'NOT_FOUND');
  const { ctx, row } = await visibleRow(req, payment.request_id);
  if (!ctx.canPay) throw httpError(403, 'Only accounting can change payments', 'FORBIDDEN');
  if (['closed', 'cancelled'].includes(row.status)) throw httpError(409, 'The request is finished', 'LOCKED');
  const { rows: docs } = await query(`SELECT storage_key FROM proc_documents WHERE payment_id = $1`, [payment.id]);
  await withTransaction(async (client) => {
    await lockRequest(client, row.id);
    await client.query(`DELETE FROM proc_documents WHERE payment_id = $1`, [payment.id]);
    await client.query(`DELETE FROM proc_payments WHERE id = $1`, [payment.id]);
    const next = await recompute(client, row.id);
    await logEvent(client, row.id, ctx.userId, 'payment_removed', { amount: Number(payment.amount), currency: row.currency, status: next.status });
  });
  for (const doc of docs) await removeBlob(doc.storage_key);
  return getRequest(req, row.id);
}

/** POST /requests/:id/deliveries (multipart: deliveredOn, partial, note, files[]). */
export async function addDelivery(req, res, id) {
  const files = await runUpload(req, res);
  let ctx;
  let row;
  let input;
  try {
    ({ ctx, row } = await visibleRow(req, id));
    const error = actionError('deliver', row.status, rolesOn(ctx, row));
    if (error === 'FORBIDDEN') throw httpError(403, 'Delivery is confirmed by the responsible person or the author', 'FORBIDDEN');
    if (error) throw httpError(409, 'Not possible in this status', 'BAD_TRANSITION', { status: row.status });
    const body = req.body || {};
    const deliveredOn = body.deliveredOn ? day(body.deliveredOn) : await todayFor(req);
    if (!deliveredOn) throw httpError(400, 'Invalid date', 'BAD_DATE');
    input = { deliveredOn, partial: body.partial === true || body.partial === 'true' || body.partial === '1', note: text(body.note, 1000) };
  } catch (err) {
    await discardUploads(files);
    throw err;
  }
  const accepted = await acceptedFiles(files);
  try {
    await withTransaction(async (client) => {
      const current = await lockRequest(client, row.id);
      if (!['to_pay', 'partially_paid', 'paid'].includes(current.status)) throw httpError(409, 'The request has changed, reload it', 'STALE');
      const { rows } = await client.query(`INSERT INTO proc_deliveries (request_id, delivered_on, partial, note, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [row.id, input.deliveredOn, input.partial, input.note, ctx.userId]);
      if (accepted.length) await insertDocuments(client, row, ctx.userId, accepted, { kind: 'waybill', deliveryId: rows[0].id });
      const next = await recompute(client, row.id);
      await logEvent(client, row.id, ctx.userId, 'delivered', { partial: input.partial, deliveredOn: input.deliveredOn, status: next.status });
    });
  } catch (err) {
    for (const file of accepted) await removeBlob(file.storageKey);
    throw err;
  }
  const fresh = (await query(`SELECT * FROM proc_requests WHERE id = $1`, [row.id])).rows[0];
  const actor = (await usersByIds([ctx.userId])).get(ctx.userId)?.name || '';
  notify({ userIds: [fresh.author_id, fresh.responsible_id], kind: 'procurement.delivered', module: 'procurement', link: requestUrl(row.id), actorId: ctx.userId, render: procurementMessage('delivered', { doc: docOf(fresh), partial: input.partial, actor }) }).catch(() => {});
  webhook('procurement.delivered', fresh, ctx.userId, { delivery: input });
  return getRequest(req, row.id);
}

/** DELETE /deliveries/:id. */
export async function deleteDelivery(req, deliveryId) {
  const n = Number(deliveryId);
  const { rows } = await query(`SELECT * FROM proc_deliveries WHERE id = $1`, [Number.isInteger(n) ? n : 0]);
  const delivery = rows[0];
  if (!delivery) throw httpError(404, 'Delivery not found', 'NOT_FOUND');
  const { ctx, row } = await visibleRow(req, delivery.request_id);
  const roles = rolesOn(ctx, row);
  if (!(roles.author || roles.responsible || roles.admin)) throw httpError(403, 'You cannot change deliveries', 'FORBIDDEN');
  if (['closed', 'cancelled'].includes(row.status)) throw httpError(409, 'The request is finished', 'LOCKED');
  const { rows: docs } = await query(`SELECT storage_key FROM proc_documents WHERE delivery_id = $1`, [delivery.id]);
  await withTransaction(async (client) => {
    await lockRequest(client, row.id);
    await client.query(`DELETE FROM proc_documents WHERE delivery_id = $1`, [delivery.id]);
    await client.query(`DELETE FROM proc_deliveries WHERE id = $1`, [delivery.id]);
    const next = await recompute(client, row.id);
    await logEvent(client, row.id, ctx.userId, 'delivery_removed', { status: next.status });
  });
  for (const doc of docs) await removeBlob(doc.storage_key);
  return getRequest(req, row.id);
}
