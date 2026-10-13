import { query } from '../../config/database.js';
import { notify } from '../../services/notifications.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { eventMessage } from './messages.js';
import { fromWall, occurrences, seriesNotOverBefore } from './recurrence.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const GRACE = 10 * MINUTE;
const MAX_LEAD = 7 * 24 * 60 * MINUTE;

/**
 * Every minute: for each occurrence starting within the next 7 days, sends the
 * reminders whose time has come (within a 10-minute grace window, so a restart
 * does not lose them). `cal_reminders_sent` makes each one go out exactly once.
 * Recipients: the organizer, attendees who did not decline, and the owner of
 * a personal calendar.
 */
export async function runEventReminders() {
  const parsed = parseSettings(await getSettings());
  const module = parsed.modules.calendar;
  if (!module?.enabled || module.settings.reminders === false) return;

  const now = new Date();
  const from = new Date(now.getTime() - GRACE);
  const to = new Date(now.getTime() + MAX_LEAD + MINUTE);
  const { rows } = await query(
    `SELECT e.*, c.owner_id, c.is_personal FROM cal_events e JOIN cal_calendars c ON c.id = e.calendar_id
     WHERE cardinality(e.reminders) > 0 AND e.starts_at < $2 AND ((e.rrule IS NOT NULL AND ${seriesNotOverBefore('$1')}) OR e.starts_at > $1)`,
    // A day of slack: all-day events start at local, not UTC, midnight.
    [new Date(from.getTime() - DAY), to]
  );

  for (const event of rows) {
    // One broken event must not stop the others.
    try {
      await remindEvent(event, now, from, to);
    } catch (err) {
      console.warn(`Reminder for event ${event.id} failed:`, err.message);
    }
  }
}

/**
 * One occurrence's times: `start` is the real instant the reminders count from
 * (all-day events start at local midnight of the creator's time zone, not UTC);
 * `shown` is what the message prints — for all-day events the stored UTC-midnight
 * day, which messages format as a date in UTC, so zones east of UTC do not show
 * the previous day.
 */
export function occurrenceTimes(event, occurrence) {
  if (!event.all_day) return { start: occurrence, shown: occurrence };
  return { start: fromWall(occurrence, event.timezone || 'UTC'), shown: occurrence };
}

async function remindEvent(event, now, from, to) {
  for (const day of occurrences(event, new Date(from.getTime() - DAY), to)) {
    const { start, shown } = occurrenceTimes(event, day);
    for (const minutes of event.reminders) {
      const fireAt = start.getTime() - minutes * MINUTE;
      if (fireAt > now.getTime() || fireAt <= now.getTime() - GRACE) continue;
      const claimed = await query(
        `INSERT INTO cal_reminders_sent (event_id, occurrence, minutes) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING 1`,
        [event.id, start, minutes]
      );
      if (!claimed.rows.length) continue;
      const attendees = await query(`SELECT user_id FROM cal_attendees WHERE event_id = $1 AND status <> 'declined'`, [event.id]);
      const recipients = [
        ...attendees.rows.map((row) => row.user_id),
        attendees.rows.length ? null : event.created_by,
        event.is_personal ? event.owner_id : null,
      ];
      await notify({
        userIds: recipients,
        kind: 'calendar.reminder',
        module: 'calendar',
        link: `/app/calendar/e/${event.id}`,
        render: eventMessage('reminder', {
          title: event.title,
          location: event.location,
          start: shown,
          allDay: event.all_day,
          timezone: event.timezone,
          // A reminder sent late (after a restart) states the real time left.
          minutes: Math.max(0, Math.round((start.getTime() - Date.now()) / MINUTE)),
        }),
      });
    }
  }
}
