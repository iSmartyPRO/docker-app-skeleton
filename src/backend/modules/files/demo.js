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

const T = (ru, en, ky, tr, zh) => ({ ru, en, ky, tr, zh });

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
  ky: `# Демо: долбоордун документтери

Бул демо мейкиндик. Аны «Демо маалыматтар менен толтуруу» баскычы түздү, ал эми «Демо маалыматтарды өчүрүү» баскычы аны ичиндеги бардык файлдар менен кошо өчүрөт.

## Бул жерде эмне бар

- **01 Келишимдер** — «Мисал» ЖЧК менен жеткирүү келишими (Word) жана салыштыруу акты (PDF).
- **02 Сметалар жана бюджеттер** — «Түндүк квартал» объектинин сметасы жана долбоордун бюджети (Excel).
- **03 Объекттин сүрөттөрү** — курулуштун баскычтар боюнча сүрөттөрү. Папкада көрүү үчүн гана ачык шилтеме бар.
- **04 Подрядчиктерден келгендер** — «жүктөө гана» ачык шилтемеси: подрядчик файлдарды жөнөтөт, бирок башкалардыкын көрбөйт.

## Аракет кылып көрүңүз

1. Документти ачыңыз — Word жана Excel файлдары порталдын ичинде эле көрүү терезесинде ачылат.
2. Папканын ачык шилтемелерин жана алардын укуктарын көрүү үчүн «Бөлүшүү» баскычын басыңыз.
3. Компьютериңизден файлды каалаган папкага сүйрөп таштаңыз.
`,
  tr: `# Demo: proje belgeleri

Bu bir demo alanıdır. «Demo verileriyle doldur» onu oluşturdu; «Demo verilerini kaldır» onu içindeki tüm dosyalarla birlikte siler.

## Burada neler var

- **01 Sözleşmeler** — Örnek Ltd. Şti. ile bir tedarik sözleşmesi (Word) ve bir mutabakat tutanağı (PDF).
- **02 Keşifler ve bütçeler** — «Kuzey Mahallesi» keşfi ve proje bütçesi (Excel).
- **03 Şantiye fotoğrafları** — aşamalara göre inşaat fotoğrafları. Klasörün yalnızca görüntüleme amaçlı herkese açık bir bağlantısı var.
- **04 Yüklenicilerden gelenler** — yalnızca yükleme yapılabilen herkese açık bir bağlantı: yüklenici dosya gönderir ama başkalarınınkini görmez.

## Deneyin

1. Bir belge açın — Word ve Excel dosyaları doğrudan portaldaki görüntüleyicide açılır.
2. Herkese açık bağlantılarını ve izinlerini görmek için bir klasörde «Paylaş»a basın.
3. Bilgisayarınızdan herhangi bir klasöre bir dosya sürükleyin.
`,
  zh: `# 演示：项目文档

这是一个演示空间。它由“填充演示数据”创建，“删除演示数据”会将其连同其中的所有文件一并删除。

## 这里有什么

- **01 合同**——与“示例”有限责任公司的供货合同（Word）和对账单（PDF）。
- **02 预算与概算**——“北区”工程概算和项目预算（Excel）。
- **03 工地照片**——按阶段拍摄的施工照片。该文件夹有一个仅供查看的公开链接。
- **04 承包商来件**——仅可上传的公开链接：承包商可以发送文件，但看不到他人的文件。

## 试一试

1. 打开一个文档——Word 和 Excel 文件可直接在门户的查看器中打开。
2. 在文件夹上点击“共享”，查看其公开链接及权限。
3. 从电脑将文件拖入任意文件夹。
`,
};

/** The folders and files. `who` is a demo colleague (the author), `daysAgo` backdates the change. */
const TREE = [
  {
    folder: T('01 Договоры', '01 Contracts', '01 Келишимдер', '01 Sözleşmeler', '01 合同'),
    files: [
      {
        name: T('Договор поставки — ООО «Пример».docx', 'Supply contract — Example LLC.docx', 'Жеткирүү келишими — «Мисал» ЖЧК.docx', 'Tedarik sözleşmesi — Örnek Ltd. Şti..docx', '供货合同 — “示例”有限责任公司.docx'),
        who: 'director',
        daysAgo: 12,
        make: (t) =>
          simpleDocx(t(T('Договор поставки № 15/26', 'Supply contract No. 15/26', '№ 15/26 жеткирүү келишими', '15/26 numaralı tedarik sözleşmesi', '供货合同 第 15/26 号')), [
            t(T('г. Пример', 'Example City', 'Мисал ш.', 'Örnek Şehir', '示例市')),
            t(T('ООО «Пример» (Поставщик) и Заказчик заключили настоящий договор о поставке строительных материалов на объект «Северный квартал».', 'Example LLC (the Supplier) and the Customer sign this contract for the supply of building materials to the «North Quarter» site.', '«Мисал» ЖЧК (Жеткирүүчү) жана Заказчик «Түндүк квартал» объектисине курулуш материалдарын жеткирүү боюнча ушул келишимди түзүштү.', 'Örnek Ltd. Şti. (Tedarikçi) ve Müşteri, «Kuzey Mahallesi» şantiyesine yapı malzemesi tedariki için bu sözleşmeyi imzalar.', '“示例”有限责任公司（供方）与需方就向“北区”工地供应建筑材料签订本合同。')),
            t(T('1. Предмет договора: поставка арматуры, бетона и кирпича по спецификации.', '1. Subject: supply of rebar, concrete and bricks per the specification.', '1. Келишимдин предмети: спецификация боюнча арматура, бетон жана кирпич жеткирүү.', '1. Konu: şartnameye göre inşaat demiri, beton ve tuğla tedariki.', '1. 合同标的：按规格书供应钢筋、混凝土和砖。')),
            t(T('2. Срок поставки: 30 календарных дней со дня оплаты.', '2. Delivery: within 30 calendar days of payment.', '2. Жеткирүү мөөнөтү: төлөгөн күндөн тартып 30 календардык күндүн ичинде.', '2. Teslimat: ödemeden itibaren 30 takvim günü içinde.', '2. 交货期限：付款之日起 30 个日历日内。')),
            t(T('Демо-документ. Удаляется кнопкой «Удалить демо-данные».', 'A demo document. «Remove demo data» deletes it.', 'Демо документ. «Демо маалыматтарды өчүрүү» баскычы аны өчүрөт.', 'Bir demo belge. «Demo verilerini kaldır» onu siler.', '演示文档。“删除演示数据”会将其删除。')),
          ]),
      },
      {
        name: T('Акт сверки — 3 квартал.pdf', 'Reconciliation statement — Q3.pdf', 'Салыштыруу акты — 3-чейрек.pdf', 'Mutabakat tutanağı — 3. çeyrek.pdf', '对账单 — 第三季度.pdf'),
        who: 'finance',
        daysAgo: 5,
        make: () => simplePdf(['Reconciliation statement - Q3', 'Example LLC / Demo customer', '', 'Opening balance: 0.00', 'Invoices: 48 500.00', 'Payments: 48 500.00', 'Closing balance: 0.00', '', 'Demo document.']),
      },
    ],
  },
  {
    folder: T('02 Сметы и бюджеты', '02 Estimates and budgets', '02 Сметалар жана бюджеттер', '02 Keşifler ve bütçeler', '02 概算与预算'),
    files: [
      {
        name: T('Смета — Северный квартал.xlsx', 'Estimate — North Quarter.xlsx', 'Смета — Түндүк квартал.xlsx', 'Keşif — Kuzey Mahallesi.xlsx', '概算 — 北区.xlsx'),
        who: 'foreman',
        daysAgo: 3,
        make: (t) =>
          simpleXlsx(t(T('Смета', 'Estimate', 'Эсептөө', 'Fiyat hesaplama', '报价测算')), [
            [t(T('Работа', 'Work', 'Иш', 'İş', '工程项目')), t(T('Ед.', 'Unit', 'Бирд.', 'Birim', '单位')), t(T('Кол-во', 'Qty', 'Саны', 'Miktar', '数量')), t(T('Цена', 'Price', 'Баасы', 'Fiyat', '价格')), t(T('Сумма', 'Total', 'Сумма', 'Tutar', '金额'))],
            [t(T('Фундамент', 'Foundation', 'Пайдубал', 'Temel', '基础')), 'м³', 120, 95, 11400],
            [t(T('Кладка стен', 'Brickwork', 'Дубал тургузуу', 'Duvar örme', '砌墙')), 'м²', 640, 28, 17920],
            [t(T('Кровля', 'Roofing', 'Чатыр', 'Çatı', '屋面')), 'м²', 310, 34, 10540],
            [t(T('Окна', 'Windows', 'Терезелер', 'Pencereler', '窗户')), t(T('шт', 'pcs', 'даана', 'adet', '个')), 48, 210, 10080],
            [t(T('Итого', 'Total', 'Сумма', 'Tutar', '金额')), '', '', '', 49940],
          ]),
      },
      {
        name: T('Бюджет проекта 2026.xlsx', 'Project budget 2026.xlsx', 'Долбоордун бюджети 2026.xlsx', 'Proje bütçesi 2026.xlsx', '项目预算 2026.xlsx'),
        who: 'finance',
        daysAgo: 9,
        make: (t) =>
          simpleXlsx(t(T('Бюджет', 'Budget', 'Бюджет', 'Bütçe', '预算')), [
            [t(T('Статья', 'Item', 'Берене', 'Kalem', '科目')), t(T('План', 'Plan', 'План', 'Plan', '计划')), t(T('Факт', 'Actual', 'Факт', 'Gerçekleşen', '实际'))],
            [t(T('Материалы', 'Materials', 'Материалдар', 'Malzemeler', '材料')), 180000, 126500],
            [t(T('Работы подрядчиков', 'Contractors', 'Подрядчиктердин иштери', 'Yükleniciler', '承包商工程')), 240000, 151000],
            [t(T('Техника', 'Machinery', 'Техника', 'Makine', '机械')), 60000, 41800],
            [t(T('Прочее', 'Other', 'Башка', 'Diğer', '其他')), 20000, 7300],
          ]),
      },
    ],
  },
  {
    folder: T('03 Фото объекта', '03 Site photos', '03 Объекттин сүрөттөрү', '03 Şantiye fotoğrafları', '03 工地照片'),
    viewLink: true,
    files: [
      { name: T('Котлован и фундамент.png', 'Pit and foundation.png', 'Казаң жана пайдубал.png', 'Kazı ve temel.png', '基坑与基础.png'), who: 'foreman', daysAgo: 40, make: () => sitePhoto({ progress: 0.08, seed: 1 }) },
      { name: T('Кладка — 2 этаж.png', 'Brickwork — 2nd floor.png', 'Дубал — 2-кабат.png', 'Duvar — 2. kat.png', '砌墙 — 二层.png'), who: 'foreman', daysAgo: 18, make: () => sitePhoto({ progress: 0.5, seed: 2 }) },
      { name: T('Кровля готова.png', 'Roof done.png', 'Чатыр даяр.png', 'Çatı bitti.png', '屋面完工.png'), who: 'north', daysAgo: 2, make: () => sitePhoto({ progress: 0.95, seed: 3, wall: '#B4875C' }) },
    ],
  },
  { folder: T('04 Входящие от подрядчиков', '04 Incoming from contractors', '04 Подрядчиктерден келгендер', '04 Yüklenicilerden gelenler', '04 承包商来件'), dropBox: true, files: [] },
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
    ky: '«Демо: долбоордун документтери» жалпы мейкиндиги: келишим (Word), смета жана бюджет (Excel), акт (PDF), объекттин сүрөттөрү жана README бар папкалар; сүрөттөргө ачык шилтеме жана подрядчиктер үчүн «жүктөө гана» шилтемеси.',
    tr: 'Paylaşılan bir «Demo: proje belgeleri» alanı: sözleşme (Word), keşif ve bütçe (Excel), tutanak (PDF), şantiye fotoğrafları ve README içeren klasörler; fotoğraflar için herkese açık bir bağlantı ve yükleniciler için yalnızca yükleme bağlantısı.',
    zh: '共享空间“演示：项目文档”：包含合同（Word）、概算和预算（Excel）、对账单（PDF）、工地照片和 README 的文件夹；照片的公开链接和供承包商使用的仅上传链接。',
  },
  async seed(ctx) {
    const fs = contextFromRequest(ctx.request, 'files.admin');
    const settings = await filesSettings();
    const people = await demoColleagues(ctx, ['director', 'finance', 'north', 'foreman']);
    const space = await createSpace(
      fs,
      {
        name: ctx.t(T('Демо: проектные документы', 'Demo: project documents', 'Демо: долбоордун документтери', 'Demo: proje belgeleri', '演示：项目文档')),
        description: ctx.t(T('Документы объекта «Северный квартал». Демо-данные: удаляются кнопкой «Удалить демо-данные».', 'Documents of the «North Quarter» site. Demo data: «Remove demo data» deletes them.', '«Түндүк квартал» объектинин документтери. Демо маалыматтар: «Демо маалыматтарды өчүрүү» баскычы аларды өчүрөт.', '«Kuzey Mahallesi» şantiyesinin belgeleri. Demo verileri: «Demo verilerini kaldır» bunları siler.', '“北区”工地的文档。演示数据：“删除演示数据”会将其删除。')),
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
        await tryLink(fs, ctx, folderId, { permissions: ['view', 'download'], title: ctx.t(T('Фото для заказчика', 'Photos for the client', 'Заказчик үчүн сүрөттөр', 'Müşteri için fotoğraflar', '给客户的照片')) });
      }
      if (entry.dropBox) {
        await tryLink(fs, ctx, folderId, {
          permissions: ['upload'],
          title: ctx.t(T('Загрузка документов подрядчиками', 'Contractor uploads', 'Подрядчиктердин документ жүктөөсү', 'Yüklenici yüklemeleri', '承包商上传文件')),
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
