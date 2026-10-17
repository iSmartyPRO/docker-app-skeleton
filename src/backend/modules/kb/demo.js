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
  title: { ru: 'Охрана труда на объекте', en: 'Site safety rules', ky: 'Объекттеги эмгекти коргоо', tr: 'Şantiyede iş güvenliği', zh: '工地安全规定' },
  description: { ru: 'Визуальная статья: картинка, таблица и чек-лист', en: 'A visual article: a picture, a table and a checklist', ky: 'Визуалдык макала: сүрөт, таблица жана текшерүү тизмеси', tr: 'Görsel bir makale: bir resim, bir tablo ve bir kontrol listesi', zh: '可视化文章：图片、表格和检查清单' },
  caption: { ru: 'Объект «Северный квартал»: идёт кладка стен', en: '«North Quarter» site: brickwork in progress', ky: '«Түндүк квартал» объектиси: дубалдар тургузулууда', tr: '«Kuzey Mahallesi» şantiyesi: duvar örme devam ediyor', zh: '“北区”工地：正在砌墙' },
  content: {
    ru: (figure) => `<h2>Перед входом на объект</h2><p>Каждый, кто приходит на объект «Северный квартал», проходит <strong>вводный инструктаж</strong> у прораба и получает средства защиты.</p>${figure}<h2>Средства защиты</h2><table><tbody><tr><th><p>Что</p></th><th><p>Когда</p></th></tr><tr><td><p>Каска</p></td><td><p>Всегда на территории</p></td></tr><tr><td><p>Сигнальный жилет</p></td><td><p>Всегда на территории</p></td></tr><tr><td><p>Страховочная привязь</p></td><td><p>Работы на высоте от 1,8 м</p></td></tr></tbody></table><h2>Чек-лист прораба</h2><ul><li><p>Ограждение зоны работ на месте</p></li><li><p>Аптечка и огнетушитель доступны</p></li><li><p>Журнал инструктажей заполнен</p></li></ul><blockquote><p>Это демо-статья. Её удалит кнопка «Удалить демо-данные».</p></blockquote>`,
    en: (figure) => `<h2>Before entering the site</h2><p>Everyone who comes to the «North Quarter» site gets a <strong>safety briefing</strong> from the foreman and protective equipment.</p>${figure}<h2>Protective equipment</h2><table><tbody><tr><th><p>What</p></th><th><p>When</p></th></tr><tr><td><p>Hard hat</p></td><td><p>Always on site</p></td></tr><tr><td><p>High-visibility vest</p></td><td><p>Always on site</p></td></tr><tr><td><p>Safety harness</p></td><td><p>Work at height from 1.8 m</p></td></tr></tbody></table><h2>Foreman’s checklist</h2><ul><li><p>The work area is fenced</p></li><li><p>First-aid kit and extinguisher at hand</p></li><li><p>The briefing log is filled in</p></li></ul><blockquote><p>This is a demo article. «Remove demo data» deletes it.</p></blockquote>`,
    ky: (figure) => `<h2>Объектке кирээр алдында</h2><p>«Түндүк квартал» объектисине келген ар бир адам прорабдан <strong>киришүү нускамасын</strong> угуп, коргонуу каражаттарын алат.</p>${figure}<h2>Коргонуу каражаттары</h2><table><tbody><tr><th><p>Эмне</p></th><th><p>Качан</p></th></tr><tr><td><p>Каска</p></td><td><p>Аймакта дайыма</p></td></tr><tr><td><p>Сигналдык жилет</p></td><td><p>Аймакта дайыма</p></td></tr><tr><td><p>Сактоочу кур</p></td><td><p>1,8 мден жогору бийиктикте иштөөдө</p></td></tr></tbody></table><h2>Прорабдын текшерүү тизмеси</h2><ul><li><p>Иш аймагы тосулган</p></li><li><p>Дары кутусу жана өрт өчүргүч жеткиликтүү</p></li><li><p>Нускамалар журналы толтурулган</p></li></ul><blockquote><p>Бул демо макала. Аны «Демо маалыматтарды өчүрүү» баскычы өчүрөт.</p></blockquote>`,
    tr: (figure) => `<h2>Şantiyeye girmeden önce</h2><p>«Kuzey Mahallesi» şantiyesine gelen herkes şantiye şefinden <strong>iş güvenliği eğitimi</strong> alır ve koruyucu donanım teslim alır.</p>${figure}<h2>Koruyucu donanım</h2><table><tbody><tr><th><p>Ne</p></th><th><p>Ne zaman</p></th></tr><tr><td><p>Baret</p></td><td><p>Sahada her zaman</p></td></tr><tr><td><p>Reflektörlü yelek</p></td><td><p>Sahada her zaman</p></td></tr><tr><td><p>Emniyet kemeri</p></td><td><p>1,8 m ve üzeri yüksekte çalışma</p></td></tr></tbody></table><h2>Şantiye şefinin kontrol listesi</h2><ul><li><p>Çalışma alanı çevrilmiş</p></li><li><p>İlk yardım çantası ve yangın söndürücü el altında</p></li><li><p>Eğitim defteri doldurulmuş</p></li></ul><blockquote><p>Bu bir demo makaledir. «Demo verilerini kaldır» onu siler.</p></blockquote>`,
    zh: (figure) => `<h2>进入工地之前</h2><p>每位进入“北区”工地的人员都要接受工长的<strong>安全交底</strong>，并领取防护用品。</p>${figure}<h2>防护用品</h2><table><tbody><tr><th><p>用品</p></th><th><p>何时使用</p></th></tr><tr><td><p>安全帽</p></td><td><p>在工地内始终佩戴</p></td></tr><tr><td><p>反光背心</p></td><td><p>在工地内始终穿着</p></td></tr><tr><td><p>安全带</p></td><td><p>1.8 米及以上高空作业</p></td></tr></tbody></table><h2>工长检查清单</h2><ul><li><p>作业区域已围挡</p></li><li><p>急救箱和灭火器随手可取</p></li><li><p>安全交底记录已填写</p></li></ul><blockquote><p>这是一篇演示文章。“删除演示数据”会将其删除。</p></blockquote>`,
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
    [ctx.t({ ru: 'Демо — кладка стен.png', en: 'Demo — brickwork.png', ky: 'Демо — дубал тургузуу.png', tr: 'Demo — duvar örme.png', zh: '演示 — 砌墙.png' }), folder.id, ctx.userId, blob.key, blob.size]
  );
  await ctx.track('fs_nodes', rows[0].id);
  return rows[0].id;
}

const ARTICLES = [
  {
    title: { ru: 'Как оформить командировку', en: 'How to arrange a business trip', ky: 'Иш сапарын кантип тариздөө керек', tr: 'İş seyahati nasıl düzenlenir', zh: '如何办理出差' },
    description: { ru: 'Пошаговая инструкция для сотрудников', en: 'Step-by-step guide for employees', ky: 'Кызматкерлер үчүн кадам-кадам нускама', tr: 'Çalışanlar için adım adım kılavuz', zh: '员工分步指南' },
    content: {
      ru: '## Шаги\n\n1. Согласуйте поездку с руководителем.\n2. Создайте задачу «Командировка» с датами и целью.\n3. Приложите билеты и бронь гостиницы.\n4. После поездки сдайте отчёт и чеки в течение 3 рабочих дней.\n\n> Это демо-статья. Её удалит кнопка «Удалить демо-данные».',
      en: '## Steps\n\n1. Agree the trip with your manager.\n2. Create a «Business trip» task with the dates and purpose.\n3. Attach the tickets and hotel booking.\n4. Hand in the report and receipts within 3 working days.\n\n> This is a demo article. «Remove demo data» deletes it.',
      ky: '## Кадамдар\n\n1. Сапарды жетекчиңиз менен макулдашыңыз.\n2. Датасы жана максаты көрсөтүлгөн «Иш сапары» тапшырмасын түзүңүз.\n3. Билеттерди жана мейманкананын броңун тиркеңиз.\n4. Сапардан кийин 3 жумуш күнүнүн ичинде отчетту жана чектерди тапшырыңыз.\n\n> Бул демо макала. Аны «Демо маалыматтарды өчүрүү» баскычы өчүрөт.',
      tr: '## Adımlar\n\n1. Seyahati yöneticinizle onaylatın.\n2. Tarihleri ve amacı içeren bir «İş seyahati» görevi oluşturun.\n3. Biletleri ve otel rezervasyonunu ekleyin.\n4. Raporu ve fişleri 3 iş günü içinde teslim edin.\n\n> Bu bir demo makaledir. «Demo verilerini kaldır» onu siler.',
      zh: '## 步骤\n\n1. 与您的上级确认出差安排。\n2. 创建一个“出差”任务，填写日期和目的。\n3. 附上机票和酒店预订。\n4. 在 3 个工作日内提交报告和票据。\n\n> 这是一篇演示文章。“删除演示数据”会将其删除。',
    },
  },
  {
    title: { ru: 'Правила работы с документами', en: 'Document handling rules', ky: 'Документтер менен иштөө эрежелери', tr: 'Belge işleme kuralları', zh: '文档管理规定' },
    description: { ru: 'Где хранить, как называть, кто согласует', en: 'Where to keep, how to name, who approves', ky: 'Кайда сактоо, кантип атоо, ким макулдашат', tr: 'Nerede saklanır, nasıl adlandırılır, kim onaylar', zh: '存放位置、命名方式、审批人' },
    content: {
      ru: '## Хранение\n\nРабочие документы храните в общем пространстве отдела, а не в личных файлах.\n\n## Названия\n\nФормат: `ГГГГ-ММ-ДД Тема — версия`, например `2026-03-01 Договор ООО «Пример» — v2`.\n\n## Согласование\n\nДоговоры и счета проходят маршрут согласования в портале.',
      en: '## Storage\n\nKeep working documents in the department’s shared space, not in personal files.\n\n## Names\n\nFormat: `YYYY-MM-DD Subject — version`, e.g. `2026-03-01 Example LLC contract — v2`.\n\n## Approval\n\nContracts and invoices go through an approval route in the portal.',
      ky: '## Сактоо\n\nЖумушчу документтерди жеке файлдарда эмес, бөлүмдүн жалпы мейкиндигинде сактаңыз.\n\n## Аталыштар\n\nФормат: `ЖЖЖЖ-АА-КК Тема — версия`, мисалы `2026-03-01 «Мисал» ЖЧК келишими — v2`.\n\n## Макулдашуу\n\nКелишимдер жана эсеп-дүмүрчөктөр порталда макулдашуу маршрутунан өтөт.',
      tr: '## Saklama\n\nÇalışma belgelerini kişisel dosyalarda değil, departmanın paylaşılan alanında saklayın.\n\n## Adlar\n\nBiçim: `YYYY-AA-GG Konu — sürüm`, örneğin `2026-03-01 Örnek Ltd. Şti. sözleşmesi — v2`.\n\n## Onay\n\nSözleşmeler ve faturalar portalda bir onay akışından geçer.',
      zh: '## 存放\n\n工作文档请存放在部门的共享空间，而不是个人文件中。\n\n## 命名\n\n格式：`YYYY-MM-DD 主题 — 版本`，例如 `2026-03-01 “示例”有限责任公司合同 — v2`。\n\n## 审批\n\n合同和发票在门户中走审批流程。',
    },
  },
  {
    title: { ru: 'Первый день в компании', en: 'Your first day', ky: 'Компаниядагы биринчи күнүңүз', tr: 'İlk gününüz', zh: '入职第一天' },
    description: { ru: 'Что сделать новому сотруднику', en: 'What a new employee should do', ky: 'Жаңы кызматкер эмне кылышы керек', tr: 'Yeni bir çalışanın yapması gerekenler', zh: '新员工需要做什么' },
    content: {
      ru: '- Войдите в портал и заполните профиль.\n- Пройдите тур по порталу.\n- Подпишитесь на чат своего отдела.\n- Прочитайте раздел «Правила работы с документами».',
      en: '- Sign in to the portal and fill in your profile.\n- Take the portal tour.\n- Join your department’s chat.\n- Read «Document handling rules».',
      ky: '- Порталга кирип, профилиңизди толтуруңуз.\n- Портал боюнча турдан өтүңүз.\n- Бөлүмүңүздүн чатына кошулуңуз.\n- «Документтер менен иштөө эрежелери» бөлүмүн окуңуз.',
      tr: '- Portalda oturum açın ve profilinizi doldurun.\n- Portal turunu tamamlayın.\n- Departmanınızın sohbetine katılın.\n- «Belge işleme kuralları»nı okuyun.',
      zh: '- 登录门户并完善个人资料。\n- 完成门户导览。\n- 加入您所在部门的聊天。\n- 阅读“文档管理规定”。',
    },
  },
];

registerDemo({
  module: 'kb',
  describe: {
    ru: 'Папка «Демо: регламенты» с тремя статьями-инструкциями.',
    en: 'A «Demo: rules» folder with three how-to articles.',
    ky: 'Үч нускама-макаласы бар «Демо: регламенттер» папкасы.',
    tr: 'Üç nasıl yapılır makalesi içeren bir «Demo: kurallar» klasörü.',
    zh: '“演示：规章制度”文件夹，内含三篇操作指南文章。',
  },
  async seed(ctx) {
    const kb = contextFromRequest(ctx.request);
    const folderId = await createFolder(kb, {
      name: ctx.t({ ru: 'Демо: регламенты', en: 'Demo: rules', ky: 'Демо: регламенттер', tr: 'Demo: kurallar', zh: '演示：规章制度' }),
      description: ctx.t({ ru: 'Пример раздела базы знаний', en: 'A sample knowledge base section', ky: 'Билим базасынын бөлүмүнүн мисалы', tr: 'Örnek bir bilgi bankası bölümü', zh: '知识库栏目示例' }),
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
    const visual = await createItem(kb, { folderId, kind: 'article', title: ctx.t(VISUAL.title), description: ctx.t(VISUAL.description), content: ctx.t(VISUAL.content)(figure), format: 'html' });
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
