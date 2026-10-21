import { registerDemo } from '../../services/demo.js';
import { query } from '../../config/database.js';
import { contextFromRequest } from '../shared/acl.js';
import { saveCode } from './service.js';

/*
 * Demo data of QR codes: five codes of the superadministrator in different
 * ready-made templates — a dynamic website code with a month of scans, a
 * business card, guest Wi-Fi, a WhatsApp chat and an event. Neutral
 * example.com content. Scan days go with their code (ON DELETE CASCADE).
 */

const T = (ru, en, ky, tr, zh) => ({ ru, en, ky, tr, zh });

const CODES = [
  {
    preset: 'brand-card',
    name: T('Сайт компании', 'Company website', 'Компаниянын сайты', 'Şirket web sitesi', '公司网站'),
    type: 'url',
    content: { url: 'https://www.example.com' },
    dynamic: true,
    scans: true,
  },
  {
    preset: 'midnight',
    name: T('Визитка: Аида Бекова', 'Card: Aida Bekova', 'Визитка: Аида Бекова', 'Kartvizit: Aida Bekova', '名片：Aida Bekova'),
    type: 'vcard',
    content: { firstName: 'Aida', lastName: 'Bekova', org: 'Example LLC', title: 'Sales manager', mobile: '+996 555 000 111', email: 'aida@example.com', website: 'www.example.com' },
  },
  {
    preset: 'emerald',
    name: T('Гостевой Wi-Fi', 'Guest Wi-Fi', 'Конок Wi-Fi', 'Misafir Wi-Fi', '访客 Wi-Fi'),
    type: 'wifi',
    content: { ssid: 'Example-Guest', password: 'welcome-2026', security: 'WPA' },
    frameText: T('Бесплатный Wi-Fi', 'Free Wi-Fi', 'Акысыз Wi-Fi', 'Ücretsiz Wi-Fi', '免费 Wi-Fi'),
  },
  {
    preset: 'sunset',
    name: T('Чат поддержки', 'Support chat', 'Колдоо чаты', 'Destek sohbeti', '客服聊天'),
    type: 'whatsapp',
    content: { phone: '+996555000222', message: 'Hello!' },
  },
  {
    preset: 'ocean',
    name: T('День открытых дверей', 'Open day', 'Ачык эшиктер күнү', 'Açık kapı günü', '开放日'),
    type: 'event',
    content: { title: 'Open day', location: 'Example LLC, main office', allDay: false },
  },
];

registerDemo({
  module: 'qr',
  describe: {
    ru: 'Пять QR-кодов в готовых шаблонах: динамический код сайта со сканированиями за месяц, визитка, гостевой Wi-Fi, WhatsApp и событие.',
    en: 'Five QR codes in ready-made templates: a dynamic website code with a month of scans, a business card, guest Wi-Fi, WhatsApp and an event.',
    ky: 'Даяр үлгүлөрдөгү беш QR-код: бир айлык сканерлөөсү бар динамикалык сайт коду, визитка, конок Wi-Fi, WhatsApp жана иш-чара.',
    tr: 'Hazır şablonlarda beş QR kodu: bir aylık taramalı dinamik web sitesi kodu, kartvizit, misafir Wi-Fi, WhatsApp ve bir etkinlik.',
    zh: '五个使用现成模板的二维码：带一个月扫描数据的动态网址码、名片、访客 Wi-Fi、WhatsApp 和一个活动。',
  },
  async seed(ctx) {
    const qr = contextFromRequest(ctx.request, 'qr.admin');
    const { rows: templates } = await query(`SELECT id, preset_key, design FROM qr_templates`);
    for (const def of CODES) {
      const template = templates.find((row) => row.preset_key === def.preset) || null;
      const design = template ? structuredClone(template.design) : undefined;
      if (design && def.frameText) design.frame = { ...design.frame, text: ctx.t(def.frameText) };
      const content = { ...def.content };
      if (def.type === 'event') {
        const start = ctx.day(7, '10:00');
        const end = ctx.day(7, '16:00');
        const local = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        Object.assign(content, { title: ctx.t(def.name), start: local(start), end: local(end) });
      }
      const code = await saveCode(qr, { name: ctx.t(def.name), type: def.type, content, templateId: template?.id ?? null, design, dynamic: Boolean(def.dynamic) });
      await ctx.track('qr_codes', code.id);
      if (def.scans) {
        // A believable month: more on weekdays, a small campaign spike.
        let total = 0;
        for (let back = 29; back >= 0; back -= 1) {
          const weekday = new Date(Date.now() - back * 86400000).getDay();
          const count = Math.round((weekday === 0 || weekday === 6 ? 3 : 9) + ((back * 7) % 5) + (back >= 10 && back <= 13 ? 22 - (back - 10) * 4 : 0));
          total += count;
          await query(`INSERT INTO qr_scan_days (code_id, day, count) VALUES ($1, CURRENT_DATE - $2::int, $3)`, [code.id, back, count]);
        }
        await query(`UPDATE qr_codes SET scans = $1, last_scan_at = NOW() - INTERVAL '2 hours' WHERE id = $2`, [total, code.id]);
      }
    }
  },
});
