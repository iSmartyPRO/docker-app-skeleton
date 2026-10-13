import api from '../../services/api';
import { getRegional } from '../../lib/datetime';

const base = '/app/calendar';

export const calendarApi = {
  home: () => api.get(base),
  savePrefs: (prefs) => api.put(`${base}/prefs`, prefs),
  resetPrefs: () => api.delete(`${base}/prefs`),
  createCalendar: (payload) => api.post(`${base}/calendars`, payload),
  updateCalendar: (id, payload) => api.put(`${base}/calendars/${id}`, payload),
  deleteCalendar: (id) => api.delete(`${base}/calendars/${id}`),
  access: (id) => api.get(`${base}/calendars/${id}/access`),
  saveAccess: (id, entries) => api.put(`${base}/calendars/${id}/access`, { entries }),
  subjects: () => api.get(`${base}/subjects`),

  events: (params) => api.get(`${base}/events`, { params }),
  event: (id, occurrence) => api.get(`${base}/events/${id}`, { params: occurrence ? { occurrence } : {} }),
  createEvent: (payload) => api.post(`${base}/events`, payload),
  updateEvent: (id, payload) => api.put(`${base}/events/${id}`, payload),
  deleteEvent: (id, params) => api.delete(`${base}/events/${id}`, { params }),
  rsvp: (id, status) => api.put(`${base}/events/${id}/rsvp`, { status }),

  googleEvents: (params) => api.get(`${base}/google/events`, { params }),
  createGoogle: (payload) => api.post(`${base}/google/events`, payload),
  updateGoogle: (payload) => api.put(`${base}/google/events`, payload),
  deleteGoogle: (calendar, event) => api.delete(`${base}/google/events`, { params: { calendar, event } }),
};

/** The person's time zone (regional settings), e.g. for an event's `timezone`. */
export const localTimeZone = () => getRegional().timeZone;

/** Personal calendars keep their default name in the UI language. */
const DEFAULT_PERSONAL = ['My calendar', 'Мой календарь'];
export function calendarLabel(calendar, t) {
  const name = calendar.personal && DEFAULT_PERSONAL.includes(calendar.name) ? t('calendar.myCalendar') : calendar.name;
  return calendar.personal && !calendar.mine ? `${name} · ${calendar.owner}` : name;
}
