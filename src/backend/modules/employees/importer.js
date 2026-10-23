import { query, withTransaction } from '../../config/database.js';
import { byId, descendantIds, loadUnits, pathNames } from '../org/api.js';
import { assertHr, rightsOf } from './access.js';
import { logEvent, syncUser } from './service.js';
import { httpError, planImport } from './logic.js';

/*
 * Import from Excel / CSV (docs/employees.md → Import). The browser reads the
 * file (exceljs) and posts rows mapped to keys; the server validates every
 * row and answers a report { ok, created, updated, errors, warnings }.
 * `dryRun` checks without writing. A row with a known personnel number
 * updates that card; others create new cards. Unknown positions are added
 * when `createPositions` is on (a warning per new name), unknown units are errors.
 * Writing is all or nothing.
 */

const FIELDS = {
  lastName: 'last_name',
  firstName: 'first_name',
  middleName: 'middle_name',
  personnelNo: 'personnel_no',
  hireDate: 'hire_date',
  birthDate: 'birth_date',
  status: 'status',
  employment: 'employment',
  workEmail: 'work_email',
  workPhone: 'work_phone',
  workMobile: 'work_mobile',
  personalEmail: 'personal_email',
  personalPhone: 'personal_phone',
  unitId: 'unit_id',
  siteId: 'site_id',
  positionId: 'position_id',
};

export async function importEmployees(req, input = {}) {
  const rights = await rightsOf(req);
  assertHr(rights);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length) throw httpError(400, 'The file has no rows', 'NO_ROWS');
  const units = await loadUnits();
  const map = byId(units);
  const { rows: positions } = await query(`SELECT id, name FROM emp_positions`);
  const { rows: known } = await query(`SELECT id, personnel_no FROM employees WHERE personnel_no IS NOT NULL`);
  const report = planImport(rows, {
    units: units.map((unit) => ({ ...unit, path: pathNames(map, unit.id) })),
    positions,
    existing: new Map(known.map((row) => [row.personnel_no.toLowerCase(), row.id])),
    createPositions: input.createPositions !== false,
  });
  const created = report.plan.filter((item) => !item.match).length;
  const updated = report.plan.length - created;
  if (input.dryRun || report.errors.length) {
    return { ok: report.errors.length === 0, dryRun: Boolean(input.dryRun), created: report.errors.length ? 0 : created, updated: report.errors.length ? 0 : updated, errors: report.errors.slice(0, 500), warnings: report.warnings.slice(0, 200), rows: rows.length, written: false };
  }
  await withTransaction(async (client) => {
    const positionIds = new Map();
    for (const item of report.plan) {
      const values = { ...item.values };
      if (values.positionName) {
        const key = values.positionName.toLowerCase();
        if (!positionIds.has(key)) {
          const { rows: made } = await client.query(
            `INSERT INTO emp_positions (name, sort) VALUES ($1, COALESCE((SELECT MAX(sort) + 10 FROM emp_positions), 10))
             ON CONFLICT ((LOWER(name))) DO UPDATE SET name = emp_positions.name RETURNING id`,
            [values.positionName]
          );
          positionIds.set(key, made[0].id);
        }
        values.positionId = positionIds.get(key);
        delete values.positionName;
      }
      const keys = Object.keys(values).filter((key) => FIELDS[key] && values[key] !== undefined);
      if (item.match) {
        // Empty cells do not clear what the card already has.
        const set = keys.filter((key) => values[key] !== null && values[key] !== '');
        if (set.length) await client.query(`UPDATE employees SET ${set.map((key, index) => `${FIELDS[key]} = $${index + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`, [item.match, ...set.map((key) => values[key])]);
        await logEvent(client, item.match, 'imported', req.user?.id || null, { row: item.row, update: true });
        await syncUser(client, item.match);
      } else {
        const { rows: made } = await client.query(
          `INSERT INTO employees (${[...keys.map((key) => FIELDS[key]), 'created_by'].join(', ')}) VALUES (${[...keys, 'x'].map((_, index) => `$${index + 1}`).join(', ')}) RETURNING id`,
          [...keys.map((key) => values[key]), req.user?.id || null]
        );
        await logEvent(client, made[0].id, 'imported', req.user?.id || null, { row: item.row });
      }
    }
  });
  return { ok: true, dryRun: false, created, updated, errors: [], warnings: report.warnings.slice(0, 200), rows: rows.length, written: true };
}
