import { query } from '../../config/database.js';
import { isValidTimeZone } from '../../services/datetime.js';
import { recordSecurityEvent } from '../../services/security.js';
import { csvCell } from '../drive/activity.js';
import { NTFS_ACTIONS, withoutBlob } from './ntfsLogic.js';
import { GROUP_ACTIONS, MEMBERSHIP_ACTIONS } from './policy.js';

/*
 * Journal of Folder access changes: one row per object changed (a member in a
 * group, a group created / described / deleted). Who (portal person and the
 * AD account the change was made with), when, from where, before → after,
 * and the result. Membership rows can be undone (policy.undoRefusal).
 *
 * Kinds: 'membership' (system administrators see these) and 'group'
 * (superadministrators only), and 'ntfs' (superadministrators only: permission
 * changes with the previous descriptor in `before.sd` for undo, see ntfs.js).
 */

export async function ensureJournalTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS fa_journal (
      id BIGSERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      batch VARCHAR(40),
      kind VARCHAR(16) NOT NULL,
      action VARCHAR(32) NOT NULL,
      via VARCHAR(16) NOT NULL DEFAULT 'single',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name VARCHAR(255),
      user_login VARCHAR(255),
      ad_account VARCHAR(255),
      ip VARCHAR(64),
      user_agent VARCHAR(300),
      group_dn TEXT,
      group_name VARCHAR(255),
      to_group_dn TEXT,
      to_group_name VARCHAR(255),
      member_dn TEXT,
      member_name VARCHAR(255),
      member_login VARCHAR(255),
      before JSONB,
      after JSONB,
      ok BOOLEAN NOT NULL,
      outcome VARCHAR(16) NOT NULL,
      error_code VARCHAR(40),
      error TEXT,
      undo_of BIGINT REFERENCES fa_journal(id) ON DELETE SET NULL,
      undone_by BIGINT REFERENCES fa_journal(id) ON DELETE SET NULL
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS fa_journal_at_idx ON fa_journal (at DESC, id DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS fa_journal_user_idx ON fa_journal (user_id, at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS fa_journal_member_idx ON fa_journal (LOWER(member_dn))`);
}

export const kindOf = (action) => (MEMBERSHIP_ACTIONS.includes(action) ? 'membership' : GROUP_ACTIONS.includes(action) ? 'group' : 'ntfs');

const clip = (value, max) => (value == null ? null : String(value).slice(0, max));

/** Who acts: from the request, plus the AD account the change runs as. */
export function actorOf(req, adAccount) {
  return {
    userId: req.user?.id || null,
    name: req.user?.displayName || req.user?.username || null,
    login: req.user?.username || null,
    adAccount: adAccount || null,
    ip: req.ip || null,
    userAgent: req.get?.('user-agent') || null,
  };
}

/**
 * Records one change. `entry`: { action, via, batch, group: {dn,name}, toGroup, member: {dn,name,login},
 * before, after, ok, outcome ('changed' | 'unchanged' | 'failed' | 'rolled_back'), errorCode, error, undoOf }.
 */
export async function recordChange(actor, entry) {
  const { rows } = await query(
    `INSERT INTO fa_journal (batch, kind, action, via, user_id, user_name, user_login, ad_account, ip, user_agent,
       group_dn, group_name, to_group_dn, to_group_name, member_dn, member_name, member_login, before, after, ok, outcome, error_code, error, undo_of)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
     RETURNING id`,
    [
      clip(entry.batch, 40),
      kindOf(entry.action),
      entry.action,
      clip(entry.via || 'single', 16),
      actor.userId,
      clip(actor.name, 255),
      clip(actor.login, 255),
      clip(actor.adAccount, 255),
      clip(actor.ip, 64),
      clip(actor.userAgent, 300),
      clip(entry.group?.dn, 2000),
      clip(entry.group?.name, 255),
      clip(entry.toGroup?.dn, 2000),
      clip(entry.toGroup?.name, 255),
      clip(entry.member?.dn, 2000),
      clip(entry.member?.name, 255),
      clip(entry.member?.login, 255),
      entry.before == null ? null : JSON.stringify(entry.before),
      entry.after == null ? null : JSON.stringify(entry.after),
      entry.ok !== false,
      entry.outcome || (entry.ok === false ? 'failed' : 'changed'),
      clip(entry.errorCode, 40),
      clip(entry.error, 500),
      entry.undoOf || null,
    ]
  );
  if (entry.undoOf && entry.ok !== false) {
    await query(`UPDATE fa_journal SET undone_by = $2 WHERE id = $1 AND undone_by IS NULL`, [entry.undoOf, rows[0].id]);
  }
  return rows[0].id;
}

/** One security event per request that changed AD (the journal has the details). */
export function securityEvent(req, kind, detail, severity = 'info') {
  recordSecurityEvent({ kind, severity, username: req.user?.username, ip: req.ip, detail }).catch(() => {});
}

export async function journalEntry(id) {
  const { rows } = await query(`SELECT * FROM fa_journal WHERE id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Ids of later successful membership changes of the same person in the same group(s) as `entry`:
 * undoing `entry` would also revert those (A adds X, B removes X, C adds X again; undoing A's
 * change would remove X and so revert C's).
 */
export async function laterChanges(entry, run = query) {
  const groups = [entry.group_dn, entry.to_group_dn].filter(Boolean).map((dn) => String(dn).toLowerCase());
  if (!entry.member_dn || !groups.length) return [];
  const { rows } = await run(
    `SELECT id FROM fa_journal
      WHERE id > $1 AND kind = 'membership' AND ok = TRUE AND outcome = 'changed'
        AND LOWER(member_dn) = LOWER($2)
        AND (LOWER(group_dn) = ANY($3) OR LOWER(to_group_dn) = ANY($3))
      ORDER BY id LIMIT 20`,
    [entry.id, entry.member_dn, groups]
  );
  return rows.map((row) => Number(row.id));
}

const ACTIONS = [...MEMBERSHIP_ACTIONS, ...GROUP_ACTIONS, ...NTFS_ACTIONS];
const day = (value) => (/^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? new Date(String(value)) : null);

const escapeLike = (value) => String(value).replace(/[\\%_]/g, '\\$&');
/** Glob ("sg_*_root_*") → ILIKE pattern ("sg\_%\_root\_%"). */
export const globToLike = (pattern) => escapeLike(pattern).replace(/\*/g, '%');

/**
 * WHERE clause for the journal filters. `scope` limits what the viewer may see:
 * null (all), a list of kinds, or policy.journalScope() = { kinds, groupPrefix, hiddenGroups }
 * (rows of groups without the prefix or matching a hidden pattern are left out).
 */
export function journalFilter(input = {}, scope = null) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  const { kinds = null, groupPrefix = null, hiddenGroups = [] } = Array.isArray(scope) || scope == null ? { kinds: scope } : scope;
  if (kinds) add('j.kind = ANY(?)', kinds);
  if (groupPrefix) add('(j.group_name ILIKE ? AND (j.to_group_name IS NULL OR j.to_group_name ILIKE ?))', `${escapeLike(groupPrefix)}%`);
  if (hiddenGroups.length) add('(NOT (j.group_name ILIKE ANY(?)) AND (j.to_group_name IS NULL OR NOT (j.to_group_name ILIKE ANY(?))))', hiddenGroups.map(globToLike));
  const from = day(input.from);
  const to = day(input.to);
  if (from && !Number.isNaN(from.getTime())) add('j.at >= ?', from.toISOString());
  if (to && !Number.isNaN(to.getTime())) add('j.at < ?', to.toISOString());
  const actions = String(input.actions || '')
    .split(',')
    .filter((action) => ACTIONS.includes(action));
  if (actions.length) add('j.action = ANY(?)', actions);
  if (Number(input.user) > 0) add('j.user_id = ?', Number(input.user));
  if (input.mine === '1' && Number(input.viewer) > 0) add('j.user_id = ?', Number(input.viewer));
  if (input.result === 'ok') where.push('j.ok = TRUE');
  if (input.result === 'failed') where.push('j.ok = FALSE');
  const like = (value) => `%${String(value).replace(/[\\%_]/g, '\\$&').slice(0, 100)}%`;
  if (input.group) {
    params.push(like(input.group));
    where.push(`(j.group_name ILIKE $${params.length} OR j.to_group_name ILIKE $${params.length})`);
  }
  if (input.member) {
    params.push(like(input.member));
    where.push(`(j.member_name ILIKE $${params.length} OR j.member_login ILIKE $${params.length} OR j.member_dn ILIKE $${params.length})`);
  }
  if (input.q) {
    params.push(like(input.q));
    const n = params.length;
    where.push(`(j.user_name ILIKE $${n} OR j.user_login ILIKE $${n} OR j.ad_account ILIKE $${n} OR j.group_name ILIKE $${n} OR j.member_name ILIKE $${n} OR j.member_login ILIKE $${n} OR j.ip ILIKE $${n})`);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function rowShape(row) {
  return {
    id: Number(row.id),
    at: row.at,
    batch: row.batch,
    kind: row.kind,
    action: row.action,
    via: row.via,
    user: row.user_id || row.user_name ? { id: row.user_id, name: row.user_name, login: row.user_login } : null,
    adAccount: row.ad_account,
    ip: row.ip,
    group: row.group_dn || row.group_name ? { dn: row.group_dn, name: row.group_name } : null,
    toGroup: row.to_group_dn ? { dn: row.to_group_dn, name: row.to_group_name } : null,
    member: row.member_dn ? { dn: row.member_dn, name: row.member_name, login: row.member_login } : null,
    before: withoutBlob(row.before),
    after: withoutBlob(row.after),
    ok: row.ok,
    outcome: row.outcome,
    errorCode: row.error_code,
    error: row.error,
    undoOf: row.undo_of ? Number(row.undo_of) : null,
    undoneBy: row.undone_by ? Number(row.undone_by) : null,
  };
}

export async function listJournal(input = {}, scope = null) {
  const { sql, params } = journalFilter(input, scope);
  const pageSize = Math.min(200, Math.max(10, Number(input.pageSize) || 50));
  const page = Math.max(1, Number(input.page) || 1);
  const total = Number((await query(`SELECT COUNT(*)::int AS n FROM fa_journal j ${sql}`, params)).rows[0].n);
  const { rows } = await query(`SELECT j.* FROM fa_journal j ${sql} ORDER BY j.at DESC, j.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
  return { items: rows.map(rowShape), total, page, pageSize };
}

/** People who appear in the journal (for the "who" filter). */
export async function journalPeople(scope = null) {
  const { sql, params } = journalFilter({}, scope);
  const { rows } = await query(
    `SELECT j.user_id AS id, MAX(j.user_name) AS name, MAX(j.user_login) AS login FROM fa_journal j ${sql}${sql ? ' AND' : ' WHERE'} j.user_id IS NOT NULL GROUP BY j.user_id ORDER BY MAX(j.user_name) LIMIT 200`,
    params
  );
  return rows;
}

const describe = (value) => (value == null ? '' : JSON.stringify(withoutBlob(value)));

/** CSV (Excel-friendly: BOM and ';'), newest first, up to 100 000 rows. */
export async function exportJournal(res, input = {}, scope = null, fallbackZone = 'UTC') {
  const { sql, params } = journalFilter(input, scope);
  const { rows } = await query(`SELECT j.* FROM fa_journal j ${sql} ORDER BY j.at DESC, j.id DESC LIMIT 100000`, params);
  const zone = isValidTimeZone(input.tz) ? input.tz : isValidTimeZone(fallbackZone) ? fallbackZone : 'UTC';
  const stampOf = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const head = [`time (${zone})`, 'id', 'user', 'login', 'ad_account', 'ip', 'action', 'via', 'group', 'to_group', 'member', 'member_login', 'before', 'after', 'result', 'error_code', 'error', 'undo_of', 'undone_by'];
  const lines = rows.map((row) =>
    [
      stampOf.format(new Date(row.at)),
      Number(row.id),
      row.user_name || '',
      row.user_login || '',
      row.ad_account || '',
      row.ip || '',
      row.action,
      row.via,
      row.group_name || '',
      row.to_group_name || '',
      row.member_name || '',
      row.member_login || '',
      describe(row.before),
      describe(row.after),
      row.outcome,
      row.error_code || '',
      row.error || '',
      row.undo_of || '',
      row.undone_by || '',
    ]
      .map(csvCell)
      .join(';')
  );
  const stamp = stampOf.format(new Date()).slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="folder-access-journal-${stamp}.csv"`);
  res.send(`﻿${[head.join(';'), ...lines].join('\r\n')}\r\n`);
}
