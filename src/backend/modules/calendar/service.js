import { query, withTransaction } from '../../config/database.js';
import { notify, subscribersOf } from '../../services/notifications.js';
import {
  createGoogleEvent,
  deleteGoogleEvent,
  googleStatus,
  listGoogleCalendars,
  listGoogleEvents,
  publicBase,
  updateGoogleEvent,
} from '../../services/google.js';
import { emitEvent, requestAs } from '../../api/events.js';
import {
  HEX,
  LEVEL,
  LEVEL_NAMES,
  avatarOf,
  clean,
  contextFromRequest,
  httpError,
  levelMap,
  levelOn,
  readAcl,
  requireLevel,
  withinLimits,
  writeAcl,
} from '../shared/acl.js';
import { normalizeRule, occurrences, seriesNotOverBefore } from './recurrence.js';
import { eventMessage } from './messages.js';
import { regionalOfUser } from '../../services/regional.js';
import { isValidTimeZone } from '../../services/datetime.js';
import { tr } from '../../services/i18n/index.js';

const ACL = 'cal_acl';
const RSVP = ['accepted', 'declined', 'tentative', 'needs'];
const DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE = 120 * DAY;


function calendarShape(row, level, ctx) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    color: row.color,
    personal: row.is_personal,
    mine: row.is_personal && row.owner_id === ctx.userId,
    owner: row.owner_name || null,
    level: LEVEL_NAMES[level],
  };
}

// ── Calendars ───────────────────────────────────────────────────────────────

export async function ensurePersonalCalendar(ctx, locale) {
  const existing = await query(`SELECT id FROM cal_calendars WHERE owner_id = $1 AND is_personal`, [ctx.userId]);
  if (existing.rows[0]) return existing.rows[0].id;
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO cal_calendars (name, color, owner_id, is_personal, created_by)
       VALUES ($1, '#3B82F6', $2, TRUE, $2)
       ON CONFLICT (owner_id) WHERE is_personal DO NOTHING RETURNING id`,
      [tr(locale, 'calendar.personal'), ctx.userId]
    );
    const id = rows[0]?.id;
    if (!id) {
      const again = await client.query(`SELECT id FROM cal_calendars WHERE owner_id = $1 AND is_personal`, [ctx.userId]);
      return again.rows[0].id;
    }
    await client.query(`INSERT INTO cal_acl (resource_id, subject_type, subject_id, level) VALUES ($1, 'user', $2, $3)`, [
      id,
      ctx.userId,
      LEVEL.manage,
    ]);
    return id;
  });
}

/** Personal calendars of other people are hidden from admins unless shared: privacy over power. */
async function calendarLevels(ctx) {
  const levels = await levelMap(ACL, { ...ctx, isAdmin: false });
  const { rows } = await query(
    `SELECT c.*, COALESCE(u.display_name, u.username) AS owner_name FROM cal_calendars c
     LEFT JOIN users u ON u.id = c.owner_id ORDER BY c.is_personal DESC, LOWER(c.name)`
  );
  const of = (row) => {
    // An API token limited to some calendars sees nothing else, administrator or not.
    if (!withinLimits(ctx, ACL, row.id)) return LEVEL.none;
    const own = levels.of(row.id);
    if (ctx.isAdmin && !row.is_personal) return LEVEL.manage;
    return own;
  };
  return { rows, of };
}

export async function listCalendars(ctx, locale) {
  await ensurePersonalCalendar(ctx, locale);
  const { rows, of } = await calendarLevels(ctx);
  return rows
    .filter((row) => of(row) >= LEVEL.view)
    .map((row) => calendarShape(row, of(row), ctx))
    .sort((a, b) => Number(b.mine) - Number(a.mine));
}

async function loadCalendar(id) {
  if (!Number.isInteger(Number(id)) || Number(id) < 1) throw httpError(404, 'Calendar not found', 'NOT_FOUND');
  const { rows } = await query(`SELECT * FROM cal_calendars WHERE id = $1`, [Number(id)]);
  if (!rows[0]) throw httpError(404, 'Calendar not found', 'NOT_FOUND');
  return rows[0];
}

async function calendarLevel(ctx, calendar) {
  if (!withinLimits(ctx, ACL, calendar.id)) return LEVEL.none;
  if (ctx.isAdmin && !calendar.is_personal) return LEVEL.manage;
  return levelOn(ACL, calendar.id, { ...ctx, isAdmin: false });
}

export async function createCalendar(ctx, input, { allowed }) {
  if (!allowed) throw httpError(403, 'Only administrators can create calendars', 'FORBIDDEN');
  const name = clean(input.name, 120);
  if (!name) throw httpError(400, 'Calendar name is required', 'NAME_REQUIRED');
  const visibility = ['private', 'team', 'teamEdit'].includes(input.visibility) ? input.visibility : 'team';
  const row = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO cal_calendars (name, description, color, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, clean(input.description, 1000) || null, HEX.test(input.color || '') ? input.color.toUpperCase() : '#10B981', ctx.userId]
    );
    await client.query(`INSERT INTO cal_acl (resource_id, subject_type, subject_id, level) VALUES ($1, 'user', $2, $3)`, [
      rows[0].id,
      ctx.userId,
      LEVEL.manage,
    ]);
    if (visibility !== 'private') {
      await client.query(`INSERT INTO cal_acl (resource_id, subject_type, subject_id, level) VALUES ($1, 'everyone', NULL, $2)`, [
        rows[0].id,
        visibility === 'teamEdit' ? LEVEL.edit : LEVEL.view,
      ]);
    }
    return rows[0];
  });
  return calendarShape(row, LEVEL.manage, ctx);
}

export async function updateCalendar(ctx, id, input) {
  const calendar = await loadCalendar(id);
  requireLevel(await calendarLevel(ctx, calendar), LEVEL.manage);
  const name = input.name !== undefined ? clean(input.name, 120) : calendar.name;
  if (!name) throw httpError(400, 'Calendar name is required', 'NAME_REQUIRED');
  const { rows } = await query(
    `UPDATE cal_calendars SET name = $2, description = $3, color = $4, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [
      calendar.id,
      name,
      input.description !== undefined ? clean(input.description, 1000) || null : calendar.description,
      HEX.test(input.color || '') ? input.color.toUpperCase() : calendar.color,
    ]
  );
  return calendarShape(rows[0], LEVEL.manage, ctx);
}

export async function deleteCalendar(ctx, id) {
  const calendar = await loadCalendar(id);
  requireLevel(await calendarLevel(ctx, calendar), LEVEL.manage);
  if (calendar.is_personal) throw httpError(400, 'A personal calendar cannot be deleted', 'PERSONAL');
  await query(`DELETE FROM cal_calendars WHERE id = $1`, [calendar.id]);
}

export async function getCalendarAccess(ctx, id) {
  const calendar = await loadCalendar(id);
  requireLevel(await calendarLevel(ctx, calendar), LEVEL.manage);
  return readAcl(ACL, calendar.id);
}

export async function setCalendarAccess(ctx, id, entries) {
  const calendar = await loadCalendar(id);
  requireLevel(await calendarLevel(ctx, calendar), LEVEL.manage);
  await withTransaction((client) => writeAcl(client, ACL, calendar.id, entries, { ...ctx, isAdmin: false }));
  return readAcl(ACL, calendar.id);
}

// ── Events: reading ─────────────────────────────────────────────────────────

function parseRange(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw httpError(400, 'Invalid date range', 'INVALID_RANGE');
  }
  if (end - start > MAX_RANGE) throw httpError(400, 'Date range is too long', 'INVALID_RANGE');
  return { start, end };
}

const dateOnly = (date) => new Date(date).toISOString().slice(0, 10);

async function attendeesOf(eventIds) {
  if (!eventIds.length) return new Map();
  const { rows } = await query(
    `SELECT a.event_id, a.user_id, a.status, u.username, COALESCE(u.display_name, u.username) AS name, u.avatar_path
     FROM cal_attendees a JOIN users u ON u.id = a.user_id
     WHERE a.event_id = ANY($1) ORDER BY LOWER(COALESCE(u.display_name, u.username))`,
    [eventIds]
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.event_id)) map.set(row.event_id, []);
    map.get(row.event_id).push({ id: row.user_id, username: row.username, name: row.name, avatarUrl: avatarOf(row.avatar_path), status: row.status });
  }
  return map;
}

function occurrenceShape(row, start, { attendees, level, ctx }) {
  const duration = new Date(row.ends_at) - new Date(row.starts_at);
  const end = new Date(start.getTime() + duration);
  const mine = attendees.find((person) => person.id === ctx.userId);
  return {
    key: row.rrule ? `${row.id}@${start.toISOString()}` : String(row.id),
    id: row.id,
    calendarId: row.calendar_id,
    calendarName: row.calendar_name,
    title: row.title,
    description: row.description || '',
    location: row.location || '',
    meetingUrl: row.meeting_url || '',
    start: row.all_day ? dateOnly(start) : start.toISOString(),
    end: row.all_day ? dateOnly(end) : end.toISOString(),
    occurrence: start.toISOString(),
    allDay: row.all_day,
    timezone: row.timezone,
    rrule: row.rrule,
    recurring: Boolean(row.rrule),
    seriesId: row.series_id,
    color: row.color || row.calendar_color,
    reminders: row.reminders || [],
    attendees,
    myStatus: mine?.status || null,
    organizer: row.created_by ? { id: row.created_by, name: row.organizer_name } : null,
    canEdit: level >= LEVEL.edit,
    invited: level < LEVEL.view,
  };
}

const EVENT_SELECT = `
  SELECT e.*, c.color AS calendar_color, c.name AS calendar_name,
         COALESCE(o.display_name, o.username) AS organizer_name
  FROM cal_events e
  JOIN cal_calendars c ON c.id = e.calendar_id
  LEFT JOIN users o ON o.id = e.created_by
`;

/**
 * Occurrences in [from, to) for the selected calendars (default: all visible),
 * plus events the user is invited to (`invited: true` when the calendar itself
 * is not visible to them).
 */
export async function listEvents(ctx, { from, to, calendars, invitations = true }) {
  const range = parseRange(from, to);
  const { rows: calendarRows, of } = await calendarLevels(ctx);
  const visible = calendarRows.filter((row) => of(row) >= LEVEL.view).map((row) => row.id);
  const wanted = calendars
    ? String(calendars).split(',').map(Number).filter((id) => visible.includes(id))
    : visible;
  const levelById = new Map(calendarRows.map((row) => [row.id, of(row)]));

  // An API token limited to some calendars: invitations only from those calendars too.
  const limits = ctx.limits?.[ACL] ? [...ctx.limits[ACL]] : null;
  const params = [wanted, range.start, range.end, ctx.userId, limits];
  const { rows } = await query(
    `${EVENT_SELECT}
     WHERE e.starts_at < $3 AND ((e.rrule IS NOT NULL AND ${seriesNotOverBefore('$2')}) OR e.ends_at > $2)
       AND ($5::int[] IS NULL OR e.calendar_id = ANY($5))
       AND (e.calendar_id = ANY($1)
            ${invitations ? 'OR EXISTS (SELECT 1 FROM cal_attendees a WHERE a.event_id = e.id AND a.user_id = $4)' : ''})`,
    params
  );
  const attendees = await attendeesOf(rows.map((row) => row.id));
  const items = [];
  for (const row of rows) {
    const level = levelById.get(row.calendar_id) || 0;
    for (const start of occurrences(row, range.start, range.end)) {
      items.push(occurrenceShape(row, start, { attendees: attendees.get(row.id) || [], level, ctx }));
    }
  }
  return items.sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

async function loadEvent(id) {
  if (!Number.isInteger(Number(id)) || Number(id) < 1) throw httpError(404, 'Event not found', 'NOT_FOUND');
  const { rows } = await query(`${EVENT_SELECT} WHERE e.id = $1`, [Number(id)]);
  if (!rows[0]) throw httpError(404, 'Event not found', 'NOT_FOUND');
  return rows[0];
}

async function eventLevel(ctx, row) {
  if (!withinLimits(ctx, ACL, row.calendar_id)) return 0;
  const level = await calendarLevel(ctx, await loadCalendar(row.calendar_id));
  if (level >= LEVEL.view) return level;
  const invited = await query(`SELECT 1 FROM cal_attendees WHERE event_id = $1 AND user_id = $2`, [row.id, ctx.userId]);
  // Invited people see the event without access to its calendar (0.5 = "through the invitation").
  return invited.rows.length ? 0.5 : 0;
}

export async function getEvent(ctx, id, occurrence) {
  const row = await loadEvent(id);
  const level = await eventLevel(ctx, row);
  if (!level) throw httpError(404, 'Event not found', 'NOT_FOUND');
  const attendees = (await attendeesOf([row.id])).get(row.id) || [];
  const start = occurrence && row.rrule ? new Date(occurrence) : new Date(row.starts_at);
  return occurrenceShape(row, Number.isNaN(start.getTime()) ? new Date(row.starts_at) : start, {
    attendees,
    level: level === 0.5 ? 0 : level,
    ctx,
  });
}

// ── Events: writing ─────────────────────────────────────────────────────────

/** Validates timing and the rest of an event body. `base` fills fields that were not sent. */
function eventFields(input, base = {}) {
  const allDay = input.allDay !== undefined ? Boolean(input.allDay) : Boolean(base.all_day);
  let startsAt;
  let endsAt;
  if (input.start !== undefined || input.end !== undefined || input.allDay !== undefined) {
    // Stored values come back from pg as Date objects.
    const iso = (value) => (value instanceof Date ? value.toISOString() : value);
    const startRaw = iso(input.start ?? base.starts_at);
    const endRaw = iso(input.end ?? base.ends_at);
    if (allDay) {
      const startDay = String(startRaw).slice(0, 10);
      const endDay = String(endRaw || startRaw).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay) || !/^\d{4}-\d{2}-\d{2}$/.test(endDay)) throw httpError(400, 'Invalid date', 'INVALID_DATE');
      startsAt = new Date(`${startDay}T00:00:00Z`);
      endsAt = new Date(`${endDay}T00:00:00Z`);
      if (endsAt <= startsAt) endsAt = new Date(startsAt.getTime() + DAY);
    } else {
      startsAt = new Date(startRaw);
      endsAt = new Date(endRaw);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw httpError(400, 'Invalid date', 'INVALID_DATE');
      if (endsAt <= startsAt) throw httpError(400, 'The event must end after it starts', 'INVALID_RANGE');
    }
    if (endsAt - startsAt > 62 * DAY) throw httpError(400, 'An event can last at most 62 days', 'INVALID_RANGE');
    // Sane years keep recurrence expansion cheap.
    const year = startsAt.getUTCFullYear();
    const thisYear = new Date().getUTCFullYear();
    if (year < 1970 || year > thisYear + 10) throw httpError(400, 'The date is out of range', 'INVALID_DATE');
  } else {
    startsAt = new Date(base.starts_at);
    endsAt = new Date(base.ends_at);
  }

  const title = input.title !== undefined ? clean(input.title, 300) : base.title;
  if (!title) throw httpError(400, 'Event title is required', 'TITLE_REQUIRED');
  const meetingUrl = input.meetingUrl !== undefined ? clean(input.meetingUrl, 500) : base.meeting_url || '';
  if (meetingUrl && !/^https?:\/\//i.test(meetingUrl)) throw httpError(400, 'The meeting link must start with http:// or https://', 'INVALID_URL');
  const timezone = isValidTimeZone(input.timezone) ? input.timezone : base.timezone || 'UTC';
  const reminders =
    input.reminders !== undefined
      ? [...new Set((Array.isArray(input.reminders) ? input.reminders : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 10080))].slice(0, 5)
      : base.reminders || [];

  return {
    title,
    description: input.description !== undefined ? clean(input.description, 10000) || null : base.description || null,
    location: input.location !== undefined ? clean(input.location, 300) || null : base.location || null,
    meeting_url: meetingUrl || null,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: allDay,
    timezone,
    rrule: input.rrule !== undefined ? normalizeRule(input.rrule) : base.rrule || null,
    color: input.color !== undefined ? (HEX.test(input.color || '') ? input.color.toUpperCase() : null) : base.color || null,
    reminders,
  };
}

async function cleanAttendees(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger))].slice(0, 200);
  if (!list.length) return [];
  const { rows } = await query(`SELECT id FROM users WHERE id = ANY($1) AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`, [list]);
  return rows.map((row) => row.id);
}

async function actorName(ctx) {
  const { rows } = await query(`SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1`, [ctx.userId]);
  return rows[0]?.name || '';
}

const COLUMNS = ['title', 'description', 'location', 'meeting_url', 'starts_at', 'ends_at', 'all_day', 'timezone', 'rrule', 'color', 'reminders'];

async function insertEvent(client, calendarId, fields, extra = {}) {
  const columns = ['calendar_id', ...COLUMNS, 'created_by', 'series_id', 'original_start'];
  const values = [calendarId, ...COLUMNS.map((column) => fields[column]), extra.createdBy, extra.seriesId || null, extra.originalStart || null];
  const { rows } = await client.query(
    `INSERT INTO cal_events (${columns.join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING id`,
    values
  );
  return rows[0].id;
}

async function setAttendees(client, eventId, userIds, organizerId) {
  const existing = await client.query(`SELECT user_id, status FROM cal_attendees WHERE event_id = $1`, [eventId]);
  const before = new Map(existing.rows.map((row) => [row.user_id, row.status]));
  const wanted = new Set(userIds);
  // The organizer is part of the meeting as soon as anyone else is invited.
  if (wanted.size && organizerId) wanted.add(organizerId);
  const added = [...wanted].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !wanted.has(id));
  for (const id of added) {
    await client.query(`INSERT INTO cal_attendees (event_id, user_id, status) VALUES ($1, $2, $3)`, [
      eventId,
      id,
      id === organizerId ? 'accepted' : 'needs',
    ]);
  }
  if (removed.length) await client.query(`DELETE FROM cal_attendees WHERE event_id = $1 AND user_id = ANY($2)`, [eventId, removed]);
  return { added, removed, kept: [...wanted].filter((id) => before.has(id)) };
}

function messageParams(fields, actor, start = fields.starts_at) {
  return { title: fields.title, location: fields.location, start, allDay: fields.all_day, timezone: fields.timezone, actor };
}

const eventLink = (id) => `/app/calendar/e/${id}`;

export async function createEvent(ctx, input) {
  const calendar = await loadCalendar(input.calendarId);
  requireLevel(await calendarLevel(ctx, calendar), LEVEL.edit);
  // No zone sent: the event lives in its creator's zone (recurrence, all-day reminders).
  const fields = eventFields(input, isValidTimeZone(input.timezone) ? {} : { timezone: (await regionalOfUser(ctx.userId)).timeZone });
  const attendeeIds = await cleanAttendees(input.attendees);
  const { id, added } = await withTransaction(async (client) => {
    const eventId = await insertEvent(client, calendar.id, fields, { createdBy: ctx.userId });
    const changes = await setAttendees(client, eventId, attendeeIds, ctx.userId);
    return { id: eventId, added: changes.added };
  });
  if (added.length) {
    await notify({
      userIds: added,
      kind: 'calendar.invited',
      module: 'calendar',
      link: eventLink(id),
      actorId: ctx.userId,
      render: eventMessage('invited', messageParams(fields, await actorName(ctx))),
    });
  }
  return getEvent(ctx, id);
}

/**
 * scope 'all' edits the series (or a single event); scope 'single' with
 * `occurrence` detaches that occurrence into its own event.
 */
export async function updateEvent(ctx, id, input, { scope = 'all', occurrence } = {}) {
  const row = await loadEvent(id);
  requireLevel(await calendarLevel(ctx, await loadCalendar(row.calendar_id)), LEVEL.edit);
  let targetCalendar = row.calendar_id;
  if (input.calendarId && Number(input.calendarId) !== row.calendar_id) {
    const next = await loadCalendar(input.calendarId);
    requireLevel(await calendarLevel(ctx, next), LEVEL.edit);
    targetCalendar = next.id;
  }

  if (scope === 'single' && row.rrule && occurrence) {
    const occurrenceStart = new Date(occurrence);
    if (Number.isNaN(occurrenceStart.getTime())) throw httpError(400, 'Invalid occurrence', 'INVALID_DATE');
    const duration = new Date(row.ends_at) - new Date(row.starts_at);
    const base = { ...row, starts_at: occurrenceStart, ends_at: new Date(occurrenceStart.getTime() + duration), rrule: null };
    const fields = eventFields({ ...input, rrule: null }, base);
    const attendees = ((await attendeesOf([row.id])).get(row.id) || []).map((person) => person.id);
    const newId = await withTransaction(async (client) => {
      await client.query(`UPDATE cal_events SET exdates = array_append(exdates, $2), updated_at = NOW() WHERE id = $1`, [row.id, occurrenceStart]);
      const eventId = await insertEvent(client, targetCalendar, fields, {
        createdBy: row.created_by,
        seriesId: row.id,
        originalStart: occurrenceStart,
      });
      await setAttendees(client, eventId, input.attendees !== undefined ? await cleanAttendees(input.attendees) : attendees, row.created_by);
      // The detached occurrence keeps everyone's answers to the series (a "declined" stays declined).
      await client.query(
        `UPDATE cal_attendees a SET status = m.status, responded_at = m.responded_at
         FROM cal_attendees m WHERE a.event_id = $1 AND m.event_id = $2 AND m.user_id = a.user_id`,
        [eventId, row.id]
      );
      return eventId;
    });
    // Same messages as an edit of the whole event, about this one occurrence.
    const after = ((await attendeesOf([newId])).get(newId) || []).map((person) => person.id);
    const before = new Set(attendees);
    const now = new Set(after);
    await notifyEventChanges(ctx, {
      eventId: newId,
      previous: { starts_at: base.starts_at, ends_at: base.ends_at, location: row.location, rrule: null },
      fields,
      changes: {
        added: after.filter((userId) => !before.has(userId)),
        removed: attendees.filter((userId) => !now.has(userId)),
        kept: after.filter((userId) => before.has(userId)),
      },
    });
    return getEvent(ctx, newId);
  }

  input = withoutEchoedOccurrence(row, input, occurrence);
  const fields = eventFields(input, row);
  const attendeeIds = input.attendees !== undefined ? await cleanAttendees(input.attendees) : null;
  const changes = await withTransaction(async (client) => {
    const values = COLUMNS.map((column) => fields[column]);
    await client.query(
      `UPDATE cal_events SET ${COLUMNS.map((column, index) => `${column} = $${index + 2}`).join(', ')},
         calendar_id = $${COLUMNS.length + 2}, updated_at = NOW()
       WHERE id = $1`,
      [row.id, ...values, targetCalendar]
    );
    // Exceptions are tied to the old occurrence times: when the series moves
    // or its rule changes they no longer match, so start the series afresh.
    const seriesChanged =
      row.rrule && (fields.rrule !== row.rrule || new Date(row.starts_at).getTime() !== fields.starts_at.getTime());
    if (seriesChanged) {
      await client.query(`UPDATE cal_events SET exdates = '{}' WHERE id = $1`, [row.id]);
      await client.query(`DELETE FROM cal_events WHERE series_id = $1`, [row.id]);
    }
    return attendeeIds ? setAttendees(client, row.id, attendeeIds, row.created_by) : null;
  });

  await notifyEventChanges(ctx, { eventId: row.id, previous: row, fields, changes });
  return getEvent(ctx, row.id);
}

/**
 * Invitations / cancellations for added and removed attendees, and an
 * "updated" message to those who stay when the time, place or rule changed.
 * `changes` null = attendees untouched.
 */
async function notifyEventChanges(ctx, { eventId, previous, fields, changes }) {
  const actor = await actorName(ctx);
  const timingChanged =
    new Date(previous.starts_at).getTime() !== fields.starts_at.getTime() ||
    new Date(previous.ends_at).getTime() !== fields.ends_at.getTime() ||
    (previous.location || null) !== fields.location ||
    (previous.rrule || null) !== fields.rrule;
  const current = changes ? changes.kept : ((await attendeesOf([eventId])).get(eventId) || []).map((person) => person.id);
  if (changes?.added.length) {
    await notify({
      userIds: changes.added,
      kind: 'calendar.invited',
      module: 'calendar',
      link: eventLink(eventId),
      actorId: ctx.userId,
      render: eventMessage('invited', messageParams(fields, actor)),
    });
  }
  if (changes?.removed.length) {
    await notify({
      userIds: changes.removed,
      kind: 'calendar.cancelled',
      module: 'calendar',
      actorId: ctx.userId,
      render: eventMessage('cancelled', messageParams(fields, actor)),
    });
  }
  if (timingChanged && current.length) {
    await notify({
      userIds: current,
      kind: 'calendar.updated',
      module: 'calendar',
      link: eventLink(eventId),
      actorId: ctx.userId,
      render: eventMessage('updated', messageParams(fields, actor)),
    });
  }
}

/**
 * A whole-series edit made from one occurrence that sends back that
 * occurrence's own timing means "time unchanged" (older clients did this):
 * taking it literally would make the occurrence the series' first one and
 * wipe its history. Such echoed timing is dropped.
 */
function withoutEchoedOccurrence(row, input, occurrence) {
  if (!row.rrule || !occurrence || (input.start === undefined && input.end === undefined)) return input;
  const occurrenceStart = new Date(occurrence);
  if (Number.isNaN(occurrenceStart.getTime()) || occurrenceStart.getTime() === new Date(row.starts_at).getTime()) return input;
  if (input.allDay !== undefined && Boolean(input.allDay) !== Boolean(row.all_day)) return input;
  const occurrenceEnd = new Date(occurrenceStart.getTime() + (new Date(row.ends_at) - new Date(row.starts_at)));
  const same = row.all_day
    ? (value, date) => String(value ?? '').slice(0, 10) === dateOnly(date)
    : (value, date) => value !== undefined && value !== null && new Date(value).getTime() === date.getTime();
  if (!same(input.start, occurrenceStart) || (input.end !== undefined && !same(input.end, occurrenceEnd))) return input;
  const { start, end, allDay, ...rest } = input;
  return rest;
}

export async function deleteEvent(ctx, id, { scope = 'all', occurrence } = {}) {
  const row = await loadEvent(id);
  requireLevel(await calendarLevel(ctx, await loadCalendar(row.calendar_id)), LEVEL.edit);
  const attendees = ((await attendeesOf([row.id])).get(row.id) || []).map((person) => person.id);
  const actor = await actorName(ctx);
  if (scope === 'single' && row.rrule && occurrence) {
    const occurrenceStart = new Date(occurrence);
    if (Number.isNaN(occurrenceStart.getTime())) throw httpError(400, 'Invalid occurrence', 'INVALID_DATE');
    await query(`UPDATE cal_events SET exdates = array_append(exdates, $2), updated_at = NOW() WHERE id = $1`, [row.id, occurrenceStart]);
    await notify({
      userIds: attendees,
      kind: 'calendar.cancelled',
      module: 'calendar',
      actorId: ctx.userId,
      render: eventMessage('cancelled', messageParams(row, actor, occurrenceStart)),
    });
    return;
  }
  await query(`DELETE FROM cal_events WHERE id = $1`, [row.id]);
  await notify({
    userIds: attendees,
    kind: 'calendar.cancelled',
    module: 'calendar',
    actorId: ctx.userId,
    render: eventMessage('cancelled', messageParams(row, actor)),
  });
}

export async function respond(ctx, id, status) {
  if (!RSVP.includes(status)) throw httpError(400, 'Invalid response', 'INVALID_STATUS');
  const row = await loadEvent(id);
  if (!withinLimits(ctx, ACL, row.calendar_id)) throw httpError(404, 'Event not found', 'NOT_FOUND');
  const { rowCount } = await query(
    `UPDATE cal_attendees SET status = $3, responded_at = NOW() WHERE event_id = $1 AND user_id = $2`,
    [row.id, ctx.userId, status]
  );
  if (!rowCount) throw httpError(404, 'You are not invited to this event', 'NOT_FOUND');
  if (row.created_by && status !== 'needs') {
    await notify({
      userIds: [row.created_by],
      kind: 'calendar.rsvp',
      module: 'calendar',
      link: eventLink(row.id),
      actorId: ctx.userId,
      external: false,
      render: eventMessage('rsvp', { ...messageParams(row, await actorName(ctx)), status }),
    });
  }
  return getEvent(ctx, row.id);
}

// ── Google Calendar (live, through the user's own Google connection) ────────

const googleCalendarCache = new Map();

async function googleCalendars(userId, { fresh = false } = {}) {
  const cached = googleCalendarCache.get(userId);
  if (!fresh && cached && cached.until > Date.now()) return cached.list;
  const list = await listGoogleCalendars(userId);
  googleCalendarCache.set(userId, { list, until: Date.now() + 5 * 60 * 1000 });
  return list;
}

function fromGoogle(calendar, event) {
  const allDay = Boolean(event.start?.date);
  return {
    key: `g:${calendar.id}:${event.id}`,
    id: event.id,
    source: 'google',
    calendarId: `g:${calendar.id}`,
    googleCalendarId: calendar.id,
    calendarName: calendar.name,
    title: event.summary || '',
    description: event.description || '',
    location: event.location || '',
    meetingUrl: event.hangoutLink || '',
    htmlLink: event.htmlLink || '',
    start: allDay ? event.start.date : event.start?.dateTime,
    end: allDay ? event.end?.date : event.end?.dateTime,
    allDay,
    recurring: Boolean(event.recurringEventId),
    color: calendar.color,
    attendees: (event.attendees || []).slice(0, 50).map((person) => ({ name: person.displayName || person.email, email: person.email, status: person.responseStatus })),
    canEdit: calendar.writable && !event.recurringEventId,
  };
}

function toGoogle(input, fallbackZone = 'UTC') {
  const body = {};
  if (input.title !== undefined) body.summary = clean(input.title, 300);
  if (input.description !== undefined) body.description = clean(input.description, 10000);
  if (input.location !== undefined) body.location = clean(input.location, 300);
  if (input.start !== undefined) {
    const tz = isValidTimeZone(input.timezone) ? input.timezone : fallbackZone;
    if (input.allDay) {
      const start = String(input.start).slice(0, 10);
      let end = String(input.end || input.start).slice(0, 10);
      if (end <= start) end = dateOnly(new Date(new Date(`${start}T00:00:00Z`).getTime() + DAY));
      body.start = { date: start };
      body.end = { date: end };
    } else {
      const start = new Date(input.start);
      const end = new Date(input.end || start.getTime() + 60 * 60 * 1000);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw httpError(400, 'Invalid date', 'INVALID_DATE');
      body.start = { dateTime: start.toISOString(), timeZone: tz };
      body.end = { dateTime: end.toISOString(), timeZone: tz };
    }
  }
  if (input.rrule !== undefined) {
    const rule = normalizeRule(input.rrule);
    body.recurrence = rule ? [`RRULE:${rule}`] : [];
  }
  return body;
}

export async function listGoogleItems(ctx, { from, to }) {
  const status = await googleStatus(ctx.userId);
  if (!status.calendar) return { items: [], calendars: [], connected: status.connected, calendarAccess: false };
  const range = parseRange(from, to);
  const calendars = await googleCalendars(ctx.userId);
  const selected = status.calendars.length ? status.calendars : calendars.filter((item) => item.primary).map((item) => item.id);
  const chosen = calendars.filter((item) => selected.includes(item.id));
  const results = await Promise.allSettled(
    chosen.map(async (calendar) =>
      (await listGoogleEvents(ctx.userId, calendar.id, { timeMin: range.start.toISOString(), timeMax: range.end.toISOString() })).map((event) =>
        fromGoogle(calendar, event)
      )
    )
  );
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length === results.length && failed.length) throw failed[0].reason;
  return {
    items: results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
    calendars: chosen,
    connected: true,
    calendarAccess: true,
  };
}

async function writableGoogleCalendar(userId, calendarId) {
  const calendar = (await googleCalendars(userId)).find((item) => item.id === calendarId);
  if (!calendar) throw httpError(404, 'Google calendar not found', 'NOT_FOUND');
  if (!calendar.writable) throw httpError(403, 'This Google calendar is read-only', 'FORBIDDEN');
  return calendar;
}

export async function createGoogleItem(ctx, calendarId, input) {
  const calendar = await writableGoogleCalendar(ctx.userId, calendarId);
  if (!clean(input.title, 300)) throw httpError(400, 'Event title is required', 'TITLE_REQUIRED');
  return fromGoogle(calendar, await createGoogleEvent(ctx.userId, calendar.id, toGoogle(input, (await regionalOfUser(ctx.userId)).timeZone)));
}

export async function updateGoogleItem(ctx, calendarId, eventId, input) {
  const calendar = await writableGoogleCalendar(ctx.userId, calendarId);
  return fromGoogle(calendar, await updateGoogleEvent(ctx.userId, calendar.id, eventId, toGoogle(input, (await regionalOfUser(ctx.userId)).timeZone)));
}

export async function deleteGoogleItem(ctx, calendarId, eventId) {
  const calendar = await writableGoogleCalendar(ctx.userId, calendarId);
  await deleteGoogleEvent(ctx.userId, calendar.id, eventId);
}

export function forgetGoogleCalendars(userId) {
  googleCalendarCache.delete(userId);
}

/**
 * A webhook event about an event (see api/events.js): delivered to webhooks
 * whose person sees the calendar or is invited.
 */
export async function eventWebhook(type, event, actorId) {
  if (!event) return;
  try {
    const calendar = await loadCalendar(event.calendarId).catch(() => null);
    if (!calendar) return;
    const invited = (event.attendees || []).map((person) => person.id);
    const { canEdit, invited: _invited, myStatus, ...data } = event;
    await emitEvent(type, {
      data: { event: { ...data, url: `${publicBase()}/app/calendar?event=${event.id}` }, actorId: actorId || null },
      visible: async (req) => {
        const ctx = contextFromRequest(req, 'calendar.admin');
        if (!withinLimits(ctx, ACL, calendar.id)) return false;
        return (await calendarLevel(ctx, calendar)) >= LEVEL.view || invited.includes(ctx.userId);
      },
    });
  } catch (err) {
    console.warn(`[calendar] webhook ${type} failed:`, err.message);
  }
}

/** People following a calendar (who still see it) hear about its events. */
export async function notifyCalendarFollowers(kind, event, actorId) {
  if (!event) return;
  try {
    const calendar = await loadCalendar(event.calendarId).catch(() => null);
    if (!calendar) return;
    const attendees = (event.attendees || []).map((person) => person.id);
    const ids = (await subscribersOf('calendar.calendar', calendar.id)).filter((id) => id !== actorId && !attendees.includes(id));
    const allowed = [];
    for (const id of ids) {
      const req = await requestAs(id);
      if (req && (await calendarLevel(contextFromRequest(req, 'calendar.admin'), calendar)) >= LEVEL.view) allowed.push(id);
    }
    if (!allowed.length) return;
    const actor = actorId ? await actorName({ userId: actorId }) : '';
    await notify({
      userIds: allowed,
      kind: 'calendar.subscribed',
      module: 'calendar',
      link: kind === 'followDeleted' ? '/app/calendar' : eventLink(event.id),
      actorId,
      render: eventMessage(kind, { title: event.title, location: event.location, start: event.start, allDay: event.allDay, timezone: event.timezone, actor, calendar: calendar.name }),
    });
  } catch (err) {
    console.warn('[calendar] followers:', err.message);
  }
}

// ── Personal view settings ─────────────────────────────────────────────────

const VIEWS = ['month', 'week', 'workweek', 'day', 'agenda'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Calendar defaults for a person: the module settings, with the week start
 * from the region settings: the person's own choice first; then the portal's
 * region week start when it was changed from Monday; else the module's
 * legacy setting (settings.weekStart).
 */
export function calendarDefaults(settings = {}, portalWeekStart = 1, ownWeekStart = null) {
  const valid = (value) => value !== null && value !== undefined && value !== '' && [0, 1, 6].includes(Number(value));
  let weekStart = valid(settings.weekStart) ? Number(settings.weekStart) : 1;
  if (valid(portalWeekStart) && Number(portalWeekStart) !== 1) weekStart = Number(portalWeekStart);
  if (valid(ownWeekStart)) weekStart = Number(ownWeekStart);
  return { ...settings, weekStart };
}

/** A person's calendar settings over the portal defaults. */
export function cleanPrefs(input = {}, defaults = {}) {
  const pick = (value, list, fallback) => (list.includes(value) ? value : fallback);
  const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
  const int = (value, min, max, fallback) => (Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : fallback);
  return {
    defaultView: pick(input.defaultView, VIEWS, defaults.defaultView || 'week'),
    weekStart: int(input.weekStart, 0, 6, defaults.weekStart ?? 1),
    dayStart: TIME_RE.test(input.dayStart || '') ? input.dayStart : defaults.dayStart || '08:00',
    dayEnd: TIME_RE.test(input.dayEnd || '') ? input.dayEnd : defaults.dayEnd || '20:00',
    slotMinutes: pick(Number(input.slotMinutes), [15, 30, 60], 30),
    showWeekends: bool(input.showWeekends, true),
    showWeekNumbers: bool(input.showWeekNumbers, false),
    showTasks: bool(input.showTasks, true),
    taskScope: pick(input.taskScope, ['doing', 'participant', 'all'], 'participant'),
    showDoneTasks: bool(input.showDoneTasks, true),
    taskDuration: pick(Number(input.taskDuration), [0, 15, 30, 60], 30),
    showDeclined: bool(input.showDeclined, true),
    defaultDuration: pick(Number(input.defaultDuration), [15, 30, 45, 60, 90, 120], 60),
    defaultReminder: int(input.defaultReminder, -1, 10080, defaults.defaultReminder ?? 15),
    defaultCalendarId: Number.isInteger(Number(input.defaultCalendarId)) && Number(input.defaultCalendarId) > 0 ? Number(input.defaultCalendarId) : null,
    compact: bool(input.compact, false),
  };
}

export async function getPrefs(ctx, defaults) {
  const { rows } = await query(`SELECT prefs FROM cal_user_prefs WHERE user_id = $1`, [ctx.userId]);
  return cleanPrefs(rows[0]?.prefs || {}, defaults);
}

export async function savePrefs(ctx, input, defaults) {
  const current = await getPrefs(ctx, defaults);
  const next = cleanPrefs({ ...current, ...input }, defaults);
  await query(
    `INSERT INTO cal_user_prefs (user_id, prefs) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = NOW()`,
    [ctx.userId, JSON.stringify(next)]
  );
  return next;
}

export async function resetPrefs(ctx, defaults) {
  await query(`DELETE FROM cal_user_prefs WHERE user_id = $1`, [ctx.userId]);
  return cleanPrefs({}, defaults);
}

/** May this person see the calendar (personal calendars of others stay private even for admins)? */
export async function canViewCalendar(ctx, id) {
  const calendar = await loadCalendar(id).catch(() => null);
  return Boolean(calendar) && (await calendarLevel(ctx, calendar)) >= LEVEL.view;
}
