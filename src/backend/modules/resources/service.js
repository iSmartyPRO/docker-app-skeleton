import { query, withTransaction } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { MODULE_CATALOG } from '../catalog.js';
import { HEX, LEVEL, clean, contextFromRequest, httpError, intId, matches, readAcl, writeAcl } from '../shared/acl.js';
import { cleanIcon, iconFiles, removeIconFiles } from './icons.js';

/*
 * Who sees a resource:
 *   public  everyone, including people who are not signed in
 *   signed  every signed-in employee
 *   custom  the users, groups and roles in res_item_acl
 * Holders of resources.admin see and manage everything.
 */

export const VISIBILITY = ['public', 'signed', 'custom'];

export function resourcesContext(req) {
  return contextFromRequest(req, 'resources.admin');
}

export async function resourcesSettings() {
  const parsed = parseSettings(await getSettings());
  return { enabled: Boolean(parsed.modules.resources?.enabled), ...parsed.modules.resources.settings };
}

/** http(s), mailto:, tel: or a path inside the portal ("/app/kb"). */
export function cleanUrl(value) {
  const url = String(value || '').trim().slice(0, 2000);
  if (/^\/(?!\/)[^\s]*$/.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) return parsed.href;
  } catch {
    /* fall through */
  }
  throw httpError(400, 'Enter a web address (https://…), mailto:, tel: or a portal path', 'INVALID_URL');
}

const LANGS = ['ru', 'en'];
// Modules a resource can point to (not the resources board itself).
export const LINKABLE_MODULES = MODULE_CATALOG.filter((module) => !module.overlay && module.id !== 'resources').map((module) => module.id);

function cleanI18n(input) {
  const out = {};
  for (const lang of LANGS) {
    const title = clean(input?.[lang]?.title ?? '', 120);
    const description = clean(input?.[lang]?.description ?? '', 300);
    if (title || description) out[lang] = { ...(title ? { title } : {}), ...(description ? { description } : {}) };
  }
  return out;
}

function itemShape(row) {
  return {
    id: row.id,
    kind: row.kind || 'link',
    module: row.module || null,
    i18n: row.i18n || {},
    title: row.title,
    url: row.url,
    description: row.description || '',
    categoryId: row.category_id,
    icon: row.icon || {},
    target: row.target,
    visibility: row.visibility,
    active: row.active,
  };
}

function categoryShape(row) {
  return { id: row.id, name: row.name, color: row.color, i18n: row.i18n || {} };
}

async function loadAll() {
  const [items, categories, acl] = await Promise.all([
    query(`SELECT * FROM res_items ORDER BY sort, id`),
    query(`SELECT * FROM res_categories ORDER BY sort, id`),
    query(`SELECT resource_id, subject_type, subject_id, level FROM res_item_acl`),
  ]);
  const aclByItem = new Map();
  for (const entry of acl.rows) {
    if (!aclByItem.has(entry.resource_id)) aclByItem.set(entry.resource_id, []);
    aclByItem.get(entry.resource_id).push(entry);
  }
  return { items: items.rows, categories: categories.rows, aclByItem };
}

function canSee(ctx, item, entries) {
  if (ctx.isAdmin) return true;
  if (!item.active) return false;
  if (item.visibility === 'public') return true;
  if (!ctx.userId) return false;
  if (item.visibility === 'signed') return true;
  return entries.some((entry) => entry.level >= LEVEL.view && matches(entry, ctx));
}

function cleanLayout(input = {}) {
  const ids = (list) =>
    [...new Set((Array.isArray(list) ? list : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
  return { order: ids(input.order), hidden: ids(input.hidden) };
}

/** What the home page shows to this viewer (signed in or not), with their layout. */
export async function board(ctx) {
  const settings = await resourcesSettings();
  const { items, categories, aclByItem } = await loadAll();
  const modules = parseSettings(await getSettings()).modules;
  // A tile of a switched-off module disappears with it.
  const moduleOn = (item) => item.kind !== 'module' || Boolean(modules[item.module]?.enabled);
  const visible = items.filter((item) => moduleOn(item) && canSee(ctx, item, aclByItem.get(item.id) || []) && (item.active || ctx.isAdmin));
  const used = new Set(visible.map((item) => item.category_id));
  let layout = null;
  if (ctx.userId) {
    const { rows } = await query(`SELECT layout FROM res_layouts WHERE user_id = $1`, [ctx.userId]);
    layout = rows[0] ? cleanLayout(rows[0].layout) : null;
  }
  return {
    items: visible.filter((item) => item.active).map(itemShape),
    categories: categories.filter((category) => used.has(category.id)).map(categoryShape),
    layout,
    config: {
      title: settings.title,
      subtitle: settings.subtitle,
      personalize: settings.personalize,
      showDescriptions: settings.showDescriptions,
      showSearch: settings.showSearch,
      density: settings.density,
      canManage: ctx.isAdmin,
      signedIn: Boolean(ctx.userId),
    },
  };
}

export async function saveLayout(ctx, input) {
  const settings = await resourcesSettings();
  if (!settings.personalize) throw httpError(403, 'Personal layouts are turned off', 'PERSONALIZE_OFF');
  const layout = cleanLayout(input);
  await query(
    `INSERT INTO res_layouts (user_id, layout, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET layout = EXCLUDED.layout, updated_at = NOW()`,
    [ctx.userId, JSON.stringify(layout)]
  );
  return layout;
}

export async function resetLayout(ctx) {
  await query(`DELETE FROM res_layouts WHERE user_id = $1`, [ctx.userId]);
}

// ── Administration ──────────────────────────────────────────────────────────

export function requireAdmin(ctx) {
  if (!ctx.isAdmin) throw httpError(403, 'You do not have permission for this action', 'FORBIDDEN');
}

export async function adminList() {
  const { items, categories } = await loadAll();
  const withAccess = await Promise.all(
    items.map(async (item) => ({
      ...itemShape(item),
      access: item.visibility === 'custom' ? await readAcl('res_item_acl', item.id) : [],
    }))
  );
  return { items: withAccess, categories: categories.map(categoryShape) };
}

function itemInput(input, current = {}) {
  const kind = input.kind === 'module' || input.kind === 'link' ? input.kind : current.kind || 'link';
  const module = kind === 'module' ? String(input.module ?? current.module ?? '') : null;
  if (kind === 'module' && !LINKABLE_MODULES.includes(module)) throw httpError(400, 'Choose a module', 'INVALID_MODULE');
  const i18n = input.i18n !== undefined ? cleanI18n(input.i18n) : current.i18n || {};
  // A module tile may stay untitled: the module's name is shown in each language.
  const title = clean(input.title ?? current.title ?? '', 120) || Object.values(i18n).find((entry) => entry.title)?.title || '';
  if (!title && kind !== 'module') throw httpError(400, 'Enter a title', 'NAME_REQUIRED');
  const visibility = VISIBILITY.includes(input.visibility) ? input.visibility : current.visibility || 'signed';
  return {
    kind,
    module,
    i18n,
    title,
    url: kind === 'module' ? `/app/${module}` : cleanUrl(input.url ?? current.url),
    description: clean(input.description ?? current.description ?? '', 300) || Object.values(i18n).find((entry) => entry.description)?.description || null,
    categoryId: input.categoryId === null || input.categoryId === '' ? null : input.categoryId !== undefined ? intId(input.categoryId) : current.category_id ?? null,
    icon: input.icon !== undefined ? cleanIcon(input.icon) : current.icon || cleanIcon({ type: 'letter', text: (title || module || '•').slice(0, 1) }),
    target: ['blank', 'self'].includes(input.target) ? input.target : current.target || (kind === 'module' ? 'self' : 'blank'),
    visibility,
    active: typeof input.active === 'boolean' ? input.active : current.active ?? true,
  };
}

export async function saveItem(ctx, input = {}, id = null) {
  let current = {};
  if (id) {
    const { rows } = await query(`SELECT * FROM res_items WHERE id = $1`, [intId(id)]);
    if (!rows[0]) throw httpError(404, 'Resource not found', 'NOT_FOUND');
    current = rows[0];
  }
  const v = itemInput(input, current);
  if (v.categoryId) {
    const { rows } = await query(`SELECT id FROM res_categories WHERE id = $1`, [v.categoryId]);
    if (!rows[0]) v.categoryId = null;
  }
  const saved = await withTransaction(async (client) => {
    const params = [v.title, v.url, v.description, v.categoryId, JSON.stringify(v.icon), v.target, v.visibility, v.active, v.kind, v.module, JSON.stringify(v.i18n)];
    const { rows } = id
      ? await client.query(
          `UPDATE res_items SET title = $1, url = $2, description = $3, category_id = $4, icon = $5, target = $6,
             visibility = $7, active = $8, kind = $9, module = $10, i18n = $11, updated_at = NOW() WHERE id = $12 RETURNING *`,
          [...params, current.id]
        )
      : await client.query(
          `INSERT INTO res_items (title, url, description, category_id, icon, target, visibility, active, kind, module, i18n, created_by, sort)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, (SELECT COALESCE(MAX(sort), 0) + 1 FROM res_items)) RETURNING *`,
          [...params, ctx.userId]
        );
    if (Array.isArray(input.access) || v.visibility !== 'custom') {
      // Only "view" makes sense here; the admin decides who sees the tile.
      const entries = v.visibility === 'custom' ? input.access.map((entry) => ({ ...entry, level: 'view' })) : [];
      await writeAcl(client, 'res_item_acl', rows[0].id, entries, null);
    }
    return rows[0];
  });
  // Files of a replaced uploaded icon go away.
  const kept = new Set(iconFiles(v.icon));
  await removeIconFiles(iconFiles(current.icon).filter((name) => !kept.has(name)));
  return { ...itemShape(saved), access: saved.visibility === 'custom' ? await readAcl('res_item_acl', saved.id) : [] };
}

export async function deleteItem(id) {
  const { rows } = await query(`DELETE FROM res_items WHERE id = $1 RETURNING icon`, [intId(id)]);
  if (!rows[0]) throw httpError(404, 'Resource not found', 'NOT_FOUND');
  await removeIconFiles(iconFiles(rows[0].icon));
}

export async function reorder(table, ids = []) {
  const list = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 1000);
  await withTransaction(async (client) => {
    for (const [index, id] of list.entries()) {
      await client.query(`UPDATE ${table} SET sort = $1 WHERE id = $2`, [index + 1, id]);
    }
  });
}

export async function saveCategory(input = {}, id = null) {
  const i18n = {};
  for (const lang of LANGS) {
    const value = clean(input.i18n?.[lang] ?? '', 80);
    if (value) i18n[lang] = value;
  }
  const name = clean(input.name, 80) || Object.values(i18n)[0];
  if (!name) throw httpError(400, 'Enter a name', 'NAME_REQUIRED');
  const color = HEX.test(input.color || '') ? input.color.toUpperCase() : '#6366F1';
  const { rows } = id
    ? await query(`UPDATE res_categories SET name = $1, color = $2, i18n = $3 WHERE id = $4 RETURNING *`, [name, color, JSON.stringify(i18n), intId(id)])
    : await query(
        `INSERT INTO res_categories (name, color, i18n, sort) VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort), 0) + 1 FROM res_categories)) RETURNING *`,
        [name, color, JSON.stringify(i18n)]
      );
  if (!rows[0]) throw httpError(404, 'Category not found', 'NOT_FOUND');
  return categoryShape(rows[0]);
}

export async function deleteCategory(id) {
  const { rowCount } = await query(`DELETE FROM res_categories WHERE id = $1`, [intId(id)]);
  if (!rowCount) throw httpError(404, 'Category not found', 'NOT_FOUND');
}
