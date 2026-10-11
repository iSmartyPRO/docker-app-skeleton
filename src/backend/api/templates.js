import { query } from '../config/database.js';
import { contextFromRequest, levelMap } from '../modules/shared/acl.js';
import { AREAS, RESOURCE_KINDS, cleanRules, cleanScopes } from './scopes.js';
import { httpError } from './tokens.js';

/* Access templates: reusable sets of scopes and rules. */

const HEX = /^#[0-9a-f]{6}$/i;
const ICONS = ['key', 'eye', 'user', 'tasks', 'calendar', 'chat', 'people', 'chart', 'bolt', 'shield', 'cloud', 'robot', 'rocket', 'folder', 'database', 'building'];

function templateShape(row) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description || '',
    color: row.color,
    icon: row.icon,
    scopes: cleanScopes(row.scopes || {}),
    rules: cleanRules(row.rules || []),
    system: row.is_system,
    tokens: Number(row.tokens || 0),
    updatedAt: row.updated_at,
  };
}

export async function listTemplates() {
  const { rows } = await query(
    `SELECT t.*, (SELECT COUNT(*) FROM api_tokens k WHERE k.template_id = t.id AND k.revoked_at IS NULL) AS tokens
     FROM api_templates t ORDER BY t.is_system DESC, t.sort, LOWER(COALESCE(t.name, t.key))`
  );
  return rows.map(templateShape);
}

function cleanTemplate(input, current) {
  const out = {};
  if (input.name !== undefined || !current) {
    out.name = String(input.name ?? '').trim().slice(0, 120);
    if (!out.name) throw httpError(400, 'Name the template', 'NAME_REQUIRED');
  }
  if (input.description !== undefined) out.description = String(input.description || '').trim().slice(0, 1000) || null;
  if (input.color !== undefined) out.color = HEX.test(input.color) ? input.color : '#6366F1';
  if (input.icon !== undefined) out.icon = ICONS.includes(input.icon) ? input.icon : 'key';
  if (input.scopes !== undefined || !current) out.scopes = JSON.stringify(cleanScopes(input.scopes || {}));
  if (input.rules !== undefined) out.rules = JSON.stringify(cleanRules(input.rules));
  return out;
}

export async function createTemplate(actor, input = {}) {
  const fields = cleanTemplate(input, null);
  const columns = ['created_by', ...Object.keys(fields)];
  const { rows } = await query(
    `INSERT INTO api_templates (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    [actor.id, ...Object.values(fields)]
  );
  return (await listTemplates()).find((template) => template.id === rows[0].id);
}

export async function updateTemplate(id, input = {}) {
  const { rows } = await query(`SELECT * FROM api_templates WHERE id = $1`, [Number(id)]);
  if (!rows[0]) throw httpError(404, 'Template not found', 'NOT_FOUND');
  if (rows[0].is_system) throw httpError(400, 'Built-in templates cannot be changed; duplicate one instead', 'SYSTEM_TEMPLATE');
  const fields = cleanTemplate(input, rows[0]);
  const keys = Object.keys(fields);
  if (keys.length) {
    await query(`UPDATE api_templates SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`, [rows[0].id, ...Object.values(fields)]);
  }
  return (await listTemplates()).find((template) => template.id === rows[0].id);
}

export async function deleteTemplate(id) {
  const { rows } = await query(`SELECT is_system FROM api_templates WHERE id = $1`, [Number(id)]);
  if (!rows[0]) throw httpError(404, 'Template not found', 'NOT_FOUND');
  if (rows[0].is_system) throw httpError(400, 'Built-in templates cannot be deleted', 'SYSTEM_TEMPLATE');
  const { rows: used } = await query(`SELECT COUNT(*)::int AS n FROM api_tokens WHERE template_id = $1 AND revoked_at IS NULL`, [Number(id)]);
  if (used[0].n) throw httpError(400, 'Active tokens use this template', 'TEMPLATE_IN_USE', { tokens: used[0].n });
  await query(`DELETE FROM api_templates WHERE id = $1`, [Number(id)]);
}

/** Areas with module state, for the scope editor. */
export function areaList(modules) {
  return AREAS.map((area) => ({ ...area, enabled: area.module ? Boolean(modules?.[area.module]?.enabled) : true }));
}

/**
 * Resources a token can be narrowed to, as the person sees them
 * (an administrator sees all).
 */
export async function resourceOptions(req, { all = false } = {}) {
  const out = {};
  for (const kind of RESOURCE_KINDS) {
    const ctx = contextFromRequest({ ...req, apiLimits: null }, `${kind.module}.admin`);
    const levels = await levelMap(kind.table, ctx);
    let rows = [];
    if (kind.key === 'tasks.projects') {
      ({ rows } = await query(`SELECT id, name, key AS code, color, is_personal FROM task_projects WHERE archived_at IS NULL ORDER BY is_personal DESC, LOWER(name)`).catch(() => ({ rows: [] })));
      rows = rows.filter((row) => all || row.is_personal || levels.of(row.id) > 0);
    } else if (kind.key === 'calendar.calendars') {
      ({ rows } = await query(
        `SELECT c.id, c.name, c.color, c.is_personal, COALESCE(u.display_name, u.username) AS owner FROM cal_calendars c LEFT JOIN users u ON u.id = c.owner_id ORDER BY c.is_personal, LOWER(c.name)`
      ).catch(() => ({ rows: [] })));
      rows = rows.filter((row) => all || levels.of(row.id) > 0);
    } else if (kind.key === 'files.spaces') {
      ({ rows } = await query(`SELECT id, name, color FROM fs_spaces ORDER BY LOWER(name)`).catch(() => ({ rows: [] })));
      rows = rows.filter((row) => all || levels.of(row.id) > 0);
    }
    out[kind.key] = rows.map((row) => ({ id: row.id, name: row.name, code: row.code || null, color: row.color || null, personal: Boolean(row.is_personal), owner: row.owner || null }));
  }
  return out;
}
