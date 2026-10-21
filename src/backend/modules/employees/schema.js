import { query } from '../../config/database.js';
import { registerJob } from '../../services/scheduler.js';
import { runClearanceReminders } from './jobs.js';

/*
 * Employees tables (docs/employees.md → Data model):
 *
 *   emp_positions   the positions directory (employees.admin)
 *   employees       the card: names, photo, position, unit and site (org_units), manager,
 *                   personnel number, dates, status, employment type, work and personal
 *                   contacts, HR notes, the optional portal account (user_id, unique) and
 *                   the AD account placeholder (ad_account) for the AD directory module
 *   emp_skills      skills and clearances with expiry dates
 *   emp_files       documents of the card (and nothing else; the photo is employees.photo_key)
 *   emp_events      history of the card
 *   emp_notices     reminders already sent (one row per clearance, expiry date and threshold)
 */
export async function ensureEmployeesSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS emp_positions (
      id SERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS emp_positions_name_key ON emp_positions (LOWER(name))`);
  await query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      last_name VARCHAR(80) NOT NULL,
      first_name VARCHAR(80) NOT NULL,
      middle_name VARCHAR(80),
      photo_key TEXT,
      position_id INTEGER REFERENCES emp_positions(id) ON DELETE SET NULL,
      unit_id INTEGER REFERENCES org_units(id) ON DELETE SET NULL,
      site_id INTEGER REFERENCES org_units(id) ON DELETE SET NULL,
      manager_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      personnel_no VARCHAR(40),
      hire_date DATE,
      termination_date DATE,
      birth_date DATE,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      employment VARCHAR(16) NOT NULL DEFAULT 'staff',
      work_email VARCHAR(255),
      work_phone VARCHAR(40),
      work_mobile VARCHAR(40),
      work_location VARCHAR(160),
      personal_email VARCHAR(255),
      personal_phone VARCHAR(40),
      personal_address VARCHAR(400),
      emergency_contact VARCHAR(300),
      hr_notes TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ad_account VARCHAR(200),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS employees_user_key ON employees (user_id) WHERE user_id IS NOT NULL`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS employees_personnel_no_key ON employees (LOWER(personnel_no)) WHERE personnel_no IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS employees_unit_idx ON employees (unit_id)`);
  await query(`CREATE INDEX IF NOT EXISTS employees_site_idx ON employees (site_id)`);
  await query(`CREATE INDEX IF NOT EXISTS employees_name_idx ON employees (LOWER(last_name), LOWER(first_name))`);
  await query(`
    CREATE TABLE IF NOT EXISTS emp_skills (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      kind VARCHAR(16) NOT NULL DEFAULT 'skill',
      name VARCHAR(160) NOT NULL,
      number VARCHAR(80),
      level VARCHAR(40),
      issued_on DATE,
      expires_on DATE,
      note VARCHAR(500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS emp_skills_employee_idx ON emp_skills (employee_id)`);
  await query(`CREATE INDEX IF NOT EXISTS emp_skills_expiry_idx ON emp_skills (expires_on) WHERE expires_on IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS emp_files (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      ext VARCHAR(16) NOT NULL DEFAULT '',
      size BIGINT NOT NULL DEFAULT 0,
      storage_key TEXT NOT NULL,
      note VARCHAR(300),
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS emp_files_employee_idx ON emp_files (employee_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS emp_events (
      id BIGSERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      action VARCHAR(24) NOT NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS emp_events_employee_idx ON emp_events (employee_id, id DESC)`);
  await query(`CREATE TABLE IF NOT EXISTS emp_notices (key VARCHAR(160) PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  // Accounts linked before cards carried the first name over (greetings): fill the gaps once.
  await query(
    `UPDATE users u SET first_name = e.first_name
     FROM employees e
     WHERE e.user_id = u.id AND u.first_name IS NULL AND COALESCE(e.first_name, '') <> ''`
  );

  registerJob({ name: 'employees:clearances', everyMs: 30 * 60 * 1000, run: () => runClearanceReminders() });
}
