import { query } from '../../config/database.js';

/* One row per person: on/off, chosen robot, sections already greeted. */
export async function ensureAssistantSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS assistant_prefs (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
