import { query } from '../../config/database.js';

/*
 * Org structure tables (docs/org-structure.md):
 *
 *   org_units         the tree: type, name, code, head, address, zone, status, purposes, order
 *   org_unit_events   history of every unit: created, updated, moved, closed, reopened, deleted
 *   users.org_unit_id / users.position_title
 *                     the light «подразделение / должность» of a portal account. With the
 *                     Employees module on, a linked employee card keeps them in sync.
 */
export async function ensureOrgSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS org_units (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER REFERENCES org_units(id) ON DELETE RESTRICT,
      type VARCHAR(24) NOT NULL,
      name VARCHAR(200) NOT NULL,
      code VARCHAR(40),
      legal_entity_id INTEGER REFERENCES legal_entities(id) ON DELETE SET NULL,
      head_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      head_employee_id INTEGER,
      address VARCHAR(400),
      time_zone VARCHAR(64),
      status VARCHAR(10) NOT NULL DEFAULT 'active',
      purposes TEXT[] NOT NULL DEFAULT '{}',
      note VARCHAR(1000),
      sort INTEGER NOT NULL DEFAULT 0,
      closed_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS org_units_parent_idx ON org_units (parent_id, sort)`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS org_units_code_key ON org_units (LOWER(code)) WHERE code IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS org_units_purposes_idx ON org_units USING GIN (purposes)`);
  await query(`
    CREATE TABLE IF NOT EXISTS org_unit_events (
      id BIGSERIAL PRIMARY KEY,
      unit_id INTEGER NOT NULL,
      action VARCHAR(16) NOT NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS org_unit_events_unit_idx ON org_unit_events (unit_id, id DESC)`);
  // The light link of a portal account (works without the Employees module).
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS org_unit_id INTEGER REFERENCES org_units(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS position_title VARCHAR(160)`);
  await query(`CREATE INDEX IF NOT EXISTS users_org_unit_idx ON users (org_unit_id) WHERE org_unit_id IS NOT NULL`);
}
