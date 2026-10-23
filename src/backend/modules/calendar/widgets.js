import { isoDay, startOfDay } from '../../services/datetime.js';
import { DAY, bounds, int } from '../../platform/widgets.js';
import { contextFromRequest, httpError } from '../shared/acl.js';
import { listCalendars, listEvents } from './service.js';

/*
 * Dashboard widgets of Calendar (registered in index.js register()): the
 * agenda (Tasks adds its tasks to it as a widget section), the mini calendar,
 * the event counters of «Welcome» and the calendar list for widget settings.
 */

const calCtx = (req) => contextFromRequest(req, 'calendar.admin');

const eventShape = (event) => ({
  key: event.key,
  id: event.id,
  title: event.title,
  start: event.start,
  end: event.end,
  allDay: event.allDay,
  color: event.color,
  calendarName: event.calendarName,
  location: event.location,
  meetingUrl: event.meetingUrl,
  occurrence: event.occurrence,
  myStatus: event.myStatus,
});

async function agenda(req, settings, tz) {
  const days = int(settings.days, 1, 31, 7);
  const { today } = await bounds(tz);
  const to = startOfDay(new Date(), tz, days);
  const calendars = Array.isArray(settings.calendars) && settings.calendars.length ? settings.calendars.join(',') : undefined;
  const events = await listEvents(calCtx(req), { from: new Date(today).toISOString(), to: to.toISOString(), calendars });
  // Tasks adds the person's tasks of these days (widget section, while Tasks is on).
  const tasks = [];
  return {
    from: today,
    days,
    events: events.filter((event) => !event.end || new Date(event.end) > new Date() || event.allDay).slice(0, 200).map(eventShape),
    tasks,
  };
}

async function miniCalendar(req, settings, tz, input) {
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to - from > 45 * DAY) throw httpError(400, 'Invalid date range', 'INVALID_RANGE');
  const calendars = Array.isArray(settings.calendars) && settings.calendars.length ? settings.calendars.join(',') : undefined;
  const events = await listEvents(calCtx(req), { from: from.toISOString(), to: to.toISOString(), calendars });
  return { events: events.slice(0, 600).map(eventShape) };
}

/** «Welcome»: today's events and the next one. */
async function welcomeEvents(req, settings, tz) {
  const { today, tomorrow } = await bounds(tz);
  const now = new Date();
  const events = await listEvents(calCtx(req), { from: new Date(today).toISOString(), to: startOfDay(now, tz, 7).toISOString() });
  // All-day events are calendar days: today's is the person's today.
  const todayKey = isoDay(now, tz);
  const todays = events.filter((event) => (event.allDay ? event.start <= todayKey : new Date(event.start) < new Date(tomorrow)));
  const next = events.find((event) => !event.allDay && new Date(event.start) > now);
  return { events: { today: todays.length, next: next ? eventShape(next) : null } };
}

export function registerCalendarWidgets(ctx) {
  const options = async (req) => ({ calendars: (await listCalendars(calCtx(req), req.locale)).map((calendar) => ({ id: calendar.id, name: calendar.name, color: calendar.color })) });
  ctx.registerWidget({ type: 'agenda', data: agenda, options });
  ctx.registerWidget({ type: 'miniCalendar', data: miniCalendar });
  ctx.registerWidgetSection('welcome', { data: welcomeEvents });
}
