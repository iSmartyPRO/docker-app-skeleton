import { query } from '../../config/database.js';
import { registerJob } from '../../services/scheduler.js';

/*
 * Warehouse tables (docs/warehouse.md#data-model). Idempotent; runs on every start.
 *
 *   wh_categories     category tree of items (+ custom attribute definitions)
 *   wh_items          nomenclature: units with factors, tracking type, supplier, prices, attributes
 *   wh_barcodes       several barcodes per item (a pack barcode carries its unit)
 *   wh_warehouses     warehouses (main / site / transit / mobile) with the MOL
 *   wh_bins           optional addressed storage: zone → rack → shelf
 *   wh_assignments    rights on one warehouse (zone of responsibility)
 *   wh_norms          minimum and reorder point per item × warehouse
 *   wh_batches        batches: number, expiry, supplier, unit cost
 *   wh_instances      serial instances (tools, equipment)
 *   wh_stock          the stock register: item × warehouse × bin × batch × instance × holder
 *   wh_costs          last moving-average cost per item × warehouse (fallback when the pool is empty)
 *   wh_moves          the movement journal (immutable: a trigger refuses UPDATE / DELETE)
 *   wh_reserves       reserves under an object, project, deal, request or person
 *   wh_docs           documents (receipt, issue, transfer…)
 *   wh_doc_lines      their lines
 *   wh_files          photos of items and instances, document attachments, signatures
 *   wh_events         audit trail: who created, posted, reversed, changed a card or a norm
 *   wh_counters       document numbers per type (row-locked)
 *   wh_notices        «sent once» markers of notifications (low-stock digest, expiry, service…)
 *
 * Inventory sessions (wh_inv_*: counting by several people, reconciliation)
 * are created by ensureInventorySchema() below and produce one `inventory` act each.
 */
export async function ensureWarehouseSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS wh_categories (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER REFERENCES wh_categories(id) ON DELETE SET NULL,
      name VARCHAR(120) NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      attrs JSONB NOT NULL DEFAULT '[]'::jsonb,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_items (
      id SERIAL PRIMARY KEY,
      sku VARCHAR(60),
      name VARCHAR(300) NOT NULL,
      category_id INTEGER REFERENCES wh_categories(id) ON DELETE SET NULL,
      brand VARCHAR(120),
      kind VARCHAR(10) NOT NULL DEFAULT 'goods',
      tracking VARCHAR(10) NOT NULL DEFAULT 'quantity',
      track_expiry BOOLEAN NOT NULL DEFAULT FALSE,
      base_unit VARCHAR(16) NOT NULL DEFAULT 'шт',
      units JSONB NOT NULL DEFAULT '[]'::jsonb,
      receipt_unit VARCHAR(16),
      issue_unit VARCHAR(16),
      purchase_multiple NUMERIC(18,4),
      supplier_company_id INTEGER,
      supplier_name VARCHAR(300),
      last_price NUMERIC(18,4),
      plan_price NUMERIC(18,4),
      attrs JSONB NOT NULL DEFAULT '{}'::jsonb,
      description TEXT,
      service_interval_days INTEGER,
      archived_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS wh_items_sku_uidx ON wh_items (LOWER(sku)) WHERE sku IS NOT NULL AND sku <> ''`);
  await query(`CREATE INDEX IF NOT EXISTS wh_items_name_idx ON wh_items (LOWER(name))`);
  await query(`CREATE INDEX IF NOT EXISTS wh_items_category_idx ON wh_items (category_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_barcodes (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES wh_items(id) ON DELETE CASCADE,
      code VARCHAR(120) NOT NULL,
      kind VARCHAR(10) NOT NULL DEFAULT 'code128',
      unit VARCHAR(16),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS wh_barcodes_code_uidx ON wh_barcodes (code)`);
  await query(`CREATE INDEX IF NOT EXISTS wh_barcodes_item_idx ON wh_barcodes (item_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_warehouses (
      id SERIAL PRIMARY KEY,
      code VARCHAR(20),
      name VARCHAR(160) NOT NULL,
      kind VARCHAR(10) NOT NULL DEFAULT 'main',
      mol_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      address VARCHAR(300),
      project_id INTEGER,
      project_label VARCHAR(200),
      bins_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      allow_negative BOOLEAN NOT NULL DEFAULT FALSE,
      note VARCHAR(1000),
      sort INTEGER NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS wh_warehouses_code_uidx ON wh_warehouses (LOWER(code)) WHERE code IS NOT NULL AND code <> ''`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_bins (
      id SERIAL PRIMARY KEY,
      warehouse_id INTEGER NOT NULL REFERENCES wh_warehouses(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES wh_bins(id) ON DELETE CASCADE,
      kind VARCHAR(8) NOT NULL DEFAULT 'shelf',
      code VARCHAR(40) NOT NULL,
      name VARCHAR(120),
      path VARCHAR(200) NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS wh_bins_path_uidx ON wh_bins (warehouse_id, LOWER(path))`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_assignments (
      id SERIAL PRIMARY KEY,
      warehouse_id INTEGER NOT NULL REFERENCES wh_warehouses(id) ON DELETE CASCADE,
      subject_type VARCHAR(8) NOT NULL CHECK (subject_type IN ('user', 'group')),
      subject_id INTEGER NOT NULL,
      rights TEXT[] NOT NULL DEFAULT '{}',
      until DATE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS wh_assignments_uidx ON wh_assignments (warehouse_id, subject_type, subject_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_norms (
      item_id INTEGER NOT NULL REFERENCES wh_items(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES wh_warehouses(id) ON DELETE CASCADE,
      min_qty NUMERIC(18,4),
      reorder_qty NUMERIC(18,4),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (item_id, warehouse_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_batches (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES wh_items(id) ON DELETE CASCADE,
      number VARCHAR(80) NOT NULL,
      expires_on DATE,
      produced_on DATE,
      supplier_company_id INTEGER,
      supplier_name VARCHAR(300),
      unit_cost NUMERIC(18,4),
      doc_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS wh_batches_number_uidx ON wh_batches (item_id, LOWER(number))`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_instances (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES wh_items(id) ON DELETE CASCADE,
      inventory_no VARCHAR(60) NOT NULL,
      serial_no VARCHAR(120),
      state VARCHAR(12) NOT NULL DEFAULT 'ok',
      purchased_on DATE,
      cost NUMERIC(18,2),
      warranty_until DATE,
      next_service_on DATE,
      service_interval_days INTEGER,
      note VARCHAR(1000),
      doc_id INTEGER,
      written_off_doc_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS wh_instances_inv_uidx ON wh_instances (LOWER(inventory_no))`);
  await query(`CREATE INDEX IF NOT EXISTS wh_instances_serial_idx ON wh_instances (LOWER(serial_no))`);
  await query(`CREATE INDEX IF NOT EXISTS wh_instances_service_idx ON wh_instances (next_service_on) WHERE next_service_on IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_stock (
      id BIGSERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES wh_items(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES wh_warehouses(id) ON DELETE CASCADE,
      bin_id INTEGER REFERENCES wh_bins(id) ON DELETE SET NULL,
      batch_id INTEGER REFERENCES wh_batches(id) ON DELETE SET NULL,
      instance_id INTEGER REFERENCES wh_instances(id) ON DELETE SET NULL,
      holder_type VARCHAR(10) NOT NULL DEFAULT 'warehouse',
      holder_id INTEGER NOT NULL DEFAULT 0,
      qty NUMERIC(18,4) NOT NULL DEFAULT 0,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      last_move_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS wh_stock_key_uidx ON wh_stock (item_id, warehouse_id, COALESCE(bin_id, 0), COALESCE(batch_id, 0), COALESCE(instance_id, 0), holder_type, holder_id)`
  );
  await query(`CREATE INDEX IF NOT EXISTS wh_stock_wh_idx ON wh_stock (warehouse_id, item_id) WHERE holder_type = 'warehouse'`);
  await query(`CREATE INDEX IF NOT EXISTS wh_stock_holder_idx ON wh_stock (holder_type, holder_id) WHERE holder_type <> 'warehouse'`);
  await query(`CREATE INDEX IF NOT EXISTS wh_stock_instance_idx ON wh_stock (instance_id) WHERE instance_id IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_costs (
      item_id INTEGER NOT NULL REFERENCES wh_items(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES wh_warehouses(id) ON DELETE CASCADE,
      avg_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (item_id, warehouse_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_docs (
      id SERIAL PRIMARY KEY,
      type VARCHAR(16) NOT NULL,
      seq INTEGER NOT NULL,
      number VARCHAR(40) NOT NULL,
      status VARCHAR(12) NOT NULL DEFAULT 'draft',
      doc_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      warehouse_id INTEGER REFERENCES wh_warehouses(id) ON DELETE SET NULL,
      to_warehouse_id INTEGER REFERENCES wh_warehouses(id) ON DELETE SET NULL,
      from_holder_type VARCHAR(10),
      from_holder_id INTEGER,
      from_holder_label VARCHAR(300),
      to_holder_type VARCHAR(10),
      to_holder_id INTEGER,
      to_holder_label VARCHAR(300),
      supplier_company_id INTEGER,
      supplier_name VARCHAR(300),
      currency VARCHAR(3),
      rate NUMERIC(18,6),
      reason VARCHAR(16),
      reason_text VARCHAR(1000),
      comment VARCHAR(2000),
      base_doc_id INTEGER REFERENCES wh_docs(id) ON DELETE SET NULL,
      proc_request_id INTEGER,
      proc_request_label VARCHAR(300),
      deal_id INTEGER,
      deal_label VARCHAR(300),
      contract_id INTEGER,
      contract_label VARCHAR(300),
      return_by DATE,
      total NUMERIC(18,2),
      transfer_state VARCHAR(10),
      signed_at TIMESTAMPTZ,
      signed_name VARCHAR(200),
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      requested_at TIMESTAMPTZ,
      shipped_at TIMESTAMPTZ,
      shipped_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      received_at TIMESTAMPTZ,
      received_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      posted_at TIMESTAMPTZ,
      posted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reversed_at TIMESTAMPTZ,
      reversed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      overdue_notified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS wh_docs_number_uidx ON wh_docs (number)`);
  await query(`CREATE INDEX IF NOT EXISTS wh_docs_status_idx ON wh_docs (status, type, doc_date DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS wh_docs_wh_idx ON wh_docs (warehouse_id, doc_date DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS wh_docs_to_wh_idx ON wh_docs (to_warehouse_id, transfer_state)`);
  await query(`CREATE INDEX IF NOT EXISTS wh_docs_proc_idx ON wh_docs (proc_request_id) WHERE proc_request_id IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS wh_docs_holder_idx ON wh_docs (to_holder_type, to_holder_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_doc_lines (
      id SERIAL PRIMARY KEY,
      doc_id INTEGER NOT NULL REFERENCES wh_docs(id) ON DELETE CASCADE,
      sort INTEGER NOT NULL DEFAULT 0,
      item_id INTEGER REFERENCES wh_items(id) ON DELETE RESTRICT,
      name_hint VARCHAR(300),
      qty NUMERIC(18,4) NOT NULL DEFAULT 0,
      unit VARCHAR(16),
      factor NUMERIC(18,6) NOT NULL DEFAULT 1,
      base_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
      price NUMERIC(18,4),
      amount NUMERIC(18,2),
      bin_id INTEGER REFERENCES wh_bins(id) ON DELETE SET NULL,
      to_bin_id INTEGER REFERENCES wh_bins(id) ON DELETE SET NULL,
      batch_id INTEGER REFERENCES wh_batches(id) ON DELETE SET NULL,
      batch_number VARCHAR(80),
      expires_on DATE,
      instance_id INTEGER REFERENCES wh_instances(id) ON DELETE SET NULL,
      serials JSONB,
      reserve_id INTEGER,
      book_qty NUMERIC(18,4),
      counted_qty NUMERIC(18,4),
      received_qty NUMERIC(18,4),
      proc_item_id INTEGER,
      note VARCHAR(500)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS wh_doc_lines_doc_idx ON wh_doc_lines (doc_id, sort, id)`);
  await query(`CREATE INDEX IF NOT EXISTS wh_doc_lines_item_idx ON wh_doc_lines (item_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_moves (
      id BIGSERIAL PRIMARY KEY,
      doc_id INTEGER NOT NULL REFERENCES wh_docs(id) ON DELETE RESTRICT,
      line_id INTEGER,
      item_id INTEGER NOT NULL REFERENCES wh_items(id) ON DELETE RESTRICT,
      warehouse_id INTEGER NOT NULL,
      bin_id INTEGER,
      batch_id INTEGER,
      instance_id INTEGER,
      holder_type VARCHAR(10) NOT NULL,
      holder_id INTEGER NOT NULL DEFAULT 0,
      qty NUMERIC(18,4) NOT NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      moved_at TIMESTAMPTZ NOT NULL,
      actor_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS wh_moves_item_idx ON wh_moves (item_id, moved_at)`);
  await query(`CREATE INDEX IF NOT EXISTS wh_moves_wh_idx ON wh_moves (warehouse_id, moved_at)`);
  await query(`CREATE INDEX IF NOT EXISTS wh_moves_doc_idx ON wh_moves (doc_id)`);
  await query(`CREATE INDEX IF NOT EXISTS wh_moves_holder_idx ON wh_moves (holder_type, holder_id) WHERE holder_type <> 'warehouse'`);
  await query(`CREATE INDEX IF NOT EXISTS wh_moves_instance_idx ON wh_moves (instance_id) WHERE instance_id IS NOT NULL`);
  // The journal is append-only (spec §11 «неизменяемый журнал»). Test clean-up sets wh.purge.
  await query(`
    CREATE OR REPLACE FUNCTION wh_moves_immutable() RETURNS trigger AS $$
    BEGIN
      IF current_setting('wh.purge', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'wh_moves is append-only';
    END;
    $$ LANGUAGE plpgsql
  `);
  await query(`DROP TRIGGER IF EXISTS wh_moves_immutable_trg ON wh_moves`);
  await query(`CREATE TRIGGER wh_moves_immutable_trg BEFORE UPDATE OR DELETE ON wh_moves FOR EACH ROW EXECUTE FUNCTION wh_moves_immutable()`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_reserves (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES wh_items(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES wh_warehouses(id) ON DELETE CASCADE,
      qty NUMERIC(18,4) NOT NULL,
      target_type VARCHAR(10) NOT NULL DEFAULT 'other',
      target_id INTEGER,
      target_label VARCHAR(300),
      expires_on DATE,
      note VARCHAR(500),
      status VARCHAR(10) NOT NULL DEFAULT 'active',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS wh_reserves_active_idx ON wh_reserves (item_id, warehouse_id) WHERE status = 'active'`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_files (
      id SERIAL PRIMARY KEY,
      owner_type VARCHAR(10) NOT NULL,
      owner_id INTEGER NOT NULL,
      kind VARCHAR(12) NOT NULL DEFAULT 'other',
      name VARCHAR(255) NOT NULL,
      ext VARCHAR(12),
      size BIGINT NOT NULL DEFAULT 0,
      storage_key VARCHAR(300) NOT NULL,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS wh_files_owner_idx ON wh_files (owner_type, owner_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_events (
      id BIGSERIAL PRIMARY KEY,
      entity_type VARCHAR(10) NOT NULL,
      entity_id INTEGER NOT NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(32) NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS wh_events_entity_idx ON wh_events (entity_type, entity_id, id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_counters (
      key VARCHAR(20) PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_notices (
      key VARCHAR(160) PRIMARY KEY,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await ensureInventorySchema();

  // Low-stock digest, expiring batches, tool service and overdue tools, expired reserves.
  const { runDaily } = await import('./jobs.js');
  registerJob({ name: 'warehouse:daily', everyMs: 30 * 60 * 1000, run: () => runDaily() });
  // Reminders of regular partial inventories (schedules «каждые N дней по категории X»).
  const { runInventoryReminders } = await import('./inventory.js');
  registerJob({ name: 'warehouse:inventory', everyMs: 60 * 60 * 1000, run: () => runInventoryReminders() });
}

/*
 * Inventory sessions (spec §6, docs/warehouse.md#inventory-sessions):
 *
 *   wh_inv_sessions   a count of one warehouse (optionally some bins / categories), blind mode,
 *                     the freeze policy, status, the one `inventory` act it produced
 *   wh_inv_people     counters taking part (besides those assigned to areas)
 *   wh_inv_areas      progress by bins: one row per bin in scope (NULL = «без ячейки»), assignee, status
 *   wh_inv_counts     what each counter counted per bin × item (× instance), base units
 *   wh_inv_ops        the operations phones sent (client-generated ids → idempotent offline sync)
 *   wh_inv_finals     the manager's decision for a row (overrides the sum of counters)
 *   wh_inv_recounts   recount requests (a whole bin or one item in it)
 *   wh_inv_schedules  regular partial counts «every N days by category X» with reminders
 */
async function ensureInventorySchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS wh_inv_schedules (
      id SERIAL PRIMARY KEY,
      warehouse_id INTEGER NOT NULL REFERENCES wh_warehouses(id) ON DELETE CASCADE,
      title VARCHAR(200),
      category_ids INTEGER[] NOT NULL DEFAULT '{}',
      bin_ids INTEGER[] NOT NULL DEFAULT '{}',
      every_days INTEGER NOT NULL DEFAULT 30,
      next_on DATE NOT NULL,
      blind BOOLEAN NOT NULL DEFAULT FALSE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_session_id INTEGER,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_inv_sessions (
      id SERIAL PRIMARY KEY,
      number VARCHAR(40) NOT NULL,
      warehouse_id INTEGER NOT NULL REFERENCES wh_warehouses(id) ON DELETE CASCADE,
      title VARCHAR(200),
      status VARCHAR(10) NOT NULL DEFAULT 'draft',
      blind BOOLEAN NOT NULL DEFAULT FALSE,
      freeze_policy VARCHAR(8) NOT NULL DEFAULT 'block',
      bin_roots INTEGER[] NOT NULL DEFAULT '{}',
      bin_ids INTEGER[] NOT NULL DEFAULT '{}',
      category_roots INTEGER[] NOT NULL DEFAULT '{}',
      category_ids INTEGER[] NOT NULL DEFAULT '{}',
      schedule_id INTEGER REFERENCES wh_inv_schedules(id) ON DELETE SET NULL,
      doc_id INTEGER REFERENCES wh_docs(id) ON DELETE SET NULL,
      comment VARCHAR(2000),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      finished_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      cancelled_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS wh_inv_sessions_number_uidx ON wh_inv_sessions (number)`);
  await query(`CREATE INDEX IF NOT EXISTS wh_inv_sessions_wh_idx ON wh_inv_sessions (warehouse_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS wh_inv_sessions_doc_idx ON wh_inv_sessions (doc_id) WHERE doc_id IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_inv_people (
      session_id INTEGER NOT NULL REFERENCES wh_inv_sessions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, user_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_inv_areas (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES wh_inv_sessions(id) ON DELETE CASCADE,
      bin_id INTEGER REFERENCES wh_bins(id) ON DELETE CASCADE,
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(10) NOT NULL DEFAULT 'todo',
      done_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      done_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS wh_inv_areas_uidx ON wh_inv_areas (session_id, COALESCE(bin_id, 0))`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_inv_counts (
      id BIGSERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES wh_inv_sessions(id) ON DELETE CASCADE,
      counter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bin_id INTEGER REFERENCES wh_bins(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES wh_items(id) ON DELETE CASCADE,
      instance_id INTEGER REFERENCES wh_instances(id) ON DELETE CASCADE,
      qty NUMERIC(18,4) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS wh_inv_counts_uidx ON wh_inv_counts (session_id, counter_id, COALESCE(bin_id, 0), item_id, COALESCE(instance_id, 0))`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_inv_ops (
      id BIGSERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES wh_inv_sessions(id) ON DELETE CASCADE,
      client_id VARCHAR(64) NOT NULL,
      counter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      op JSONB NOT NULL,
      made_at TIMESTAMPTZ,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS wh_inv_ops_uidx ON wh_inv_ops (session_id, client_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_inv_finals (
      session_id INTEGER NOT NULL REFERENCES wh_inv_sessions(id) ON DELETE CASCADE,
      bin_id INTEGER REFERENCES wh_bins(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES wh_items(id) ON DELETE CASCADE,
      instance_id INTEGER REFERENCES wh_instances(id) ON DELETE CASCADE,
      qty NUMERIC(18,4) NOT NULL,
      decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS wh_inv_finals_uidx ON wh_inv_finals (session_id, COALESCE(bin_id, 0), item_id, COALESCE(instance_id, 0))`);
  await query(`
    CREATE TABLE IF NOT EXISTS wh_inv_recounts (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES wh_inv_sessions(id) ON DELETE CASCADE,
      bin_id INTEGER REFERENCES wh_bins(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES wh_items(id) ON DELETE CASCADE,
      requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      done_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS wh_inv_recounts_open_idx ON wh_inv_recounts (session_id) WHERE done_at IS NULL`);
}
