import { query, withTransaction } from '../../config/database.js';
import { getSetting, setSetting } from '../../services/settings.js';
import { registerJob } from '../../services/scheduler.js';
import { runReminders } from './reminders.js';
import { registerDealChat } from './chat.js';

/*
 * CRM: deals moving through pipeline stages (docs/crm.md).
 *
 *   crm_pipelines      pipelines ("воронки")
 *   crm_stages         their stages; exactly one 'won' and one 'lost' per pipeline (the last two)
 *   crm_deals          deals; clients are cmp_companies / cmp_people of the Companies module
 *   crm_deal_watchers  watchers ("наблюдатели")
 *   crm_activities     things to do on a deal: calls, meetings, tasks… with due dates and reminders
 *   crm_events         the deal's history: changes, comments, activities
 *   crm_presets        personal saved filters
 */

export const DEFAULT_STAGES = [
  { name: 'Новая', color: '#94A3B8', kind: 'open' },
  { name: 'Квалификация', color: '#3B82F6', kind: 'open' },
  { name: 'Предложение', color: '#8B5CF6', kind: 'open' },
  { name: 'Переговоры', color: '#F59E0B', kind: 'open' },
  { name: 'Успешно', color: '#10B981', kind: 'won' },
  { name: 'Провалена', color: '#EF4444', kind: 'lost' },
];

export async function ensureCrmSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS crm_pipelines (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      color VARCHAR(7),
      sort INTEGER NOT NULL DEFAULT 0,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS crm_stages (
      id SERIAL PRIMARY KEY,
      pipeline_id INTEGER NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
      name VARCHAR(80) NOT NULL,
      color VARCHAR(7) NOT NULL DEFAULT '#94A3B8',
      sort INTEGER NOT NULL DEFAULT 0,
      kind VARCHAR(8) NOT NULL DEFAULT 'open' CHECK (kind IN ('open', 'won', 'lost')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS crm_stages_pipeline_idx ON crm_stages (pipeline_id, sort)`);
  await query(`
    CREATE TABLE IF NOT EXISTS crm_deals (
      id SERIAL PRIMARY KEY,
      pipeline_id INTEGER NOT NULL REFERENCES crm_pipelines(id),
      stage_id INTEGER NOT NULL REFERENCES crm_stages(id),
      title VARCHAR(300) NOT NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      currency CHAR(3) NOT NULL DEFAULT 'KGS',
      company_id INTEGER REFERENCES cmp_companies(id) ON DELETE SET NULL,
      person_id INTEGER REFERENCES cmp_people(id) ON DELETE SET NULL,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      source VARCHAR(80),
      comment TEXT,
      close_date DATE,
      lost_reason VARCHAR(300),
      custom JSONB NOT NULL DEFAULT '{}',
      rank DOUBLE PRECISION NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `);
  // Extra (not in the first spec): who moved a deal to the trash.
  await query(`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await query(`CREATE INDEX IF NOT EXISTS crm_deals_board_idx ON crm_deals (pipeline_id, stage_id, rank) WHERE deleted_at IS NULL`);
  await query(`CREATE INDEX IF NOT EXISTS crm_deals_owner_idx ON crm_deals (owner_id)`);
  await query(`CREATE INDEX IF NOT EXISTS crm_deals_company_idx ON crm_deals (company_id)`);
  await query(`CREATE INDEX IF NOT EXISTS crm_deals_person_idx ON crm_deals (person_id)`);
  await query(`CREATE INDEX IF NOT EXISTS crm_deals_close_idx ON crm_deals (close_date)`);
  await query(`CREATE INDEX IF NOT EXISTS crm_deals_trash_idx ON crm_deals (deleted_at) WHERE deleted_at IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS crm_deal_watchers (
      deal_id INTEGER NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (deal_id, user_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS crm_deal_watchers_user_idx ON crm_deal_watchers (user_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS crm_activities (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
      kind VARCHAR(8) NOT NULL DEFAULT 'task' CHECK (kind IN ('call', 'meeting', 'task', 'email', 'other')),
      title VARCHAR(300) NOT NULL,
      note TEXT,
      due_at TIMESTAMPTZ,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      remind_minutes INTEGER,
      reminded_at TIMESTAMPTZ,
      done_at TIMESTAMPTZ,
      done_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS crm_activities_open_idx ON crm_activities (deal_id) WHERE done_at IS NULL`);
  await query(`CREATE INDEX IF NOT EXISTS crm_activities_owner_idx ON crm_activities (owner_id, due_at) WHERE done_at IS NULL`);
  await query(`CREATE INDEX IF NOT EXISTS crm_activities_remind_idx ON crm_activities (due_at) WHERE done_at IS NULL AND reminded_at IS NULL AND remind_minutes IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS crm_events (
      id BIGSERIAL PRIMARY KEY,
      deal_id INTEGER NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
      kind VARCHAR(24) NOT NULL,
      body TEXT,
      data JSONB NOT NULL DEFAULT '{}',
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS crm_events_deal_idx ON crm_events (deal_id, id DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS crm_events_author_idx ON crm_events (author_id, deal_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS crm_presets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(80) NOT NULL,
      filter JSONB NOT NULL DEFAULT '{}',
      sort VARCHAR(40),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS crm_presets_user_idx ON crm_presets (user_id)`);

  await seedPipeline();
  registerJob({ name: 'crm:reminders', everyMs: 60 * 1000, run: runReminders });
  registerDealChat();
}

/** The default pipeline "Продажи", once. */
async function seedPipeline() {
  if ((await getSetting('crm_seeded')) === 'true') return;
  await withTransaction(async (client) => {
    const existing = await client.query(`SELECT 1 FROM crm_pipelines LIMIT 1`);
    if (existing.rows.length) return;
    const { rows } = await client.query(`INSERT INTO crm_pipelines (name, color, sort, is_default) VALUES ('Продажи', '#2563EB', 0, TRUE) RETURNING id`);
    for (const [index, stage] of DEFAULT_STAGES.entries()) {
      await client.query(`INSERT INTO crm_stages (pipeline_id, name, color, sort, kind) VALUES ($1, $2, $3, $4, $5)`, [rows[0].id, stage.name, stage.color, index, stage.kind]);
    }
  });
  await setSetting('crm_seeded', 'true');
}
