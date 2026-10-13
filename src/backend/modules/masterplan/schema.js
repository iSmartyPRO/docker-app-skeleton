import { query, withTransaction } from '../../config/database.js';
import { getSetting, setSetting } from '../../services/settings.js';
import { registerJob } from '../../services/scheduler.js';
import { DEFAULT_STAGES, DEFAULT_TYPES } from './constants.js';
import { runBookingTimers } from './sales.js';
import { ensureReportSchema, runDailyChecks } from './construction.js';
import { purgeOrphans } from './media.js';
import { registerCrmHooks } from './crmLink.js';
import { ensurePricingSchema } from './pricing.js';
import { ensureBuildingSchema } from './buildings.js';

/*
 * Masterplan (docs/masterplan.md): development projects as a tree of nodes,
 * the sales status of every sellable unit, bookings with timers, prices,
 * construction progress and photo reports, the interactive site plan.
 *
 *   mp_projects       projects (a residential complex, a cottage village)
 *   mp_types          object types directory (sellable, category, icon, colour, stage set)
 *   mp_stages         construction stages directory, by stage set, with weights
 *   mp_nodes          the tree: levels (queue, sector, line…), plots, objects, units; path = ancestors + self
 *   mp_units          sales data of sellable nodes (1:1), optimistic locking by `version`
 *   mp_bookings       reserve / booking timers
 *   mp_price_history  every price change
 *   mp_node_stages    stage progress of construction objects (plan / fact / percent)
 *   mp_reports        construction journal, mp_report_nodes its objects
 *   mp_media          photos, renders, layouts, documents, plan backgrounds
 *   mp_plans          site plans (a project's, or a node's close-up), mp_contours their polygons,
 *                     mp_markers point markers (a numbered circle instead of a polygon)
 *   mp_assignments    module roles with a zone (project or node subtree)
 *   mp_events         history of everything (audit trail)
 */

export async function ensureMasterplanSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS mp_projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      code VARCHAR(30),
      address VARCHAR(300),
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      description TEXT,
      class VARCHAR(12),
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      status VARCHAR(16) NOT NULL DEFAULT 'sales',
      start_date DATE,
      finish_date DATE,
      manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      settings JSONB NOT NULL DEFAULT '{}',
      sort INTEGER NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_types (
      id SERIAL PRIMARY KEY,
      key VARCHAR(40),
      name VARCHAR(120) NOT NULL,
      category VARCHAR(16) NOT NULL DEFAULT 'residential',
      node_kind VARCHAR(8) NOT NULL DEFAULT 'object',
      sellable BOOLEAN NOT NULL DEFAULT FALSE,
      stage_set VARCHAR(24),
      icon VARCHAR(24),
      color VARCHAR(7),
      sort INTEGER NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS mp_types_key_idx ON mp_types (key) WHERE key IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_stages (
      id SERIAL PRIMARY KEY,
      set_key VARCHAR(24) NOT NULL,
      name VARCHAR(160) NOT NULL,
      weight NUMERIC(6,2) NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS mp_stages_set_idx ON mp_stages (set_key, sort)`);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_nodes (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES mp_projects(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES mp_nodes(id) ON DELETE CASCADE,
      path INTEGER[] NOT NULL DEFAULT '{}',
      depth SMALLINT NOT NULL DEFAULT 1,
      kind VARCHAR(8) NOT NULL CHECK (kind IN ('level', 'plot', 'object', 'unit')),
      level_key VARCHAR(24),
      type_id INTEGER REFERENCES mp_types(id) ON DELETE SET NULL,
      code VARCHAR(60) NOT NULL DEFAULT '',
      name VARCHAR(200) NOT NULL DEFAULT '',
      sort DOUBLE PRECISION NOT NULL DEFAULT 0,
      description TEXT,
      area NUMERIC(12,2),
      build_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sales_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      contractor VARCHAR(200),
      plan_start DATE,
      plan_end DATE,
      handover VARCHAR(16),
      readiness NUMERIC(5,1) NOT NULL DEFAULT 0,
      readiness_manual BOOLEAN NOT NULL DEFAULT FALSE,
      current_stage_id INTEGER REFERENCES mp_stages(id) ON DELETE SET NULL,
      last_report_at TIMESTAMPTZ,
      stale_notified_at TIMESTAMPTZ,
      delay_notified_days INTEGER,
      attrs JSONB NOT NULL DEFAULT '{}',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS mp_nodes_project_idx ON mp_nodes (project_id, parent_id, sort)`);
  await query(`CREATE INDEX IF NOT EXISTS mp_nodes_path_idx ON mp_nodes USING GIN (path)`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS mp_nodes_code_idx ON mp_nodes (project_id, LOWER(code)) WHERE code <> ''`);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_units (
      node_id INTEGER PRIMARY KEY REFERENCES mp_nodes(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES mp_projects(id) ON DELETE CASCADE,
      status VARCHAR(16) NOT NULL DEFAULT 'free',
      version INTEGER NOT NULL DEFAULT 1,
      price NUMERIC(18,2),
      currency CHAR(3),
      discount_pct NUMERIC(5,2),
      min_price NUMERIC(18,2),
      area_total NUMERIC(10,2),
      area_living NUMERIC(10,2),
      area_plot NUMERIC(10,2),
      area_terrace NUMERIC(10,2),
      rooms SMALLINT,
      bedrooms SMALLINT,
      bathrooms SMALLINT,
      levels SMALLINT,
      ceiling NUMERIC(4,2),
      floor SMALLINT,
      number VARCHAR(20),
      riser SMALLINT,
      finishing VARCHAR(16),
      payment_forms TEXT[] NOT NULL DEFAULT '{}',
      no_publish BOOLEAN NOT NULL DEFAULT FALSE,
      manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      deal_id INTEGER REFERENCES crm_deals(id) ON DELETE SET NULL,
      person_id INTEGER REFERENCES cmp_people(id) ON DELETE SET NULL,
      company_id INTEGER REFERENCES cmp_companies(id) ON DELETE SET NULL,
      client_name VARCHAR(200),
      booking_id INTEGER,
      contract_number VARCHAR(60),
      contract_date DATE,
      contract_amount NUMERIC(18,2),
      paid_amount NUMERIC(18,2),
      act_date DATE,
      status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS mp_units_status_idx ON mp_units (project_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS mp_units_manager_idx ON mp_units (manager_id) WHERE manager_id IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS mp_units_deal_idx ON mp_units (deal_id) WHERE deal_id IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_bookings (
      id SERIAL PRIMARY KEY,
      unit_id INTEGER NOT NULL REFERENCES mp_nodes(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES mp_projects(id) ON DELETE CASCADE,
      kind VARCHAR(8) NOT NULL CHECK (kind IN ('reserve', 'booking')),
      manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      deal_id INTEGER REFERENCES crm_deals(id) ON DELETE SET NULL,
      person_id INTEGER REFERENCES cmp_people(id) ON DELETE SET NULL,
      company_id INTEGER REFERENCES cmp_companies(id) ON DELETE SET NULL,
      client_name VARCHAR(200),
      paid BOOLEAN NOT NULL DEFAULT FALSE,
      amount NUMERIC(18,2),
      price NUMERIC(18,2),
      currency CHAR(3),
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'expired', 'converted')),
      extensions INTEGER NOT NULL DEFAULT 0,
      extended_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      release_reason VARCHAR(300),
      warned_hours INTEGER,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS mp_bookings_active_idx ON mp_bookings (ends_at) WHERE status = 'active'`);
  await query(`CREATE INDEX IF NOT EXISTS mp_bookings_unit_idx ON mp_bookings (unit_id, id DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_price_history (
      id SERIAL PRIMARY KEY,
      unit_id INTEGER NOT NULL REFERENCES mp_nodes(id) ON DELETE CASCADE,
      old_price NUMERIC(18,2),
      new_price NUMERIC(18,2),
      currency CHAR(3),
      reason VARCHAR(300),
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS mp_price_history_unit_idx ON mp_price_history (unit_id, id DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_node_stages (
      node_id INTEGER NOT NULL REFERENCES mp_nodes(id) ON DELETE CASCADE,
      stage_id INTEGER NOT NULL REFERENCES mp_stages(id) ON DELETE CASCADE,
      plan_start DATE,
      plan_end DATE,
      fact_start DATE,
      fact_end DATE,
      percent NUMERIC(5,1) NOT NULL DEFAULT 0,
      state VARCHAR(12) NOT NULL DEFAULT 'not_started',
      pause_reason VARCHAR(300),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (node_id, stage_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_reports (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES mp_projects(id) ON DELETE CASCADE,
      stage_id INTEGER REFERENCES mp_stages(id) ON DELETE SET NULL,
      percent NUMERIC(5,1),
      fact_date DATE NOT NULL,
      body TEXT,
      status VARCHAR(10) NOT NULL DEFAULT 'published',
      visibility VARCHAR(10) NOT NULL DEFAULT 'sales',
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      review_note VARCHAR(500),
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS mp_reports_project_idx ON mp_reports (project_id, status, id DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_report_nodes (
      report_id INTEGER NOT NULL REFERENCES mp_reports(id) ON DELETE CASCADE,
      node_id INTEGER NOT NULL REFERENCES mp_nodes(id) ON DELETE CASCADE,
      PRIMARY KEY (report_id, node_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS mp_report_nodes_node_idx ON mp_report_nodes (node_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_media (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES mp_projects(id) ON DELETE CASCADE,
      node_id INTEGER REFERENCES mp_nodes(id) ON DELETE CASCADE,
      report_id INTEGER REFERENCES mp_reports(id) ON DELETE CASCADE,
      kind VARCHAR(10) NOT NULL DEFAULT 'photo',
      name VARCHAR(255) NOT NULL,
      mime VARCHAR(120),
      size BIGINT NOT NULL DEFAULT 0,
      storage_key VARCHAR(200) NOT NULL,
      thumb_key VARCHAR(200),
      width INTEGER,
      height INTEGER,
      taken_at TIMESTAMPTZ,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS mp_media_node_idx ON mp_media (node_id, id DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS mp_media_report_idx ON mp_media (report_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_plans (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES mp_projects(id) ON DELETE CASCADE,
      node_id INTEGER REFERENCES mp_nodes(id) ON DELETE CASCADE,
      media_id INTEGER REFERENCES mp_media(id) ON DELETE SET NULL,
      name VARCHAR(160),
      width INTEGER NOT NULL DEFAULT 1600,
      height INTEGER NOT NULL DEFAULT 1000,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_contours (
      plan_id INTEGER NOT NULL REFERENCES mp_plans(id) ON DELETE CASCADE,
      node_id INTEGER NOT NULL REFERENCES mp_nodes(id) ON DELETE CASCADE,
      points JSONB NOT NULL,
      PRIMARY KEY (plan_id, node_id)
    )
  `);
  // Point markers (markers.js): a numbered circle instead of a contour, one placement per object per plan.
  await query(`
    CREATE TABLE IF NOT EXISTS mp_markers (
      plan_id INTEGER NOT NULL REFERENCES mp_plans(id) ON DELETE CASCADE,
      node_id INTEGER NOT NULL REFERENCES mp_nodes(id) ON DELETE CASCADE,
      x REAL NOT NULL,
      y REAL NOT NULL,
      r REAL NOT NULL,
      label VARCHAR(12),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (plan_id, node_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_assignments (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES mp_projects(id) ON DELETE CASCADE,
      node_id INTEGER REFERENCES mp_nodes(id) ON DELETE CASCADE,
      subject_type VARCHAR(8) NOT NULL CHECK (subject_type IN ('user', 'group')),
      subject_id INTEGER NOT NULL,
      role VARCHAR(20) NOT NULL,
      until DATE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS mp_assignments_key ON mp_assignments (project_id, COALESCE(node_id, 0), subject_type, subject_id, role)`);
  await query(`
    CREATE TABLE IF NOT EXISTS mp_events (
      id BIGSERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES mp_projects(id) ON DELETE CASCADE,
      node_id INTEGER REFERENCES mp_nodes(id) ON DELETE CASCADE,
      kind VARCHAR(24) NOT NULL,
      data JSONB NOT NULL DEFAULT '{}',
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS mp_events_node_idx ON mp_events (node_id, id DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS mp_events_project_idx ON mp_events (project_id, id DESC)`);

  await ensurePricingSchema();
  await ensureBuildingSchema();
  await ensureReportSchema();
  await seedDirectories();
  registerJob({ name: 'masterplan:bookings', everyMs: 60 * 1000, run: runBookingTimers });
  registerJob({
    name: 'masterplan:daily',
    everyMs: 6 * 60 * 60 * 1000,
    run: async () => {
      await runDailyChecks();
      await purgeOrphans();
    },
  });
  registerCrmHooks();
}

/** Object types (§4.3) and construction stages (§7.1), once. Directories only — never project data. */
async function seedDirectories() {
  if ((await getSetting('masterplan_seeded')) === 'true') return;
  await withTransaction(async (client) => {
    for (const [index, type] of DEFAULT_TYPES.entries()) {
      await client.query(
        `INSERT INTO mp_types (key, name, category, node_kind, sellable, stage_set, icon, color, sort)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (key) WHERE key IS NOT NULL DO NOTHING`,
        [type.key, type.name, type.category, type.nodeKind, type.sellable, type.stageSet, type.icon, type.color, index]
      );
    }
    const existing = await client.query(`SELECT 1 FROM mp_stages LIMIT 1`);
    if (!existing.rows.length) {
      for (const [set, stages] of Object.entries(DEFAULT_STAGES)) {
        for (const [index, [name, weight]] of stages.entries()) {
          await client.query(`INSERT INTO mp_stages (set_key, name, weight, sort) VALUES ($1, $2, $3, $4)`, [set, name, weight, index]);
        }
      }
    }
  });
  await setSetting('masterplan_seeded', 'true');
}
