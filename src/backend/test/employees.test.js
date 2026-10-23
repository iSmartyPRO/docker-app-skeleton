import '../test-fixtures/test-env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearanceState,
  clearanceThresholds,
  cleanEmployee,
  csvCell,
  daysBetween,
  levelFor,
  nextOccurrence,
  parseDay,
  planImport,
  shapeEmployee,
  toCsv,
  upcomingDates,
} from '../modules/employees/logic.js';
import { MODULE_CATALOG, resolveModules } from '../modules/catalog.js';
import { EMPLOYEES_DEFAULTS, sanitizeEmployees } from '../modules/employees/settings.js';
import { sourcePackage } from './helpers/modules.js';
import { NOTIFICATION_GROUPS } from '../services/notificationCatalog.js';
import { suggestUsername } from '../modules/employees/accounts.js';

// Employees is a module package: its catalog entry as an installed package adds it (module.json + settings.js).
await sourcePackage('employees');

/* Pure parts of the Employees module (docs/employees.md). */

const row = {
  id: 7,
  last_name: 'Иванов',
  first_name: 'Иван',
  middle_name: 'Петрович',
  photo_key: null,
  status: 'active',
  employment: 'staff',
  work_email: 'ivanov@example.com',
  work_phone: '+1 555 0100',
  work_mobile: null,
  work_location: null,
  personal_email: 'home@example.com',
  personal_phone: '+1 555 0199',
  personal_address: 'Home 1',
  emergency_contact: null,
  birth_date: new Date(1990, 5, 15),
  hire_date: '2020-03-01',
  termination_date: null,
  personnel_no: 'T-1',
  hr_notes: 'secret',
  ad_account: null,
  user_id: 11,
};

test('employees: the directory never carries personal data', () => {
  const view = shapeEmployee(row, 'view');
  assert.equal(view.name, 'Иванов Иван Петрович');
  assert.equal(view.shortName, 'Иванов И. П.');
  assert.equal(view.work.email, 'ivanov@example.com');
  for (const key of ['personal', 'birthDate', 'hrNotes', 'personnelNo', 'hireDate', 'skills', 'documents', 'user', 'employment']) assert.equal(key in view, false, key);
  const self = shapeEmployee(row, 'self');
  assert.equal(self.personal.email, 'home@example.com');
  assert.equal(self.birthDate, '1990-06-15', 'a DATE column becomes YYYY-MM-DD');
  assert.equal('hrNotes' in self, false);
  assert.equal('documents' in self, false);
  const hr = shapeEmployee(row, 'hr');
  assert.equal(hr.hrNotes, 'secret');
  assert.equal(hr.personnelNo, 'T-1');
  assert.equal(hr.hireDate, '2020-03-01');
});

test('employees: who sees a card at which level', () => {
  const viewer = { view: true, hr: false, userId: 99 };
  assert.equal(levelFor({ hr: true }, { ...row, status: 'terminated' }), 'hr');
  assert.equal(levelFor(viewer, row), 'view');
  assert.equal(levelFor(viewer, { ...row, status: 'terminated' }), null, 'the directory shows working people only');
  assert.equal(levelFor(viewer, { ...row, status: 'candidate' }), null);
  assert.equal(levelFor({ view: false, hr: false, userId: 11 }, { ...row, status: 'terminated' }), 'self', 'the person always sees their own card');
  assert.equal(levelFor({ view: false, hr: false, userId: 5 }, row), null);
});

test('employees: input cleaning and dates', () => {
  assert.equal(parseDay('15.06.1990'), '1990-06-15');
  assert.equal(parseDay('2020-02-29'), '2020-02-29');
  assert.equal(parseDay('1.2.05'), '2005-02-01');
  assert.equal(parseDay(''), null);
  assert.throws(() => parseDay('2021-02-29'), (err) => err.code === 'BAD_DATE');
  assert.throws(() => parseDay('tomorrow'), (err) => err.code === 'BAD_DATE');
  const clean = cleanEmployee({ lastName: ' Петров ', firstName: 'Пётр', workEmail: 'P@Example.COM', status: 'vacation', hireDate: '01.02.2024' });
  assert.equal(clean.lastName, 'Петров');
  assert.equal(clean.workEmail, 'p@example.com');
  assert.equal(clean.hireDate, '2024-02-01');
  assert.throws(() => cleanEmployee({ lastName: 'A', firstName: 'B', status: 'fired' }), (err) => err.code === 'BAD_STATUS');
  assert.throws(() => cleanEmployee({ lastName: '', firstName: 'B' }), (err) => err.code === 'NAME_REQUIRED');
  assert.throws(() => cleanEmployee({ lastName: 'A', firstName: 'B', workEmail: 'nope' }), (err) => err.code === 'BAD_EMAIL');
  assert.throws(() => cleanEmployee({ lastName: 'A', firstName: 'B', hireDate: '2024-05-01', terminationDate: '2024-04-01' }), (err) => err.code === 'BAD_DATES');
  assert.deepEqual(Object.keys(cleanEmployee({ workPhone: '+1 (555) 01-00 ext' }, { partial: true })), ['workPhone']);
});

test('employees: CSV export neutralises formulas', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+1 555 0100'), `"'+1 555 0100"`);
  assert.equal(csvCell('-5'), '-5');
  assert.equal(csvCell('@SUM(A1)'), `"'@SUM(A1)"`);
  const csv = toCsv(['Name'], [['Иванов']]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('Иванов'));
});

test('employees: import rows are validated with a report', () => {
  const lookups = {
    units: [
      { id: 1, name: 'Отдел продаж', code: 'S-N', path: ['Компания', 'Север', 'Отдел продаж'] },
      { id: 2, name: 'Отдел продаж', code: 'S-S', path: ['Компания', 'Юг', 'Отдел продаж'] },
      { id: 3, name: 'Объект «Север»', code: 'SITE', path: ['Компания', 'Объект «Север»'] },
    ],
    positions: [{ id: 5, name: 'Монтажник' }],
    existing: new Map([['t-1', 70]]),
    createPositions: true,
  };
  const report = planImport(
    [
      { lastName: 'Иванов', firstName: 'Иван', personnelNo: 'T-1', position: 'монтажник', unit: 'S-N', site: 'SITE', status: 'работает', hireDate: '01.03.2024' },
      { lastName: 'Петров', firstName: 'Пётр', unit: 'Отдел продаж' },
      { lastName: 'Сидоров', firstName: '', unit: 'Нет такого' },
      { lastName: 'Козлов', firstName: 'Кирилл', personnelNo: 'T-1', status: 'уволен', employment: 'вахта' },
      { lastName: 'Новиков', firstName: 'Ник', position: 'Сварщик', hireDate: '31.02.2024', unit: 'Компания / Юг / Отдел продаж' },
      { lastName: 'Орлов', firstName: 'Олег', position: 'Сварщик', employment: 'сезонный', unit: 'Компания / Юг / Отдел продаж' },
    ],
    lookups
  );
  assert.equal(report.plan.length, 2);
  assert.deepEqual(report.plan[0], { row: 2, match: 70, values: { lastName: 'Иванов', firstName: 'Иван', personnelNo: 'T-1', hireDate: '2024-03-01', status: 'active', employment: 'staff', unitId: 1, siteId: 3, positionId: 5 } });
  assert.equal(report.plan[1].row, 7);
  assert.equal(report.plan[1].values.positionName, 'Сварщик');
  assert.equal(report.plan[1].values.employment, 'seasonal');
  assert.equal(report.plan[1].values.unitId, 2, 'the full path picks one of two same names');
  const codes = report.errors.map((error) => `${error.row}:${error.code}`);
  assert.ok(codes.includes('3:UNIT_AMBIGUOUS'));
  assert.ok(codes.includes('4:NAME_REQUIRED'));
  assert.ok(codes.includes('4:UNIT_UNKNOWN'));
  assert.ok(codes.includes('5:DUPLICATE'));
  assert.ok(codes.includes('5:BAD_EMPLOYMENT'));
  assert.ok(codes.includes('6:BAD_DATE'));
  assert.deepEqual(report.warnings.map((warning) => warning.code), ['POSITION_NEW'], 'one warning per new position');
  const strict = planImport([{ lastName: 'A', firstName: 'B', position: 'Новая' }], { ...lookups, createPositions: false });
  assert.equal(strict.errors[0].code, 'POSITION_UNKNOWN');
});

test('employees: clearance reminders fire once per threshold, the closest first', () => {
  assert.equal(daysBetween('2026-10-16', '2026-10-23'), 7);
  assert.deepEqual(clearanceThresholds('2026-11-30', '2026-10-16', [30, 7, 0]), { send: null, reached: [], left: 45 });
  assert.deepEqual(clearanceThresholds('2026-11-10', '2026-10-16', [30, 7, 0]), { send: 30, reached: [30], left: 25 });
  // First seen 5 days before: the 7-day notice is sent, the 30-day one only marked.
  assert.deepEqual(clearanceThresholds('2026-10-21', '2026-10-16', [30, 7, 0]), { send: 7, reached: [7, 30], left: 5 });
  assert.deepEqual(clearanceThresholds('2026-10-10', '2026-10-16', [30, 7, 0]).send, 0, 'expired: the «on the day» notice');
  assert.equal(clearanceState('2026-10-10', '2026-10-16'), 'expired');
  assert.equal(clearanceState('2026-10-20', '2026-10-16'), 'soon');
  assert.equal(clearanceState('2027-10-20', '2026-10-16'), 'ok');
  assert.equal(clearanceState(null, '2026-10-16'), 'none');
});

test('employees: birthdays show day and month, anniversaries count years', () => {
  assert.deepEqual(nextOccurrence('1990-10-20', '2026-10-16'), { date: '2026-10-20', inDays: 4, years: 36 });
  assert.deepEqual(nextOccurrence('1990-01-05', '2026-12-30'), { date: '2027-01-05', inDays: 6, years: 37 });
  assert.equal(nextOccurrence('2000-02-29', '2027-02-20').date, '2027-02-28', '29 February in a common year');
  const people = [
    { name: 'A', birthDate: '1990-10-18', hireDate: '2025-10-17' },
    { name: 'B', birthDate: '1990-12-01', hireDate: '2026-10-17' },
    { name: 'C', birthDate: '1985-10-16', hireDate: null },
  ];
  assert.deepEqual(upcomingDates(people, '2026-10-16', 14, 'birthDate').map((entry) => entry.item.name), ['C', 'A']);
  // A hire date this year is not an anniversary yet.
  assert.deepEqual(upcomingDates(people, '2026-10-16', 14, 'hireDate').map((entry) => `${entry.item.name}:${entry.next.years}`), ['A:1']);
});

test('employees: settings, permissions, notifications', () => {
  const module = MODULE_CATALOG.find((item) => item.id === 'employees');
  assert.equal(module.defaultEnabled, false);
  assert.deepEqual(module.permissions, ['employees.view', 'employees.hr', 'employees.admin']);
  assert.equal(resolveModules({}).employees.enabled, false);
  const next = sanitizeEmployees(EMPLOYEES_DEFAULTS, { birthdays: 'nobody', clearanceWarnDays: [7, '30', 7, -1, 500, 'x'], everyoneCanView: 'yes', junk: 1 });
  assert.equal(next.birthdays, 'all');
  assert.deepEqual(next.clearanceWarnDays, [365, 30, 7]);
  assert.equal(next.everyoneCanView, false);
  assert.equal('junk' in next, false);
  const kinds = NOTIFICATION_GROUPS.flatMap((group) => group.events.map((event) => event.kind));
  assert.ok(kinds.includes('employees.clearance'));
  assert.equal(suggestUsername({ last_name: 'Щукина', first_name: 'Юлия' }), 'shchukina.y');
  assert.equal(suggestUsername({ last_name: 'Smith', first_name: 'Anna' }), 'smith.a');
});
