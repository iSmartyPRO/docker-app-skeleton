import { Router } from 'express';
import { getSettings, parseSettings } from '../../services/settings.js';
import { googleStatus } from '../../services/google.js';
import { contextFromRequest, intId, listSubjects, wrap } from '../shared/acl.js';
import {
  createCalendar,
  createEvent,
  createGoogleItem,
  deleteCalendar,
  deleteEvent,
  deleteGoogleItem,
  forgetGoogleCalendars,
  getCalendarAccess,
  getEvent,
  listCalendars,
  listEvents,
  listGoogleItems,
  respond,
  setCalendarAccess,
  updateCalendar,
  updateEvent,
  updateGoogleItem,
} from './service.js';

/** /api/app/calendar — signed-in users; access is checked per calendar. */
export function privateRoutes() {
  const router = Router();
  router.use((req, res, next) => {
    req.cal = contextFromRequest(req, 'calendar.admin');
    next();
  });

  router.get('/', wrap(async (req, res) => {
    const parsed = parseSettings(await getSettings());
    const settings = parsed.modules.calendar.settings;
    const google = await googleStatus(req.user.id);
    res.json({
      success: true,
      calendars: await listCalendars(req.cal, req.user.locale),
      google: { available: google.calendarFeature, connected: google.connected, calendar: google.calendar, email: google.email },
      config: {
        canCreateCalendars: settings.calendarCreation !== 'admins' || req.cal.isAdmin,
        defaultView: settings.defaultView,
        weekStart: settings.weekStart,
        dayStart: settings.dayStart,
        dayEnd: settings.dayEnd,
        defaultReminder: settings.defaultReminder,
        showTasks: Boolean(settings.showTasks && parsed.modules.tasks?.enabled),
      },
    });
  }));

  // Calendars
  router.post('/calendars', wrap(async (req, res) => {
    const settings = parseSettings(await getSettings()).modules.calendar.settings;
    const calendar = await createCalendar(req.cal, req.body || {}, {
      allowed: settings.calendarCreation !== 'admins' || req.cal.isAdmin,
    });
    res.status(201).json({ success: true, calendar });
  }));
  router.put('/calendars/:id', wrap(async (req, res) => {
    res.json({ success: true, calendar: await updateCalendar(req.cal, intId(req.params.id), req.body || {}) });
  }));
  router.delete('/calendars/:id', wrap(async (req, res) => {
    await deleteCalendar(req.cal, intId(req.params.id));
    res.json({ success: true });
  }));
  router.get('/calendars/:id/access', wrap(async (req, res) => {
    res.json({ success: true, entries: await getCalendarAccess(req.cal, intId(req.params.id)) });
  }));
  router.put('/calendars/:id/access', wrap(async (req, res) => {
    res.json({ success: true, entries: await setCalendarAccess(req.cal, intId(req.params.id), req.body?.entries) });
  }));
  router.get('/subjects', wrap(async (req, res) => {
    res.json({ success: true, ...(await listSubjects()) });
  }));

  // Events
  router.get('/events', wrap(async (req, res) => {
    res.json({
      success: true,
      events: await listEvents(req.cal, {
        from: req.query.from,
        to: req.query.to,
        calendars: req.query.calendars,
        invitations: req.query.invitations !== '0',
      }),
    });
  }));
  router.post('/events', wrap(async (req, res) => {
    res.status(201).json({ success: true, event: await createEvent(req.cal, req.body || {}) });
  }));
  router.get('/events/:id', wrap(async (req, res) => {
    res.json({ success: true, event: await getEvent(req.cal, intId(req.params.id), req.query.occurrence) });
  }));
  router.put('/events/:id', wrap(async (req, res) => {
    const { scope, occurrence, ...body } = req.body || {};
    res.json({ success: true, event: await updateEvent(req.cal, intId(req.params.id), body, { scope, occurrence }) });
  }));
  router.delete('/events/:id', wrap(async (req, res) => {
    await deleteEvent(req.cal, intId(req.params.id), { scope: req.query.scope, occurrence: req.query.occurrence });
    res.json({ success: true });
  }));
  router.put('/events/:id/rsvp', wrap(async (req, res) => {
    res.json({ success: true, event: await respond(req.cal, intId(req.params.id), req.body?.status) });
  }));

  // Google Calendar (the user's own connection)
  router.get('/google/events', wrap(async (req, res) => {
    if (req.query.refresh === '1') forgetGoogleCalendars(req.user.id);
    res.json({ success: true, ...(await listGoogleItems(req.cal, { from: req.query.from, to: req.query.to })) });
  }));
  router.post('/google/events', wrap(async (req, res) => {
    const { googleCalendarId, ...body } = req.body || {};
    res.status(201).json({ success: true, event: await createGoogleItem(req.cal, String(googleCalendarId || ''), body) });
  }));
  router.put('/google/events', wrap(async (req, res) => {
    const { googleCalendarId, eventId, ...body } = req.body || {};
    res.json({ success: true, event: await updateGoogleItem(req.cal, String(googleCalendarId || ''), String(eventId || ''), body) });
  }));
  router.delete('/google/events', wrap(async (req, res) => {
    await deleteGoogleItem(req.cal, String(req.query.calendar || ''), String(req.query.event || ''));
    res.json({ success: true });
  }));

  return router;
}
