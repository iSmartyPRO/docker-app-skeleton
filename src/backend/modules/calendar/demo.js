import { registerDemo } from '../../services/demo.js';
import { contextFromRequest } from '../shared/acl.js';
import { dropNotifications } from '../shared/demoAssets.js';
import { demoColleagues } from '../shared/demoPeople.js';
import { createCalendar, createEvent } from './service.js';

/*
 * Demo data of Calendar (pattern: modules/tasks/demo.js): a shared team
 * calendar with meetings this week and next (one recurring, one yesterday,
 * all-day days) and a site calendar of «Северный квартал». Attendees are the
 * demo colleagues of shared/demoPeople.js (the Org structure / Employees
 * people when those are seeded). The invitations they get go with them.
 */

const EVENTS = [
  { title: { ru: 'Планёрка команды', en: 'Team stand-up' }, day: 0, at: '09:30', minutes: 30, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', location: { ru: 'Переговорная «Север»', en: 'Meeting room «North»' } },
  { title: { ru: 'Встреча с ООО «Пример»', en: 'Meeting with Example LLC' }, day: 1, at: '11:00', minutes: 60, location: { ru: 'Офис клиента', en: 'Client office' } },
  { title: { ru: 'Обход объекта «Северный квартал»', en: 'Site walk at «North Quarter»' }, day: 2, at: '14:00', minutes: 90, location: { ru: 'Объект «Северный квартал»', en: '«North Quarter» site' } },
  { title: { ru: 'Обучение: работа с порталом', en: 'Training: working with the portal' }, day: 3, at: '16:00', minutes: 60, meetingUrl: 'https://meet.example.com/demo-training' },
  { title: { ru: 'День открытых дверей', en: 'Open day' }, day: 6, allDay: true },
  { title: { ru: 'Итоги недели', en: 'Week review' }, day: -1, at: '17:00', minutes: 45, with: ['director', 'finance'], location: { ru: 'Переговорная «Север»', en: 'Meeting room «North»' } },
  { title: { ru: 'Совещание по бюджету проекта', en: 'Project budget meeting' }, day: 8, at: '10:00', minutes: 60, with: ['director', 'finance', 'north'], meetingUrl: 'https://meet.example.com/demo-budget' },
  { title: { ru: 'Сдача квартальной отчётности', en: 'Quarterly reports due' }, day: 9, allDay: true, with: ['finance'] },
];

/** The site calendar: inspections and deliveries at «Северный квартал». */
const SITE_EVENTS = [
  { title: { ru: 'Приёмка фундамента, секция 2', en: 'Foundation acceptance, section 2' }, day: 1, at: '09:00', minutes: 60, with: ['foreman', 'north'], location: { ru: 'Объект «Северный квартал»', en: '«North Quarter» site' } },
  { title: { ru: 'Поставка металлочерепицы', en: 'Roofing delivery' }, day: 4, at: '08:00', minutes: 120, with: ['foreman', 'buyer'], location: { ru: 'Склад объекта', en: 'Site store' } },
  { title: { ru: 'Технадзор заказчика', en: 'Client’s technical inspection' }, day: 7, at: '11:00', minutes: 90, with: ['north'], location: { ru: 'Объект «Северный квартал»', en: '«North Quarter» site' } },
];

registerDemo({
  module: 'calendar',
  after: ['tasks', 'org', 'employees'],
  describe: {
    ru: 'Общий календарь «Демо: команда» со встречами на эту и следующую неделю (одна повторяется) и календарь объекта «Северный квартал» с приёмками и поставками; участники — демо-коллеги.',
    en: 'A shared «Demo: team» calendar with this and next week’s meetings (one recurring) and a «North Quarter» site calendar with inspections and deliveries; demo colleagues attend.',
  },
  async seed(ctx) {
    const cal = contextFromRequest(ctx.request, 'calendar.admin');
    const calendar = await createCalendar(cal, { name: ctx.t({ ru: 'Демо: команда', en: 'Demo: team' }), color: '#8B5CF6', visibility: 'team' }, { allowed: true });
    await ctx.track('cal_calendars', calendar.id);
    const people = await demoColleagues(ctx, ['director', 'finance', 'north', 'foreman', 'buyer']);
    const day = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const add = async (calendarId, item) => {
      const start = ctx.day(item.day, item.at || '00:00');
      const end = new Date(start.getTime() + (item.minutes || 0) * 60000);
      const event = await createEvent(cal, {
        calendarId,
        title: ctx.t(item.title),
        start: item.allDay ? day(start) : start.toISOString(),
        end: item.allDay ? day(start) : end.toISOString(),
        allDay: Boolean(item.allDay),
        location: item.location ? ctx.t(item.location) : undefined,
        meetingUrl: item.meetingUrl,
        rrule: item.rrule,
        attendees: (item.with || ['director']).map((role) => people[role].id),
      });
      await ctx.track('cal_events', event.id);
    };
    for (const item of EVENTS) await add(calendar.id, item);
    const site = await createCalendar(cal, { name: ctx.t({ ru: 'Демо: объект «Северный квартал»', en: 'Demo: «North Quarter» site' }), color: '#F97316', visibility: 'team' }, { allowed: true });
    await ctx.track('cal_calendars', site.id);
    for (const item of SITE_EVENTS) await add(site.id, item);
  },
  async purge(ctx) {
    // Invitations of the demo events (notifications) go with them.
    await dropNotifications(ctx.query, (await ctx.records('cal_events')).map((id) => `/app/calendar/e/${id}`));
  },
});
