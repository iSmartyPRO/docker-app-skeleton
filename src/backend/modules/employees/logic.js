/*
 * Pure pieces of the Employees module (no database): enums, input cleaning,
 * what each level of access sees, import row validation, CSV with the
 * formula guard, clearance thresholds and birthdays. Unit-tested in
 * test/employees.test.js.
 */

export const STATUSES = ['active', 'vacation', 'terminated', 'candidate'];
/** Statuses the directory (employees.view) shows; HR sees every status. */
export const DIRECTORY_STATUSES = ['active', 'vacation'];
export const EMPLOYMENT = ['staff', 'part_time', 'contractor', 'seasonal'];
export const SKILL_KINDS = ['skill', 'clearance'];
export const MAX_IMPORT_ROWS = 5000;

export function httpError(statusCode, message, code, info) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  if (info) error.info = info;
  return error;
}

export const clean = (value, max) => {
  const out = String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return out || null;
};
const longText = (value, max) => {
  const out = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
  return out || null;
};
export const intOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A DATE column as YYYY-MM-DD (node-postgres gives a Date at local midnight). */
export function dayText(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return String(value).slice(0, 10);
}

/** A calendar day from YYYY-MM-DD or DD.MM.YYYY (also D.M.YY); null when empty; throws on nonsense. */
export function parseDay(value, field = 'date') {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  let y;
  let m;
  let d;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(raw);
  if (match) [, y, m, d] = match.map(Number);
  else if ((match = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/.exec(raw))) {
    [, d, m, y] = match.map(Number);
    if (y < 100) y += y > 50 ? 1900 : 2000;
  } else throw httpError(400, `Bad ${field}`, 'BAD_DATE', { field });
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 1900 || y > 2200) throw httpError(400, `Bad ${field}`, 'BAD_DATE', { field });
  return date.toISOString().slice(0, 10);
}

function email(value, field) {
  const out = clean(value, 255);
  if (out && !EMAIL.test(out)) throw httpError(400, `Bad ${field}`, 'BAD_EMAIL', { field });
  return out ? out.toLowerCase() : null;
}

function phone(value) {
  const out = clean(value, 40);
  if (!out) return null;
  return out.replace(/[^\d+()\-\s]/g, '').trim() || null;
}

/**
 * An employee as sent by the card or the import, made safe. With `partial`
 * only the keys present are returned (an update never clears what it did not send).
 */
export function cleanEmployee(input = {}, { partial = false } = {}) {
  const out = {};
  const has = (key) => !partial || Object.prototype.hasOwnProperty.call(input, key);
  if (has('lastName')) {
    out.lastName = clean(input.lastName, 80);
    if (!out.lastName) throw httpError(400, 'Enter the last name', 'NAME_REQUIRED', { field: 'lastName' });
  }
  if (has('firstName')) {
    out.firstName = clean(input.firstName, 80);
    if (!out.firstName) throw httpError(400, 'Enter the first name', 'NAME_REQUIRED', { field: 'firstName' });
  }
  if (has('middleName')) out.middleName = clean(input.middleName, 80);
  if (has('positionId')) out.positionId = intOrNull(input.positionId);
  if (has('unitId')) out.unitId = intOrNull(input.unitId);
  if (has('siteId')) out.siteId = intOrNull(input.siteId);
  if (has('managerId')) out.managerId = intOrNull(input.managerId);
  if (has('personnelNo')) out.personnelNo = clean(input.personnelNo, 40);
  if (has('hireDate')) out.hireDate = parseDay(input.hireDate, 'hireDate');
  if (has('terminationDate')) out.terminationDate = parseDay(input.terminationDate, 'terminationDate');
  if (has('birthDate')) out.birthDate = parseDay(input.birthDate, 'birthDate');
  if (has('status')) {
    const status = input.status ?? 'active';
    if (!STATUSES.includes(status)) throw httpError(400, 'Unknown status', 'BAD_STATUS', { field: 'status' });
    out.status = status;
  }
  if (has('employment')) {
    const employment = input.employment ?? 'staff';
    if (!EMPLOYMENT.includes(employment)) throw httpError(400, 'Unknown employment type', 'BAD_EMPLOYMENT', { field: 'employment' });
    out.employment = employment;
  }
  if (has('workEmail')) out.workEmail = email(input.workEmail, 'workEmail');
  if (has('workPhone')) out.workPhone = phone(input.workPhone);
  if (has('workMobile')) out.workMobile = phone(input.workMobile);
  if (has('workLocation')) out.workLocation = clean(input.workLocation, 160);
  if (has('personalEmail')) out.personalEmail = email(input.personalEmail, 'personalEmail');
  if (has('personalPhone')) out.personalPhone = phone(input.personalPhone);
  if (has('personalAddress')) out.personalAddress = clean(input.personalAddress, 400);
  if (has('emergencyContact')) out.emergencyContact = clean(input.emergencyContact, 300);
  if (has('hrNotes')) out.hrNotes = longText(input.hrNotes, 8000);
  if (has('adAccount')) out.adAccount = clean(input.adAccount, 200);
  if (out.hireDate && out.terminationDate && out.terminationDate < out.hireDate) throw httpError(400, 'The termination date is before the hire date', 'BAD_DATES', { field: 'terminationDate' });
  return out;
}

/** Fields only HR (employees.hr) may send. */
export const HR_FIELDS = ['personnelNo', 'hireDate', 'terminationDate', 'birthDate', 'employment', 'personalEmail', 'personalPhone', 'personalAddress', 'emergencyContact', 'hrNotes'];

export function fullName(row) {
  return [row.last_name ?? row.lastName, row.first_name ?? row.firstName, row.middle_name ?? row.middleName].filter(Boolean).join(' ');
}

/** «Иванов И. П.» */
export function shortName(row) {
  const last = row.last_name ?? row.lastName ?? '';
  const initials = [row.first_name ?? row.firstName, row.middle_name ?? row.middleName].filter(Boolean).map((part) => `${String(part)[0]}.`).join(' ');
  return [last, initials].filter(Boolean).join(' ');
}

/**
 * What a viewer at `level` sees of one employee:
 *   'hr'   everything
 *   'self' the directory, own personal contacts, birthday and skills (no HR notes, no documents)
 *   'view' the directory: names, photo, position, unit, site, manager, status, work contacts
 * `extra`: joined parts already shaped (position, unit, site, manager, user, skills, documents).
 */
export function shapeEmployee(row, level, extra = {}) {
  const base = {
    id: row.id,
    lastName: row.last_name,
    firstName: row.first_name,
    middleName: row.middle_name || null,
    name: fullName(row),
    shortName: shortName(row),
    photoUrl: row.photo_key ? `/api/app/employees/employees/${row.id}/photo?v=${encodeURIComponent(String(row.photo_key).slice(-12))}` : null,
    position: extra.position || null,
    unit: extra.unit || null,
    site: extra.site || null,
    manager: extra.manager || null,
    status: row.status,
    work: { email: row.work_email || null, phone: row.work_phone || null, mobile: row.work_mobile || null, location: row.work_location || null },
    userId: row.user_id || null,
    level,
  };
  if (level === 'view') return base;
  const own = {
    ...base,
    birthDate: dayText(row.birth_date),
    personal: { email: row.personal_email || null, phone: row.personal_phone || null, address: row.personal_address || null, emergency: row.emergency_contact || null },
    skills: extra.skills || [],
  };
  if (level === 'self') return own;
  return {
    ...own,
    personnelNo: row.personnel_no || null,
    hireDate: dayText(row.hire_date),
    terminationDate: dayText(row.termination_date),
    employment: row.employment,
    hrNotes: row.hr_notes || null,
    adAccount: row.ad_account || null,
    user: extra.user || null,
    documents: extra.documents || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The level a viewer has on a row: 'hr' | 'self' | 'view' | null (hidden). */
export function levelFor(rights, row) {
  if (rights.hr) return 'hr';
  if (rights.userId && row.user_id && Number(row.user_id) === Number(rights.userId)) return 'self';
  if (rights.view && DIRECTORY_STATUSES.includes(row.status)) return 'view';
  return null;
}

// ── CSV ─────────────────────────────────────────────────────────────────────

/** A CSV cell: quoted, and formulas neutralised (=, +, -, @, tab, CR start a formula in Excel). */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+([.,]\d+)?$/.test(text)) text = `'${text}`;
  return /[";\n\r,]/.test(text) || text !== String(value) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header, rows) {
  const line = (cells) => cells.map(csvCell).join(';');
  return `﻿${[line(header), ...rows.map(line)].join('\r\n')}\r\n`;
}

// ── Import ──────────────────────────────────────────────────────────────────

const STATUS_WORDS = {
  active: 'active', работает: 'active', работающий: 'active', 'в штате': 'active',
  vacation: 'vacation', отпуск: 'vacation', 'в отпуске': 'vacation',
  terminated: 'terminated', уволен: 'terminated', уволена: 'terminated', уволенный: 'terminated',
  candidate: 'candidate', кандидат: 'candidate',
};
const EMPLOYMENT_WORDS = {
  staff: 'staff', штат: 'staff', штатный: 'staff', 'в штате': 'staff',
  part_time: 'part_time', 'part-time': 'part_time', совместитель: 'part_time', совместительство: 'part_time',
  contractor: 'contractor', подрядчик: 'contractor', гпх: 'contractor',
  seasonal: 'seasonal', сезонный: 'seasonal', сезонная: 'seasonal',
};

/**
 * Validates import rows (already mapped to keys by the browser) against the
 * lookups and returns { plan: [{ row, values, match }], errors, warnings }.
 * Rows are numbered as in the sheet (header = 1). Nothing is written here.
 *
 * lookups: { units: [{ id, name, code, path }], positions: [{ id, name }],
 *            existing: Map(personnelNo lower → id), createPositions: bool }
 */
export function planImport(rows, lookups) {
  const plan = [];
  const errors = [];
  const warnings = [];
  const seenNo = new Set();
  const unitKey = (value) => String(value || '').trim().toLowerCase();
  const findUnit = (value) => {
    const wanted = unitKey(value);
    if (!wanted) return null;
    const matches = lookups.units.filter((unit) => unitKey(unit.code) === wanted || unitKey(unit.name) === wanted || unitKey((unit.path || []).join(' / ')) === wanted);
    return matches.length === 1 ? matches[0] : matches.length > 1 ? 'ambiguous' : undefined;
  };
  const newPositions = new Set();
  for (const [index, raw] of rows.slice(0, MAX_IMPORT_ROWS).entries()) {
    const row = index + 2;
    const err = (field, code, message) => errors.push({ row, field, code, message });
    const before = errors.length;
    const values = {};
    try {
      // Names are always checked; other columns only when the file has them.
      const given = { lastName: raw.lastName ?? '', firstName: raw.firstName ?? '' };
      for (const key of ['middleName', 'personnelNo', 'hireDate', 'birthDate', 'workEmail', 'workPhone', 'workMobile', 'personalEmail', 'personalPhone']) {
        if (raw[key] !== undefined && raw[key] !== null && String(raw[key]).trim() !== '') given[key] = raw[key];
      }
      Object.assign(values, cleanEmployee(given, { partial: true }));
    } catch (error) {
      err(error.info?.field || 'row', error.code || 'BAD_ROW', error.message);
    }
    const status = raw.status ? STATUS_WORDS[String(raw.status).trim().toLowerCase()] : 'active';
    if (!status) err('status', 'BAD_STATUS', `Unknown status «${raw.status}»`);
    else values.status = status;
    const employment = raw.employment ? EMPLOYMENT_WORDS[String(raw.employment).trim().toLowerCase()] : 'staff';
    if (!employment) err('employment', 'BAD_EMPLOYMENT', `Unknown employment type «${raw.employment}»`);
    else values.employment = employment;
    for (const [field, key] of [['unit', 'unitId'], ['site', 'siteId']]) {
      if (!clean(raw[field], 300)) continue;
      const unit = findUnit(raw[field]);
      if (unit === 'ambiguous') err(field, 'UNIT_AMBIGUOUS', `«${raw[field]}» matches several units: use the code or the full path`);
      else if (!unit) err(field, 'UNIT_UNKNOWN', `No unit «${raw[field]}» in the org structure`);
      else values[key] = unit.id;
    }
    const positionName = clean(raw.position, 160);
    if (positionName) {
      const found = lookups.positions.find((item) => item.name.toLowerCase() === positionName.toLowerCase());
      if (found) values.positionId = found.id;
      else if (lookups.createPositions) {
        values.positionName = positionName;
        if (!newPositions.has(positionName.toLowerCase())) warnings.push({ row, field: 'position', code: 'POSITION_NEW', message: `New position «${positionName}» will be added` });
        newPositions.add(positionName.toLowerCase());
      } else err('position', 'POSITION_UNKNOWN', `No position «${positionName}» in the directory`);
    }
    let match = null;
    if (values.personnelNo) {
      const key = values.personnelNo.toLowerCase();
      if (seenNo.has(key)) err('personnelNo', 'DUPLICATE', `Personnel number ${values.personnelNo} repeats in the file`);
      seenNo.add(key);
      match = lookups.existing.get(key) || null;
    }
    if (errors.length === before) plan.push({ row, values, match });
  }
  if (rows.length > MAX_IMPORT_ROWS) warnings.push({ row: MAX_IMPORT_ROWS + 2, field: 'row', code: 'TOO_MANY', message: `Only the first ${MAX_IMPORT_ROWS} rows are read` });
  return { plan, errors, warnings };
}

// ── Clearances ──────────────────────────────────────────────────────────────

/** Days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from, to) {
  const a = Date.UTC(...String(from).slice(0, 10).split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const b = Date.UTC(...String(to).slice(0, 10).split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((b - a) / 86400000);
}

/**
 * Which reminder thresholds of a clearance are reached today: `warnDays`
 * e.g. [30, 7, 0]. Returns { send: threshold | null, reached: [thresholds] }:
 * all reached thresholds are marked done, but only the closest one is sent
 * (a clearance first seen 5 days before expiry gets the 7-day notice, not the 30-day one too).
 */
export function clearanceThresholds(expiresOn, today, warnDays = [30, 7, 0]) {
  if (!expiresOn) return { send: null, reached: [], left: null };
  const left = daysBetween(today, expiresOn);
  const reached = [...new Set(warnDays)].filter((days) => left <= days).sort((a, b) => a - b);
  return { send: reached.length ? reached[0] : null, reached, left };
}

/** 'expired' | 'soon' | 'ok' | 'none' for the card and the registry chip. */
export function clearanceState(expiresOn, today, soonDays = 30) {
  if (!expiresOn) return 'none';
  const left = daysBetween(today, expiresOn);
  if (left < 0) return 'expired';
  if (left <= soonDays) return 'soon';
  return 'ok';
}

// ── Birthdays and anniversaries ─────────────────────────────────────────────

/**
 * The next occurrence of a yearly date (MM-DD of `day`) on or after `today`,
 * as { date, inDays, years } (years since `day`'s year at that occurrence).
 * 29 February falls on 28 February in other years.
 */
export function nextOccurrence(day, today) {
  if (!day) return null;
  const [y, m, d] = String(day).slice(0, 10).split('-').map(Number);
  const [ty] = String(today).slice(0, 10).split('-').map(Number);
  for (const year of [ty, ty + 1]) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const dd = m === 2 && d === 29 && !leap ? 28 : d;
    const date = `${year}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    const inDays = daysBetween(today, date);
    if (inDays >= 0) return { date, inDays, years: year - y };
  }
  return null;
}

/** Upcoming birthdays / anniversaries within `days`, nearest first. */
export function upcomingDates(list, today, days, field) {
  return list
    .map((item) => ({ item, next: nextOccurrence(item[field], today) }))
    .filter((entry) => entry.next && entry.next.inDays <= days && (field !== 'hireDate' || entry.next.years >= 1))
    .sort((a, b) => a.next.inDays - b.next.inDays || String(a.item.name).localeCompare(String(b.item.name), 'ru'));
}
