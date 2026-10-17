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

const LANGS = ['ru', 'en', 'ky', 'tr', 'zh'];
const T = (ru, en, ky, tr, zh) => ({ ru, en, ky, tr, zh });

const CATEGORIES = [
  { key: 'work', name: T('Работа', 'Work', 'Иш', 'İş', '工作'), color: '#6366F1' },
  { key: 'docs', name: T('Документы и справка', 'Documents and help', 'Документтер жана маалымкат', 'Belgeler ve yardım', '文档与帮助'), color: '#10B981' },
  { key: 'office', name: T('Офис', 'Office', 'Кеңсе', 'Ofis', '办公室'), color: '#F59E0B' },
];

const menu = (name, color, color2 = null) => ({ type: 'menu', name, style: 'gradient', color, color2 });
const letter = (text, color, style = 'soft') => ({ type: 'letter', text, style, color });

const ITEMS = [
  { cat: 'work', title: T('Почта', 'Mail', 'Почта', 'E-posta', '邮件'), url: 'https://mail.example.com', description: T('Корпоративная почта', 'Company e-mail', 'Корпоративдик почта', 'Kurumsal e-posta', '企业邮箱'), icon: menu('mail', '#2563EB', '#7C3AED') },
  { cat: 'work', title: T('Видеовстречи', 'Video meetings', 'Видеожолугушуулар', 'Görüntülü toplantılar', '视频会议'), url: 'https://meet.example.com', description: T('Комнаты для созвонов', 'Rooms for calls', 'Чалуулар үчүн бөлмөлөр', 'Görüşme odaları', '通话会议室'), icon: menu('chat', '#0EA5E9', '#22D3EE') },
  { cat: 'work', title: T('Бухгалтерия', 'Accounting', 'Бухгалтерия', 'Muhasebe', '财务'), url: 'https://accounting.example.com', description: T('Учёт и отчётность', 'Bookkeeping and reports', 'Эсеп жана отчеттуулук', 'Muhasebe ve raporlar', '记账与报表'), icon: menu('chart', '#16A34A', '#4ADE80') },
  { cat: 'work', kind: 'module', module: 'tasks', icon: menu('project', '#F97316', '#FBBF24') },
  { cat: 'work', kind: 'module', module: 'files', icon: menu('file', '#0284C7', '#38BDF8') },
  { cat: 'docs', title: T('Шаблоны документов', 'Document templates', 'Документтердин үлгүлөрү', 'Belge şablonları', '文档模板'), url: 'https://docs.example.com/templates', description: T('Бланки, письма, доверенности', 'Forms, letters, powers of attorney', 'Бланктар, каттар, ишеним каттары', 'Formlar, yazılar, vekâletnameler', '表格、信函、授权书'), icon: letter('Ш', '#10B981') },
  { cat: 'docs', title: T('Справочник ГОСТ и СНиП', 'Building codes', 'Курулуш ченемдери', 'Yapı yönetmelikleri', '建筑规范'), url: 'https://example.org/codes', description: T('Нормы и правила строительства', 'Construction norms and rules', 'Курулуштун ченемдери жана эрежелери', 'İnşaat norm ve kuralları', '施工标准与规范'), icon: letter('Н', '#059669', 'solid') },
  { cat: 'docs', title: T('Сайт компании', 'Company website', 'Компаниянын сайты', 'Şirket web sitesi', '公司网站'), url: 'https://www.example.com', description: T('Публичный сайт ООО «Пример»', 'The public website of Example LLC', '«Мисал» ЖЧКнын ачык сайты', 'Örnek Ltd. Şti.\'nin herkese açık web sitesi', '“示例”有限责任公司官网'), icon: menu('globe', '#334155', '#64748B'), visibility: 'public' },
  { cat: 'office', title: T('Заказ пропусков', 'Visitor passes', 'Өткөрмө буйрутма кылуу', 'Ziyaretçi kartları', '访客通行证'), url: 'https://pass.example.com', description: T('Пропуск для гостя на завтра', 'A pass for a guest tomorrow', 'Эртеңкиге конок үчүн өткөрмө', 'Yarın için bir misafir kartı', '为明天的访客办理通行证'), icon: menu('key', '#D97706', '#FBBF24') },
  { cat: 'office', title: T('Бронь переговорных', 'Meeting rooms', 'Сүйлөшүү бөлмөлөрүн брондоо', 'Toplantı odaları', '会议室预订'), url: 'https://rooms.example.com', description: T('Свободные переговорные на сегодня', 'Free meeting rooms today', 'Бүгүнкү бош сүйлөшүү бөлмөлөрү', 'Bugün boş toplantı odaları', '今日空闲会议室'), icon: menu('calendar', '#DB2777', '#F472B6') },
  { cat: 'office', title: T('Служба поддержки', 'IT help desk', 'IT колдоо кызматы', 'BT yardım masası', 'IT 服务台'), url: 'mailto:help@example.com', description: T('Написать в ИТ-отдел', 'Write to IT', 'IT бөлүмүнө жазуу', 'BT\'ye yazın', '联系 IT 部门'), icon: menu('server', '#475569', '#94A3B8'), target: 'self' },
];

registerDemo({
  module: 'resources',
  describe: {
    ru: 'Три категории и 11 плиток: сервисы на example.com, разделы портала («Задачи», «Файлы») и публичная плитка сайта компании.',
    en: 'Three categories and 11 tiles: example.com services, portal sections (Tasks, Files) and a public company website tile.',
    ky: 'Үч категория жана 11 плитка: example.com сервистери, портал бөлүмдөрү («Тапшырмалар», «Файлдар») жана компания сайтынын ачык плиткасы.',
    tr: 'Üç kategori ve 11 kutucuk: example.com hizmetleri, portal bölümleri (Görevler, Dosyalar) ve herkese açık bir şirket web sitesi kutucuğu.',
    zh: '三个类别和 11 个磁贴：example.com 服务、门户栏目（任务、文件）以及一个公开的公司网站磁贴。',
  },
  async seed(ctx) {
    const req = ctx.request;
    const categories = {};
    for (const def of CATEGORIES) {
      const category = await saveCategory({ name: ctx.t(def.name), color: def.color, i18n: Object.fromEntries(LANGS.filter((lang) => def.name[lang]).map((lang) => [lang, def.name[lang]])) });
      categories[def.key] = category.id;
      await ctx.track('res_categories', category.id);
    }
    for (const def of ITEMS) {
      const i18n = def.title ? Object.fromEntries(LANGS.filter((lang) => def.title[lang]).map((lang) => [lang, { title: def.title[lang], description: def.description?.[lang] }])) : {};
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
