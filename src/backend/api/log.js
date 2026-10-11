import { query } from '../config/database.js';
import { apiConfig } from './config.js';

/* Request log of token calls, and the figures built from it. */

export function logRequest(entry) {
  query(
    `INSERT INTO api_requests (token_id, user_id, method, path, area, status, code, duration_ms, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.tokenId || null,
      entry.userId || null,
      String(entry.method).slice(0, 8),
      String(entry.path).slice(0, 300),
      entry.area || null,
      entry.status,
      entry.code ? String(entry.code).slice(0, 40) : null,
      Math.max(0, Math.round(entry.ms || 0)),
      entry.ip ? String(entry.ip).slice(0, 64) : null,
      entry.userAgent ? String(entry.userAgent).slice(0, 200) : null,
    ]
  ).catch(() => {});
}

export async function purgeLog() {
  const { logRetentionDays } = await apiConfig();
  await query(`DELETE FROM api_requests WHERE created_at < NOW() - make_interval(days => $1)`, [logRetentionDays]);
}

function filtersSql(filters, params) {
  const where = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('$?', `$${params.length}`));
  };
  if (filters.tokenId) add('r.token_id = $?', Number(filters.tokenId));
  if (filters.userId) add('k.user_id = $?', Number(filters.userId));
  if (filters.method) add('r.method = $?', String(filters.method).toUpperCase());
  if (filters.area) add('r.area = $?', String(filters.area));
  if (filters.status === 'ok') where.push('r.status < 400');
  else if (filters.status === 'error') where.push('r.status >= 400');
  else if (/^\d{3}$/.test(filters.status || '')) add('r.status = $?', Number(filters.status));
  if (filters.q) add('r.path ILIKE $?', `%${String(filters.q).slice(0, 100)}%`);
  if (filters.from) add('r.created_at >= $?', new Date(filters.from));
  if (filters.to) add('r.created_at <= $?', new Date(filters.to));
  return where;
}

export async function listRequests(filters = {}) {
  const params = [];
  const where = filtersSql(filters, params);
  const limit = Math.min(500, Math.max(1, Number(filters.limit) || 100));
  if (filters.before) {
    params.push(Number(filters.before));
    where.push(`r.id < $${params.length}`);
  }
  params.push(limit + 1);
  const { rows } = await query(
    `SELECT r.*, k.name AS token_name, k.prefix, COALESCE(u.display_name, u.username) AS user_name
     FROM api_requests r
     LEFT JOIN api_tokens k ON k.id = r.token_id
     LEFT JOIN users u ON u.id = r.user_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY r.id DESC LIMIT $${params.length}`,
    params
  );
  return {
    requests: rows.slice(0, limit).map((row) => ({
      id: Number(row.id),
      at: row.created_at,
      method: row.method,
      path: row.path,
      area: row.area,
      status: row.status,
      code: row.code,
      ms: row.duration_ms,
      ip: row.ip,
      userAgent: row.user_agent,
      token: row.token_id ? { id: row.token_id, name: row.token_name, prefix: row.prefix } : null,
      user: row.user_id ? { id: row.user_id, name: row.user_name } : null,
    })),
    more: rows.length > limit,
  };
}

/** Figures for a period: series, totals, top paths/tokens, statuses. */
export async function requestStats({ tokenId, userId, days = 1 } = {}) {
  const span = Math.min(90, Math.max(1, Number(days) || 1));
  const hourly = span <= 2;
  const params = [span];
  const scope = [];
  if (tokenId) {
    params.push(Number(tokenId));
    scope.push(`r.token_id = $${params.length}`);
  }
  if (userId) {
    params.push(Number(userId));
    scope.push(`r.user_id = $${params.length}`);
  }
  const base = `FROM api_requests r WHERE r.created_at >= NOW() - make_interval(days => $1) ${scope.map((s) => `AND ${s}`).join(' ')}`;
  const unit = hourly ? 'hour' : 'day';
  const [series, totals, paths, tokens, statuses] = await Promise.all([
    query(
      `WITH slots AS (
         SELECT generate_series(date_trunc('${unit}', NOW() - make_interval(days => $1)) + INTERVAL '1 ${unit}', date_trunc('${unit}', NOW()), INTERVAL '1 ${unit}') AS slot
       ), counts AS (
         SELECT date_trunc('${unit}', r.created_at) AS slot, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE r.status >= 400)::int AS errors ${base} GROUP BY 1
       )
       SELECT s.slot, COALESCE(c.total, 0) AS total, COALESCE(c.errors, 0) AS errors FROM slots s LEFT JOIN counts c ON c.slot = s.slot ORDER BY s.slot`,
      params
    ),
    query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE r.status >= 400)::int AS errors,
              COUNT(*) FILTER (WHERE r.status = 429)::int AS limited, COUNT(*) FILTER (WHERE r.status IN (401, 403))::int AS denied,
              COALESCE(ROUND(AVG(r.duration_ms))::int, 0) AS avg_ms,
              COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY r.duration_ms)::int, 0) AS p95_ms,
              COUNT(DISTINCT r.token_id)::int AS tokens ${base}`,
      params
    ),
    query(
      `SELECT r.method, regexp_replace(r.path, '/\\d+(?=/|$)', '/:id', 'g') AS path, COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE r.status >= 400)::int AS errors, ROUND(AVG(r.duration_ms))::int AS avg_ms
       ${base} GROUP BY 1, 2 ORDER BY total DESC LIMIT 8`,
      params
    ),
    query(
      `SELECT r.token_id, k.name, k.prefix, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE r.status >= 400)::int AS errors
       ${base.replace('FROM api_requests r', 'FROM api_requests r LEFT JOIN api_tokens k ON k.id = r.token_id')} GROUP BY 1, 2, 3 ORDER BY total DESC LIMIT 6`,
      params
    ),
    query(`SELECT (r.status / 100)::int AS class, COUNT(*)::int AS total ${base} GROUP BY 1 ORDER BY 1`, params),
  ]);
  const t = totals.rows[0];
  return {
    unit,
    series: series.rows.map((row) => ({ at: row.slot, total: row.total, errors: row.errors })),
    totals: { total: t.total, errors: t.errors, limited: t.limited, denied: t.denied, avgMs: t.avg_ms, p95Ms: t.p95_ms, tokens: t.tokens },
    paths: paths.rows.map((row) => ({ method: row.method, path: row.path, total: row.total, errors: row.errors, avgMs: row.avg_ms })),
    tokens: tokens.rows.map((row) => ({ id: row.token_id, name: row.name, prefix: row.prefix, total: row.total, errors: row.errors })),
    statuses: statuses.rows.map((row) => ({ class: `${row.class}xx`, total: row.total })),
  };
}
