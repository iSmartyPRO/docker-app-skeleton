import '../test-fixtures/test-env.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Database integration of the Employees module (docs/employees.md):
 * visibility (directory vs HR vs the person), the portal account link
 * (create, link, unlink), termination with blocking, import validation,
 * clearance reminders sent once, the explicit manager in managerOf, and the
 * demo data (seed / purge, both idempotent). Needs a test database (never
 * production!) with the superadministrator «admin»:
 *
 *   EMPLOYEES_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/employees.db.test.js
 *
 * Without EMPLOYEES_DB_TEST it is skipped, so `npm test` stays database-free.
 */

const enabled = process.env.EMPLOYEES_DB_TEST === '1';
const skip = enabled ? false : 'set EMPLOYEES_DB_TEST=1 and a test database to run';

const tag = `empt${Date.now().toString(36)}`;
let db = null;
let restoreModule = null;
const created = { users: [], units: [], employees: [], positions: [] };

async function makeUser(name) {
  const { rows } = await db.query(`INSERT INTO users (username, password_hash, display_name) VALUES ($1, '!', $2) RETURNING id`, [`${tag}.${name}`, `${name} ${tag}`]);
  created.users.push(rows[0].id);
  return rows[0].id;
}

after(async () => {
  if (!db) return;
  await new Promise((resolve) => setTimeout(resolve, 300));
  const { rows } = await db.query(`SELECT id, user_id FROM employees WHERE last_name LIKE $1 OR personnel_no LIKE $1`, [`${tag}%`]);
  const userIds = [...created.users, ...rows.map((row) => row.user_id).filter(Boolean)];
  await db.query(`DELETE FROM employees WHERE id = ANY($1)`, [[...created.employees, ...rows.map((row) => row.id)]]);
  await db.query(`DELETE FROM emp_positions WHERE id = ANY($1) OR name LIKE $2`, [created.positions, `${tag}%`]);
  await db.query(`DELETE FROM emp_notices WHERE key LIKE 'clr:%' AND created_at > NOW() - INTERVAL '1 hour'`);
  if (userIds.length) {
    await db.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [userIds]).catch(() => {});
    await db.query(`UPDATE users SET org_unit_id = NULL WHERE id = ANY($1)`, [userIds]);
  }
  for (const id of [...created.units].reverse()) await db.query(`DELETE FROM org_units WHERE id = $1`, [id]).catch(() => {});
  if (userIds.length) await db.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
  if (restoreModule) await restoreModule();
  await db.closePool();
});

test('database: employees end to end', { skip }, async () => {
  db = await import('../config/database.js');
  const { ensureOrgSchema } = await import('../modules/org/schema.js');
  const { ensureEmployeesSchema } = await import('../modules/employees/schema.js');
  const { ensureDemoSchema, seedModule, purgeModule, demoCounts } = await import('../services/demo.js');
  await ensureOrgSchema();
  await ensureEmployeesSchema();
  await ensureDemoSchema();
  const settingsService = await import('../services/settings.js');
  await import('../modules/employees/index.js');
  await import('../modules/org/demo.js');
  await import('../modules/employees/demo.js');
  const service = await import('../modules/employees/service.js');
  const accounts = await import('../modules/employees/accounts.js');
  const { importEmployees } = await import('../modules/employees/importer.js');
  const { runClearanceReminders } = await import('../modules/employees/jobs.js');
  const orgService = await import('../modules/org/service.js');
  const org = await import('../modules/org/api.js');

  // The module on for the test, back as it was afterwards.
  const before = settingsService.parseSettings(await settingsService.getSettings({ fresh: true })).modules.employees.enabled;
  await settingsService.updateAdminSettings({ modules: { employees: { enabled: true } } });
  restoreModule = () => settingsService.updateAdminSettings({ modules: { employees: { enabled: before } } });

  const adminId = (await db.query(`SELECT id FROM users WHERE username = 'admin'`)).rows[0]?.id;
  assert.ok(adminId, 'the test database has the superadministrator «admin»');
  const hrUser = await makeUser('hr');
  const viewerUser = await makeUser('viewer');
  const selfUser = await makeUser('self');
  const strangerUser = await makeUser('stranger');
  const as = (id, permissions) => ({ user: { id, username: `u${id}` }, access: { permissions }, actor: { id, permissions: new Set(permissions) } });
  const hr = as(hrUser, ['employees.hr']);
  const hrAdmin = as(adminId, ['*']);
  const viewer = as(viewerUser, ['employees.view']);
  const stranger = as(strangerUser, []);
  const system = { system: true, user: { id: adminId } };

  const unit = await orgService.createUnit(system, { name: `${tag} Dept`, type: 'department' });
  created.units.push(unit.id);
  const position = await service.savePosition(hrAdmin, null, { name: `${tag} Fitter` });
  created.positions.push(position.id);

  // ── Cards and visibility ──────────────────────────────────────────────
  await assert.rejects(service.createEmployee(viewer, { lastName: `${tag}X`, firstName: 'X' }), (err) => err.code === 'FORBIDDEN');
  const boss = (await service.createEmployee(hr, { lastName: `${tag}Boss`, firstName: 'Bella', unitId: unit.id, positionId: position.id })).employee;
  created.employees.push(boss.id);
  const worker = (
    await service.createEmployee(hr, {
      lastName: `${tag}Worker`,
      firstName: 'Walt',
      unitId: unit.id,
      managerId: boss.id,
      personnelNo: `${tag}-1`,
      workEmail: 'walt@example.com',
      personalPhone: '+1 555 0001',
      birthDate: '1990-06-15',
      hrNotes: 'private',
    })
  ).employee;
  created.employees.push(worker.id);
  await assert.rejects(service.createEmployee(hr, { lastName: `${tag}Dup`, firstName: 'D', personnelNo: `${tag}-1` }), (err) => err.code === 'PERSONNEL_NO_TAKEN');
  await assert.rejects(service.updateEmployee(hr, boss.id, { managerId: worker.id }), (err) => err.code === 'MANAGER_LOOP');

  const asViewer = (await service.getEmployee(viewer, worker.id)).employee;
  assert.equal(asViewer.level, 'view');
  assert.equal(asViewer.work.email, 'walt@example.com');
  for (const key of ['personal', 'hrNotes', 'birthDate', 'personnelNo', 'documents', 'skills']) assert.equal(key in asViewer, false, key);
  const asHr = (await service.getEmployee(hr, worker.id)).employee;
  assert.equal(asHr.hrNotes, 'private');
  assert.equal(asHr.personal.phone, '+1 555 0001');
  await assert.rejects(service.getEmployee(stranger, worker.id), (err) => err.statusCode === 404, 'no right: the card does not exist');
  // The directory lists working people; HR filters by «no portal access».
  const list = await service.listEmployees(viewer, { q: tag });
  assert.deepEqual(list.items.map((item) => item.id).sort(), [boss.id, worker.id].sort());
  assert.equal(list.items.some((item) => 'personal' in item || 'hrNotes' in item), false);

  // ── Portal accounts ───────────────────────────────────────────────────
  await assert.rejects(accounts.createAccount(hr, worker.id, { username: `${tag}w`, password: 'supersecret1' }), (err) => err.code === 'FORBIDDEN', 'creating needs users.manage');
  await assert.rejects(accounts.createAccount(hrAdmin, worker.id, { username: `${tag}w`, method: 'password' }), (err) => err.code === 'PASSWORD_REQUIRED');
  const made = await accounts.createAccount(hrAdmin, worker.id, { username: `${tag}w`, method: 'password', password: 'supersecret1' });
  assert.equal(made.employee.user.username, `${tag}w`);
  const workerUser = made.employee.user.id;
  created.users.push(workerUser);
  const placed = (await db.query(`SELECT org_unit_id, display_name, password_hash LIKE '$2%' AS has_password FROM users WHERE id = $1`, [workerUser])).rows[0];
  assert.equal(placed.org_unit_id, unit.id, 'the account follows the card');
  assert.equal(placed.has_password, true);
  assert.match(placed.display_name, new RegExp(`${tag}Worker`));
  await assert.rejects(accounts.createAccount(hrAdmin, worker.id, { username: `${tag}w2`, password: 'supersecret1' }), (err) => err.code === 'ALREADY_LINKED');
  // The core org structure sees the employee: a unit change moves the account, the unit field is managed by the card.
  await assert.rejects(orgService.setUserUnit(system, workerUser, { unitId: null }), (err) => err.code === 'MANAGED_BY_EMPLOYEE');
  // Link / unlink an existing account (the boss), one card per account.
  const bossUser = await makeUser('boss');
  // Linking changes the account (unit, position, approvers): HR alone is not enough, users.manage is needed too.
  await assert.rejects(accounts.linkAccount(hr, boss.id, { userId: bossUser }), (err) => err.code === 'FORBIDDEN');
  const hrUsers = as(hrUser, ['employees.hr', 'users.manage']);
  await accounts.linkAccount(hrUsers, boss.id, { userId: bossUser });
  await assert.rejects(accounts.linkAccount(hrUsers, boss.id, { userId: workerUser }), (err) => err.code === 'USER_LINKED');
  await assert.rejects(accounts.linkAccount(hrUsers, boss.id, { userId: adminId }), (err) => err.statusCode === 403, 'not an account with more access than yours');
  assert.equal(await org.managerOf(workerUser), bossUser, 'the explicit manager on the card');
  // The person sees their own card with personal data, not HR notes.
  const mine = (await service.getEmployee(as(workerUser, []), worker.id)).employee;
  assert.equal(mine.level, 'self');
  assert.equal(mine.personal.phone, '+1 555 0001');
  assert.equal('hrNotes' in mine, false);
  await service.updateEmployee(as(workerUser, []), worker.id, { personalPhone: '+1 555 0002', hrNotes: 'mine now', personnelNo: 'X' });
  const afterSelf = (await service.getEmployee(hr, worker.id)).employee;
  assert.equal(afterSelf.personal.phone, '+1 555 0002');
  assert.equal(afterSelf.hrNotes, 'private', 'the person cannot touch HR fields');
  assert.equal(afterSelf.personnelNo, `${tag}-1`);
  await assert.rejects(accounts.unlinkAccount(hr, boss.id), (err) => err.code === 'FORBIDDEN');
  await accounts.unlinkAccount(hrUsers, boss.id);
  assert.equal((await service.getEmployee(hr, boss.id)).employee.user, null);
  assert.equal(await org.managerOf(workerUser), null, 'no manager with a portal account, no head of the unit');
  await orgService.updateUnit(system, unit.id, { headUserId: bossUser });
  assert.equal(await org.managerOf(workerUser), bossUser, 'the head of the unit');

  // ── Termination offers to block the account ───────────────────────────
  const changed = await service.updateEmployee(hr, worker.id, { status: 'terminated' });
  assert.equal(changed.offerBlock, true);
  assert.ok(changed.employee.terminationDate, 'the date is set');
  assert.equal((await service.listEmployees(viewer, { q: tag })).items.some((item) => item.id === worker.id), false, 'terminated people leave the directory');
  await service.updateEmployee(hr, worker.id, { status: 'active' });
  await assert.rejects(service.terminateEmployee(hr, worker.id, { date: '2026-10-16', blockUser: true }), (err) => err.code === 'FORBIDDEN', 'blocking needs users.manage');
  const terminated = await service.terminateEmployee(hrAdmin, worker.id, { date: '2026-10-16', blockUser: true });
  assert.equal(terminated.employee.status, 'terminated');
  assert.equal(terminated.employee.terminationDate, '2026-10-16');
  assert.equal(terminated.employee.user.isBlocked, true);

  // ── Import ────────────────────────────────────────────────────────────
  const bad = await importEmployees(hr, { rows: [{ lastName: `${tag}Imp`, firstName: '', unit: 'nope' }, { lastName: `${tag}Imp2`, firstName: 'A', hireDate: '31.02.2024' }] });
  assert.equal(bad.ok, false);
  assert.equal(bad.written, false);
  assert.deepEqual(bad.errors.map((error) => `${error.row}:${error.code}`).sort(), ['2:NAME_REQUIRED', '2:UNIT_UNKNOWN', '3:BAD_DATE']);
  const rows = [
    { lastName: `${tag}Imp`, firstName: 'Ivan', personnelNo: `${tag}-10`, position: `${tag} Welder`, unit: `${tag} Dept`, status: 'работает' },
    { lastName: `${tag}Imp`, firstName: 'Olga', personnelNo: `${tag}-1`, employment: 'сезонный' },
  ];
  const dry = await importEmployees(hr, { rows, dryRun: true });
  assert.deepEqual([dry.ok, dry.created, dry.updated, dry.written], [true, 1, 1, false]);
  assert.equal(dry.warnings[0].code, 'POSITION_NEW');
  const done = await importEmployees(hr, { rows });
  assert.deepEqual([done.ok, done.created, done.updated, done.written], [true, 1, 1, true]);
  const updatedWorker = (await service.getEmployee(hr, worker.id)).employee;
  assert.equal(updatedWorker.firstName, 'Olga', 'the known personnel number updated that card');
  assert.equal(updatedWorker.employment, 'seasonal');
  assert.equal(updatedWorker.hrNotes, 'private', 'empty cells keep what the card has');

  // ── Clearance reminders: once per threshold ───────────────────────────
  await service.updateEmployee(hr, worker.id, { status: 'active' });
  await service.saveSkill(hr, worker.id, null, { kind: 'clearance', name: `${tag} Height`, expiresOn: '2026-10-21' });
  const settings = { clearanceWarnDays: [30, 7, 0], notifyEmployee: true, notifyManager: true };
  const first = await runClearanceReminders({ today: '2026-10-16', settings });
  assert.ok(first.sent >= 1);
  const skill = (await db.query(`SELECT id FROM emp_skills WHERE employee_id = $1`, [worker.id])).rows[0].id;
  const keys = (await db.query(`SELECT key FROM emp_notices WHERE key LIKE $1 ORDER BY key`, [`clr:${skill}:%`])).rows.map((row) => row.key);
  assert.deepEqual(keys, [`clr:${skill}:2026-10-21:30`, `clr:${skill}:2026-10-21:7`], 'the 7-day notice sent, the 30-day one only marked');
  const again = await runClearanceReminders({ today: '2026-10-17', settings });
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM emp_notices WHERE key LIKE $1`, [`clr:${skill}:%`])).rows[0].n, 2, 'nothing new the next day');
  assert.equal(again.sent >= 0, true);
  await runClearanceReminders({ today: '2026-10-21', settings });
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM emp_notices WHERE key LIKE $1`, [`clr:${skill}:%`])).rows[0].n, 3, 'the «on the day» notice');
  const notified = (await db.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'employees.clearance'`, [workerUser])).rows[0].n;
  assert.equal(notified, 0, 'a blocked account gets nothing');

  // ── Demo data: seed and purge, both idempotent ────────────────────────
  const req = { user: { id: adminId, username: 'admin' }, access: { permissions: ['*'] }, locale: 'ru' };
  const hadOrg = Boolean((await demoCounts()).org);
  const hadEmployees = Boolean((await demoCounts()).employees);
  if (!hadEmployees) {
    const seeded = await seedModule('employees', req);
    assert.equal(seeded.already, false);
    assert.ok(seeded.counts.employees >= 25);
    const again2 = await seedModule('employees', req);
    assert.equal(again2.already, true);
    const demo = await service.listEmployees(hrAdmin, { q: 'DEMO-', status: 'all', limit: 200 });
    assert.ok(demo.total >= 25);
    assert.ok((await service.listEmployees(hrAdmin, { q: 'DEMO-', noAccess: '1', limit: 200 })).total >= 10, 'people without portal access');
    assert.ok((await service.listEmployees(hrAdmin, { q: 'DEMO-', expiring: '1', limit: 200 })).total >= 3, 'clearances expiring');
    // Their clearances expire inside the warning window, yet real HR hears nothing about made-up people.
    const demoPeople = (await db.query(`SELECT record_key FROM demo_records WHERE module = 'employees' AND table_name = 'employees'`)).rows.map((row) => Number(row.record_key));
    await runClearanceReminders({ settings: { clearanceWarnDays: [30, 7, 0], notifyEmployee: true, notifyManager: true } });
    const demoNotices = await db.query(`SELECT COUNT(*)::int AS n FROM emp_notices n JOIN emp_skills s ON n.key LIKE 'clr:' || s.id || ':%' WHERE s.employee_id = ANY($1)`, [demoPeople]);
    assert.equal(demoNotices.rows[0].n, 0, 'no reminders about demo people');
    const purged = await purgeModule('employees', req);
    assert.equal(purged.kept, 0);
    assert.equal((await service.listEmployees(hrAdmin, { q: 'DEMO-', status: 'all' })).total, 0);
    const twice = await purgeModule('employees', req);
    assert.equal(twice.removed, 0);
    if (!hadOrg) {
      const orgPurged = await purgeModule('org', req);
      assert.equal(orgPurged.kept, 0);
      assert.equal(Boolean((await demoCounts()).org), false);
    }
  }
});

test('database: who sees employees in pickers, headcounts, managers and position renames', { skip }, async () => {
  db ||= await import('../config/database.js');
  const settingsService = await import('../services/settings.js');
  await import('../modules/employees/index.js');
  const service = await import('../modules/employees/service.js');
  const { activeProvider } = await import('../modules/org/providers.js');
  const before = settingsService.parseSettings(await settingsService.getSettings({ fresh: true })).modules.employees;
  await settingsService.updateAdminSettings({ modules: { employees: { enabled: true, settings: { everyoneCanView: false } } } });
  try {
    const as = (id, permissions) => ({ user: { id, username: `u${id}` }, access: { permissions }, actor: { id, permissions: new Set(permissions) } });
    const adminId = (await db.query(`SELECT id FROM users WHERE username = 'admin'`)).rows[0]?.id;
    const hrAdmin = as(adminId, ['*']);
    const viewer = as(await makeUser('viewer2'), ['employees.view']);
    const stranger = as(await makeUser('stranger2'), []);
    const linked = await makeUser('linked2');

    // The org «people» picker: employees (also without portal access) only for directory readers and org managers.
    const provider = await activeProvider();
    assert.ok(provider?.searchEmployees);
    assert.equal(await provider.searchEmployees('', { req: stranger }), null);
    assert.ok(Array.isArray(await provider.searchEmployees('', { req: viewer })));
    assert.ok(Array.isArray(await provider.searchEmployees('', { req: stranger, canManageOrg: true })));

    // Headcounts of positions are directory data.
    const position = await service.savePosition(hrAdmin, null, { name: `${tag} Rigger` });
    created.positions.push(position.id);
    const boss = (await service.createEmployee(hrAdmin, { lastName: `${tag}Gone`, firstName: 'G', positionId: position.id })).employee;
    created.employees.push(boss.id);
    const worker = (await service.createEmployee(hrAdmin, { lastName: `${tag}Stay`, firstName: 'S', positionId: position.id, managerId: boss.id })).employee;
    created.employees.push(worker.id);
    const counted = (await service.listPositions(viewer)).find((item) => item.id === position.id);
    assert.equal(counted.people, 2);
    const hidden = (await service.listPositions(stranger)).find((item) => item.id === position.id);
    assert.equal(hidden.people, null, 'no headcount without the directory');

    // A terminated manager is not shown on directory cards; HR still sees who is set.
    await db.query(`UPDATE employees SET status = 'terminated' WHERE id = $1`, [boss.id]);
    assert.equal((await service.getEmployee(viewer, worker.id)).employee.manager, null);
    assert.equal((await service.getEmployee(hrAdmin, worker.id)).employee.manager.id, boss.id);
    const listed = (await service.listEmployees(viewer, { q: `${tag}Stay` })).items.find((item) => item.id === worker.id);
    assert.equal(listed.manager, null);

    // Renaming a position renames it on linked accounts too.
    await db.query(`UPDATE employees SET user_id = $2 WHERE id = $1`, [worker.id, linked]);
    await db.query(`UPDATE users SET position_title = $2 WHERE id = $1`, [linked, `${tag} Rigger`]);
    await service.savePosition(hrAdmin, position.id, { name: `${tag} Senior rigger` });
    assert.equal((await db.query(`SELECT position_title FROM users WHERE id = $1`, [linked])).rows[0].position_title, `${tag} Senior rigger`);
    await db.query(`UPDATE employees SET user_id = NULL WHERE id = $1`, [worker.id]);
  } finally {
    await settingsService.updateAdminSettings({ modules: { employees: { enabled: before.enabled, settings: { everyoneCanView: Boolean(before.settings?.everyoneCanView) } } } });
  }
});
