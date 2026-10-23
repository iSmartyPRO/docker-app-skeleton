import { withTransaction } from '../../config/database.js';
import { registerJob } from '../../services/scheduler.js';

/*
 * Procurement tables (docs/procurement.md#data-model).
 *
 *   proc_requests     the purchase requests (status, money, deadlines, supplier, links)
 *   proc_items        line items of a request
 *   proc_documents    invoices, quotes, photos, waybills, payment orders (own storage)
 *   proc_payments     payments (several partial ones allowed)
 *   proc_deliveries   delivery confirmations (partial allowed)
 *   proc_events       history of the request (approval history is merged in from the approvals service)
 *   proc_views        saved list views per person
 *   proc_counters     the request number sequence (row-locked: no duplicates under concurrency)
 *
 * Migration 001 (index.js `migrations`, docs/module-packages.md «Migrations»): the schema Procurement had
 * while built into the core — CREATE … IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, all idempotent — so on a
 * portal that already has the proc_* tables it changes nothing. Everything goes through `db` (the
 * migration's transaction). No foreign keys into other modules' tables (contracts, deals, projects,
 * counterparties are ids + labels, checked by the module when a link is saved).
 */
export async function createProcurementSchema(db) {
  const query = (text, params) => db.query(text, params);
  await query(`
    CREATE TABLE IF NOT EXISTS proc_requests (
      id SERIAL PRIMARY KEY,
      seq INTEGER NOT NULL,
      number VARCHAR(40) NOT NULL,
      title VARCHAR(300) NOT NULL DEFAULT '',
      description TEXT,
      category VARCHAR(40),
      has_items BOOLEAN NOT NULL DEFAULT FALSE,
      amount NUMERIC(16,2) NOT NULL DEFAULT 0,
      currency VARCHAR(3) NOT NULL DEFAULT 'USD',
      legal_entity_id INTEGER,
      payment_terms VARCHAR(12) NOT NULL DEFAULT 'full',
      advance_percent SMALLINT,
      urgency VARCHAR(24),
      pay_by DATE,
      deliver_by DATE,
      supplier_company_id INTEGER,
      supplier_name VARCHAR(300),
      supplier_contact VARCHAR(500),
      project_id INTEGER,
      project_label VARCHAR(200),
      object_id INTEGER,
      object_label VARCHAR(200),
      deal_id INTEGER,
      deal_label VARCHAR(300),
      contract_id INTEGER,
      contract_label VARCHAR(300),
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      responsible_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'draft',
      paid_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
      delivery_state VARCHAR(8) NOT NULL DEFAULT 'none',
      submitted_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      pay_soon_at TIMESTAMPTZ,
      pay_overdue_at TIMESTAMPTZ,
      deliver_soon_at TIMESTAMPTZ,
      deliver_overdue_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS proc_requests_number_uidx ON proc_requests (number)`);
  await query(`CREATE INDEX IF NOT EXISTS proc_requests_status_idx ON proc_requests (status, pay_by)`);
  await query(`CREATE INDEX IF NOT EXISTS proc_requests_author_idx ON proc_requests (author_id)`);
  await query(`CREATE INDEX IF NOT EXISTS proc_requests_responsible_idx ON proc_requests (responsible_id)`);
  await query(`CREATE INDEX IF NOT EXISTS proc_requests_contract_idx ON proc_requests (contract_id) WHERE contract_id IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS proc_requests_updated_idx ON proc_requests (updated_at DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS proc_items (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES proc_requests(id) ON DELETE CASCADE,
      sort INTEGER NOT NULL DEFAULT 0,
      name VARCHAR(300) NOT NULL,
      qty NUMERIC(14,3) NOT NULL DEFAULT 1,
      unit VARCHAR(16),
      price NUMERIC(16,2) NOT NULL DEFAULT 0,
      amount NUMERIC(16,2) NOT NULL DEFAULT 0
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS proc_items_request_idx ON proc_items (request_id, sort)`);
  await query(`
    CREATE TABLE IF NOT EXISTS proc_payments (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES proc_requests(id) ON DELETE CASCADE,
      paid_on DATE NOT NULL,
      amount NUMERIC(16,2) NOT NULL,
      method VARCHAR(12) NOT NULL DEFAULT 'bank',
      reference VARCHAR(80),
      note VARCHAR(500),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS proc_payments_request_idx ON proc_payments (request_id, paid_on)`);
  await query(`
    CREATE TABLE IF NOT EXISTS proc_deliveries (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES proc_requests(id) ON DELETE CASCADE,
      delivered_on DATE NOT NULL,
      partial BOOLEAN NOT NULL DEFAULT FALSE,
      note VARCHAR(1000),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS proc_deliveries_request_idx ON proc_deliveries (request_id)`);
  // Deliveries recorded by another module (the Warehouse receipt): where from and which document, so a storno can take them back.
  await query(`ALTER TABLE proc_deliveries ADD COLUMN IF NOT EXISTS source VARCHAR(20)`);
  await query(`ALTER TABLE proc_deliveries ADD COLUMN IF NOT EXISTS reference VARCHAR(80)`);
  await query(`
    CREATE TABLE IF NOT EXISTS proc_documents (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES proc_requests(id) ON DELETE CASCADE,
      kind VARCHAR(12) NOT NULL DEFAULT 'other',
      name VARCHAR(255) NOT NULL,
      ext VARCHAR(12),
      size BIGINT NOT NULL DEFAULT 0,
      storage_key VARCHAR(300) NOT NULL,
      source VARCHAR(8) NOT NULL DEFAULT 'upload',
      node_id INTEGER,
      payment_id INTEGER REFERENCES proc_payments(id) ON DELETE SET NULL,
      delivery_id INTEGER REFERENCES proc_deliveries(id) ON DELETE SET NULL,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS proc_documents_request_idx ON proc_documents (request_id, kind)`);
  await query(`
    CREATE TABLE IF NOT EXISTS proc_events (
      id BIGSERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES proc_requests(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(32) NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS proc_events_request_idx ON proc_events (request_id, id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS proc_views (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(60) NOT NULL,
      filter JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS proc_views_user_idx ON proc_views (user_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS proc_counters (
      key VARCHAR(20) PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    )
  `);
  await query(`INSERT INTO proc_counters (key, value) VALUES ('request', 0) ON CONFLICT (key) DO NOTHING`);
}

/** The schema outside a package install (tests, scripts): migration 001 in its own transaction. */
export async function ensureProcurementSchema() {
  await withTransaction(async (client) => {
    // The lock the package migrations take (platform/packages/migrations.js): one at a time.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('module-migrations:procurement'))`);
    await createProcurementSchema({ query: (text, params) => client.query(text, params) });
  });
}

/** Background jobs (register(ctx); no database access). */
export function startProcurement() {
  // Pay-by / deliver-by reminders (once each), every 10 minutes.
  registerJob({ name: 'procurement:deadlines', everyMs: 10 * 60 * 1000, run: async () => (await import('./reminders.js')).runDeadlines() });
}
