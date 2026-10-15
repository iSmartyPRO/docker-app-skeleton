import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { RUNNING, dueReminders } from './logic.js';
import { applyDates, contractShape, emitContract, loadRow, notifyPeople, portalToday } from './service.js';

/*
 * contracts:daily (every 10 minutes, under the scheduler's advisory lock;
 * "today" is the portal's day):
 *   1. dates — a signed contract whose start has come is «Действует»; one
 *      ending within `expiringDays` is «Истекает»; one past its end is
 *      «Завершён», or gets its next term when it auto-prolongs;
 *   2. reminders — N days before the end (reminderDays, 30 and 7 by default)
 *      and before the refusal deadline of an auto-prolonged contract, to the
 *      business owner and the lawyer (the creator when neither is set).
 *      Each (contract, kind, days, target day) is stored in ctr_reminders by
 *      the same INSERT that decides to send it, so it goes out once; a new
 *      term or a moved date makes a new target and a new reminder.
 */

/** `today` and `settings` may be given (tests); without settings the job runs only while the module is on. */
export async function runDaily({ today: forcedToday, settings: forcedSettings, ids: onlyIds } = {}) {
  let settings = forcedSettings;
  if (!settings) {
    const module = parseSettings(await getSettings()).modules.contracts;
    if (!module?.enabled) return { changed: 0, reminders: 0 };
    settings = module.settings;
  }
  const today = forcedToday || (await portalToday());
  let changed = 0;
  let reminders = 0;

  const { rows: ids } = await query(
    `SELECT id FROM ctr_contracts WHERE status = ANY($1::text[]) AND ($2::int[] IS NULL OR id = ANY($2::int[])) ORDER BY id`,
    [RUNNING, onlyIds || null]
  );
  for (const { id } of ids) {
    try {
      const row = await loadRow(id);
      if (!row || !RUNNING.includes(row.status)) continue;
      const after = await applyDates(row, today, settings);
      if (after !== row) changed += 1;
      reminders += await sendReminders(after, today, settings);
    } catch (err) {
      console.warn(`[contracts] daily job for contract ${id} failed:`, err.message);
    }
  }
  return { changed, reminders };
}

async function sendReminders(row, today, settings) {
  const contract = contractShape(row);
  let sent = 0;
  for (const due of dueReminders(contract, today, settings.reminderDays || [30, 7])) {
    const { rows } = await query(
      `INSERT INTO ctr_reminders (contract_id, kind, days, target) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING contract_id`,
      [row.id, due.kind, due.days, due.target]
    );
    if (!rows.length) continue;
    const people = [row.owner_id, row.lawyer_id].filter(Boolean);
    await notifyPeople(people.length ? people : [row.created_by], 'contracts.reminder', due.kind === 'end' ? 'reminderEnd' : 'reminderNotice', { left: due.left, target: due.target }, row, null);
    emitContract('reminder', row, null, { reminder: { kind: due.kind, days: due.days, target: due.target, left: due.left } });
    sent += 1;
  }
  return sent;
}

/**
 * contracts:payments (every 15 minutes, the portal's day): reminders before a
 * payment's day and once when it is overdue (payments.js sendPaymentReminders).
 */
export async function runPaymentReminders({ today: forcedToday, settings: forcedSettings } = {}) {
  let settings = forcedSettings;
  if (!settings) {
    const module = parseSettings(await getSettings()).modules.contracts;
    if (!module?.enabled) return { reminders: 0 };
    settings = module.settings;
  }
  const today = forcedToday || (await portalToday());
  const { sendPaymentReminders } = await import('./payments.js');
  return { reminders: await sendPaymentReminders(today, settings) };
}
