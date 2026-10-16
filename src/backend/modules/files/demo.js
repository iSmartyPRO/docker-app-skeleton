import { registerDemo } from '../../services/demo.js';
import { LEVEL, contextFromRequest } from '../shared/acl.js';
import { removeDemoBlobs, simpleDocx, simplePdf, simpleXlsx, sitePhoto, storeDemoBlob } from '../shared/demoAssets.js';
import { demoColleagues } from '../shared/demoPeople.js';
import { mimeOf } from '../shared/storage.js';
import { createLink } from './links.js';
import { allowedExt, createSpace, filesSettings } from './service.js';

/*
 * Demo data of Files (pattern: modules/tasks/demo.js): a shared space
 * «Демо: проектные документы» with folders of generated documents — Word,
 * Excel, PDF, site photos and a README.md — written by demo colleagues, plus
 * two public links: a read-only one to the photos and an upload-only «drop
 * box» for contractors. Everything lives in a shared space, so nobody's
 * personal quota is touched; a file type the Files settings do not allow,
 * or one over the size limit, is simply left out. Links the settings forbid
 * (public links off, write links off) are left out too.
 *
 * Purge deletes the space with everything in it — also files people or
 * link visitors added there since — and removes the blobs from disk.
 */

const T = (ru, en) => ({ ru, en });

const README = {
  ru: `# Демо: проектные документы

Это демонстрационное пространство. Его создала кнопка «Заполнить демо-данными», и кнопка «Удалить демо-данные» удалит его вместе со всеми файлами.

## Что здесь есть

- **01 Договоры** — договор поставки с ООО «Пример» (Word) и акт сверки (PDF).
- **02 Сметы и бюджеты** — смета по объекту «Северный квартал» и бюджет проекта (Excel).
- **03 Фото объекта** — снимки стройки по этапам. На папку есть публичная ссылка только для просмотра.
- **04 Входящие от подрядчиков** — публичная ссылка «только загрузка»: подрядчик отправляет файлы, но не видит чужие.

## Попробуйте

1. Откройте документ — Word и Excel открываются в просмотре прямо в портале.
2. Нажмите «Поделиться» у папки, чтобы увидеть публичные ссылки и их права.
3. Перетащите файл с компьютера в любую папку.
`,
  en: `# Demo: project documents

This is a demo space. «Fill with demo data» created it, and «Remove demo data» deletes it with every file inside.

## What is here

- **01 Contracts** — a supply contract with Example LLC (Word) and a reconciliation statement (PDF).
- **02 Estimates and budgets** — the «North Quarter» estimate and the project budget (Excel).
- **03 Site photos** — construction photos by stage. The folder has a view-only public link.
- **04 Incoming from contractors** — an upload-only public link: a contractor sends files but does not see anyone else's.

## Try it

1. Open a document — Word and Excel files open in the viewer right in the portal.
2. Press «Share» on a folder to see its public links and their permissions.
3. Drag a file from your computer into any folder.
`,
};

/** The folders and files. `who` is a demo colleague (the author), `daysAgo` backdates the change. */
const TREE = [
  {
    folder: T('01 Договоры', '01 Contracts'),
    files: [
      {
        name: T('Договор поставки — ООО «Пример».docx', 'Supply contract — Example LLC.docx'),
        who: 'director',
        daysAgo: 12,
        make: (t) =>
          simpleDocx(t(T('Договор поставки № 15/26', 'Supply contract No. 15/26')), [
            t(T('г. Пример', 'Example City')),
            t(T('ООО «Пример» (Поставщик) и Заказчик заключили настоящий договор о поставке строительных материалов на объект «Северный квартал».', 'Example LLC (the Supplier) and the Customer sign this contract for the supply of building materials to the «North Quarter» site.')),
            t(T('1. Предмет договора: поставка арматуры, бетона и кирпича по спецификации.', '1. Subject: supply of rebar, concrete and bricks per the specification.')),
            t(T('2. Срок поставки: 30 календарных дней со дня оплаты.', '2. Delivery: within 30 calendar days of payment.')),
            t(T('Демо-документ. Удаляется кнопкой «Удалить демо-данные».', 'A demo document. «Remove demo data» deletes it.')),
          ]),
      },
      {
        name: T('Акт сверки — 3 квартал.pdf', 'Reconciliation statement — Q3.pdf'),
        who: 'finance',
        daysAgo: 5,
        make: () => simplePdf(['Reconciliation statement - Q3', 'Example LLC / Demo customer', '', 'Opening balance: 0.00', 'Invoices: 48 500.00', 'Payments: 48 500.00', 'Closing balance: 0.00', '', 'Demo document.']),
      },
    ],
  },
  {
    folder: T('02 Сметы и бюджеты', '02 Estimates and budgets'),
    files: [
      {
        name: T('Смета — Северный квартал.xlsx', 'Estimate — North Quarter.xlsx'),
        who: 'foreman',
        daysAgo: 3,
        make: (t) =>
          simpleXlsx(t(T('Смета', 'Estimate')), [
            [t(T('Работа', 'Work')), t(T('Ед.', 'Unit')), t(T('Кол-во', 'Qty')), t(T('Цена', 'Price')), t(T('Сумма', 'Total'))],
            [t(T('Фундамент', 'Foundation')), 'м³', 120, 95, 11400],
            [t(T('Кладка стен', 'Brickwork')), 'м²', 640, 28, 17920],
            [t(T('Кровля', 'Roofing')), 'м²', 310, 34, 10540],
            [t(T('Окна', 'Windows')), t(T('шт', 'pcs')), 48, 210, 10080],
            [t(T('Итого', 'Total')), '', '', '', 49940],
          ]),
      },
      {
        name: T('Бюджет проекта 2026.xlsx', 'Project budget 2026.xlsx'),
        who: 'finance',
        daysAgo: 9,
        make: (t) =>
          simpleXlsx(t(T('Бюджет', 'Budget')), [
            [t(T('Статья', 'Item')), t(T('План', 'Plan')), t(T('Факт', 'Actual'))],
            [t(T('Материалы', 'Materials')), 180000, 126500],
            [t(T('Работы подрядчиков', 'Contractors')), 240000, 151000],
            [t(T('Техника', 'Machinery')), 60000, 41800],
            [t(T('Прочее', 'Other')), 20000, 7300],
          ]),
      },
    ],
  },
  {
    folder: T('03 Фото объекта', '03 Site photos'),
    viewLink: true,
    files: [
      { name: T('Котлован и фундамент.png', 'Pit and foundation.png'), who: 'foreman', daysAgo: 40, make: () => sitePhoto({ progress: 0.08, seed: 1 }) },
      { name: T('Кладка — 2 этаж.png', 'Brickwork — 2nd floor.png'), who: 'foreman', daysAgo: 18, make: () => sitePhoto({ progress: 0.5, seed: 2 }) },
      { name: T('Кровля готова.png', 'Roof done.png'), who: 'north', daysAgo: 2, make: () => sitePhoto({ progress: 0.95, seed: 3, wall: '#B4875C' }) },
    ],
  },
  { folder: T('04 Входящие от подрядчиков', '04 Incoming from contractors'), dropBox: true, files: [] },
];

/** Inserts a file node (bytes stored under UPLOAD_DIR/files/…); returns its id or null when the settings do not allow it. */
async function addFile(ctx, settings, { spaceId, parentId, name, bytes, authorId, daysAgo }) {
  const ext = name.split('.').pop().toLowerCase();
  if (!allowedExt(settings, ext) || bytes.length > settings.maxUploadMb * 1024 * 1024) return null;
  const blob = await storeDemoBlob('files', ext, bytes);
  try {
    const { rows } = await ctx.query(
      `INSERT INTO fs_nodes (kind, name, parent_id, owner_id, space_id, storage_key, mime, size, ext, created_by, updated_by, created_at, updated_at)
       VALUES ('file', $1, $2, $3, $4, $5, $6, $7, $8, $3, $3, NOW() - make_interval(days => $9), NOW() - make_interval(days => $9)) RETURNING id`,
      [name, parentId, authorId, spaceId, blob.key, mimeOf(ext), blob.size, ext, daysAgo]
    );
    await ctx.track('fs_nodes', rows[0].id);
    return rows[0].id;
  } catch (err) {
    await removeDemoBlobs([blob.key]);
    throw err;
  }
}

/** A public link, or nothing when the Files settings forbid this kind. */
async function tryLink(fs, ctx, nodeId, input) {
  try {
    const link = await createLink(fs, nodeId, input);
    await ctx.track('fs_links', link.id);
    return link;
  } catch (err) {
    if (['LINKS_DISABLED', 'WRITE_LINKS_DISABLED', 'PASSWORD_REQUIRED', 'GRANT_EXCEEDED', 'FORBIDDEN'].includes(err.code)) return null;
    throw err;
  }
}

registerDemo({
  module: 'files',
  after: ['org', 'employees'],
  describe: {
    ru: 'Общее пространство «Демо: проектные документы»: папки с договором (Word), сметой и бюджетом (Excel), актом (PDF), фото объекта и README; публичная ссылка на фото и ссылка «только загрузка» для подрядчиков.',
    en: 'A shared «Demo: project documents» space: folders with a contract (Word), an estimate and a budget (Excel), a statement (PDF), site photos and a README; a public link to the photos and an upload-only link for contractors.',
  },
  async seed(ctx) {
    const fs = contextFromRequest(ctx.request, 'files.admin');
    const settings = await filesSettings();
    const people = await demoColleagues(ctx, ['director', 'finance', 'north', 'foreman']);
    const space = await createSpace(
      fs,
      {
        name: ctx.t(T('Демо: проектные документы', 'Demo: project documents')),
        description: ctx.t(T('Документы объекта «Северный квартал». Демо-данные: удаляются кнопкой «Удалить демо-данные».', 'Documents of the «North Quarter» site. Demo data: «Remove demo data» deletes them.')),
        color: '#0EA5E9',
        visibility: 'team',
      },
      { allowed: true }
    );
    await ctx.track('fs_spaces', space.id);
    // The demo colleagues work in the space too (edit), the rest of the team reads it.
    for (const person of Object.values(people)) {
      await ctx.query(`INSERT INTO fs_space_acl (resource_id, subject_type, subject_id, level) VALUES ($1, 'user', $2, $3) ON CONFLICT DO NOTHING`, [space.id, person.id, LEVEL.edit]);
    }

    for (const [index, entry] of TREE.entries()) {
      const { rows } = await ctx.query(
        `INSERT INTO fs_nodes (kind, name, space_id, owner_id, created_by, updated_by, created_at, updated_at)
         VALUES ('folder', $1, $2, $3, $3, $3, NOW() - make_interval(days => $4), NOW() - make_interval(days => $4)) RETURNING id`,
        [ctx.t(entry.folder), space.id, ctx.userId, 45 - index]
      );
      const folderId = rows[0].id;
      await ctx.track('fs_nodes', folderId);
      for (const file of entry.files) {
        await addFile(ctx, settings, {
          spaceId: space.id,
          parentId: folderId,
          name: ctx.t(file.name),
          bytes: file.make(ctx.t),
          authorId: people[file.who].id,
          daysAgo: file.daysAgo,
        });
      }
      if (entry.viewLink) {
        await tryLink(fs, ctx, folderId, { permissions: ['view', 'download'], title: ctx.t(T('Фото для заказчика', 'Photos for the client')) });
      }
      if (entry.dropBox) {
        await tryLink(fs, ctx, folderId, {
          permissions: ['upload'],
          title: ctx.t(T('Загрузка документов подрядчиками', 'Contractor uploads')),
          maxFileMb: Math.min(20, settings.maxUploadMb || 20),
          extensions: 'pdf,docx,xlsx,jpg,png',
          quotaMb: 200,
          requireName: true,
        });
      }
    }
    await addFile(ctx, settings, {
      spaceId: space.id,
      parentId: null,
      name: 'README.md',
      bytes: Buffer.from(ctx.t(README), 'utf8'),
      authorId: people.director.id,
      daysAgo: 1,
    });
  },
  async purge(ctx) {
    const spaces = await ctx.records('fs_spaces');
    const nodes = await ctx.records('fs_nodes');
    const links = await ctx.records('fs_links');
    // Every blob of the space (also files added there since) and of demo files moved elsewhere.
    const { rows } = await ctx.query(`SELECT storage_key FROM fs_nodes WHERE kind = 'file' AND storage_key IS NOT NULL AND (space_id = ANY($1::int[]) OR id = ANY($2::int[]))`, [spaces, nodes]);
    if (links.length) await ctx.query(`DELETE FROM fs_link_events WHERE link_id = ANY($1::int[])`, [links]);
    for (const id of spaces) {
      try {
        await ctx.query(`DELETE FROM fs_spaces WHERE id = $1`, [id]);
      } catch (err) {
        // A knowledge base article still uses a file of the space: it stays (and stays tracked).
        if (err.code !== '23503') throw err;
      }
    }
    // Demo files moved out of the space since: one by one, a file the knowledge base uses stays.
    const { rows: left } = await ctx.query(`SELECT id FROM fs_nodes WHERE id = ANY($1::int[])`, [nodes]);
    for (const { id } of left) {
      await ctx.query(`DELETE FROM fs_nodes WHERE id = $1`, [id]).catch((err) => {
        if (err.code !== '23503') throw err;
      });
    }
    // Only blobs no row points at any more go from the disk.
    const keys = rows.map((row) => row.storage_key);
    const { rows: still } = keys.length ? await ctx.query(`SELECT storage_key FROM fs_nodes WHERE storage_key = ANY($1::text[])`, [keys]) : { rows: [] };
    const kept = new Set(still.map((row) => row.storage_key));
    await removeDemoBlobs(keys.filter((key) => !kept.has(key)));
  },
});
