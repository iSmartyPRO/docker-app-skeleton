import { registerDemo } from '../../services/demo.js';
import { saveCategory, saveItem } from './service.js';

/*
 * Demo data of Online resources (pattern: modules/tasks/demo.js): three
 * categories and a dozen tiles — neutral example.com services, two portal
 * modules and a public tile visible on the sign-in-free home page — with
 * portal icons and letter tiles, titles in both languages. Rows go through
 * the module's own save (validation, sort order); a plain DELETE removes
 * them (demo tiles use no uploaded icon files).
 */

const T = (ru, en) => ({ ru, en });

const CATEGORIES = [
  { key: 'work', name: T('Работа', 'Work'), color: '#6366F1' },
  { key: 'docs', name: T('Документы и справка', 'Documents and help'), color: '#10B981' },
  { key: 'office', name: T('Офис', 'Office'), color: '#F59E0B' },
];

const menu = (name, color, color2 = null) => ({ type: 'menu', name, style: 'gradient', color, color2 });
const letter = (text, color, style = 'soft') => ({ type: 'letter', text, style, color });

const ITEMS = [
  { cat: 'work', title: T('Почта', 'Mail'), url: 'https://mail.example.com', description: T('Корпоративная почта', 'Company e-mail'), icon: menu('mail', '#2563EB', '#7C3AED') },
  { cat: 'work', title: T('Видеовстречи', 'Video meetings'), url: 'https://meet.example.com', description: T('Комнаты для созвонов', 'Rooms for calls'), icon: menu('chat', '#0EA5E9', '#22D3EE') },
  { cat: 'work', title: T('Бухгалтерия', 'Accounting'), url: 'https://accounting.example.com', description: T('Учёт и отчётность', 'Bookkeeping and reports'), icon: menu('chart', '#16A34A', '#4ADE80') },
  { cat: 'work', kind: 'module', module: 'tasks', icon: menu('project', '#F97316', '#FBBF24') },
  { cat: 'work', kind: 'module', module: 'files', icon: menu('file', '#0284C7', '#38BDF8') },
  { cat: 'docs', title: T('Шаблоны документов', 'Document templates'), url: 'https://docs.example.com/templates', description: T('Бланки, письма, доверенности', 'Forms, letters, powers of attorney'), icon: letter('Ш', '#10B981') },
  { cat: 'docs', title: T('Справочник ГОСТ и СНиП', 'Building codes'), url: 'https://example.org/codes', description: T('Нормы и правила строительства', 'Construction norms and rules'), icon: letter('Н', '#059669', 'solid') },
  { cat: 'docs', title: T('Сайт компании', 'Company website'), url: 'https://www.example.com', description: T('Публичный сайт ООО «Пример»', 'The public website of Example LLC'), icon: menu('globe', '#334155', '#64748B'), visibility: 'public' },
  { cat: 'office', title: T('Заказ пропусков', 'Visitor passes'), url: 'https://pass.example.com', description: T('Пропуск для гостя на завтра', 'A pass for a guest tomorrow'), icon: menu('key', '#D97706', '#FBBF24') },
  { cat: 'office', title: T('Бронь переговорных', 'Meeting rooms'), url: 'https://rooms.example.com', description: T('Свободные переговорные на сегодня', 'Free meeting rooms today'), icon: menu('calendar', '#DB2777', '#F472B6') },
  { cat: 'office', title: T('Служба поддержки', 'IT help desk'), url: 'mailto:help@example.com', description: T('Написать в ИТ-отдел', 'Write to IT'), icon: menu('server', '#475569', '#94A3B8'), target: 'self' },
];

registerDemo({
  module: 'resources',
  describe: {
    ru: 'Три категории и 11 плиток: сервисы на example.com, разделы портала («Задачи», «Файлы») и публичная плитка сайта компании.',
    en: 'Three categories and 11 tiles: example.com services, portal sections (Tasks, Files) and a public company website tile.',
  },
  async seed(ctx) {
    const req = ctx.request;
    const categories = {};
    for (const def of CATEGORIES) {
      const category = await saveCategory({ name: ctx.t(def.name), color: def.color, i18n: { ru: def.name.ru, en: def.name.en } });
      categories[def.key] = category.id;
      await ctx.track('res_categories', category.id);
    }
    for (const def of ITEMS) {
      const i18n = def.title ? { ru: { title: def.title.ru, description: def.description?.ru }, en: { title: def.title.en, description: def.description?.en } } : {};
      const item = await saveItem(
        { userId: req?.user?.id || ctx.userId },
        {
          kind: def.kind || 'link',
          module: def.module,
          title: def.title ? ctx.t(def.title) : '',
          url: def.url,
          description: def.description ? ctx.t(def.description) : '',
          i18n,
          categoryId: categories[def.cat],
          icon: def.icon,
          target: def.target,
          visibility: def.visibility || 'signed',
          active: true,
        }
      );
      await ctx.track('res_items', item.id);
    }
  },
});
