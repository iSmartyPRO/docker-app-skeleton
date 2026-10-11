import { query } from '../../config/database.js';

/*
 * Dashboard: each person's own arrangement of widgets.
 *
 *   dash_layouts  a person's widgets (type, size, settings) in display order
 *   dash_default  the starting layout set by an administrator (one row);
 *                 without it the built-in one (widgets.js) is used
 */

export async function ensureDashboardSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS dash_layouts (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      widgets JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS dash_default (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      widgets JSONB NOT NULL DEFAULT '[]',
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
