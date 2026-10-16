import { registerDemo } from '../../services/demo.js';
import { companiesContext, companiesSettings, createCompany, createPerson, deleteCompany, deletePerson } from './service.js';

/*
 * Demo data of Counterparties: neutral companies and contacts (pattern:
 * modules/tasks/demo.js). The purge goes through the module's own delete so
 * the timeline, ratings and files of a card go too.
 */

const COMPANIES = [
  { key: 'example', name: { ru: 'ООО «Пример»', en: 'Example LLC' }, relations: ['client'], site: 'example.com', activity: { ru: 'Оптовая торговля', en: 'Wholesale trade' } },
  { key: 'sample', name: { ru: 'АО «Образец»', en: 'Sample JSC' }, relations: ['supplier'], site: 'sample.example.com', activity: { ru: 'Производство строительных материалов', en: 'Building materials' } },
  { key: 'partner', name: { ru: 'ООО «Компания-Партнёр»', en: 'Partner Company LLC' }, relations: ['partner'], site: 'partner.example.com', activity: { ru: 'Инженерные услуги', en: 'Engineering services' } },
  { key: 'prospect', name: { ru: 'ИП Тестов', en: 'Test Sole Trader' }, relations: ['prospect'], site: null, activity: { ru: 'Розничная торговля', en: 'Retail' } },
];

const PEOPLE = [
  { first: { ru: 'Ирина', en: 'Irene' }, last: { ru: 'Примерова', en: 'Example' }, company: 'example', title: { ru: 'Директор по закупкам', en: 'Purchasing director' } },
  { first: { ru: 'Олег', en: 'Oleg' }, last: { ru: 'Образцов', en: 'Sample' }, company: 'sample', title: { ru: 'Менеджер по продажам', en: 'Sales manager' } },
  { first: { ru: 'Елена', en: 'Helen' }, last: { ru: 'Партнёрова', en: 'Partner' }, company: 'partner', title: { ru: 'Главный инженер', en: 'Chief engineer' } },
];

registerDemo({
  module: 'companies',
  describe: {
    ru: 'Четыре компании («ООО «Пример»» и другие) с контактами и ролями: клиент, поставщик, партнёр.',
    en: 'Four companies (Example LLC and others) with contacts and roles: client, supplier, partner.',
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
        notes: ctx.t({ ru: 'Демо-запись.', en: 'Demo record.' }),
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
