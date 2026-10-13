import { query } from '../config/database.js';
import { registerJob } from '../services/scheduler.js';
import { AREA_KEYS } from './scopes.js';
import { purgeLog } from './log.js';
import { deliverDue, purgeDeliveries } from './webhooks.js';

/*
 * Public API storage.
 *
 *   api_templates   access templates: a level per area + path rules
 *   api_tokens      tokens; each belongs to a person and acts with their rights,
 *                   narrowed by its template, its own changes, resource limits,
 *                   IP list, expiry and rate limit
 *   api_requests    request log of token calls
 *   api_webhooks    outgoing webhooks: events, URL, signing secret, run-as person
 *   api_deliveries  each webhook call with its attempts and the answer
 */

const all = (level) => Object.fromEntries(AREA_KEYS.map((key) => [key, level]));
const userAreas = AREA_KEYS.filter((key) => !key.startsWith('admin.'));

/** Built-in templates, seeded by key; editing them is not allowed (duplicate instead). */
export const SYSTEM_TEMPLATES = [
  {
    key: 'read_only',
    color: '#0EA5E9',
    icon: 'eye',
    scopes: Object.fromEntries(userAreas.map((key) => [key, 'read'])),
    rules: [],
  },
  {
    key: 'user_full',
    color: '#6366F1',
    icon: 'user',
    scopes: Object.fromEntries(userAreas.map((key) => [key, 'write'])),
    rules: [],
  },
  {
    key: 'tasks',
    color: '#10B981',
    icon: 'tasks',
    scopes: { account: 'read', tasks: 'write', chat: 'write', calendar: 'read' },
    rules: [],
  },
  {
    key: 'calendar',
    color: '#F59E0B',
    icon: 'calendar',
    scopes: { account: 'read', calendar: 'write' },
    rules: [],
  },
  {
    key: 'bot',
    color: '#EC4899',
    icon: 'chat',
    scopes: { account: 'read', chat: 'write', notifications: 'read' },
    rules: [{ effect: 'deny', methods: ['DELETE'], path: '/app/chat/**', note: '' }],
  },
  {
    key: 'directory_sync',
    color: '#8B5CF6',
    icon: 'people',
    scopes: { account: 'read', 'admin.users': 'write' },
    rules: [{ effect: 'deny', methods: ['DELETE'], path: '/admin/users/*', note: '' }],
  },
  {
    key: 'monitoring',
    color: '#64748B',
    icon: 'chart',
    scopes: { account: 'read', 'admin.security': 'read', 'admin.settings': 'read', dashboard: 'read' },
    rules: [],
  },
  {
    key: 'full_admin',
    color: '#EF4444',
    icon: 'key',
    scopes: all('write'),
    rules: [],
  },
];

export async function ensureApiTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS api_templates (
      id SERIAL PRIMARY KEY,
      key VARCHAR(40) UNIQUE,
      name VARCHAR(120),
      description TEXT,
      color VARCHAR(7) NOT NULL DEFAULT '#6366F1',
      icon VARCHAR(30) NOT NULL DEFAULT 'key',
      scopes JSONB NOT NULL DEFAULT '{}',
      rules JSONB NOT NULL DEFAULT '[]',
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      sort INTEGER NOT NULL DEFAULT 100,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      kind VARCHAR(12) NOT NULL DEFAULT 'personal',
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      prefix VARCHAR(24) NOT NULL UNIQUE,
      secret_hash VARCHAR(64) NOT NULL,
      template_id INTEGER REFERENCES api_templates(id) ON DELETE SET NULL,
      scopes JSONB NOT NULL DEFAULT '{}',
      rules JSONB NOT NULL DEFAULT '[]',
      limits JSONB NOT NULL DEFAULT '{}',
      ip_allow TEXT[] NOT NULL DEFAULT '{}',
      rate_limit INTEGER,
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      last_used_at TIMESTAMPTZ,
      last_ip VARCHAR(64),
      use_count BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS api_tokens_user ON api_tokens (user_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS api_requests (
      id BIGSERIAL PRIMARY KEY,
      token_id INTEGER REFERENCES api_tokens(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      method VARCHAR(8) NOT NULL,
      path VARCHAR(300) NOT NULL,
      area VARCHAR(40),
      status SMALLINT NOT NULL,
      code VARCHAR(40),
      duration_ms INTEGER NOT NULL DEFAULT 0,
      ip VARCHAR(64),
      user_agent VARCHAR(200),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS api_requests_time ON api_requests (created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS api_requests_token ON api_requests (token_id, created_at DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS api_webhooks (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      url VARCHAR(1000) NOT NULL,
      secret TEXT NOT NULL,
      events TEXT[] NOT NULL DEFAULT '{}',
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      limits JSONB NOT NULL DEFAULT '{}',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      failure_streak INTEGER NOT NULL DEFAULT 0,
      disabled_reason VARCHAR(40),
      last_status VARCHAR(12),
      last_delivery_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS api_deliveries (
      id BIGSERIAL PRIMARY KEY,
      webhook_id INTEGER NOT NULL REFERENCES api_webhooks(id) ON DELETE CASCADE,
      event_id UUID NOT NULL,
      event VARCHAR(60) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(10) NOT NULL DEFAULT 'pending',
      attempts SMALLINT NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      response_status SMALLINT,
      response_body TEXT,
      error TEXT,
      duration_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      delivered_at TIMESTAMPTZ
    )
  `);
  // "Send again" from the console: the same event id, sent with X-Portal-Redelivery: 1.
  await query(`ALTER TABLE api_deliveries ADD COLUMN IF NOT EXISTS redelivery BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`CREATE INDEX IF NOT EXISTS api_deliveries_due ON api_deliveries (next_attempt_at) WHERE status = 'pending'`);
  await query(`CREATE INDEX IF NOT EXISTS api_deliveries_hook ON api_deliveries (webhook_id, created_at DESC)`);

  for (const [index, template] of SYSTEM_TEMPLATES.entries()) {
    await query(
      `INSERT INTO api_templates (key, color, icon, scopes, rules, is_system, sort)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6)
       ON CONFLICT (key) DO UPDATE SET scopes = EXCLUDED.scopes, rules = EXCLUDED.rules, color = EXCLUDED.color, icon = EXCLUDED.icon, sort = EXCLUDED.sort`,
      [template.key, template.color, template.icon, JSON.stringify(template.scopes), JSON.stringify(template.rules), index]
    );
  }

  registerJob({ name: 'api:webhooks', everyMs: 20_000, run: deliverDue });
  registerJob({ name: 'api:housekeeping', everyMs: 6 * 60 * 60 * 1000, run: async () => {
    await purgeLog();
    await purgeDeliveries();
  } });
}
