import { query } from '../../config/database.js';
import { registerJob } from '../../services/scheduler.js';
import { purgeOrphanFiles } from './files.js';

/*
 * Chat: conversations inside the portal.
 *
 *   chat_rooms     a conversation: direct (two people), group (named, any
 *                  number of people) or entity (bound to a record of another
 *                  module, e.g. a task: entity_type 'task', entity_id 42)
 *   chat_members   who is in a room, how far they have read, mute / pin
 *   chat_messages  text messages, system events (kind 'system', data holds the
 *                  event) and replies; edits and deletions keep the row
 *   chat_reactions emoji per person per message
 *   chat_files     uploads; attached to a message once it is sent
 *
 * Entity rooms take their access from the owning module (entities.js), so a
 * task's chat is open to exactly the people who may see the task.
 */

export async function ensureChatSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id SERIAL PRIMARY KEY,
      kind VARCHAR(8) NOT NULL,
      title VARCHAR(200),
      color VARCHAR(7),
      entity_type VARCHAR(24),
      entity_id INTEGER,
      direct_key VARCHAR(40) UNIQUE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_message_id BIGINT,
      last_message_at TIMESTAMPTZ
    )
  `);
  await query(`ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS link TEXT`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS chat_rooms_entity_uidx ON chat_rooms (entity_type, entity_id) WHERE entity_type IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS chat_members (
      room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(8) NOT NULL DEFAULT 'member',
      last_read_id BIGINT NOT NULL DEFAULT 0,
      muted BOOLEAN NOT NULL DEFAULT FALSE,
      pinned BOOLEAN NOT NULL DEFAULT FALSE,
      hidden BOOLEAN NOT NULL DEFAULT FALSE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (room_id, user_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS chat_members_user_idx ON chat_members (user_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      kind VARCHAR(8) NOT NULL DEFAULT 'text',
      body TEXT NOT NULL DEFAULT '',
      data JSONB,
      reply_to_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      edited_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS chat_messages_room_idx ON chat_messages (room_id, id DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS chat_reactions (
      message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji VARCHAR(16) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (message_id, user_id, emoji)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS chat_files (
      id SERIAL PRIMARY KEY,
      room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      mime VARCHAR(120),
      size BIGINT NOT NULL DEFAULT 0,
      storage_key VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS chat_files_message_idx ON chat_files (message_id)`);

  // Uploads never sent with a message are removed after a day.
  registerJob({ name: 'chat:orphans', everyMs: 6 * 60 * 60 * 1000, run: purgeOrphanFiles });
}
