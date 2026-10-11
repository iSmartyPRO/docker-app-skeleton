import { query } from '../../config/database.js';
import { registerJob } from '../../services/scheduler.js';
import { ensureAclTable } from '../shared/acl.js';
import { runEventReminders } from './reminders.js';

/*
 * Calendar: personal calendars (one per user, created on first use), shared
 * calendars with access lists, events with optional recurrence (RRULE in the
 * event's time zone), per-occurrence exceptions, attendees with RSVP and
 * reminders.
 */

export async function ensureCalendarSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS cal_calendars (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      color VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      is_personal BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS cal_personal_key ON cal_calendars (owner_id) WHERE is_personal`);
  await ensureAclTable('cal_acl', 'cal_calendars');
  await query(`
    CREATE TABLE IF NOT EXISTS cal_events (
      id SERIAL PRIMARY KEY,
      calendar_id INTEGER NOT NULL REFERENCES cal_calendars(id) ON DELETE CASCADE,
      title VARCHAR(300) NOT NULL,
      description TEXT,
      location VARCHAR(300),
      meeting_url VARCHAR(500),
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      all_day BOOLEAN NOT NULL DEFAULT FALSE,
      timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
      rrule TEXT,
      exdates TIMESTAMPTZ[] NOT NULL DEFAULT '{}',
      series_id INTEGER REFERENCES cal_events(id) ON DELETE CASCADE,
      original_start TIMESTAMPTZ,
      color VARCHAR(7),
      reminders INTEGER[] NOT NULL DEFAULT '{}',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS cal_events_range_idx ON cal_events (calendar_id, starts_at, ends_at)`);
  await query(`CREATE INDEX IF NOT EXISTS cal_events_recurring_idx ON cal_events (calendar_id) WHERE rrule IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS cal_attendees (
      event_id INTEGER NOT NULL REFERENCES cal_events(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(10) NOT NULL DEFAULT 'needs',
      responded_at TIMESTAMPTZ,
      PRIMARY KEY (event_id, user_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS cal_attendees_user_idx ON cal_attendees (user_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS cal_reminders_sent (
      event_id INTEGER NOT NULL REFERENCES cal_events(id) ON DELETE CASCADE,
      occurrence TIMESTAMPTZ NOT NULL,
      minutes INTEGER NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, occurrence, minutes)
    )
  `);

  registerJob({ name: 'calendar:reminders', everyMs: 60 * 1000, run: runEventReminders });
  registerJob({
    name: 'calendar:cleanup',
    everyMs: 12 * 60 * 60 * 1000,
    run: () => query(`DELETE FROM cal_reminders_sent WHERE sent_at < NOW() - INTERVAL '30 days'`),
  });
}
