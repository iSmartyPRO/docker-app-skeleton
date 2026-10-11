import { httpError } from '../../shared/acl.js';

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** fetch with a timeout; registry outages become a clear 502 instead of a hang. */
export async function fetchWithTimeout(url, options = {}, ms = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    throw httpError(502, `The registry did not respond (${err.name === 'AbortError' ? 'timeout' : err.message})`, 'REGISTRY_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}

/** "dd.mm.yyyy" (optionally followed by words) → "yyyy-mm-dd". */
export function ruDate(value) {
  const match = /(\d{2})\.(\d{2})\.(\d{4})/.exec(String(value || ''));
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

export function msDate(value) {
  if (!value) return null;
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Straight quotes → «ёлочки» for display names. */
export function niceQuotes(text) {
  let open = true;
  return String(text || '').replace(/"/g, () => {
    const mark = open ? '«' : '»';
    open = !open;
    return mark;
  });
}

const FORMS = [
  [/^общество с ограниченной ответственностью/i, { KG: 'ОсОО', DEFAULT: 'ООО' }],
  [/^публичное акционерное общество/i, { DEFAULT: 'ПАО' }],
  [/^непубличное акционерное общество/i, { DEFAULT: 'НАО' }],
  [/^открытое акционерное общество/i, { DEFAULT: 'ОАО' }],
  [/^закрытое акционерное общество/i, { DEFAULT: 'ЗАО' }],
  [/^акционерное общество/i, { DEFAULT: 'АО' }],
  [/^индивидуальный предприниматель/i, { DEFAULT: 'ИП' }],
  [/^общественное объединение/i, { DEFAULT: 'ОО' }],
  [/^общественный фонд/i, { DEFAULT: 'ОФ' }],
  [/^учреждение/i, { DEFAULT: 'Учреждение' }],
  [/^филиал/i, { DEFAULT: 'Филиал' }],
  [/^представительство/i, { DEFAULT: 'Представительство' }],
  [/^автономная некоммерческая организация/i, { DEFAULT: 'АНО' }],
  [/^государственное унитарное предприятие/i, { DEFAULT: 'ГУП' }],
  [/^муниципальное унитарное предприятие/i, { DEFAULT: 'МУП' }],
  [/кооператив/i, { DEFAULT: 'Кооператив' }],
];

/** Legal form abbreviation and short display name from a full registered name. */
export function splitLegalName(full, country) {
  const text = String(full || '').trim();
  for (const [pattern, forms] of FORMS) {
    if (pattern.test(text)) {
      const form = forms[country] || forms.DEFAULT;
      const quoted = /"([^]+)"\s*$/.exec(text) || /«([^]+)»\s*$/.exec(text);
      const core = quoted ? quoted[1] : text.replace(pattern, '').trim();
      return { legalForm: form, name: core ? `${form} «${core.replace(/^["«]|["»]$/g, '')}»` : text };
    }
  }
  return { legalForm: null, name: niceQuotes(text) };
}

/** "ДОЛЖНОСТЬ: Фамилия Имя Отчество" → { title, name } */
export function splitManager(text) {
  const value = String(text || '').trim();
  const index = value.indexOf(':');
  if (index === -1) return { title: null, name: value || null };
  return { title: value.slice(0, index).trim() || null, name: value.slice(index + 1).trim() || null };
}

/** "ИВАНОВ ИВАН ИВАНОВИЧ" → "Иванов Иван Иванович" */
export function titleCase(text) {
  const value = String(text || '').trim();
  if (!value || value !== value.toUpperCase()) return value || null;
  return value.toLowerCase().replace(/(^|[\s-])([a-zа-яё])/g, (m, sep, ch) => sep + ch.toUpperCase());
}

/** First letter upper, rest lower — for registry titles in capitals. */
export function sentenceCase(text) {
  const value = String(text || '').trim();
  if (!value || value !== value.toUpperCase()) return value || null;
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
