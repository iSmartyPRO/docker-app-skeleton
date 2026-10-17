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
    name: { ru: 'Кыргызстан', en: 'Kyrgyzstan', ky: 'Кыргызстан', tr: 'Kırgızistan', zh: '吉尔吉斯斯坦' },
    flag: '🇰🇬',
    phoneCode: '+996',
    registry: { id: 'minjust_kg', name: { ru: 'Минюст КР', en: 'Ministry of Justice of KG', ky: 'КР Юстиция министрлиги', tr: 'KG Adalet Bakanlığı', zh: '吉尔吉斯共和国司法部' }, by: 'inn' },
    localLanguage: { ru: 'на кыргызском', en: 'in Kyrgyz', ky: 'кыргызча', tr: 'Kırgızca', zh: '吉尔吉斯语' },
    ids: [
      { key: 'inn', label: { ru: 'ИНН', en: 'TIN (INN)', ky: 'ИСН', tr: 'VKN (INN)', zh: '税号（INN）' }, pattern: digits(14), primary: true, hint: { ru: '14 цифр', en: '14 digits', ky: '14 сан', tr: '14 hane', zh: '14 位数字' } },
      { key: 'regNumber', label: { ru: 'Регистрационный номер', en: 'Registration number', ky: 'Каттоо номери', tr: 'Sicil numarası', zh: '注册号' } },
      { key: 'okpo', label: { ru: 'ОКПО', en: 'OKPO', ky: 'ОКПО', tr: 'OKPO', zh: 'OKPO' }, pattern: '^\\d{8}$' },
    ],
    forms: ['ОсОО', 'ОАО', 'ЗАО', 'ИП', 'ОО', 'ОФ', 'Учреждение', 'Кооператив', 'Филиал', 'Представительство'],
  },
  RU: {
    name: { ru: 'Россия', en: 'Russia', ky: 'Россия', tr: 'Rusya', zh: '俄罗斯' },
    flag: '🇷🇺',
    phoneCode: '+7',
    registry: { id: 'ru', name: { ru: 'ЕГРЮЛ ФНС / DaData', en: 'EGRUL / DaData', ky: 'ЮЮБМР / DaData', tr: 'EGRUL / DaData', zh: 'EGRUL / DaData' }, by: 'inn' },
    ids: [
      { key: 'inn', label: { ru: 'ИНН', en: 'INN', ky: 'ИСН', tr: 'INN', zh: 'INN' }, pattern: '^(\\d{10}|\\d{12})$', check: 'ruInn', primary: true, hint: { ru: '10 цифр, у ИП — 12', en: '10 digits, 12 for sole traders', ky: '10 сан, жеке ишкерлерде 12', tr: '10 hane, şahıs işletmelerinde 12', zh: '10 位数字，个体工商户为 12 位' } },
      { key: 'kpp', label: { ru: 'КПП', en: 'KPP', ky: 'КПП', tr: 'KPP', zh: 'KPP' }, pattern: '^\\d{4}[\\dA-Z]{2}\\d{3}$' },
      { key: 'ogrn', label: { ru: 'ОГРН / ОГРНИП', en: 'OGRN', ky: 'ОГРН', tr: 'OGRN', zh: 'OGRN' }, pattern: '^(\\d{13}|\\d{15})$', check: 'ruOgrn' },
      { key: 'okpo', label: { ru: 'ОКПО', en: 'OKPO', ky: 'ОКПО', tr: 'OKPO', zh: 'OKPO' }, pattern: '^(\\d{8}|\\d{10})$' },
    ],
    forms: ['ООО', 'АО', 'ПАО', 'НАО', 'ИП', 'АНО', 'НКО', 'ГУП', 'МУП', 'Филиал'],
  },
  KZ: {
    name: { ru: 'Казахстан', en: 'Kazakhstan', ky: 'Казакстан', tr: 'Kazakistan', zh: '哈萨克斯坦' },
    flag: '🇰🇿',
    phoneCode: '+7',
    ids: [
      { key: 'bin', label: { ru: 'БИН / ИИН', en: 'BIN / IIN', ky: 'БИН / ЖИН', tr: 'BIN / IIN', zh: 'BIN / IIN' }, pattern: digits(12), primary: true, hint: { ru: '12 цифр', en: '12 digits', ky: '12 сан', tr: '12 hane', zh: '12 位数字' } },
      { key: 'regNumber', label: { ru: 'Регистрационный номер', en: 'Registration number', ky: 'Каттоо номери', tr: 'Sicil numarası', zh: '注册号' } },
    ],
    forms: ['ТОО', 'АО', 'ИП', 'Филиал', 'Представительство'],
  },
  UZ: {
    name: { ru: 'Узбекистан', en: 'Uzbekistan', ky: 'Өзбекстан', tr: 'Özbekistan', zh: '乌兹别克斯坦' },
    flag: '🇺🇿',
    phoneCode: '+998',
    ids: [
      { key: 'inn', label: { ru: 'ИНН (СТИР)', en: 'TIN (STIR)', ky: 'ИСН (СТИР)', tr: 'VKN (STIR)', zh: '税号（STIR）' }, pattern: digits(9), primary: true, hint: { ru: '9 цифр', en: '9 digits', ky: '9 сан', tr: '9 hane', zh: '9 位数字' } },
      { key: 'regNumber', label: { ru: 'Регистрационный номер', en: 'Registration number', ky: 'Каттоо номери', tr: 'Sicil numarası', zh: '注册号' } },
    ],
    forms: ['ООО', 'АО', 'ЧП', 'СП', 'ИП', 'Филиал'],
  },
  BY: {
    name: { ru: 'Беларусь', en: 'Belarus', ky: 'Беларусь', tr: 'Belarus', zh: '白俄罗斯' },
    flag: '🇧🇾',
    phoneCode: '+375',
    ids: [{ key: 'unp', label: { ru: 'УНП', en: 'UNP', ky: 'УНП', tr: 'UNP', zh: 'UNP' }, pattern: digits(9), primary: true, hint: { ru: '9 цифр', en: '9 digits', ky: '9 сан', tr: '9 hane', zh: '9 位数字' } }],
    forms: ['ООО', 'ОАО', 'ЗАО', 'ЧУП', 'УП', 'ИП'],
  },
  TJ: {
    name: { ru: 'Таджикистан', en: 'Tajikistan', ky: 'Тажикстан', tr: 'Tacikistan', zh: '塔吉克斯坦' },
    flag: '🇹🇯',
    phoneCode: '+992',
    ids: [{ key: 'inn', label: { ru: 'ИНН', en: 'TIN', ky: 'ИСН', tr: 'VKN', zh: '税号' }, pattern: digits(9), primary: true, hint: { ru: '9 цифр', en: '9 digits', ky: '9 сан', tr: '9 hane', zh: '9 位数字' } }],
    forms: ['ООО', 'ОАО', 'ЗАО', 'ИП'],
  },
  CN: {
    name: { ru: 'Китай', en: 'China', ky: 'Кытай', tr: 'Çin', zh: '中国' },
    flag: '🇨🇳',
    phoneCode: '+86',
    ids: [{ key: 'uscc', label: { ru: 'Единый код (USCC)', en: 'Unified Social Credit Code', ky: 'Бирдиктүү социалдык кредиттик код (USCC)', tr: 'Birleşik Sosyal Kredi Kodu (USCC)', zh: '统一社会信用代码' }, pattern: '^[0-9A-Z]{18}$', primary: true, hint: { ru: '18 символов', en: '18 characters', ky: '18 белги', tr: '18 karakter', zh: '18 位字符' } }],
    forms: ['Co., Ltd.', 'LLC', 'JSC', 'Branch'],
  },
  TR: {
    name: { ru: 'Турция', en: 'Türkiye', ky: 'Түркия', tr: 'Türkiye', zh: '土耳其' },
    flag: '🇹🇷',
    phoneCode: '+90',
    ids: [{ key: 'vkn', label: { ru: 'Налоговый номер (VKN)', en: 'Tax number (VKN)', ky: 'Салык номери (VKN)', tr: 'Vergi kimlik numarası (VKN)', zh: '税号（VKN）' }, pattern: digits(10), primary: true }],
    forms: ['Ltd. Şti.', 'A.Ş.', 'Şahıs'],
  },
  OTHER: {
    name: { ru: 'Другая страна', en: 'Other country', ky: 'Башка өлкө', tr: 'Diğer ülke', zh: '其他国家' },
    flag: '🌐',
    phoneCode: '',
    ids: [
      { key: 'taxId', label: { ru: 'Налоговый номер', en: 'Tax ID', ky: 'Салык номери', tr: 'Vergi numarası', zh: '税号' }, primary: true },
      { key: 'regNumber', label: { ru: 'Регистрационный номер', en: 'Registration number', ky: 'Каттоо номери', tr: 'Sicil numarası', zh: '注册号' } },
      { key: 'vat', label: { ru: 'VAT', en: 'VAT number', ky: 'VAT номери', tr: 'KDV numarası (VAT)', zh: '增值税号' } },
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
