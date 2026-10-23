import { withTransaction } from '../../config/database.js';
import { registerJob } from '../../services/scheduler.js';
import { runDaily, runPaymentReminders } from './jobs.js';
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
/**
 * Migration 001 (index.js `migrations`, docs/module-packages.md «Migrations»): the schema Contracts had
 * while built into the core — CREATE … IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, all idempotent — so on
 * a portal that already has the ctr_* tables it changes nothing. Everything goes through `db` (the
 * migration's transaction).
 */
export async function createContractsSchema(db) {
  const query = (text, params) => db.query(text, params);
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

  await ensurePaymentsSchema(db);
}

/** The schema outside a package install (tests, scripts): migration 001 in its own transaction. */
export async function ensureContractsSchema() {
  await withTransaction(async (client) => {
    // The lock the package migrations take (platform/packages/migrations.js): one at a time.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('module-migrations:contracts'))`);
    await createContractsSchema({ query: (text, params) => client.query(text, params) });
  });
}

/** Background jobs and the contract conversations (register(ctx); no database access). */
export function startContracts() {
  registerJob({ name: 'contracts:daily', everyMs: 10 * 60 * 1000, run: runDaily });
  registerJob({ name: 'contracts:payments', everyMs: 15 * 60 * 1000, run: runPaymentReminders });
  registerContractChat();
}

/*
 * The money side (docs/contracts.md "Deposit and payments"), all optional:
 *
 *   ctr_deposits     one per contract: «Задаток» / «Аванс», amount, due / received days,
 *                    method, document, status (expected → received → credited |
 *                    returned | forfeited), refund / forfeit terms, who confirmed
 *   ctr_schedule     the payment schedule: day, amount, purpose, `paid` (allocated,
 *                    recomputed after every change, oldest row first)
 *   ctr_payments     received payments (fact): day, amount, method, number, document
 *   ctr_pay_reminders payment reminders already sent: (row, kind, days, due day) once
 *
 * ctr_contracts keeps the totals for the registry chips: pay_tracked (has a
 * deposit / schedule / payments), pay_total, pay_paid, deposit_status, pay_plan.
 */
export async function ensurePaymentsSchema(db) {
  const query = (text, params) => db.query(text, params);
  await query(`ALTER TABLE ctr_contracts
    ADD COLUMN IF NOT EXISTS pay_tracked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pay_total NUMERIC(18,2),
    ADD COLUMN IF NOT EXISTS pay_paid NUMERIC(18,2),
    ADD COLUMN IF NOT EXISTS deposit_status VARCHAR(10),
    ADD COLUMN IF NOT EXISTS pay_plan JSONB`);
  await query(`CREATE INDEX IF NOT EXISTS ctr_contracts_pay_idx ON ctr_contracts (pay_tracked) WHERE pay_tracked`);
  await query(`
    CREATE TABLE IF NOT EXISTS ctr_deposits (
      contract_id INTEGER PRIMARY KEY REFERENCES ctr_contracts(id) ON DELETE CASCADE,
      kind VARCHAR(8) NOT NULL DEFAULT 'deposit' CHECK (kind IN ('deposit', 'advance')),
      amount NUMERIC(18,2) NOT NULL,
      currency CHAR(3),
      due_on DATE,
      received_on DATE,
      method VARCHAR(8),
      reference VARCHAR(80),
      status VARCHAR(10) NOT NULL DEFAULT 'expected' CHECK (status IN ('expected', 'received', 'credited', 'returned', 'forfeited')),
      terms TEXT,
      settled_on DATE,
      settled_amount NUMERIC(18,2),
      note VARCHAR(1000),
      file_key VARCHAR(255),
      file_name VARCHAR(255),
      file_ext VARCHAR(12),
      file_size BIGINT,
      confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      confirmed_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ctr_schedule (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER NOT NULL REFERENCES ctr_contracts(id) ON DELETE CASCADE,
      no INTEGER NOT NULL,
      due_on DATE NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      purpose VARCHAR(8) NOT NULL DEFAULT 'monthly',
      note VARCHAR(300),
      paid NUMERIC(18,2) NOT NULL DEFAULT 0
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS ctr_schedule_contract_idx ON ctr_schedule (contract_id, due_on, no)`);
  await query(`CREATE INDEX IF NOT EXISTS ctr_schedule_open_idx ON ctr_schedule (due_on) WHERE paid < amount`);
  await query(`
    CREATE TABLE IF NOT EXISTS ctr_payments (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER NOT NULL REFERENCES ctr_contracts(id) ON DELETE CASCADE,
      paid_on DATE NOT NULL,
      amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
      method VARCHAR(8) NOT NULL DEFAULT 'bank',
      reference VARCHAR(80),
      note VARCHAR(1000),
      file_key VARCHAR(255),
      file_name VARCHAR(255),
      file_ext VARCHAR(12),
      file_size BIGINT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS ctr_payments_contract_idx ON ctr_payments (contract_id, paid_on)`);
  await query(`
    CREATE TABLE IF NOT EXISTS ctr_pay_reminders (
      row_id INTEGER NOT NULL REFERENCES ctr_schedule(id) ON DELETE CASCADE,
      kind VARCHAR(8) NOT NULL,
      days INTEGER NOT NULL,
      due_on DATE NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (row_id, kind, days, due_on)
    )
  `);
}
