import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { notify } from '../../services/notifications.js';
import { permissionHolders } from '../approvals/people.js';
import { clearanceThresholds, dayText, fullName } from './logic.js';
import { employeeMessage } from './messages.js';
import { portalToday } from './service.js';

/*
 * employees:clearances (every 30 minutes, under the scheduler's advisory
 * lock; «today» is the portal's day). For every clearance of a working
 * employee with an expiry date: when a threshold of clearanceWarnDays is
 * reached (e.g. 30, 7, 0 days before), one reminder goes to HR (employees.hr),
 * the employee (when linked, notifyEmployee) and their manager (notifyManager).
 * Each threshold fires once per clearance and expiry date: the key is stored
 * in emp_notices by the same INSERT … ON CONFLICT DO NOTHING that decides to
 * send. A clearance first seen late gets only the closest notice (the others
 * are marked done), and a renewed one (new date) starts again.
 */

async function claim(keys) {
  if (!keys.length) return [];
  const { rows } = await query(`INSERT INTO emp_notices (key) SELECT UNNEST($1::text[]) ON CONFLICT DO NOTHING RETURNING key`, [keys.map((key) => key.slice(0, 160))]);
  return rows.map((row) => row.key);
}

export async function runClearanceReminders({ today: forcedToday, settings: forcedSettings } = {}) {
  let settings = forcedSettings;
  if (!settings) {
    const module = parseSettings(await getSettings()).modules.employees;
    if (!module?.enabled) return { skipped: true };
    settings = module.settings;
  }
  const warnDays = settings.clearanceWarnDays?.length ? settings.clearanceWarnDays : [];
  if (!warnDays.length) return { sent: 0 };
  const today = forcedToday || (await portalToday());
  const horizon = Math.max(...warnDays);
  const { rows } = await query(
    `SELECT s.id, s.name, s.expires_on, e.id AS employee_id, e.last_name, e.first_name, e.middle_name, e.user_id,
            (SELECT m.user_id FROM employees m WHERE m.id = e.manager_id AND m.status <> 'terminated') AS manager_user_id
     FROM emp_skills s JOIN employees e ON e.id = s.employee_id
     WHERE s.kind = 'clearance' AND s.expires_on IS NOT NULL AND e.status IN ('active', 'vacation', 'candidate')
       AND s.expires_on <= ($1::date + $2::int)
       -- Demo people (Modules → demo data) are made up: real HR is never told about them.
       AND NOT EXISTS (SELECT 1 FROM demo_records d WHERE d.table_name = 'employees' AND d.record_key = e.id::text)
     ORDER BY s.expires_on, s.id`,
    [today, horizon]
  );
  let hr = null;
  let sent = 0;
  for (const row of rows) {
    const expiresOn = dayText(row.expires_on);
    const { send, reached, left } = clearanceThresholds(expiresOn, today, warnDays);
    if (send === null) continue;
    const keys = reached.map((days) => `clr:${row.id}:${expiresOn}:${days}`);
    const claimed = await claim(keys);
    // Send when the closest threshold is new (others reached at the same time are only marked).
    if (!claimed.includes(`clr:${row.id}:${expiresOn}:${send}`)) continue;
    hr ||= await permissionHolders('employees.hr');
    const employee = fullName(row);
    const link = `/app/employees/${row.employee_id}`;
    const others = [...new Set([...hr, settings.notifyManager && row.manager_user_id ? row.manager_user_id : null].filter(Boolean))].filter((id) => id !== row.user_id);
    await notify({ userIds: others, kind: 'employees.clearance', module: 'employees', link, render: employeeMessage('clearance', { employee, clearance: row.name, expiresOn, left }) }).catch(() => {});
    if (settings.notifyEmployee && row.user_id) {
      await notify({ userIds: [row.user_id], kind: 'employees.clearance', module: 'employees', link, render: employeeMessage('clearance', { employee, clearance: row.name, expiresOn, left, self: true }) }).catch(() => {});
    }
    sent += 1;
  }
  return { sent };
}
