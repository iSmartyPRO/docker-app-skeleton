import { httpError } from '../../shared/acl.js';
import { BROWSER_UA, fetchWithTimeout, ruDate, splitLegalName, titleCase } from './common.js';
import { pdfLines } from './pdftext.js';

/*
 * Kyrgyz Republic — the Ministry of Justice register (record.minjust.gov.kg).
 * The JSON answer has the names and the registration number; everything else
 * (address, director, OKPO, status, dates) is read from the official PDF
 * extract, which is also kept as a document of the company.
 */

const BASE = 'https://record.minjust.gov.kg/register/api/v1/register';
const HEADERS = { 'User-Agent': BROWSER_UA, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'ru-RU,ru;q=0.9', Referer: 'https://record.minjust.gov.kg/' };

// Russian page of the extract: label → card field.
const LABELS = [
  ['Регистрирующий орган', 'registering_authority'],
  ['Полное фирменное наименование на государственном языке', 'local_name'],
  ['Полное фирменное наименование на официальном языке', 'full_name'],
  ['Регистрационный номер', 'regNumber'],
  ['Код ОКПО', 'okpo'],
  ['ИНН', 'inn'],
  ['Юридический адрес', 'legal_address'],
  ['Текущий статус', 'status'],
  ['Дата первичной регистрации', 'registered_on'],
  ['Дата перерегистрации', 'reregistered_on'],
  ['Регистрация прекращения деятельности', 'closed_on'],
  ['Количество учредителей/участников, членов', 'founders_count'],
  ['Руководитель', 'director_name'],
];

export function parseExtract(pages) {
  const lines = (pages.find((page) => page.some((line) => line.startsWith('СПРАВКА'))) || pages[pages.length - 1] || []).filter(
    (line) => !/^https?:\/\//.test(line) && !/^Справка из Единого/.test(line)
  );
  const values = {};
  let current = null;
  for (const line of lines) {
    const label = LABELS.find(([text]) => line.replace(/:$/, '') === text || line.startsWith(`${text}:`));
    if (label) {
      current = label[1];
      const rest = line.slice(line.indexOf(':') + 1).trim();
      values[current] = rest || '';
      continue;
    }
    if (current) values[current] = values[current] ? `${values[current]} ${line}` : line;
  }
  const clean = (value) => (value && value !== '---' ? value.trim() : null);
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, clean(value)]));
}

function statusOf(text, closedOn) {
  const value = String(text || '').toLowerCase();
  if (closedOn || /ликвид|прекращ|исключ/.test(value)) return 'liquidated';
  if (/реорганиз/.test(value)) return 'reorganizing';
  if (/регистрац|перерегистрац|действ/.test(value)) return 'active';
  return 'unknown';
}

export async function lookupKg(inn) {
  const tin = String(inn || '').replace(/\D/g, '');
  if (!/^\d{14}$/.test(tin)) throw httpError(400, 'INN must have 14 digits', 'INVALID_ID');
  const res = await fetchWithTimeout(`${BASE}?query=${tin}`, { headers: HEADERS });
  if (res.status === 404) throw httpError(404, 'The company was not found in the register', 'REGISTRY_NOT_FOUND');
  if (!res.ok) throw httpError(502, `The register answered ${res.status}`, 'REGISTRY_UNAVAILABLE');
  const json = await res.json();

  const fields = {
    kind: 'legal',
    full_name: json?.name?.ru || null,
    local_name: json?.name?.ky || null,
    ids: { inn: json?.tin || tin, regNumber: json?.registerCode || null },
  };

  let pdf = null;
  let extract = {};
  try {
    const pdfRes = await fetchWithTimeout(`${BASE}/${tin}/record`, { headers: { ...HEADERS, Accept: 'application/pdf' } }, 30000);
    if (pdfRes.ok) {
      pdf = Buffer.from(await pdfRes.arrayBuffer());
      extract = parseExtract(await pdfLines(pdf));
    }
  } catch (err) {
    console.warn('Minjust extract unavailable:', err.message);
  }

  fields.full_name = extract.full_name || fields.full_name;
  fields.local_name = extract.local_name || fields.local_name;
  if (extract.regNumber) fields.ids.regNumber = extract.regNumber;
  if (extract.okpo) fields.ids.okpo = extract.okpo;
  fields.registering_authority = extract.registering_authority || null;
  fields.legal_address = extract.legal_address || null;
  fields.registered_on = ruDate(extract.registered_on);
  fields.closed_on = ruDate(extract.closed_on);
  fields.status = extract.status ? statusOf(extract.status, fields.closed_on) : 'unknown';
  fields.founders_count = extract.founders_count && /^\d+$/.test(extract.founders_count) ? Number(extract.founders_count) : null;
  fields.director_name = titleCase(extract.director_name);
  fields.director_title = extract.director_name ? 'Руководитель' : null;
  const { legalForm, name } = splitLegalName(fields.full_name, 'KG');
  fields.legal_form = legalForm;
  fields.name = name;
  if (legalForm === 'ИП') fields.kind = 'individual';
  if (legalForm === 'Филиал' || legalForm === 'Представительство') fields.kind = 'branch';

  return {
    source: 'minjust_kg',
    sourceName: 'Минюст КР',
    url: `https://record.minjust.gov.kg/view/${tin}`,
    fields,
    document: pdf ? { buffer: pdf, name: `Выписка Минюст КР ${tin}.pdf` } : null,
  };
}
