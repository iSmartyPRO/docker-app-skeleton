import { registerDemo } from '../../services/demo.js';
import { DEFAULT_LAYOUT } from './widgets.js';

/*
 * Demo data of the Dashboard: a starting layout for everyone with a welcome
 * note on top — only when an administrator has not set one. The purge leaves
 * a layout that was saved since (it is the administrator's now).
 */

const layout = (ctx) => [
  { id: 'demo-note', type: 'note', w: 12, h: 3, settings: { text: ctx.t({ ru: 'Это демо-режим портала: задачи, встречи, контрагенты и статьи здесь — примеры. Администратор удалит их в «Настройки → Модули».', en: 'This is the portal’s demo mode: the tasks, meetings, counterparties and articles here are examples. An administrator removes them in Settings → Modules.', ky: 'Бул порталдын демо режими: бул жердеги тапшырмалар, жолугушуулар, контрагенттер жана макалалар — мисалдар. Администратор аларды «Жөндөөлөр → Модулдар» бөлүмүндө өчүрөт.', tr: 'Bu, portalın demo modudur: buradaki görevler, toplantılar, cari hesaplar ve makaleler örnektir. Bir yönetici bunları Ayarlar → Modüller\'den kaldırır.', zh: '这是门户的演示模式：这里的任务、会议、往来单位和文章都是示例。管理员可在“设置 → 模块”中将其删除。' }) } },
  ...DEFAULT_LAYOUT,
];

registerDemo({
  module: 'dashboard',
  after: ['tasks', 'calendar', 'companies', 'kb'],
  describe: {
    ru: 'Стартовая раскладка дашборда для всех с приветственной заметкой (если своя ещё не задана).',
    en: 'A starting dashboard layout for everyone with a welcome note (when none is set yet).',
    ky: 'Саламдашуу жазуусу бар баарына арналган башкаруу панелинин баштапкы жайгашуусу (өзүнүкү али коюла элек болсо).',
    tr: 'Herkes için hoş geldin notu içeren başlangıç pano düzeni (henüz bir düzen ayarlanmamışsa).',
    zh: '面向所有人的初始仪表板布局，附欢迎便签（尚未设置布局时）。',
  },
  async seed(ctx) {
    const { rows } = await ctx.query(`SELECT 1 FROM dash_default WHERE id = 1`);
    if (rows.length) return;
    await ctx.query(`INSERT INTO dash_default (id, widgets, updated_by) VALUES (1, $1, $2)`, [JSON.stringify(layout(ctx)), ctx.userId]);
    await ctx.track('dash_default', 1);
  },
  async purge(ctx) {
    // Saved by an administrator since it was seeded (any change, even one that kept the note) → theirs.
    const { rows } = await ctx.query(
      `SELECT d.widgets, d.updated_at > r.created_at + INTERVAL '1 second' AS edited
       FROM dash_default d LEFT JOIN demo_records r ON r.module = $1 AND r.table_name = 'dash_default' AND r.record_key = '1'
       WHERE d.id = 1`,
      [ctx.module]
    );
    const ours = rows[0] && Array.isArray(rows[0].widgets) && rows[0].widgets[0]?.id === 'demo-note' && rows[0].edited !== true;
    if (rows[0] && !ours) await ctx.untrack('dash_default', 1);
  },
});
