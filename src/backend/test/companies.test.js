import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanIds, primaryIdKey, validRuInn, validRuOgrn } from '../modules/companies/countries.js';
import { niceQuotes, ruDate, splitLegalName, splitManager, titleCase } from '../modules/companies/registry/common.js';
import { parseExtract } from '../modules/companies/registry/kg.js';
import { resolveModules, sanitizeModules } from '../modules/catalog.js';

test('Russian INN and OGRN check digits', () => {
  assert.equal(validRuInn('7707083893'), true);
  assert.equal(validRuInn('7707083890'), false);
  assert.equal(validRuInn('500100732259'), true);
  assert.equal(validRuInn('500100732250'), false);
  assert.equal(validRuOgrn('1027700132195'), true);
  assert.equal(validRuOgrn('1027700132194'), false);
  assert.equal(validRuOgrn('304500116000157'), true);
});

test('identifiers follow the country profile', () => {
  assert.deepEqual(cleanIds('KG', { inn: '0190 3202 6105 16', okpo: '34776226' }).errors, {});
  assert.ok(cleanIds('KG', { inn: '123' }).errors.inn);
  assert.ok(cleanIds('RU', { inn: '7707083890' }).errors.inn, 'bad check digit');
  assert.equal(cleanIds('RU', { kpp: '773601001' }).ids.kpp, '773601001');
  assert.equal(primaryIdKey('KZ'), 'bin');
  assert.equal(primaryIdKey('XX'), 'taxId', 'unknown countries use the generic profile');
});

test('registry text helpers', () => {
  assert.deepEqual(splitLegalName('Общество с ограниченной ответственностью "ПАКС групп"', 'KG'), { legalForm: 'ОсОО', name: 'ОсОО «ПАКС групп»' });
  assert.equal(splitLegalName('ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "СБЕРБАНК РОССИИ"', 'RU').legalForm, 'ПАО');
  assert.deepEqual(splitManager('ПРЕЗИДЕНТ, ПРЕДСЕДАТЕЛЬ ПРАВЛЕНИЯ: Греф Герман Оскарович'), { title: 'ПРЕЗИДЕНТ, ПРЕДСЕДАТЕЛЬ ПРАВЛЕНИЯ', name: 'Греф Герман Оскарович' });
  assert.equal(titleCase('ШАХТЫБЕКОВ АНВАР ШАХТЫБЕКОВИЧ'), 'Шахтыбеков Анвар Шахтыбекович');
  assert.equal(ruDate('19.03.2026 год'), '2026-03-19');
  assert.equal(niceQuotes('ООО "ЯНДЕКС"'), 'ООО «ЯНДЕКС»');
});

test('Minjust extract is read label by label', () => {
  const page = [
    'СПРАВКА (СВИДЕТЕЛЬСТВО)',
    'Регистрирующий орган:', 'Чуй-Бишкекское управление юстиции (г.Бишкек)',
    'Полное фирменное наименование на официальном языке:', 'Общество с ограниченной ответственностью "ПАКС групп"',
    'Код ОКПО:', '34776226',
    'Юридический адрес:', 'Кыргызская Республика, г.Бишкек,', 'улица Ибраимова, 115',
    'Дата перерегистрации:', '---',
    'Руководитель:', 'ШАХТЫБЕКОВ АНВАР ШАХТЫБЕКОВИЧ',
    'https://record.minjust.gov.kg/view/01903202610516 11.10.2026',
  ];
  const values = parseExtract([['first page'], page]);
  assert.equal(values.okpo, '34776226');
  assert.equal(values.legal_address, 'Кыргызская Республика, г.Бишкек, улица Ибраимова, 115', 'multi-line values are joined');
  assert.equal(values.reregistered_on, null, '"---" means empty');
  assert.equal(values.director_name, 'ШАХТЫБЕКОВ АНВАР ШАХТЫБЕКОВИЧ');
});

test('companies settings: relations and custom fields get stable keys', () => {
  const next = sanitizeModules(resolveModules(), {
    companies: { settings: { editPolicy: 'nobody', relations: [{ label: 'Дилер', color: 'red' }], customFields: [{ label: 'Отрасль', type: 'evil' }] } },
  }).companies.settings;
  assert.equal(next.editPolicy, 'everyone');
  assert.match(next.relations[0].key, /^x[a-z0-9]+$/);
  assert.equal(next.relations[0].color, '#64748B');
  assert.equal(next.customFields[0].type, 'text');
});
