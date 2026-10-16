import { registerDemo } from '../../services/demo.js';
import { contextFromRequest } from './access.js';
import { createFolder, createItem } from './service.js';
import { removeDemoBlobs, sitePhoto, storeDemoBlob } from '../shared/demoAssets.js';
import { ensureKbFolder } from '../files/kb.js';
import { usageOf } from '../files/service.js';

/*
 * Demo data of the Knowledge base (pattern: modules/tasks/demo.js): a folder
 * of short, neutral company rules in Markdown and one visual-editor article
 * (HTML) with a picture, a table and a checklist. The picture is a Files node
 * in the administrator's «My files / Knowledge base» folder, as an upload from
 * the editor would be; it is left out when that storage is full (quota).
 * Purge deletes the articles, then the picture and its blob.
 */

const VISUAL = {
  title: { ru: 'Охрана труда на объекте', en: 'Site safety rules' },
  description: { ru: 'Визуальная статья: картинка, таблица и чек-лист', en: 'A visual article: a picture, a table and a checklist' },
  caption: { ru: 'Объект «Северный квартал»: идёт кладка стен', en: '«North Quarter» site: brickwork in progress' },
  content: {
    ru: (figure) => `<h2>Перед входом на объект</h2><p>Каждый, кто приходит на объект «Северный квартал», проходит <strong>вводный инструктаж</strong> у прораба и получает средства защиты.</p>${figure}<h2>Средства защиты</h2><table><tbody><tr><th><p>Что</p></th><th><p>Когда</p></th></tr><tr><td><p>Каска</p></td><td><p>Всегда на территории</p></td></tr><tr><td><p>Сигнальный жилет</p></td><td><p>Всегда на территории</p></td></tr><tr><td><p>Страховочная привязь</p></td><td><p>Работы на высоте от 1,8 м</p></td></tr></tbody></table><h2>Чек-лист прораба</h2><ul><li><p>Ограждение зоны работ на месте</p></li><li><p>Аптечка и огнетушитель доступны</p></li><li><p>Журнал инструктажей заполнен</p></li></ul><blockquote><p>Это демо-статья. Её удалит кнопка «Удалить демо-данные».</p></blockquote>`,
    en: (figure) => `<h2>Before entering the site</h2><p>Everyone who comes to the «North Quarter» site gets a <strong>safety briefing</strong> from the foreman and protective equipment.</p>${figure}<h2>Protective equipment</h2><table><tbody><tr><th><p>What</p></th><th><p>When</p></th></tr><tr><td><p>Hard hat</p></td><td><p>Always on site</p></td></tr><tr><td><p>High-visibility vest</p></td><td><p>Always on site</p></td></tr><tr><td><p>Safety harness</p></td><td><p>Work at height from 1.8 m</p></td></tr></tbody></table><h2>Foreman’s checklist</h2><ul><li><p>The work area is fenced</p></li><li><p>First-aid kit and extinguisher at hand</p></li><li><p>The briefing log is filled in</p></li></ul><blockquote><p>This is a demo article. «Remove demo data» deletes it.</p></blockquote>`,
  },
};

const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The article picture as a node in the administrator's «Knowledge base» folder of Files; null when the quota is full. */
async function storePicture(ctx) {
  const bytes = sitePhoto({ width: 640, height: 360, progress: 0.7, seed: 5 });
  const usage = await usageOf(ctx.userId);
  if (usage.quota && usage.used + bytes.length > usage.quota) return null;
  const { rows: had } = await ctx.query(`SELECT 1 FROM fs_nodes WHERE owner_id = $1 AND space_id IS NULL AND parent_id IS NULL AND system_tag = 'kb' AND deleted_at IS NULL`, [ctx.userId]);
  const folder = await ensureKbFolder(ctx.userId, ctx.locale);
  if (!had.length) await ctx.track('fs_nodes', folder.id);
  const blob = await storeDemoBlob('files', 'png', bytes);
  const { rows } = await ctx.query(
    `INSERT INTO fs_nodes (kind, name, parent_id, owner_id, storage_key, mime, size, ext, created_by, updated_by) VALUES ('file', $1, $2, $3, $4, 'image/png', $5, 'png', $3, $3) RETURNING id`,
    [ctx.t({ ru: 'Демо — кладка стен.png', en: 'Demo — brickwork.png' }), folder.id, ctx.userId, blob.key, blob.size]
  );
  await ctx.track('fs_nodes', rows[0].id);
  return rows[0].id;
}

const ARTICLES = [
  {
    title: { ru: 'Как оформить командировку', en: 'How to arrange a business trip' },
    description: { ru: 'Пошаговая инструкция для сотрудников', en: 'Step-by-step guide for employees' },
    content: {
      ru: '## Шаги\n\n1. Согласуйте поездку с руководителем.\n2. Создайте задачу «Командировка» с датами и целью.\n3. Приложите билеты и бронь гостиницы.\n4. После поездки сдайте отчёт и чеки в течение 3 рабочих дней.\n\n> Это демо-статья. Её удалит кнопка «Удалить демо-данные».',
      en: '## Steps\n\n1. Agree the trip with your manager.\n2. Create a «Business trip» task with the dates and purpose.\n3. Attach the tickets and hotel booking.\n4. Hand in the report and receipts within 3 working days.\n\n> This is a demo article. «Remove demo data» deletes it.',
    },
  },
  {
    title: { ru: 'Правила работы с документами', en: 'Document handling rules' },
    description: { ru: 'Где хранить, как называть, кто согласует', en: 'Where to keep, how to name, who approves' },
    content: {
      ru: '## Хранение\n\nРабочие документы храните в общем пространстве отдела, а не в личных файлах.\n\n## Названия\n\nФормат: `ГГГГ-ММ-ДД Тема — версия`, например `2026-03-01 Договор ООО «Пример» — v2`.\n\n## Согласование\n\nДоговоры и счета проходят маршрут согласования в портале.',
      en: '## Storage\n\nKeep working documents in the department’s shared space, not in personal files.\n\n## Names\n\nFormat: `YYYY-MM-DD Subject — version`, e.g. `2026-03-01 Example LLC contract — v2`.\n\n## Approval\n\nContracts and invoices go through an approval route in the portal.',
    },
  },
  {
    title: { ru: 'Первый день в компании', en: 'Your first day' },
    description: { ru: 'Что сделать новому сотруднику', en: 'What a new employee should do' },
    content: {
      ru: '- Войдите в портал и заполните профиль.\n- Пройдите тур по порталу.\n- Подпишитесь на чат своего отдела.\n- Прочитайте раздел «Правила работы с документами».',
      en: '- Sign in to the portal and fill in your profile.\n- Take the portal tour.\n- Join your department’s chat.\n- Read «Document handling rules».',
    },
  },
];

registerDemo({
  module: 'kb',
  describe: {
    ru: 'Папка «Демо: регламенты» с тремя статьями-инструкциями.',
    en: 'A «Demo: rules» folder with three how-to articles.',
  },
  async seed(ctx) {
    const kb = contextFromRequest(ctx.request);
    const folderId = await createFolder(kb, {
      name: ctx.t({ ru: 'Демо: регламенты', en: 'Demo: rules' }),
      description: ctx.t({ ru: 'Пример раздела базы знаний', en: 'A sample knowledge base section' }),
      icon: 'book',
      color: '#F59E0B',
    });
    await ctx.track('kb_folders', folderId);
    for (const item of ARTICLES) {
      const id = await createItem(kb, { folderId, kind: 'article', title: ctx.t(item.title), description: ctx.t(item.description), content: ctx.t(item.content), format: 'md' });
      await ctx.track('kb_items', id);
    }
    const pictureId = await storePicture(ctx);
    const figure = pictureId
      ? `<figure class="kb-figure" data-align="center" data-width="80"><img src="kbfile:${pictureId}" alt="${escape(ctx.t(VISUAL.caption))}"><figcaption>${escape(ctx.t(VISUAL.caption))}</figcaption></figure>`
      : '';
    const visual = await createItem(kb, { folderId, kind: 'article', title: ctx.t(VISUAL.title), description: ctx.t(VISUAL.description), content: VISUAL.content[ctx.locale](figure), format: 'html' });
    await ctx.track('kb_items', visual);
  },
  async purge(ctx) {
    // Articles first (their file links go with them), then the picture and its blob.
    await ctx.query(`DELETE FROM kb_items WHERE id = ANY($1::int[])`, [await ctx.records('kb_items')]).catch((err) => {
      if (err.code !== '23503') throw err;
    });
    const nodes = await ctx.records('fs_nodes');
    if (!nodes.length) return;
    const { rows } = await ctx.query(`SELECT id, kind, storage_key FROM fs_nodes WHERE id = ANY($1::int[]) ORDER BY id DESC`, [nodes]);
    const gone = [];
    for (const row of rows) {
      // The «Knowledge base» folder made for the demo goes only while it is empty.
      const sql = row.kind === 'folder' ? `DELETE FROM fs_nodes WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM fs_nodes c WHERE c.parent_id = $1)` : `DELETE FROM fs_nodes WHERE id = $1`;
      const result = await ctx.query(sql, [row.id]).catch((err) => {
        if (err.code !== '23503') throw err;
        return { rowCount: 0 };
      });
      if (result.rowCount && row.storage_key) gone.push(row.storage_key);
      if (!result.rowCount) await ctx.untrack('fs_nodes', row.id);
    }
    await removeDemoBlobs(gone);
  },
});
