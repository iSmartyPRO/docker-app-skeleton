import { query } from '../../config/database.js';
import { registerJob } from '../../services/scheduler.js';
import { runSla } from './sla.js';

/*
 * Approvals tables (docs/approvals.md#data-model). Idempotent; runs on every start.
 *
 *   approval_routes        one route per document type: stages (JSONB), restart rule, escalation people
 *   approval_processes     one row per document (type, doc_id); `round` grows with every (re)start
 *   approval_seats         the approvers of an activated stage, with their decisions
 *   approval_events        history: every action, reminder and escalation
 *   approval_substitutes   "while I am away, X decides for me" (date ranges)
 */
export async function ensureApprovalsSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS approval_routes (
      id SERIAL PRIMARY KEY,
      type VARCHAR(80) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL DEFAULT '',
      stages JSONB NOT NULL DEFAULT '[]'::jsonb,
      restart_from VARCHAR(10) NOT NULL DEFAULT 'first',
      escalate_to JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS approval_processes (
      id BIGSERIAL PRIMARY KEY,
      type VARCHAR(80) NOT NULL,
      doc_id VARCHAR(64) NOT NULL,
      round INTEGER NOT NULL DEFAULT 1,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      stages JSONB NOT NULL DEFAULT '[]'::jsonb,
      skipped JSONB NOT NULL DEFAULT '[]'::jsonb,
      restart_from VARCHAR(10) NOT NULL DEFAULT 'first',
      escalate_to JSONB NOT NULL DEFAULT '[]'::jsonb,
      current_stage INTEGER NOT NULL DEFAULT 0,
      urgency VARCHAR(24) NOT NULL DEFAULT 'normal',
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(300) NOT NULL DEFAULT '',
      number VARCHAR(40),
      amount NUMERIC(18, 2),
      currency VARCHAR(3),
      url VARCHAR(500),
      doc_due_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      stage_started_at TIMESTAMPTZ,
      due_at TIMESTAMPTZ,
      remind_at TIMESTAMPTZ,
      reminded_at TIMESTAMPTZ,
      escalated_at TIMESTAMPTZ,
      paused_at TIMESTAMPTZ,
      question_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      question_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      finished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (type, doc_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS approval_processes_active_idx ON approval_processes (status, due_at) WHERE status IN ('pending', 'question')`);
  await query(`CREATE INDEX IF NOT EXISTS approval_processes_author_idx ON approval_processes (author_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS approval_processes_question_idx ON approval_processes (question_to) WHERE status = 'question'`);
  await query(`
    CREATE TABLE IF NOT EXISTS approval_seats (
      id BIGSERIAL PRIMARY KEY,
      process_id BIGINT NOT NULL REFERENCES approval_processes(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      stage_index INTEGER NOT NULL,
      kind VARCHAR(16) NOT NULL,
      ref_id INTEGER,
      ref_key VARCHAR(64),
      delegated_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      delegated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      decision VARCHAR(16),
      decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      on_behalf_of INTEGER REFERENCES users(id) ON DELETE SET NULL,
      decided_at TIMESTAMPTZ,
      comment TEXT,
      activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS approval_seats_stage_idx ON approval_seats (process_id, round, stage_index)`);
  await query(`CREATE INDEX IF NOT EXISTS approval_seats_open_idx ON approval_seats (kind, ref_id) WHERE decision IS NULL`);
  await query(`CREATE INDEX IF NOT EXISTS approval_seats_delegated_idx ON approval_seats (delegated_to) WHERE decision IS NULL AND delegated_to IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS approval_events (
      id BIGSERIAL PRIMARY KEY,
      process_id BIGINT NOT NULL REFERENCES approval_processes(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      stage_index INTEGER,
      action VARCHAR(24) NOT NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      on_behalf_of INTEGER REFERENCES users(id) ON DELETE SET NULL,
      target_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      comment TEXT,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS approval_events_process_idx ON approval_events (process_id, id)`);
  await query(`CREATE INDEX IF NOT EXISTS approval_events_actor_idx ON approval_events (actor_id, id DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS approval_substitutes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      substitute_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      starts_on DATE NOT NULL,
      ends_on DATE NOT NULL,
      note VARCHAR(200) NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (user_id <> substitute_id),
      CHECK (ends_on >= starts_on)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS approval_substitutes_sub_idx ON approval_substitutes (substitute_id, starts_on, ends_on)`);
  await query(`CREATE INDEX IF NOT EXISTS approval_substitutes_user_idx ON approval_substitutes (user_id, ends_on)`);

  registerJob({ name: 'approvals:sla', everyMs: 60 * 1000, run: () => runSla() });
}
