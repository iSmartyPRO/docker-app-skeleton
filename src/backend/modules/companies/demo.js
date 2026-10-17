import { registerDemo } from '../../services/demo.js';
import { companiesContext, companiesSettings, createCompany, createPerson, deleteCompany, deletePerson } from './service.js';

/*
 * Demo data of Counterparties: neutral companies and contacts (pattern:
 * modules/tasks/demo.js). The purge goes through the module's own delete so
 * the timeline, ratings and files of a card go too.
 */

const COMPANIES = [
  { key: 'example', name: { ru: 'ООО «Пример»', en: 'Example LLC', ky: '«Мисал» ЖЧК', tr: 'Örnek Ltd. Şti.', zh: '“示例”有限责任公司' }, relations: ['client'], site: 'example.com', activity: { ru: 'Оптовая торговля', en: 'Wholesale trade', ky: 'Дүң соода', tr: 'Toptan ticaret', zh: '批发贸易' } },
  { key: 'sample', name: { ru: 'АО «Образец»', en: 'Sample JSC', ky: '«Үлгү» АК', tr: 'Numune A.Ş.', zh: '“样本”股份公司' }, relations: ['supplier'], site: 'sample.example.com', activity: { ru: 'Производство строительных материалов', en: 'Building materials', ky: 'Курулуш материалдарын өндүрүү', tr: 'Yapı malzemeleri', zh: '建筑材料生产' } },
  { key: 'partner', name: { ru: 'ООО «Компания-Партнёр»', en: 'Partner Company LLC', ky: '«Өнөктөш компания» ЖЧК', tr: 'Ortak Şirket Ltd. Şti.', zh: '“合作伙伴”有限责任公司' }, relations: ['partner'], site: 'partner.example.com', activity: { ru: 'Инженерные услуги', en: 'Engineering services', ky: 'Инженердик кызматтар', tr: 'Mühendislik hizmetleri', zh: '工程技术服务' } },
  { key: 'prospect', name: { ru: 'ИП Тестов', en: 'Test Sole Trader', ky: 'Тестов ЖИ', tr: 'Test Şahıs İşletmesi', zh: '测试个体工商户' }, relations: ['prospect'], site: null, activity: { ru: 'Розничная торговля', en: 'Retail', ky: 'Чекене соода', tr: 'Perakende', zh: '零售' } },
];

const PEOPLE = [
  { first: { ru: 'Ирина', en: 'Irene', ky: 'Ирина' }, last: { ru: 'Примерова', en: 'Example', ky: 'Примерова' }, company: 'example', title: { ru: 'Директор по закупкам', en: 'Purchasing director', ky: 'Сатып алуулар боюнча директор', tr: 'Satın alma direktörü', zh: '采购总监' } },
  { first: { ru: 'Олег', en: 'Oleg', ky: 'Олег' }, last: { ru: 'Образцов', en: 'Sample', ky: 'Образцов' }, company: 'sample', title: { ru: 'Менеджер по продажам', en: 'Sales manager', ky: 'Сатуу менеджери', tr: 'Satış temsilcisi', zh: '销售代表' } },
  { first: { ru: 'Елена', en: 'Helen', ky: 'Елена' }, last: { ru: 'Партнёрова', en: 'Partner', ky: 'Партнёрова' }, company: 'partner', title: { ru: 'Главный инженер', en: 'Chief engineer', ky: 'Башкы инженер', tr: 'Baş mühendis', zh: '总工程师' } },
];

registerDemo({
  module: 'companies',
  describe: {
    ru: 'Четыре компании («ООО «Пример»» и другие) с контактами и ролями: клиент, поставщик, партнёр.',
    en: 'Four companies (Example LLC and others) with contacts and roles: client, supplier, partner.',
    ky: 'Байланыштары жана ролдору бар төрт компания («Мисал» ЖЧК жана башкалар): кардар, жеткирүүчү, өнөктөш.',
    tr: 'Kişileri ve rolleri olan dört şirket (Örnek Ltd. Şti. ve diğerleri): müşteri, tedarikçi, iş ortağı.',
    zh: '四家公司（“示例”有限责任公司等），附联系人和角色：客户、供应商、合作伙伴。',
  },
  async seed(ctx) {
    const cmp = companiesContext(ctx.request);
    const settings = await companiesSettings();
    const relationKeys = new Set((settings.relations || []).map((relation) => relation.key));
    const ids = {};
    for (const [index, item] of COMPANIES.entries()) {
      const company = await createCompany(cmp, {
        force: true,
        name: ctx.t(item.name),
        kind: 'legal',
        status: 'active',
        activity: ctx.t(item.activity),
        website: item.site ? `https://${item.site}` : null,
        emails: [{ value: `info${index ? index + 1 : ''}@example.com`, label: '' }],
        phones: [{ value: `+1 555 010${index}`, label: '' }],
        relations: item.relations.filter((key) => relationKeys.has(key)),
        notes: ctx.t({ ru: 'Демо-запись.', en: 'Demo record.', ky: 'Демо жазуу.', tr: 'Demo kaydı.', zh: '演示记录。' }),
      });
      ids[item.key] = company.id;
      await ctx.track('cmp_companies', company.id);
    }
    for (const item of PEOPLE) {
      const person = await createPerson(cmp, {
        first_name: ctx.t(item.first),
        last_name: ctx.t(item.last),
        emails: [{ value: `${item.company}.contact@example.com`, label: '' }],
        position: { companyId: ids[item.company], title: ctx.t(item.title), isDecisionMaker: item.company === 'example' },
      });
      await ctx.track('cmp_people', person.id);
    }
  },
  async purge(ctx) {
    const cmp = { ...companiesContext(ctx.request), isAdmin: true };
    for (const id of await ctx.records('cmp_people')) await deletePerson(cmp, id).catch(() => {});
    for (const id of await ctx.records('cmp_companies')) await deleteCompany(cmp, id).catch(() => {});
  },
});
