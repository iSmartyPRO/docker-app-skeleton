import { query } from '../../config/database.js';
import { registerJob } from '../../services/scheduler.js';
import { runDaily } from './jobs.js';
import { registerContractChat } from './chat.js';

/*
 * Contracts (docs/contracts.md):
 *
 *   ctr_contracts   the card: number, type, direction, counterparty, legal entity,
 *                   money, dates, auto-prolongation, people, links, status
 *   ctr_versions    file versions (blobs under UPLOAD_DIR/contracts/…), one marked current
 *   ctr_risks       «На что обратить внимание»: the lawyer's checklist
 *   ctr_events      history (the «История» tab)
 *   ctr_reminders   reminders already sent: (contract, kind, days, target day) once
 *
 * Calendar days are DATE columns read as text ('YYYY-MM-DD'), never as Date.
 */
export async function ensureContractsSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS ctr_contracts (
      id SERIAL PRIMARY KEY,
      seq INTEGER NOT NULL,
      number VARCHAR(40) NOT NULL,
      ext_number VARCHAR(80),
      title VARCHAR(300) NOT NULL,
      type_key VARCHAR(24),
      direction VARCHAR(10) CHECK (direction IN ('supplier', 'client')),
      company_id INTEGER,
      counterparty VARCHAR(300),
      legal_entity_id INTEGER,
      framework BOOLEAN NOT NULL DEFAULT FALSE,
      amount NUMERIC(18,2),
      currency CHAR(3),
      payment_terms TEXT,
      description TEXT,
      concluded_on DATE,
      starts_on DATE,
      ends_on DATE,
      auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
      notice_days INTEGER,
      lawyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      deal_id INTEGER,
      mp_project_id INTEGER,
      mp_node_id INTEGER,
      status VARCHAR(12) NOT NULL DEFAULT 'draft',
      status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      current_version_id INTEGER,
      signed_version_id INTEGER,
      signed_at TIMESTAMPTZ,
      signed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      terminated_reason VARCHAR(1000),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS ctr_contracts_number_key ON ctr_contracts (number)`);
  await query(`CREATE INDEX IF NOT EXISTS ctr_contracts_status_idx ON ctr_contracts (status, ends_on)`);
  await query(`CREATE INDEX IF NOT EXISTS ctr_contracts_people_idx ON ctr_contracts (owner_id, lawyer_id, created_by)`);
  await query(`CREATE INDEX IF NOT EXISTS ctr_contracts_ends_idx ON ctr_contracts (ends_on)`);
  await query(`CREATE INDEX IF NOT EXISTS ctr_contracts_deal_idx ON ctr_contracts (deal_id) WHERE deal_id IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS ctr_versions (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER NOT NULL REFERENCES ctr_contracts(id) ON DELETE CASCADE,
      no INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      ext VARCHAR(12),
      mime VARCHAR(120),
      size BIGINT NOT NULL DEFAULT 0,
      storage_key VARCHAR(255) NOT NULL,
      comment TEXT,
      signed BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (contract_id, no)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ctr_risks (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER NOT NULL REFERENCES ctr_contracts(id) ON DELETE CASCADE,
      no INTEGER NOT NULL,
      text TEXT NOT NULL,
      clause VARCHAR(120),
      importance VARCHAR(6) NOT NULL DEFAULT 'medium' CHECK (importance IN ('high', 'medium', 'low')),
      status VARCHAR(8) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'fixed')),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (contract_id, no)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ctr_events (
      id BIGSERIAL PRIMARY KEY,
      contract_id INTEGER NOT NULL REFERENCES ctr_contracts(id) ON DELETE CASCADE,
      kind VARCHAR(24) NOT NULL,
      data JSONB NOT NULL DEFAULT '{}',
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS ctr_events_contract_idx ON ctr_events (contract_id, id DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS ctr_reminders (
      contract_id INTEGER NOT NULL REFERENCES ctr_contracts(id) ON DELETE CASCADE,
      kind VARCHAR(8) NOT NULL,
      days INTEGER NOT NULL,
      target DATE NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contract_id, kind, days, target)
    )
  `);

  registerJob({ name: 'contracts:daily', everyMs: 10 * 60 * 1000, run: runDaily });
  registerContractChat();
}
