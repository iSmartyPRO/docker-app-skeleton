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
  { title: { ru: 'Планёрка команды', en: 'Team stand-up', ky: 'Команданын планёркасы', tr: 'Ekip toplantısı', zh: '团队站会' }, day: 0, at: '09:30', minutes: 30, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', location: { ru: 'Переговорная «Север»', en: 'Meeting room «North»', ky: '«Түндүк» сүйлөшүү бөлмөсү', tr: '«Kuzey» toplantı odası', zh: '“北”会议室' } },
  { title: { ru: 'Встреча с ООО «Пример»', en: 'Meeting with Example LLC', ky: '«Мисал» ЖЧК менен жолугушуу', tr: 'Örnek Ltd. Şti. ile toplantı', zh: '与“示例”有限责任公司会面' }, day: 1, at: '11:00', minutes: 60, location: { ru: 'Офис клиента', en: 'Client office', ky: 'Кардардын кеңсеси', tr: 'Müşteri ofisi', zh: '客户办公室' } },
  { title: { ru: 'Обход объекта «Северный квартал»', en: 'Site walk at «North Quarter»', ky: '«Түндүк квартал» объектин кыдыруу', tr: '«Kuzey Mahallesi» şantiye gezisi', zh: '“北区”工地巡查' }, day: 2, at: '14:00', minutes: 90, location: { ru: 'Объект «Северный квартал»', en: '«North Quarter» site', ky: '«Түндүк квартал» объектиси', tr: '«Kuzey Mahallesi» şantiyesi', zh: '“北区”工地' } },
  { title: { ru: 'Обучение: работа с порталом', en: 'Training: working with the portal', ky: 'Окутуу: портал менен иштөө', tr: 'Eğitim: portalla çalışma', zh: '培训：使用门户' }, day: 3, at: '16:00', minutes: 60, meetingUrl: 'https://meet.example.com/demo-training' },
  { title: { ru: 'День открытых дверей', en: 'Open day', ky: 'Ачык эшиктер күнү', tr: 'Açık kapı günü', zh: '开放日' }, day: 6, allDay: true },
  { title: { ru: 'Итоги недели', en: 'Week review', ky: 'Жуманын жыйынтыгы', tr: 'Haftalık değerlendirme', zh: '周总结' }, day: -1, at: '17:00', minutes: 45, with: ['director', 'finance'], location: { ru: 'Переговорная «Север»', en: 'Meeting room «North»', ky: '«Түндүк» сүйлөшүү бөлмөсү', tr: '«Kuzey» toplantı odası', zh: '“北”会议室' } },
  { title: { ru: 'Совещание по бюджету проекта', en: 'Project budget meeting', ky: 'Долбоордун бюджети боюнча кеңешме', tr: 'Proje bütçe toplantısı', zh: '项目预算会议' }, day: 8, at: '10:00', minutes: 60, with: ['director', 'finance', 'north'], meetingUrl: 'https://meet.example.com/demo-budget' },
  { title: { ru: 'Сдача квартальной отчётности', en: 'Quarterly reports due', ky: 'Чейректик отчеттуулукту тапшыруу', tr: 'Çeyrek raporlarının teslimi', zh: '季度报表截止' }, day: 9, allDay: true, with: ['finance'] },
];

/** The site calendar: inspections and deliveries at «Северный квартал». */
const SITE_EVENTS = [
  { title: { ru: 'Приёмка фундамента, секция 2', en: 'Foundation acceptance, section 2', ky: 'Пайдубалды кабыл алуу, 2-секция', tr: 'Temel kabulü, 2. bölüm', zh: '基础验收，第 2 单元' }, day: 1, at: '09:00', minutes: 60, with: ['foreman', 'north'], location: { ru: 'Объект «Северный квартал»', en: '«North Quarter» site', ky: '«Түндүк квартал» объектиси', tr: '«Kuzey Mahallesi» şantiyesi', zh: '“北区”工地' } },
  { title: { ru: 'Поставка металлочерепицы', en: 'Roofing delivery', ky: 'Металл черепицасын жеткирүү', tr: 'Çatı kaplaması teslimatı', zh: '屋面瓦到货' }, day: 4, at: '08:00', minutes: 120, with: ['foreman', 'buyer'], location: { ru: 'Склад объекта', en: 'Site store', ky: 'Объекттин кампасы', tr: 'Şantiye deposu', zh: '工地仓库' } },
  { title: { ru: 'Технадзор заказчика', en: 'Client’s technical inspection', ky: 'Заказчинин техникалык көзөмөлү', tr: 'Müşterinin teknik denetimi', zh: '甲方技术检查' }, day: 7, at: '11:00', minutes: 90, with: ['north'], location: { ru: 'Объект «Северный квартал»', en: '«North Quarter» site', ky: '«Түндүк квартал» объектиси', tr: '«Kuzey Mahallesi» şantiyesi', zh: '“北区”工地' } },
];

registerDemo({
  module: 'calendar',
  after: ['tasks', 'org', 'employees'],
  describe: {
    ru: 'Общий календарь «Демо: команда» со встречами на эту и следующую неделю (одна повторяется) и календарь объекта «Северный квартал» с приёмками и поставками; участники — демо-коллеги.',
    en: 'A shared «Demo: team» calendar with this and next week’s meetings (one recurring) and a «North Quarter» site calendar with inspections and deliveries; demo colleagues attend.',
    ky: 'Ушул жана кийинки жумадагы жолугушуулары бар «Демо: команда» жалпы календары (бирөө кайталанат) жана кабыл алуулар менен жеткирүүлөр жазылган «Түндүк квартал» объектинин календары; катышуучулар — демо кесиптештер.',
    tr: 'Bu haftanın ve gelecek haftanın toplantılarını içeren paylaşılan bir «Demo: ekip» takvimi (biri yinelenen) ve denetimler ile teslimatları içeren bir «Kuzey Mahallesi» şantiye takvimi; katılımcılar demo iş arkadaşları.',
    zh: '共享日历“演示：团队”，包含本周和下周的会议（其中一个为重复日程），以及“北区”工地日历，包含验收和到货安排；参与者为演示同事。',
  },
  async seed(ctx) {
    const cal = contextFromRequest(ctx.request, 'calendar.admin');
    const calendar = await createCalendar(cal, { name: ctx.t({ ru: 'Демо: команда', en: 'Demo: team', ky: 'Демо: команда', tr: 'Demo: ekip', zh: '演示：团队' }), color: '#8B5CF6', visibility: 'team' }, { allowed: true });
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
    const site = await createCalendar(cal, { name: ctx.t({ ru: 'Демо: объект «Северный квартал»', en: 'Demo: «North Quarter» site', ky: 'Демо: «Түндүк квартал» объектиси', tr: 'Demo: «Kuzey Mahallesi» şantiyesi', zh: '演示：“北区”工地' }), color: '#F97316', visibility: 'team' }, { allowed: true });
    await ctx.track('cal_calendars', site.id);
    for (const item of SITE_EVENTS) await add(site.id, item);
  },
  async purge(ctx) {
    // Invitations of the demo events (notifications) go with them.
    await dropNotifications(ctx.query, (await ctx.records('cal_events')).map((id) => `/app/calendar/e/${id}`));
  },
});
