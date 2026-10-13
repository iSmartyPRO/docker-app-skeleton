import { randomBytes } from 'crypto';

/*
 * Incidents: every request gets an id (X-Request-Id), the browser sends its tab
 * session id (X-Client-Session). Server errors (5xx) and crashes reported by
 * browsers are kept here with both ids, so a person can send "code, request,
 * session" from the error screen and an administrator finds what happened.
 *
 * Kept in memory on purpose: incidents matter most when the database is the
 * thing that failed. The same lines also go to the container log.
 */

const MAX = 500;
const items = [];

const SESSION = /^S-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function newRequestId() {
  return `R-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/** Express middleware: request id and client session id on req, id in the response header. */
export function requestIds(req, res, next) {
  req.requestId = newRequestId();
  const session = String(req.get('x-client-session') || '').toUpperCase();
  req.clientSession = SESSION.test(session) ? session : null;
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

/** Database outages look like these; they become 503 DB_UNAVAILABLE. */
export function isDatabaseDown(err) {
  const text = `${err?.code || ''} ${err?.message || ''} ${err?.cause?.message || ''}`;
  return /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|57P01|57P03|53300|28P01|3D000|Connection terminated|connection timeout|Database is not connected|the database system is (starting|shutting) up/i.test(text);
}

export function recordIncident(incident) {
  const entry = {
    id: incident.requestId || newRequestId(),
    at: new Date().toISOString(),
    kind: incident.kind || 'server',
    code: String(incident.code || 'SERVER_ERROR').slice(0, 60),
    status: incident.status || null,
    message: String(incident.message || '').slice(0, 500),
    method: incident.method || null,
    path: incident.path ? String(incident.path).slice(0, 300) : null,
    session: incident.session || null,
    userId: incident.userId || null,
    build: incident.build ? String(incident.build).slice(0, 40) : null,
    stack: incident.stack ? String(incident.stack).split('\n').slice(0, 8).join('\n').slice(0, 2000) : null,
    agent: incident.agent ? String(incident.agent).slice(0, 200) : null,
  };
  items.push(entry);
  if (items.length > MAX) items.splice(0, items.length - MAX);
  console.error(`[incident ${entry.code}] request=${entry.id} session=${entry.session || '-'} user=${entry.userId || '-'} ${entry.method || ''} ${entry.path || ''} — ${entry.message}`);
  return entry;
}

/** Newest first; `q` matches a request id, session id, code, path or message. */
export function listIncidents({ q = '', limit = 100 } = {}) {
  const needle = String(q || '').trim().toUpperCase();
  const list = needle
    ? items.filter((item) => [item.id, item.session, item.code, item.path, item.message].some((value) => value && String(value).toUpperCase().includes(needle)))
    : items;
  return list.slice(-Math.min(Math.max(1, Number(limit) || 100), MAX)).reverse();
}

export function incidentFromRequest(req, status, code, err) {
  return recordIncident({
    requestId: req.requestId,
    session: req.clientSession,
    userId: req.user?.id,
    method: req.method,
    path: req.originalUrl,
    status,
    code,
    message: err?.message || code,
    stack: err?.stack,
    agent: req.get('user-agent'),
  });
}
