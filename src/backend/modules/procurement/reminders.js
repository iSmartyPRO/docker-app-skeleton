import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { notify } from '../../services/notifications.js';
import { isoDay } from '../../services/datetime.js';
import { portalRegional } from '../../services/regional.js';
import { addDays, DELIVERABLE, PAYABLE } from './logic.js';
import { procurementMessage } from './messages.js';
import { docOf, payers, requestUrl, webhook } from './service.js';

/*
 * procurement:deadlines (every 10 minutes, under the scheduler's lock).
 *
 *   pay by       `reminderDays` before the day → «скоро срок» to accounting and
 *                the responsible person; the day after → «просрочено» (also the author)
 *   deliver by   the same for delivery → the responsible person and the author
 *
 * Each reminder goes once: the marker (pay_soon_at, pay_overdue_at,
 * deliver_soon_at, deliver_overdue_at) is set by the same UPDATE that picks
 * the rows; changing the date clears it. Days are the portal's calendar days.
 */
export async function runDeadlines(now = new Date()) {
  const parsed = parseSettings(await getSettings());
  const module = parsed.modules.procurement;
  if (!module?.enabled) return { sent: 0 };
  const regional = await portalRegional();
  const today = isoDay(now, regional.timeZone);
  const soonDay = addDays(today, Math.max(0, Number(module.settings.reminderDays ?? 1)));
  let sent = 0;

  const pick = async (marker, condition, params) => {
    const { rows } = await query(`UPDATE proc_requests SET ${marker} = NOW() WHERE ${marker} IS NULL AND ${condition} RETURNING *`, params);
    return rows;
  };
  // Overdue first: a request already late does not also get «скоро срок».
  const payOverdue = await pick('pay_overdue_at', `status = ANY($1::text[]) AND pay_by < $2::date`, [PAYABLE, today]);
  await query(`UPDATE proc_requests SET pay_soon_at = COALESCE(pay_soon_at, NOW()) WHERE id = ANY($1::int[])`, [payOverdue.map((row) => row.id)]);
  const paySoon = await pick('pay_soon_at', `status = ANY($1::text[]) AND pay_by >= $2::date AND pay_by <= $3::date`, [PAYABLE, today, soonDay]);
  const deliverOverdue = await pick('deliver_overdue_at', `status = ANY($1::text[]) AND delivery_state <> 'full' AND deliver_by < $2::date`, [DELIVERABLE, today]);
  await query(`UPDATE proc_requests SET deliver_soon_at = COALESCE(deliver_soon_at, NOW()) WHERE id = ANY($1::int[])`, [deliverOverdue.map((row) => row.id)]);
  const deliverSoon = await pick('deliver_soon_at', `status = ANY($1::text[]) AND delivery_state <> 'full' AND deliver_by >= $2::date AND deliver_by <= $3::date`, [DELIVERABLE, today, soonDay]);

  const accounting = paySoon.length || payOverdue.length ? await payers() : [];
  const send = async (rows, message, people, overdue) => {
    for (const row of rows) {
      try {
        const userIds = [...new Set(people(row).filter(Boolean))];
        await notify({ userIds, kind: overdue ? 'procurement.overdue' : 'procurement.due_soon', module: 'procurement', link: requestUrl(row.id), render: procurementMessage(message, { doc: docOf(row) }) });
        if (overdue) webhook('procurement.overdue', row, null, { deadline: message === 'payOverdue' ? 'pay' : 'deliver' });
        sent += 1;
      } catch (err) {
        console.warn(`[procurement] reminder for request ${row.id} failed:`, err.message);
      }
    }
  };
  await send(paySoon, 'paySoon', (row) => [...accounting, row.responsible_id], false);
  await send(payOverdue, 'payOverdue', (row) => [...accounting, row.responsible_id, row.author_id], true);
  await send(deliverSoon, 'deliverSoon', (row) => [row.responsible_id, row.author_id], false);
  await send(deliverOverdue, 'deliverOverdue', (row) => [row.responsible_id, row.author_id], true);
  return { sent, paySoon: paySoon.length, payOverdue: payOverdue.length, deliverSoon: deliverSoon.length, deliverOverdue: deliverOverdue.length };
}
