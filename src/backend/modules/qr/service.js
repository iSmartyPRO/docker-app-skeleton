import { randomBytes } from 'crypto';
import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { contextFromRequest, httpError, intId } from '../shared/acl.js';
import { TYPES, cleanContent, targetUrl } from './content.js';
import { DEFAULT_DESIGN, applyLocks, cleanDesign, cleanLocks } from './design.js';
import { insertPresets } from './schema.js';

/*
 * QR codes: templates (administrators, permission qr.admin) and each
 * person's own codes. Codes are private to their owner.
 */

const LANGS = ['ru', 'en', 'ky', 'tr', 'zh'];
const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function qrContext(req) {
  return contextFromRequest(req, 'qr.admin');
}

export function requireAdmin(ctx) {
  if (!ctx.isAdmin) throw httpError(403, 'You do not have permission for this action', 'FORBIDDEN');
}

export async function qrSettings() {
  const parsed = parseSettings(await getSettings());
  return parsed.modules.qr?.settings || {};
}

const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

function cleanI18n(input = {}) {
  const out = {};
  for (const lang of LANGS) {
    const entry = input?.[lang];
    if (!entry) continue;
    const name = text(entry.name, 80);
    const description = text(entry.description, 300);
    if (name || description) out[lang] = { name, description };
  }
  return out;
}

function templateShape(row) {
  return {
    id: row.id,
    presetKey: row.preset_key,
    name: row.name,
    description: row.description,
    i18n: row.i18n || {},
    design: cleanDesign(row.design),
    locks: cleanLocks(row.locks),
    isDefault: row.is_default,
    active: row.active,
    sort: row.sort,
    updatedAt: row.updated_at,
  };
}

function codeShape(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    content: row.content || {},
    templateId: row.template_id,
    design: cleanDesign(row.design),
    dynamic: row.dynamic,
    slug: row.slug,
    active: row.active,
    scans: row.scans,
    lastScanAt: row.last_scan_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ── Templates ─────────────────────────────────────────────────────────── */

export async function listTemplates({ all = false } = {}) {
  const { rows } = await query(
    `SELECT * FROM qr_templates ${all ? '' : 'WHERE active'} ORDER BY sort, id`
  );
  return rows.map(templateShape);
}

async function templateById(id) {
  const { rows } = await query(`SELECT * FROM qr_templates WHERE id = $1`, [id]);
  return rows[0] ? templateShape(rows[0]) : null;
}

export async function saveTemplate(ctx, input = {}, id = null) {
  const current = id ? await templateById(intId(id)) : null;
  if (id && !current) throw httpError(404, 'Template not found', 'NOT_FOUND');
  const name = text(input.name ?? current?.name, 80);
  if (!name) throw httpError(400, 'Name is required', 'NAME_REQUIRED');
  const values = [
    name,
    text(input.description ?? current?.description, 300),
    cleanI18n(input.i18n ?? current?.i18n),
    cleanDesign(input.design ?? current?.design),
    cleanLocks(input.locks ?? current?.locks),
    input.active === undefined ? current?.active ?? true : Boolean(input.active),
  ];
  let row;
  if (current) {
    ({ rows: [row] } = await query(
      `UPDATE qr_templates SET name = $1, description = $2, i18n = $3, design = $4, locks = $5, active = $6, updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [...values, current.id]
    ));
  } else {
    ({ rows: [row] } = await query(
      `INSERT INTO qr_templates (name, description, i18n, design, locks, active, sort, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort), -1) + 1 FROM qr_templates), $7) RETURNING *`,
      [...values, ctx.userId]
    ));
  }
  // The default template stays visible.
  if (row.is_default && !row.active) await query(`UPDATE qr_templates SET active = TRUE WHERE id = $1`, [row.id]);
  return templateById(row.id);
}

export async function deleteTemplate(id) {
  const { rows } = await query(`DELETE FROM qr_templates WHERE id = $1 RETURNING is_default`, [intId(id)]);
  if (!rows[0]) throw httpError(404, 'Template not found', 'NOT_FOUND');
  if (rows[0].is_default) {
    await query(`UPDATE qr_templates SET is_default = TRUE WHERE id = (SELECT id FROM qr_templates WHERE active ORDER BY sort, id LIMIT 1)`);
  }
}

export async function setDefaultTemplate(id) {
  const template = await templateById(intId(id));
  if (!template) throw httpError(404, 'Template not found', 'NOT_FOUND');
  await query(`UPDATE qr_templates SET is_default = (id = $1), active = (active OR id = $1)`, [template.id]);
}

export async function reorderTemplates(ids = []) {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger).slice(0, 500);
  for (const [index, id] of list.entries()) await query(`UPDATE qr_templates SET sort = $1 WHERE id = $2`, [index, id]);
}

export async function restorePresets() {
  return { added: await insertPresets() };
}

/* ── Codes ─────────────────────────────────────────────────────────────── */

async function uniqueSlug() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bytes = randomBytes(7);
    const slug = Array.from(bytes, (byte) => SLUG_ALPHABET[byte % SLUG_ALPHABET.length]).join('');
    const { rows } = await query(`SELECT 1 FROM qr_codes WHERE slug = $1`, [slug]);
    if (!rows.length) return slug;
  }
  throw httpError(500, 'Could not make a short link', 'SLUG_FAILED');
}

async function ownCode(ctx, id) {
  const { rows } = await query(`SELECT * FROM qr_codes WHERE id = $1 AND owner_id = $2`, [intId(id), ctx.userId]);
  if (!rows[0]) throw httpError(404, 'QR code not found', 'NOT_FOUND');
  return rows[0];
}

export async function listCodes(ctx) {
  const { rows } = await query(`SELECT * FROM qr_codes WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 2000`, [ctx.userId]);
  return rows.map(codeShape);
}

export async function getCode(ctx, id) {
  return codeShape(await ownCode(ctx, id));
}

/**
 * Creates or updates a code. The design is cleaned, then the template's locked
 * groups are put back (all of them when the module allows only templates; the
 * module administrator is free).
 */
export async function saveCode(ctx, input = {}, id = null) {
  const current = id ? await ownCode(ctx, id) : null;
  const settings = await qrSettings();
  if (!current) {
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM qr_codes WHERE owner_id = $1`, [ctx.userId]);
    if (rows[0].n >= (settings.maxCodes || 500)) throw httpError(409, 'Too many QR codes', 'QR_LIMIT');
  }
  const type = input.type ?? current?.type;
  if (!TYPES[type]) throw httpError(400, 'Unknown QR code type', 'QR_TYPE');
  const content = cleanContent(type, input.content ?? (current?.type === type ? current.content : {}));
  const name = text(input.name ?? current?.name, 120) || text(type, 120);

  let templateId = input.templateId === undefined ? current?.template_id ?? null : input.templateId == null ? null : intId(input.templateId);
  const template = templateId ? await templateById(templateId) : null;
  if (templateId && !template) templateId = null;
  let design = cleanDesign(input.design ?? current?.design ?? template?.design ?? DEFAULT_DESIGN);
  if (!ctx.isAdmin) {
    if (template) design = applyLocks(design, template.design, template.locks, settings.allowCustom === false);
    else if (settings.allowCustom === false) throw httpError(400, 'Pick a template', 'TEMPLATE_REQUIRED');
    if (settings.allowUploads === false && design.logo.source === 'upload' && design.logo.file !== template?.design.logo.file) {
      design.logo = { ...design.logo, source: 'none', file: null };
    }
  }

  const wantsDynamic = (input.dynamic ?? current?.dynamic ?? false) && type === 'url';
  if (wantsDynamic && settings.dynamic === false && !current?.dynamic) throw httpError(400, 'Dynamic codes are switched off', 'DYNAMIC_OFF');
  if (wantsDynamic && !targetUrl(content)) throw httpError(400, 'A dynamic code needs an http(s) address', 'QR_URL');
  const slug = current?.slug || (wantsDynamic ? await uniqueSlug() : null);
  const active = input.active === undefined ? current?.active ?? true : Boolean(input.active);

  const values = [name, type, content, templateId, design, wantsDynamic, slug, active];
  let row;
  if (current) {
    ({ rows: [row] } = await query(
      `UPDATE qr_codes SET name = $1, type = $2, content = $3, template_id = $4, design = $5, dynamic = $6, slug = $7, active = $8, updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [...values, current.id]
    ));
  } else {
    ({ rows: [row] } = await query(
      `INSERT INTO qr_codes (name, type, content, template_id, design, dynamic, slug, active, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [...values, ctx.userId]
    ));
  }
  return codeShape(row);
}

export async function deleteCode(ctx, id) {
  const row = await ownCode(ctx, id);
  await query(`DELETE FROM qr_codes WHERE id = $1`, [row.id]);
}

/** Scans of the last `days` days (oldest first, zeros included) and the totals. */
export async function codeStats(ctx, id, days = 30) {
  const row = await ownCode(ctx, id);
  const span = Math.min(365, Math.max(7, Number(days) || 30));
  const { rows } = await query(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COALESCE(s.count, 0)::int AS count
       FROM generate_series(CURRENT_DATE - ($2::int - 1), CURRENT_DATE, INTERVAL '1 day') AS d(day)
       LEFT JOIN qr_scan_days s ON s.code_id = $1 AND s.day = d.day::date
      ORDER BY d.day`,
    [row.id, span]
  );
  return { total: row.scans, lastScanAt: row.last_scan_at, days: rows };
}

/* ── Dynamic redirect ──────────────────────────────────────────────────── */

/** Counts a scan and answers the target, or { status } when there is none. */
export async function resolveSlug(slug, { count = true } = {}) {
  if (!/^[A-Za-z0-9]{4,16}$/.test(String(slug || ''))) return { status: 404 };
  const { rows } = await query(`SELECT id, type, content, dynamic, active FROM qr_codes WHERE slug = $1`, [slug]);
  const row = rows[0];
  if (!row || !row.dynamic) return { status: 404 };
  if (!row.active) return { status: 410 };
  const target = targetUrl(row.content);
  if (!target) return { status: 404 };
  if (count) {
    await query(`UPDATE qr_codes SET scans = scans + 1, last_scan_at = NOW() WHERE id = $1`, [row.id]);
    await query(
      `INSERT INTO qr_scan_days (code_id, day, count) VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (code_id, day) DO UPDATE SET count = qr_scan_days.count + 1`,
      [row.id]
    );
  }
  return { status: 302, target };
}

/* ── Bootstrap ─────────────────────────────────────────────────────────── */

export async function bootstrap(ctx) {
  const settings = await qrSettings();
  return {
    templates: await listTemplates({ all: ctx.isAdmin }),
    settings: {
      allowCustom: settings.allowCustom !== false,
      allowUploads: settings.allowUploads !== false,
      dynamic: settings.dynamic !== false,
      maxCodes: settings.maxCodes || 500,
    },
    canManage: ctx.isAdmin,
  };
}
