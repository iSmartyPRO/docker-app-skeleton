import { query, withTransaction } from '../../config/database.js';
import { isoDay } from '../../services/datetime.js';
import { portalRegional } from '../../services/regional.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { avatarOf } from '../shared/acl.js';
import { byId, descendantIds, loadUnits, pathNames } from '../org/api.js';
import { assertAdmin, assertHr, assertView, rightsOf } from './access.js';
import { extensionsFor } from './extensions.js';
import {
  DIRECTORY_STATUSES,
  EMPLOYMENT,
  HR_FIELDS,
  STATUSES,
  clean,
  cleanEmployee,
  clearanceState,
  dayText,
  fullName,
  httpError,
  intOrNull,
  levelFor,
  parseDay,
  shapeEmployee,
  toCsv,
  upcomingDates,
} from './logic.js';
import { translator } from '../../services/i18n/index.js';

/*
 * Employees service (docs/employees.md): the registry, the card, positions,
 * skills and clearances, history, export and the birthdays widget. Visibility
 * is decided here for every answer (logic.js → shapeEmployee / levelFor).
 */

const PAGE_MAX = 200;
const COLUMNS = {
  lastName: 'last_name',
  firstName: 'first_name',
  middleName: 'middle_name',
  positionId: 'position_id',
  unitId: 'unit_id',
  siteId: 'site_id',
  managerId: 'manager_id',
  personnelNo: 'personnel_no',
  hireDate: 'hire_date',
  terminationDate: 'termination_date',
  birthDate: 'birth_date',
  status: 'status',
  employment: 'employment',
  workEmail: 'work_email',
  workPhone: 'work_phone',
  workMobile: 'work_mobile',
  workLocation: 'work_location',
  personalEmail: 'personal_email',
  personalPhone: 'personal_phone',
  personalAddress: 'personal_address',
  emergencyContact: 'emergency_contact',
  hrNotes: 'hr_notes',
  adAccount: 'ad_account',
};

export async function portalToday() {
  const regional = await portalRegional().catch(() => ({ timeZone: 'UTC' }));
  return isoDay(new Date(), regional.timeZone || 'UTC');
}

const actorOf = (req) => (req?.user?.id ? Number(req.user.id) : null);

export async function logEvent(client, employeeId, action, actorId, data = {}) {
  await client.query(`INSERT INTO emp_events (employee_id, action, actor_id, data) VALUES ($1, $2, $3, $4)`, [employeeId, action, actorId, JSON.stringify(data)]);
}

// ── Lookups ─────────────────────────────────────────────────────────────────

export async function positionsMap() {
  const { rows } = await query(`SELECT id, name, archived_at FROM emp_positions`);
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, archived: Boolean(row.archived_at) }]));
}

async function context() {
  const units = await loadUnits();
  return { units, unitMap: byId(units), positions: await positionsMap() };
}

const unitShape = (ctx, id) => {
  const unit = id ? ctx.unitMap.get(Number(id)) : null;
  return unit ? { id: unit.id, name: unit.name, type: unit.type, code: unit.code, status: unit.status, path: pathNames(ctx.unitMap, unit.id) } : null;
};

async function managersOf(rows) {
  const ids = [...new Set(rows.map((row) => row.manager_id).filter(Boolean))];
  if (!ids.length) return new Map();
  const { rows: found } = await query(`SELECT id, last_name, first_name, middle_name, photo_key, user_id, status FROM employees WHERE id = ANY($1)`, [ids]);
  return new Map(found.map((row) => [row.id, { id: row.id, name: fullName(row), photoUrl: row.photo_key ? `/api/app/employees/employees/${row.id}/photo` : null, userId: row.user_id || null, status: row.status }]));
}

/** The manager on a card: HR sees whoever is set (to fix it); the directory only a working one. */
function managerFor(managers, row, level) {
  const manager = row.manager_id ? managers.get(row.manager_id) || null : null;
  if (!manager) return null;
  if (level === 'hr') return manager;
  if (!['active', 'vacation'].includes(manager.status)) return null;
  const { status, ...visible } = manager;
  return visible;
}

async function usersOf(rows) {
  const ids = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
  if (!ids.length) return new Map();
  const { rows: found } = await query(
    `SELECT id, username, email, COALESCE(display_name, username) AS name, avatar_path, is_active, is_blocked, last_login_at FROM users WHERE id = ANY($1)`,
    [ids]
  );
  return new Map(found.map((row) => [row.id, { id: row.id, username: row.username, email: row.email || null, name: row.name, avatarUrl: avatarOf(row.avatar_path), isActive: row.is_active !== false, isBlocked: row.is_blocked === true, lastLoginAt: row.last_login_at }]));
}

export function skillShape(row, today) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    number: row.number || null,
    level: row.level || null,
    issuedOn: dayText(row.issued_on),
    expiresOn: dayText(row.expires_on),
    state: clearanceState(dayText(row.expires_on), today),
    note: row.note || null,
  };
}

export function fileShape(row) {
  return { id: row.id, name: row.name, ext: row.ext, size: Number(row.size), note: row.note || null, createdAt: row.created_at, uploadedBy: row.uploaded_by, url: `/api/app/employees/files/${row.id}` };
}

async function rawEmployee(id, client = { query }) {
  const { rows } = await client.query(`SELECT * FROM employees WHERE id = $1`, [intOrNull(id) || 0]);
  return rows[0] || null;
}

/** A row the viewer may see, with their level; 404 otherwise (a hidden card does not exist). */
export async function visibleRow(rights, id) {
  const row = await rawEmployee(id);
  const level = row ? levelFor(rights, row) : null;
  if (!row || !level) throw httpError(404, 'Employee not found', 'NOT_FOUND');
  return { row, level };
}

/** The full card for the viewer's level. */
export async function shapeOne(rights, row, level) {
  const ctx = await context();
  const today = await portalToday();
  const managers = await managersOf([row]);
  const extra = {
    position: row.position_id ? ctx.positions.get(row.position_id) || null : null,
    unit: unitShape(ctx, row.unit_id),
    site: unitShape(ctx, row.site_id),
    manager: managerFor(managers, row, level),
  };
  if (level !== 'view') {
    const { rows: skills } = await query(`SELECT * FROM emp_skills WHERE employee_id = $1 ORDER BY kind DESC, expires_on NULLS LAST, LOWER(name)`, [row.id]);
    extra.skills = skills.map((skill) => skillShape(skill, today));
  }
  if (level === 'hr') {
    extra.user = row.user_id ? (await usersOf([row])).get(row.user_id) || null : null;
    const { rows: files } = await query(`SELECT * FROM emp_files WHERE employee_id = $1 ORDER BY id DESC`, [row.id]);
    extra.documents = files.map(fileShape);
  }
  return shapeEmployee(row, level, extra);
}

// ── Registry ────────────────────────────────────────────────────────────────

/**
 * Filters: q, unitId (with its subunits unless subtree=0), siteId, positionId,
 * status, employment, noAccess (no portal account), expiring (a clearance
 * expires within N days or has expired), sort (name|position|unit|hireDate),
 * page, limit. HR-only filters are ignored for the directory.
 */
export async function listEmployees(req, filters = {}) {
  const rights = await rightsOf(req);
  assertView(rights);
  if (!rights.view) return { items: [], total: 0, page: 1, limit: 0 };
  const { where, params, ctx } = await buildFilter(rights, filters);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(filters.limit) || 50));
  const page = Math.max(1, Number(filters.page) || 1);
  const order = {
    name: 'LOWER(e.last_name), LOWER(e.first_name)',
    position: 'LOWER(p.name) NULLS LAST, LOWER(e.last_name)',
    unit: 'e.unit_id NULLS LAST, LOWER(e.last_name)',
    hireDate: rights.hr ? 'e.hire_date DESC NULLS LAST, LOWER(e.last_name)' : 'LOWER(e.last_name)',
  }[filters.sort] || 'LOWER(e.last_name), LOWER(e.first_name)';
  const total = Number((await query(`SELECT COUNT(*)::int AS n FROM employees e LEFT JOIN emp_positions p ON p.id = e.position_id WHERE ${where}`, params)).rows[0].n);
  const { rows } = await query(
    `SELECT e.*, (SELECT MIN(s.expires_on) FROM emp_skills s WHERE s.employee_id = e.id AND s.kind = 'clearance' AND s.expires_on IS NOT NULL) AS next_expiry
     FROM employees e LEFT JOIN emp_positions p ON p.id = e.position_id
     WHERE ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    params
  );
  return { items: await shapeList(rights, rows, ctx), total, page, limit };
}

async function buildFilter(rights, filters) {
  const ctx = await context();
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const where = ['TRUE'];
  // The directory shows working people only; the person always finds themselves.
  if (!rights.hr) where.push(`(e.status = ANY(${add(DIRECTORY_STATUSES)}) OR e.user_id = ${add(rights.userId || 0)})`);
  const q = clean(filters.q, 80);
  if (q) {
    const like = add(`%${q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`);
    const hrPart = rights.hr ? ` OR e.personnel_no ILIKE ${like} OR e.personal_phone ILIKE ${like}` : '';
    where.push(`(CONCAT_WS(' ', e.last_name, e.first_name, e.middle_name) ILIKE ${like} OR CONCAT_WS(' ', e.first_name, e.last_name) ILIKE ${like} OR e.work_email ILIKE ${like} OR e.work_phone ILIKE ${like} OR e.work_mobile ILIKE ${like} OR p.name ILIKE ${like}${hrPart})`);
  }
  const unitId = intOrNull(filters.unitId);
  if (unitId) {
    const ids = filters.subtree === '0' || filters.subtree === false ? [unitId] : [unitId, ...descendantIds(ctx.units, unitId)];
    where.push(`e.unit_id = ANY(${add(ids)})`);
  }
  const siteId = intOrNull(filters.siteId);
  if (siteId) where.push(`e.site_id = ${add(siteId)}`);
  const positionId = intOrNull(filters.positionId);
  if (positionId) where.push(`e.position_id = ${add(positionId)}`);
  if (STATUSES.includes(filters.status) && (rights.hr || DIRECTORY_STATUSES.includes(filters.status))) where.push(`e.status = ${add(filters.status)}`);
  else if (rights.hr && filters.status !== 'all') where.push(`e.status <> 'terminated'`);
  if (rights.hr) {
    if (EMPLOYMENT.includes(filters.employment)) where.push(`e.employment = ${add(filters.employment)}`);
    if (filters.noAccess === '1' || filters.noAccess === true) where.push(`e.user_id IS NULL`);
    if (filters.expiring === '1' || filters.expiring === true) {
      const days = Math.max(0, ...(rights.settings.clearanceWarnDays || [30]), 30);
      const today = await portalToday();
      where.push(`EXISTS (SELECT 1 FROM emp_skills s WHERE s.employee_id = e.id AND s.kind = 'clearance' AND s.expires_on IS NOT NULL AND s.expires_on <= (${add(today)}::date + ${add(days)}::int))`);
    }
  }
  return { where: where.join(' AND '), params, ctx };
}

async function shapeList(rights, rows, ctx) {
  const managers = await managersOf(rows);
  const users = rights.hr ? await usersOf(rows) : new Map();
  const today = await portalToday();
  return rows
    .map((row) => {
      const level = levelFor(rights, row);
      if (!level) return null;
      const item = shapeEmployee(row, level === 'self' ? 'view' : level, {
        position: row.position_id ? ctx.positions.get(row.position_id) || null : null,
        unit: unitShape(ctx, row.unit_id),
        site: unitShape(ctx, row.site_id),
        manager: managerFor(managers, row, level),
        user: row.user_id ? users.get(row.user_id) || null : null,
      });
      if (level === 'hr') {
        const expiry = row.next_expiry ? String(isoDayOf(row.next_expiry)) : null;
        item.clearance = expiry ? { expiresOn: expiry, state: clearanceState(expiry, today) } : null;
        delete item.hrNotes;
        delete item.personal;
        delete item.skills;
        delete item.documents;
      }
      return item;
    })
    .filter(Boolean);
}

const isoDayOf = dayText;

/** Counters for the registry chips (HR: every status, no access, expiring). */
export async function counters(req) {
  const rights = await rightsOf(req);
  assertView(rights);
  if (!rights.hr) {
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM employees WHERE status = ANY($1)`, [DIRECTORY_STATUSES]);
    return { total: rows[0].n };
  }
  const today = await portalToday();
  const days = Math.max(0, ...(rights.settings.clearanceWarnDays || [30]), 30);
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE status <> 'terminated')::int AS total,
            COUNT(*) FILTER (WHERE status = 'active')::int AS active,
            COUNT(*) FILTER (WHERE status = 'vacation')::int AS vacation,
            COUNT(*) FILTER (WHERE status = 'candidate')::int AS candidate,
            COUNT(*) FILTER (WHERE status = 'terminated')::int AS terminated,
            COUNT(*) FILTER (WHERE status <> 'terminated' AND user_id IS NULL)::int AS no_access,
            COUNT(*) FILTER (WHERE status <> 'terminated' AND EXISTS (SELECT 1 FROM emp_skills s WHERE s.employee_id = employees.id AND s.kind = 'clearance' AND s.expires_on IS NOT NULL AND s.expires_on <= ($1::date + $2::int)))::int AS expiring
     FROM employees`,
    [today, days]
  );
  return rows[0];
}

// ── Card ────────────────────────────────────────────────────────────────────

export async function getEmployee(req, id) {
  const rights = await rightsOf(req);
  const { row, level } = await visibleRow(rights, id);
  const employee = await shapeOne(rights, row, level);
  const out = { employee, can: cardRights(rights, row, level) };
  if (level === 'hr') out.history = await history(row.id);
  out.extensions = await extensionsFor(req, employee, rights);
  return out;
}

export function cardRights(rights, row, level) {
  return {
    edit: level === 'hr',
    hr: level === 'hr',
    self: level === 'self',
    account: level === 'hr' && rights.manageUsers,
    createAccount: level === 'hr' && rights.manageUsers,
    blockAccount: level === 'hr' && rights.manageUsers && Boolean(row.user_id),
    documents: level === 'hr',
    skills: level === 'hr',
  };
}

export async function history(employeeId) {
  const { rows } = await query(
    `SELECT e.id, e.action, e.data, e.created_at, e.actor_id, COALESCE(u.display_name, u.username) AS actor_name
     FROM emp_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.employee_id = $1 ORDER BY e.id DESC LIMIT 100`,
    [employeeId]
  );
  return rows.map((row) => ({ id: Number(row.id), action: row.action, data: row.data || {}, at: row.created_at, actor: row.actor_id ? { id: row.actor_id, name: row.actor_name } : null }));
}

async function assertRefs(client, input, selfId = null) {
  if (input.positionId) {
    const { rows } = await client.query(`SELECT id FROM emp_positions WHERE id = $1`, [input.positionId]);
    if (!rows[0]) throw httpError(400, 'Unknown position', 'BAD_POSITION', { field: 'positionId' });
  }
  for (const field of ['unitId', 'siteId']) {
    if (!input[field]) continue;
    const { rows } = await client.query(`SELECT id FROM org_units WHERE id = $1`, [input[field]]);
    if (!rows[0]) throw httpError(400, 'Unknown unit', 'BAD_UNIT', { field });
  }
  if (input.managerId) {
    if (selfId && Number(input.managerId) === Number(selfId)) throw httpError(400, 'A person cannot be their own manager', 'BAD_MANAGER', { field: 'managerId' });
    const { rows } = await client.query(`SELECT id FROM employees WHERE id = $1`, [input.managerId]);
    if (!rows[0]) throw httpError(400, 'Unknown manager', 'BAD_MANAGER', { field: 'managerId' });
    // No loops: the new manager must not report (directly or not) to this person.
    if (selfId) {
      let current = Number(input.managerId);
      const seen = new Set();
      while (current && !seen.has(current) && seen.size < 64) {
        if (current === Number(selfId)) throw httpError(400, 'This would make a reporting loop', 'MANAGER_LOOP', { field: 'managerId' });
        seen.add(current);
        current = (await client.query(`SELECT manager_id FROM employees WHERE id = $1`, [current])).rows[0]?.manager_id || null;
      }
    }
  }
}

function uniqueErrors(err) {
  if (err?.code === '23505' && /personnel/.test(err.constraint || err.message)) return httpError(409, 'Another employee has this personnel number', 'PERSONNEL_NO_TAKEN', { field: 'personnelNo' });
  if (err?.code === '23505' && /user/.test(err.constraint || err.message)) return httpError(409, 'This account is linked to another employee', 'USER_LINKED');
  return err;
}

/**
 * Keeps the linked portal account in step with the card: its unit and
 * position (the light link the core org structure reads) and the first name
 * greetings use.
 */
export async function syncUser(client, employeeId) {
  const { rows } = await client.query(
    `SELECT e.user_id, e.unit_id, e.first_name, p.name AS position FROM employees e LEFT JOIN emp_positions p ON p.id = e.position_id WHERE e.id = $1`,
    [employeeId]
  );
  if (!rows[0]?.user_id) return;
  await client.query(
    `UPDATE users SET org_unit_id = $2, position_title = $3, first_name = COALESCE(NULLIF($4, ''), first_name), updated_at = NOW() WHERE id = $1`,
    [rows[0].user_id, rows[0].unit_id, rows[0].position, String(rows[0].first_name || '').trim().slice(0, 80)]
  );
}

export async function createEmployee(req, raw = {}) {
  const rights = await rightsOf(req);
  assertHr(rights);
  const input = cleanEmployee(raw);
  try {
    const id = await withTransaction(async (client) => {
      await assertRefs(client, input);
      const keys = Object.keys(input).filter((key) => COLUMNS[key]);
      const { rows } = await client.query(
        `INSERT INTO employees (${[...keys.map((key) => COLUMNS[key]), 'created_by'].join(', ')}) VALUES (${[...keys, 'x'].map((_, index) => `$${index + 1}`).join(', ')}) RETURNING id`,
        [...keys.map((key) => input[key]), actorOf(req)]
      );
      await logEvent(client, rows[0].id, 'created', actorOf(req), { name: fullName(input) });
      return rows[0].id;
    });
    return getEmployee(req, id);
  } catch (err) {
    throw uniqueErrors(err);
  }
}

/**
 * Edits a card (HR). The person themselves may change only their own
 * personal contacts. Answers { employee, offerBlock } — offerBlock when the
 * card turned «уволен» while its portal account still works.
 */
export async function updateEmployee(req, id, raw = {}) {
  const rights = await rightsOf(req);
  const { row, level } = await visibleRow(rights, id);
  let input;
  if (level === 'hr') input = cleanEmployee(raw, { partial: true });
  else if (level === 'self') {
    const allowed = ['personalEmail', 'personalPhone', 'personalAddress', 'emergencyContact', 'workPhone', 'workMobile', 'workLocation'];
    input = cleanEmployee(Object.fromEntries(Object.entries(raw).filter(([key]) => allowed.includes(key))), { partial: true });
  } else throw httpError(403, 'Only HR can change this card', 'FORBIDDEN');
  if (level !== 'hr') for (const key of HR_FIELDS) if (!['personalEmail', 'personalPhone', 'personalAddress', 'emergencyContact'].includes(key)) delete input[key];
  if (input.status === 'terminated' && !row.termination_date && !input.terminationDate) input.terminationDate = await portalToday();
  if (input.status && input.status !== 'terminated' && row.status === 'terminated' && input.terminationDate === undefined) input.terminationDate = null;
  try {
    await withTransaction(async (client) => {
      await assertRefs(client, input, row.id);
      const changes = {};
      for (const key of Object.keys(input).filter((k) => COLUMNS[k])) {
        const before = row[COLUMNS[key]] instanceof Date ? isoDayOf(row[COLUMNS[key]]) : row[COLUMNS[key]] ?? null;
        if (JSON.stringify(before) !== JSON.stringify(input[key] ?? null)) changes[key] = { from: key === 'hrNotes' ? undefined : before, to: key === 'hrNotes' ? undefined : input[key] ?? null };
      }
      if (!Object.keys(changes).length) return;
      const keys = Object.keys(changes);
      await client.query(`UPDATE employees SET ${keys.map((key, index) => `${COLUMNS[key]} = $${index + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`, [row.id, ...keys.map((key) => input[key])]);
      const action = changes.status ? `status_${input.status}` : 'updated';
      await logEvent(client, row.id, action.slice(0, 24), actorOf(req), { changes });
      if (changes.unitId || changes.positionId || changes.firstName) await syncUser(client, row.id);
    });
  } catch (err) {
    throw uniqueErrors(err);
  }
  const out = await getEmployee(req, row.id);
  const user = out.employee.user;
  out.offerBlock = Boolean(input.status === 'terminated' && row.status !== 'terminated' && user && !user.isBlocked);
  return out;
}

/** «Уволить»: status terminated with a date; optionally block the linked account (needs users.manage). */
export async function terminateEmployee(req, id, { date, blockUser = false } = {}) {
  const day = parseDay(date, 'terminationDate') || (await portalToday());
  const result = await updateEmployee(req, id, { status: 'terminated', terminationDate: day });
  if (blockUser && result.employee.user && !result.employee.user.isBlocked) {
    const { blockAccount } = await import('./accounts.js');
    await blockAccount(req, id, { blocked: true });
    return getEmployee(req, id);
  }
  return result;
}

export async function deleteEmployee(req, id) {
  const rights = await rightsOf(req);
  assertHr(rights);
  const row = await rawEmployee(id);
  if (!row) throw httpError(404, 'Employee not found', 'NOT_FOUND');
  const { rows: files } = await query(`SELECT storage_key FROM emp_files WHERE employee_id = $1`, [row.id]);
  await withTransaction(async (client) => {
    await client.query(`UPDATE org_units SET head_employee_id = NULL WHERE head_employee_id = $1`, [row.id]);
    await client.query(`DELETE FROM employees WHERE id = $1`, [row.id]);
  });
  const { removeBlob } = await import('../shared/storage.js');
  for (const file of files) await removeBlob(file.storage_key).catch(() => {});
  if (row.photo_key) await removeBlob(row.photo_key).catch(() => {});
  return { id: row.id, deleted: true };
}

// ── Skills and clearances ───────────────────────────────────────────────────

function cleanSkill(raw = {}) {
  const name = clean(raw.name, 160);
  if (!name) throw httpError(400, 'Name the skill or clearance', 'NAME_REQUIRED', { field: 'name' });
  const issuedOn = parseDay(raw.issuedOn, 'issuedOn');
  const expiresOn = parseDay(raw.expiresOn, 'expiresOn');
  if (issuedOn && expiresOn && expiresOn < issuedOn) throw httpError(400, 'It expires before it was issued', 'BAD_DATES', { field: 'expiresOn' });
  return { kind: raw.kind === 'clearance' ? 'clearance' : 'skill', name, number: clean(raw.number, 80), level: clean(raw.level, 40), issuedOn, expiresOn, note: clean(raw.note, 500) };
}

export async function saveSkill(req, employeeId, skillId, raw) {
  const rights = await rightsOf(req);
  assertHr(rights);
  const row = await rawEmployee(employeeId);
  if (!row) throw httpError(404, 'Employee not found', 'NOT_FOUND');
  const skill = cleanSkill(raw);
  await withTransaction(async (client) => {
    if (skillId) {
      const { rowCount } = await client.query(
        `UPDATE emp_skills SET kind = $3, name = $4, number = $5, level = $6, issued_on = $7, expires_on = $8, note = $9, updated_at = NOW() WHERE id = $1 AND employee_id = $2`,
        [intOrNull(skillId) || 0, row.id, skill.kind, skill.name, skill.number, skill.level, skill.issuedOn, skill.expiresOn, skill.note]
      );
      if (!rowCount) throw httpError(404, 'Not found', 'NOT_FOUND');
      await logEvent(client, row.id, 'skill_updated', actorOf(req), { name: skill.name, kind: skill.kind, expiresOn: skill.expiresOn });
    } else {
      await client.query(
        `INSERT INTO emp_skills (employee_id, kind, name, number, level, issued_on, expires_on, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [row.id, skill.kind, skill.name, skill.number, skill.level, skill.issuedOn, skill.expiresOn, skill.note]
      );
      await logEvent(client, row.id, 'skill_added', actorOf(req), { name: skill.name, kind: skill.kind, expiresOn: skill.expiresOn });
    }
  });
  return getEmployee(req, row.id);
}

export async function deleteSkill(req, employeeId, skillId) {
  const rights = await rightsOf(req);
  assertHr(rights);
  const { rows } = await query(`DELETE FROM emp_skills WHERE id = $1 AND employee_id = $2 RETURNING name`, [intOrNull(skillId) || 0, intOrNull(employeeId) || 0]);
  if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
  await logEvent({ query }, Number(employeeId), 'skill_removed', actorOf(req), { name: rows[0].name });
  return getEmployee(req, employeeId);
}

// ── Positions ───────────────────────────────────────────────────────────────

export async function listPositions(req, { includeArchived = false } = {}) {
  const rights = await rightsOf(req);
  assertView(rights);
  const { rows } = await query(
    `SELECT p.id, p.name, p.sort, p.archived_at, (SELECT COUNT(*)::int FROM employees e WHERE e.position_id = p.id AND e.status <> 'terminated') AS people
     FROM emp_positions p ${includeArchived ? '' : 'WHERE p.archived_at IS NULL'} ORDER BY p.sort, LOWER(p.name)`
  );
  // Headcounts are directory data: only for those who see the directory.
  return rows.map((row) => ({ id: row.id, name: row.name, sort: row.sort, archived: Boolean(row.archived_at), people: rights.view ? row.people : null }));
}

export async function savePosition(req, id, raw = {}) {
  const rights = await rightsOf(req);
  if (!rights.admin && !(rights.hr && !id)) throw httpError(403, 'Only employees administrators edit positions', 'FORBIDDEN');
  const name = clean(raw.name, 160);
  if (!name) throw httpError(400, 'Name the position', 'NAME_REQUIRED', { field: 'name' });
  try {
    if (id) {
      const { rows } = await query(
        `UPDATE emp_positions SET name = $2, archived_at = CASE WHEN $3::boolean IS NULL THEN archived_at WHEN $3 THEN COALESCE(archived_at, NOW()) ELSE NULL END WHERE id = $1 RETURNING *`,
        [intOrNull(id) || 0, name, typeof raw.archived === 'boolean' ? raw.archived : null]
      );
      if (!rows[0]) throw httpError(404, 'Not found', 'NOT_FOUND');
      // Linked accounts carry the position name (users.position_title): renamed with it.
      await query(
        `UPDATE users u SET position_title = $2, updated_at = NOW() FROM employees e
         WHERE e.user_id = u.id AND e.position_id = $1 AND u.position_title IS DISTINCT FROM $2`,
        [rows[0].id, rows[0].name]
      );
      return { id: rows[0].id, name: rows[0].name, archived: Boolean(rows[0].archived_at) };
    }
    const { rows } = await query(`INSERT INTO emp_positions (name, sort) VALUES ($1, COALESCE((SELECT MAX(sort) + 10 FROM emp_positions), 10)) RETURNING *`, [name]);
    return { id: rows[0].id, name: rows[0].name, archived: false };
  } catch (err) {
    if (err.code === '23505') throw httpError(409, 'This position already exists', 'POSITION_EXISTS', { field: 'name' });
    throw err;
  }
}

export async function deletePosition(req, id) {
  const rights = await rightsOf(req);
  assertAdmin(rights);
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM employees WHERE position_id = $1`, [intOrNull(id) || 0]);
  if (rows[0].n) {
    await query(`UPDATE emp_positions SET archived_at = COALESCE(archived_at, NOW()) WHERE id = $1`, [intOrNull(id) || 0]);
    return { id: Number(id), archived: true };
  }
  await query(`DELETE FROM emp_positions WHERE id = $1`, [intOrNull(id) || 0]);
  return { id: Number(id), deleted: true };
}

// ── Export ──────────────────────────────────────────────────────────────────

export async function exportCsv(req, filters = {}, locale = req?.locale) {
  const rights = await rightsOf(req);
  assertView(rights);
  if (!rights.view) throw httpError(403, 'No access to the employee directory', 'FORBIDDEN');
  const { where, params, ctx } = await buildFilter(rights, filters);
  const { rows } = await query(`SELECT e.* FROM employees e LEFT JOIN emp_positions p ON p.id = e.position_id WHERE ${where} ORDER BY LOWER(e.last_name), LOWER(e.first_name) LIMIT 20000`, params);
  const t = translator(locale);
  const statusName = t('employees.csv.status');
  const employmentName = t('employees.csv.employment');
  const header = [...t('employees.csv.head')];
  if (rights.hr) header.push(...t('employees.csv.hrHead'));
  const users = rights.hr ? await usersOf(rows) : new Map();
  const unitPath = (id) => (id && ctx.unitMap.get(id) ? pathNames(ctx.unitMap, id).join(' / ') : '');
  const lines = rows
    .filter((row) => levelFor(rights, row))
    .map((row) => {
      const cells = [row.last_name, row.first_name, row.middle_name || '', ctx.positions.get(row.position_id)?.name || '', unitPath(row.unit_id), unitPath(row.site_id), statusName[row.status] || row.status, row.work_email || '', row.work_phone || '', row.work_mobile || ''];
      if (rights.hr) cells.push(row.personnel_no || '', employmentName[row.employment] || row.employment, row.hire_date ? isoDayOf(row.hire_date) : '', row.termination_date ? isoDayOf(row.termination_date) : '', users.get(row.user_id)?.username || '');
      return cells;
    });
  return { csv: toCsv(header, lines), filename: `employees-${await portalToday()}.csv` };
}

// ── Birthdays widget ────────────────────────────────────────────────────────

/** Upcoming birthdays (day and month only) and work anniversaries, per the privacy setting. */
export async function celebrations(req, { days = 14 } = {}) {
  const rights = await rightsOf(req);
  if (!rights.view) return { birthdays: [], anniversaries: [], mode: 'none' };
  const settings = rights.settings;
  const showBirthdays = settings.birthdays === 'all' || (settings.birthdays === 'hr' && rights.hr);
  const span = Math.max(1, Math.min(60, Number(days) || 14));
  const today = await portalToday();
  const { rows } = await query(
    `SELECT id, last_name, first_name, middle_name, photo_key, position_id, unit_id, birth_date, hire_date, user_id FROM employees WHERE status = ANY($1)`,
    [DIRECTORY_STATUSES]
  );
  const ctx = await context();
  const people = rows.map((row) => ({
    id: row.id,
    name: fullName(row),
    photoUrl: row.photo_key ? `/api/app/employees/employees/${row.id}/photo` : null,
    position: ctx.positions.get(row.position_id)?.name || null,
    unit: ctx.unitMap.get(row.unit_id)?.name || null,
    birthDate: row.birth_date ? isoDayOf(row.birth_date) : null,
    hireDate: row.hire_date ? isoDayOf(row.hire_date) : null,
    userId: row.user_id || null,
  }));
  const birthdays = showBirthdays
    ? upcomingDates(people, today, span, 'birthDate').map(({ item, next }) => ({ id: item.id, name: item.name, photoUrl: item.photoUrl, position: item.position, unit: item.unit, userId: item.userId, date: next.date, inDays: next.inDays }))
    : [];
  const anniversaries = settings.anniversaries
    ? upcomingDates(people, today, span, 'hireDate').map(({ item, next }) => ({ id: item.id, name: item.name, photoUrl: item.photoUrl, position: item.position, unit: item.unit, userId: item.userId, date: next.date, inDays: next.inDays, years: next.years }))
    : [];
  return { birthdays, anniversaries, today, mode: showBirthdays ? settings.birthdays : 'off' };
}

// ── Meta ────────────────────────────────────────────────────────────────────

export async function meta(req) {
  const rights = await rightsOf(req);
  const parsed = parseSettings(await getSettings());
  return {
    rights: { view: rights.view, hr: rights.hr, admin: rights.admin, manageUsers: rights.manageUsers },
    settings: rights.admin ? rights.settings : { birthdays: rights.settings.birthdays, anniversaries: rights.settings.anniversaries, clearanceWarnDays: rights.settings.clearanceWarnDays },
    statuses: STATUSES,
    employment: EMPLOYMENT,
    // The AD account field shows while the AD integration is on (the AD directory module adds more, see extensions.js).
    ad: Boolean(parsed.integrations?.activeDirectory?.enabled),
    myEmployeeId: rights.userId ? (await query(`SELECT id FROM employees WHERE user_id = $1`, [rights.userId])).rows[0]?.id || null : null,
  };
}
