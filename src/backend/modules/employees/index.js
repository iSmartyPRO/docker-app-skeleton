import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { registerPeopleProvider } from '../org/providers.js';
import { ensureEmployeesSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import { fullName } from './logic.js';
import { rightsOf } from './access.js';

/*
 * Employees (spec docs/specs/platform-2.0.ru.md §4, docs/employees.md): the
 * registry of people — with or without portal access — their positions,
 * units and sites of the org structure, managers, documents, skills and
 * clearances. Off by default.
 *
 * At import time it lends the core org structure what only it knows (heads
 * that are employees, explicit managers, headcount) through
 * registerPeopleProvider; while the module is off the org structure works
 * from portal accounts alone.
 */

const WORKING = `status IN ('active', 'vacation')`;
const photoUrl = (row) => (row.photo_key ? `/api/app/employees/employees/${row.id}/photo` : null);

registerPeopleProvider({
  enabled: async () => Boolean(parseSettings(await getSettings()).modules.employees?.enabled),
  usersOfEmployees: async (ids) => {
    const list = [...new Set(ids.filter(Boolean).map(Number))];
    if (!list.length) return new Map();
    const { rows } = await query(`SELECT id, user_id FROM employees WHERE id = ANY($1) AND user_id IS NOT NULL AND status <> 'terminated'`, [list]);
    return new Map(rows.map((row) => [row.id, row.user_id]));
  },
  employeeUnit: async (employeeId) => {
    const { rows } = await query(`SELECT unit_id, user_id FROM employees WHERE id = $1`, [employeeId]);
    return rows[0] ? { unitId: rows[0].unit_id, userId: rows[0].user_id } : null;
  },
  explicitManagerOf: async (userId) => {
    const { rows } = await query(
      `SELECT m.user_id FROM employees e JOIN employees m ON m.id = e.manager_id
       WHERE e.user_id = $1 AND e.status <> 'terminated' AND m.status <> 'terminated' AND m.user_id IS NOT NULL`,
      [userId]
    );
    return rows[0]?.user_id || null;
  },
  headcount: async () => {
    const { rows } = await query(`SELECT unit_id, COUNT(*)::int AS n FROM employees WHERE unit_id IS NOT NULL AND ${WORKING} GROUP BY unit_id`);
    return new Map(rows.map((row) => [row.unit_id, row.n]));
  },
  employeesById: async (ids) => {
    const list = [...new Set(ids.filter(Boolean).map(Number))];
    if (!list.length) return new Map();
    const { rows } = await query(
      `SELECT e.id, e.last_name, e.first_name, e.middle_name, e.photo_key, e.user_id, p.name AS position FROM employees e LEFT JOIN emp_positions p ON p.id = e.position_id WHERE e.id = ANY($1)`,
      [list]
    );
    return new Map(rows.map((row) => [row.id, { id: row.id, name: fullName(row), photoUrl: photoUrl(row), userId: row.user_id || null, position: row.position || null }]));
  },
  employeeOfUser: async (userId) => {
    const { rows } = await query(
      `SELECT e.id, e.last_name, e.first_name, e.middle_name, e.status, e.photo_key, p.name AS position FROM employees e LEFT JOIN emp_positions p ON p.id = e.position_id WHERE e.user_id = $1`,
      [userId]
    );
    return rows[0] ? { id: rows[0].id, name: fullName(rows[0]), status: rows[0].status, position: rows[0].position || null, photoUrl: photoUrl(rows[0]) } : null;
  },
  // Only for org managers and people with the directory (employees.view / everyoneCanView); others get null.
  searchEmployees: async (q = '', { req = null, canManageOrg = false } = {}) => {
    if (!canManageOrg && !(await rightsOf(req)).view) return null;
    const text = String(q || '').trim().slice(0, 80);
    const { rows } = await query(
      `SELECT e.id, e.last_name, e.first_name, e.middle_name, e.photo_key, e.user_id, p.name AS position FROM employees e LEFT JOIN emp_positions p ON p.id = e.position_id
       WHERE ${WORKING} AND ($1 = '' OR CONCAT_WS(' ', e.last_name, e.first_name, e.middle_name) ILIKE '%' || $1 || '%')
       ORDER BY LOWER(e.last_name), LOWER(e.first_name) LIMIT 200`,
      [text]
    );
    return rows.map((row) => ({ id: row.id, name: fullName(row), photoUrl: photoUrl(row), userId: row.user_id || null, position: row.position || null }));
  },
});

export default {
  id: 'employees',
  schema: ensureEmployeesSchema,
  routes: privateRoutes,
};
