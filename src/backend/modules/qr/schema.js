import { query } from '../../config/database.js';
import { presetRows } from './presets.js';

/*
 * QR codes (docs/qr.md).
 *
 *   qr_templates   looks prepared by administrators: a design, locked groups
 *                  of options, names per language; `preset_key` marks the
 *                  ready-made ones (presets.js), one row is the default
 *   qr_codes       a person's codes: type, content, template, the full design;
 *                  a dynamic website code has a slug (/q/<slug>) whose target
 *                  can change after printing, and counts scans
 *   qr_scan_days   scans per code and day, for the chart
 */

export async function ensureQrSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS qr_templates (
      id SERIAL PRIMARY KEY,
      preset_key VARCHAR(40) UNIQUE,
      name VARCHAR(80) NOT NULL,
      description VARCHAR(300) NOT NULL DEFAULT '',
      i18n JSONB NOT NULL DEFAULT '{}',
      design JSONB NOT NULL,
      locks JSONB NOT NULL DEFAULT '{}',
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS qr_codes (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      type VARCHAR(16) NOT NULL,
      content JSONB NOT NULL DEFAULT '{}',
      template_id INTEGER REFERENCES qr_templates(id) ON DELETE SET NULL,
      design JSONB NOT NULL,
      dynamic BOOLEAN NOT NULL DEFAULT FALSE,
      slug VARCHAR(16) UNIQUE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      scans INTEGER NOT NULL DEFAULT 0,
      last_scan_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS qr_codes_owner_idx ON qr_codes (owner_id, updated_at DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS qr_scan_days (
      code_id INTEGER NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (code_id, day)
    )
  `);
  // Ready-made templates, once: a portal that deleted them keeps them deleted.
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM qr_templates`);
  if (!rows[0].n) await insertPresets();
}

/** Inserts the ready-made templates that are missing (by preset key); returns how many. */
export async function insertPresets() {
  const { rows } = await query(`SELECT preset_key FROM qr_templates WHERE preset_key IS NOT NULL`);
  const have = new Set(rows.map((row) => row.preset_key));
  const { rows: defaults } = await query(`SELECT 1 FROM qr_templates WHERE is_default LIMIT 1`);
  let hasDefault = defaults.length > 0;
  const { rows: last } = await query(`SELECT COALESCE(MAX(sort), -1)::int AS sort FROM qr_templates`);
  let added = 0;
  for (const preset of presetRows()) {
    if (have.has(preset.key)) continue;
    const isDefault = preset.isDefault && !hasDefault;
    hasDefault ||= isDefault;
    await query(
      `INSERT INTO qr_templates (preset_key, name, description, i18n, design, locks, is_default, sort)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [preset.key, preset.name, preset.description, preset.i18n, preset.design, preset.locks, isDefault, last[0].sort + 1 + preset.sort]
    );
    added += 1;
  }
  return added;
}
