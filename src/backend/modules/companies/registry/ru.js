import { httpError } from '../../shared/acl.js';
import { BROWSER_UA, fetchWithTimeout, msDate, niceQuotes, ruDate, sentenceCase, splitLegalName, splitManager, titleCase } from './common.js';

/*
 * Russia.
 *  - DaData (findById/party) when an API key is configured: names, legal
 *    form, INN/KPP/OGRN/OKPO, OKVED, status, registration date, director,
 *    full address. The free plan returns these; contacts and finances need a
 *    paid plan.
 *  - Otherwise the free public EGRUL search of the Federal Tax Service
 *    (egrul.nalog.ru): names, INN, KPP, OGRN, director, registration date,
 *    region; plus the official PDF extract.
 */

const STATUS = { ACTIVE: 'active', LIQUIDATING: 'liquidating', LIQUIDATED: 'liquidated', BANKRUPT: 'liquidating', REORGANIZING: 'reorganizing' };

function checkInn(inn) {
  const value = String(inn || '').replace(/\D/g, '');
  if (!/^(\d{10}|\d{12})$/.test(value)) throw httpError(400, 'INN must have 10 or 12 digits', 'INVALID_ID');
  return value;
}

export async function lookupDadata(inn, key) {
  const value = checkInn(inn);
  const res = await fetchWithTimeout('https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Token ${key}` },
    body: JSON.stringify({ query: value, branch_type: 'MAIN', count: 1 }),
  });
  if (res.status === 401 || res.status === 403) throw httpError(502, 'DaData rejected the API key', 'REGISTRY_KEY');
  if (res.status === 429) throw httpError(502, 'DaData daily limit reached', 'REGISTRY_LIMIT');
  if (!res.ok) throw httpError(502, `DaData answered ${res.status}`, 'REGISTRY_UNAVAILABLE');
  const json = await res.json();
  const item = json?.suggestions?.[0];
  if (!item) throw httpError(404, 'The company was not found in the register', 'REGISTRY_NOT_FOUND');
  const d = item.data || {};
  const individual = d.type === 'INDIVIDUAL';
  const fields = {
    kind: individual ? 'individual' : d.branch_type === 'BRANCH' ? 'branch' : 'legal',
    name: niceQuotes(d.name?.short_with_opf || item.value),
    full_name: d.name?.full_with_opf || null,
    legal_form: d.opf?.short || (individual ? 'ИП' : null),
    ids: { inn: d.inn || value, kpp: d.kpp || null, ogrn: d.ogrn || null, okpo: d.okpo || null },
    status: STATUS[d.state?.status] || 'unknown',
    registered_on: msDate(d.state?.registration_date),
    closed_on: msDate(d.state?.liquidation_date),
    legal_address: d.address?.unrestricted_value || d.address?.value || null,
    director_name: individual ? titleCase(d.name?.full) : titleCase(d.management?.name),
    director_title: individual ? 'Индивидуальный предприниматель' : sentenceCase(d.management?.post),
    activity_code: d.okved || null,
    employees: d.employee_count ? String(d.employee_count) : null,
  };
  if (Array.isArray(d.phones) && d.phones.length) fields.phones = d.phones.map((phone) => ({ value: phone.value, label: 'registry' }));
  if (Array.isArray(d.emails) && d.emails.length) fields.emails = d.emails.map((email) => ({ value: email.value, label: 'registry' }));
  return { source: 'dadata', sourceName: 'DaData', url: `https://www.rusprofile.ru/search?query=${value}`, fields, document: null };
}

// ── EGRUL (free) ────────────────────────────────────────────────────────────

const EGRUL = 'https://egrul.nalog.ru';

function cookieOf(res) {
  const raw = res.headers.getSetCookie?.() || [];
  return raw.map((line) => line.split(';')[0]).join('; ');
}

async function egrulExtract(token, cookie) {
  try {
    const headers = { 'User-Agent': BROWSER_UA, Cookie: cookie, Accept: 'application/json' };
    const request = await fetchWithTimeout(`${EGRUL}/vyp-request/${token}`, { headers });
    if (!request.ok) return null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const status = await fetchWithTimeout(`${EGRUL}/vyp-status/${token}`, { headers });
      const body = await status.json().catch(() => ({}));
      if (body.status === 'ready') {
        const pdf = await fetchWithTimeout(`${EGRUL}/vyp-download/${token}`, { headers: { ...headers, Accept: 'application/pdf' } }, 30000);
        return pdf.ok ? Buffer.from(await pdf.arrayBuffer()) : null;
      }
    }
  } catch (err) {
    console.warn('EGRUL extract unavailable:', err.message);
  }
  return null;
}

export async function lookupEgrul(inn) {
  const value = checkInn(inn);
  const search = await fetchWithTimeout(EGRUL + '/', {
    method: 'POST',
    headers: { 'User-Agent': BROWSER_UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ query: value, region: '', page: '' }).toString(),
  });
  if (!search.ok) throw httpError(502, `EGRUL answered ${search.status}`, 'REGISTRY_UNAVAILABLE');
  const cookie = cookieOf(search);
  const started = await search.json();
  if (started.captchaRequired) throw httpError(502, 'EGRUL asks for a captcha; add a DaData key in the module settings', 'REGISTRY_CAPTCHA');
  let rows = [];
  for (let attempt = 0; attempt < 6 && !rows.length; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt ? 600 : 250));
    const result = await fetchWithTimeout(`${EGRUL}/search-result/${started.t}`, { headers: { 'User-Agent': BROWSER_UA, Cookie: cookie, Accept: 'application/json' } });
    const body = await result.json().catch(() => ({}));
    if (body.status === 'wait') continue;
    rows = body.rows || [];
    if (!rows.length) break;
  }
  const row = rows.find((item) => item.i === value) || rows[0];
  if (!row) throw httpError(404, 'The company was not found in the register', 'REGISTRY_NOT_FOUND');
  const individual = row.k === 'fl';
  const manager = splitManager(row.g);
  const { legalForm, name } = individual ? { legalForm: 'ИП', name: `ИП ${titleCase(row.n)}` } : splitLegalName(row.n, 'RU');
  const fields = {
    kind: individual ? 'individual' : 'legal',
    name: row.c ? niceQuotes(row.c) : name,
    full_name: row.n || null,
    legal_form: legalForm,
    ids: { inn: row.i || value, kpp: row.p || null, ogrn: row.o || null },
    status: row.e ? 'liquidated' : 'active',
    registered_on: ruDate(row.r),
    closed_on: ruDate(row.e),
    legal_address: null,
    director_name: individual ? titleCase(row.n) : titleCase(manager.name),
    director_title: individual ? 'Индивидуальный предприниматель' : sentenceCase(manager.title),
  };
  const pdf = row.t ? await egrulExtract(row.t, cookie) : null;
  return {
    source: 'egrul',
    sourceName: 'ЕГРЮЛ ФНС',
    url: 'https://egrul.nalog.ru/',
    fields,
    document: pdf ? { buffer: pdf, name: `Выписка ЕГРЮЛ ${value}.pdf` } : null,
  };
}

export async function lookupRu(inn, { dadataKey } = {}) {
  if (dadataKey) {
    try {
      return await lookupDadata(inn, dadataKey);
    } catch (err) {
      // A broken key or limit falls back to the free register.
      if (!['REGISTRY_KEY', 'REGISTRY_LIMIT', 'REGISTRY_UNAVAILABLE'].includes(err.code)) throw err;
      console.warn('DaData failed, using EGRUL:', err.message);
    }
  }
  return lookupEgrul(inn);
}
