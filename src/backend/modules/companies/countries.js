/*
 * Country profiles: which identifiers a company has, how they are checked,
 * the usual legal forms and which public registry can fill the card.
 * The frontend renders forms from these profiles (GET /meta), so adding a
 * country here is enough. Administrators can add their own fields on top.
 */

const digits = (n) => `^\\d{${n}}$`;

// Russian INN: 10 digits (company) or 12 (individual), with check digits.
export function validRuInn(value) {
  const v = String(value || '');
  const check = (weights) => (weights.reduce((sum, w, i) => sum + w * Number(v[i]), 0) % 11) % 10;
  if (/^\d{10}$/.test(v)) return check([2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(v[9]);
  if (/^\d{12}$/.test(v)) {
    return (
      check([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(v[10]) &&
      check([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(v[11])
    );
  }
  return false;
}

// ОГРН (13) / ОГРНИП (15).
export function validRuOgrn(value) {
  const v = String(value || '');
  if (/^\d{13}$/.test(v)) return Number((BigInt(v.slice(0, 12)) % 11n) % 10n) === Number(v[12]);
  if (/^\d{15}$/.test(v)) return Number((BigInt(v.slice(0, 14)) % 13n) % 10n) === Number(v[14]);
  return false;
}

export const COUNTRIES = {
  KG: {
    name: { ru: 'Кыргызстан', en: 'Kyrgyzstan' },
    flag: '🇰🇬',
    phoneCode: '+996',
    registry: { id: 'minjust_kg', name: { ru: 'Минюст КР', en: 'Ministry of Justice of KG' }, by: 'inn' },
    localLanguage: { ru: 'на кыргызском', en: 'in Kyrgyz' },
    ids: [
      { key: 'inn', label: { ru: 'ИНН', en: 'TIN (INN)' }, pattern: digits(14), primary: true, hint: { ru: '14 цифр', en: '14 digits' } },
      { key: 'regNumber', label: { ru: 'Регистрационный номер', en: 'Registration number' } },
      { key: 'okpo', label: { ru: 'ОКПО', en: 'OKPO' }, pattern: '^\\d{8}$' },
    ],
    forms: ['ОсОО', 'ОАО', 'ЗАО', 'ИП', 'ОО', 'ОФ', 'Учреждение', 'Кооператив', 'Филиал', 'Представительство'],
  },
  RU: {
    name: { ru: 'Россия', en: 'Russia' },
    flag: '🇷🇺',
    phoneCode: '+7',
    registry: { id: 'ru', name: { ru: 'ЕГРЮЛ ФНС / DaData', en: 'EGRUL / DaData' }, by: 'inn' },
    ids: [
      { key: 'inn', label: { ru: 'ИНН', en: 'INN' }, pattern: '^(\\d{10}|\\d{12})$', check: 'ruInn', primary: true, hint: { ru: '10 цифр, у ИП — 12', en: '10 digits, 12 for sole traders' } },
      { key: 'kpp', label: { ru: 'КПП', en: 'KPP' }, pattern: '^\\d{4}[\\dA-Z]{2}\\d{3}$' },
      { key: 'ogrn', label: { ru: 'ОГРН / ОГРНИП', en: 'OGRN' }, pattern: '^(\\d{13}|\\d{15})$', check: 'ruOgrn' },
      { key: 'okpo', label: { ru: 'ОКПО', en: 'OKPO' }, pattern: '^(\\d{8}|\\d{10})$' },
    ],
    forms: ['ООО', 'АО', 'ПАО', 'НАО', 'ИП', 'АНО', 'НКО', 'ГУП', 'МУП', 'Филиал'],
  },
  KZ: {
    name: { ru: 'Казахстан', en: 'Kazakhstan' },
    flag: '🇰🇿',
    phoneCode: '+7',
    ids: [
      { key: 'bin', label: { ru: 'БИН / ИИН', en: 'BIN / IIN' }, pattern: digits(12), primary: true, hint: { ru: '12 цифр', en: '12 digits' } },
      { key: 'regNumber', label: { ru: 'Регистрационный номер', en: 'Registration number' } },
    ],
    forms: ['ТОО', 'АО', 'ИП', 'Филиал', 'Представительство'],
  },
  UZ: {
    name: { ru: 'Узбекистан', en: 'Uzbekistan' },
    flag: '🇺🇿',
    phoneCode: '+998',
    ids: [
      { key: 'inn', label: { ru: 'ИНН (СТИР)', en: 'TIN (STIR)' }, pattern: digits(9), primary: true, hint: { ru: '9 цифр', en: '9 digits' } },
      { key: 'regNumber', label: { ru: 'Регистрационный номер', en: 'Registration number' } },
    ],
    forms: ['ООО', 'АО', 'ЧП', 'СП', 'ИП', 'Филиал'],
  },
  BY: {
    name: { ru: 'Беларусь', en: 'Belarus' },
    flag: '🇧🇾',
    phoneCode: '+375',
    ids: [{ key: 'unp', label: { ru: 'УНП', en: 'UNP' }, pattern: digits(9), primary: true, hint: { ru: '9 цифр', en: '9 digits' } }],
    forms: ['ООО', 'ОАО', 'ЗАО', 'ЧУП', 'УП', 'ИП'],
  },
  TJ: {
    name: { ru: 'Таджикистан', en: 'Tajikistan' },
    flag: '🇹🇯',
    phoneCode: '+992',
    ids: [{ key: 'inn', label: { ru: 'ИНН', en: 'TIN' }, pattern: digits(9), primary: true, hint: { ru: '9 цифр', en: '9 digits' } }],
    forms: ['ООО', 'ОАО', 'ЗАО', 'ИП'],
  },
  CN: {
    name: { ru: 'Китай', en: 'China' },
    flag: '🇨🇳',
    phoneCode: '+86',
    ids: [{ key: 'uscc', label: { ru: 'Единый код (USCC)', en: 'Unified Social Credit Code' }, pattern: '^[0-9A-Z]{18}$', primary: true, hint: { ru: '18 символов', en: '18 characters' } }],
    forms: ['Co., Ltd.', 'LLC', 'JSC', 'Branch'],
  },
  TR: {
    name: { ru: 'Турция', en: 'Türkiye' },
    flag: '🇹🇷',
    phoneCode: '+90',
    ids: [{ key: 'vkn', label: { ru: 'Налоговый номер (VKN)', en: 'Tax number (VKN)' }, pattern: digits(10), primary: true }],
    forms: ['Ltd. Şti.', 'A.Ş.', 'Şahıs'],
  },
  OTHER: {
    name: { ru: 'Другая страна', en: 'Other country' },
    flag: '🌐',
    phoneCode: '',
    ids: [
      { key: 'taxId', label: { ru: 'Налоговый номер', en: 'Tax ID' }, primary: true },
      { key: 'regNumber', label: { ru: 'Регистрационный номер', en: 'Registration number' } },
      { key: 'vat', label: { ru: 'VAT', en: 'VAT number' } },
    ],
    forms: ['LLC', 'Ltd', 'JSC', 'GmbH', 'Inc.', 'Sole trader', 'Branch'],
  },
};

export const COUNTRY_CODES = Object.keys(COUNTRIES);

/** Profile of a country code; unknown codes use the generic profile. */
export function profileOf(code) {
  return COUNTRIES[code] || COUNTRIES.OTHER;
}

/** Validates identifiers against the country profile; returns { ids, errors }. */
export function cleanIds(country, input = {}) {
  const profile = profileOf(country);
  const ids = {};
  const errors = {};
  for (const field of profile.ids) {
    const raw = String(input[field.key] ?? '').replace(/\s+/g, '').trim().slice(0, 64);
    if (!raw) continue;
    const value = field.key === 'kpp' || field.key === 'uscc' ? raw.toUpperCase() : raw;
    let ok = !field.pattern || new RegExp(field.pattern).test(value);
    if (ok && field.check === 'ruInn') ok = validRuInn(value);
    if (ok && field.check === 'ruOgrn') ok = validRuOgrn(value);
    if (!ok) errors[field.key] = field.label;
    ids[field.key] = value;
  }
  return { ids, errors };
}

export const primaryIdKey = (country) => (profileOf(country).ids.find((field) => field.primary) || profileOf(country).ids[0]).key;
