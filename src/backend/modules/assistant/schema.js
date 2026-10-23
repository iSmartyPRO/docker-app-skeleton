import { withTransaction } from '../../config/database.js';

/*
 * One row per person: on/off, chosen robot, sections already greeted.
 *
 * Migration 001 (index.js `migrations`): the schema the assistant had while built into the core,
 * CREATE … IF NOT EXISTS — on a portal that already has assistant_prefs it changes nothing.
 */
export async function createAssistantSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS assistant_prefs (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/** The schema outside a package install (tests, scripts): migration 001 in its own transaction. */
export async function ensureAssistantSchema() {
  await withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('module-migrations:assistant'))`);
    await createAssistantSchema({ query: (text, params) => client.query(text, params) });
  });
}
