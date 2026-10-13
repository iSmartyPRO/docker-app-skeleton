import { query } from '../../config/database.js';
import { avatarOf, httpError } from '../shared/acl.js';

/*
 * Small helpers of the Masterplan module: parameter binder, value parsers,
 * the history writer and user shapes.
 */

/** Collects query parameters: `p.add(value)` → "$n". */
export class Params {
  constructor(values = []) {
    this.values = [...values];
  }

  add(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

export const money = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

/** "1 500,50" → 1500.5; null for empty; NaN (invalid) for anything else. */
export function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const text = String(value).replace(/[\s ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return NaN;
  return Number(text);
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' (a calendar day), null for empty; throws 400 for anything else. */
export function parseDay(value, field = 'date') {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).slice(0, 10);
  if (!DATE_RE.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) throw httpError(400, `Invalid date: ${field}`, 'INVALID_DATE');
  return text;
}

/** A DATE column as 'YYYY-MM-DD' (pg returns Date objects at local midnight). */
export function dayString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const iso = (value) => (value ? new Date(value).toISOString() : null);

export const intOr = (value, fallback = null) => {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
};

export const idList = (value, max = 1000) =>
  [...new Set((Array.isArray(value) ? value : String(value ?? '').split(',')).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, max);

export const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

export const likePattern = (value) => `%${String(value).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/** CSV cell for spreadsheets: quotes, and a guard against formulas. */
export const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  let out = typeof value === 'number' ? String(value).replace('.', ',') : String(value);
  if (/^[=+\-@\t\r]/.test(out) && typeof value !== 'number') out = `'${out}`;
  return /[;"\n\r]/.test(out) ? `"${out.replace(/"/g, '""')}"` : out;
};

export const userOf = (row, prefix = '') => {
  const id = row?.[`${prefix}id`];
  if (!id) return null;
  return { id, name: row[`${prefix}name`] || row[`${prefix}username`], username: row[`${prefix}username`], avatarUrl: avatarOf(row[`${prefix}avatar`]) };
};

export async function usersById(ids) {
  const list = [...new Set(ids.filter(Boolean).map(Number))];
  if (!list.length) return new Map();
  const { rows } = await query(`SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users WHERE id = ANY($1)`, [list]);
  return new Map(rows.map((row) => [row.id, { id: row.id, username: row.username, name: row.name, avatarUrl: avatarOf(row.avatar_path) }]));
}

export async function userName(id) {
  if (!id) return '';
  const { rows } = await query(`SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1`, [id]);
  return rows[0]?.name || '';
}

/** A row of the history (audit trail). `client` keeps it inside the caller's transaction. */
export async function logEvent(client, { projectId, nodeId = null, kind, data = {}, authorId = null }) {
  await (client || { query }).query(`INSERT INTO mp_events (project_id, node_id, kind, data, author_id) VALUES ($1, $2, $3, $4, $5)`, [projectId, nodeId, kind, JSON.stringify(data), authorId]);
}
