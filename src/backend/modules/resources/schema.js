import { query } from '../../config/database.js';
import { ensureAclTable } from '../shared/acl.js';

/*
 * Online resources: links to the company's services (mail, CRM, wiki…)
 * shown as icon tiles, usually on the home page.
 *
 *   res_categories  optional sections people can filter by
 *   res_items       a resource: title, URL, description, icon, how it opens,
 *                   visibility: public (anyone, signed out too), signed (all
 *                   employees) or custom (res_item_acl: users, groups, roles)
 *   res_layouts     each person's own order and hidden tiles
 */

export async function ensureResourcesSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS res_categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      color VARCHAR(7) NOT NULL DEFAULT '#6366F1',
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS res_items (
      id SERIAL PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      url TEXT NOT NULL,
      description VARCHAR(300),
      category_id INTEGER REFERENCES res_categories(id) ON DELETE SET NULL,
      icon JSONB NOT NULL DEFAULT '{}',
      target VARCHAR(8) NOT NULL DEFAULT 'blank',
      visibility VARCHAR(8) NOT NULL DEFAULT 'signed',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // kind 'module': a portal module (url = /app/<module>, name translated unless overridden).
  await query(`ALTER TABLE res_items ADD COLUMN IF NOT EXISTS kind VARCHAR(8) NOT NULL DEFAULT 'link'`);
  await query(`ALTER TABLE res_items ADD COLUMN IF NOT EXISTS module VARCHAR(30)`);
  // Translations: { ru: { title, description }, en: { title, description } }.
  await query(`ALTER TABLE res_items ADD COLUMN IF NOT EXISTS i18n JSONB NOT NULL DEFAULT '{}'`);
  await query(`ALTER TABLE res_categories ADD COLUMN IF NOT EXISTS i18n JSONB NOT NULL DEFAULT '{}'`);
  await ensureAclTable('res_item_acl', 'res_items');
  await query(`
    CREATE TABLE IF NOT EXISTS res_layouts (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      layout JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
