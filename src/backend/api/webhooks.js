import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { query } from '../config/database.js';
import { seal, unseal } from '../services/crypto.js';
import { apiConfig } from './config.js';
import { cleanEvents, eventMatches, requestAs, setEventSink } from './events.js';
import { cleanLimits } from './scopes.js';
import { httpError } from './tokens.js';

/*
 * Outgoing webhooks.
 *
 * Each event a webhook subscribes to becomes a delivery: a POST of
 *   { id, type, createdAt, data }
 * with the headers
 *   X-Portal-Event, X-Portal-Delivery, X-Portal-Signature: t=<unix>,v1=<hex>
 * where v1 = HMAC-SHA256(secret, "<t>.<raw body>"). A 2xx answer within 10 s
 * is a success; otherwise the delivery is retried after 1 min, 5 min, 30 min,
 * 2 h and 6 h. Twenty failed deliveries in a row switch the webhook off.
 *
 * A webhook runs as a person: it only receives events about things that
 * person may see, optionally narrowed to some projects, calendars or spaces.
 */

const RETRY_MINUTES = [1, 5, 30, 120, 360];
const MAX_STREAK = 20;
const TIMEOUT_MS = 10_000;

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

function newSecret() {
  return `whsec_${crypto.randomBytes(24).toString('base64url')}`;
}

export function signature(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

// ── Address safety ──────────────────────────────────────────────────────────

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

async function checkUrl(raw, { allowPrivate }) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw httpError(400, 'Enter a full URL, e.g. https://example.com/hook', 'URL_INVALID');
  }
  if (!['https:', 'http:'].includes(url.protocol)) throw httpError(400, 'Only http and https addresses are allowed', 'URL_INVALID');
  if (url.username || url.password) throw httpError(400, 'Put credentials in the signature, not in the URL', 'URL_INVALID');
  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address);
    if (!addresses.length) throw httpError(400, 'The host name does not resolve', 'URL_UNRESOLVED');
    if (addresses.some(isPrivateAddress)) throw httpError(400, 'Addresses in private networks are not allowed (see API settings)', 'URL_PRIVATE');
  }
  return url.toString();
}

// ── Webhooks ────────────────────────────────────────────────────────────────

function hookShape(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    url: row.url,
    events: row.events || [],
    active: row.active,
    disabledReason: row.disabled_reason,
    failureStreak: row.failure_streak,
    lastStatus: row.last_status,
    lastDeliveryAt: row.last_delivery_at,
    user: row.user_id ? { id: row.user_id, name: row.user_name } : null,
    limits: row.limits || {},
    createdAt: row.created_at,
    stats: row.total !== undefined ? { total: Number(row.total), failed: Number(row.failed), pending: Number(row.pending) } : undefined,
  };
}

const HOOK_SELECT = `
  SELECT h.*, COALESCE(u.display_name, u.username) AS user_name,
    (SELECT COUNT(*) FROM api_deliveries d WHERE d.webhook_id = h.id AND d.created_at > NOW() - INTERVAL '7 days') AS total,
    (SELECT COUNT(*) FROM api_deliveries d WHERE d.webhook_id = h.id AND d.status = 'failed' AND d.created_at > NOW() - INTERVAL '7 days') AS failed,
    (SELECT COUNT(*) FROM api_deliveries d WHERE d.webhook_id = h.id AND d.status = 'pending') AS pending
  FROM api_webhooks h LEFT JOIN users u ON u.id = h.user_id`;

export async function listWebhooks() {
  const { rows } = await query(`${HOOK_SELECT} ORDER BY h.created_at DESC`);
  return rows.map(hookShape);
}

export async function getWebhook(id) {
  const { rows } = await query(`${HOOK_SELECT} WHERE h.id = $1`, [Number(id)]);
  if (!rows[0]) throw httpError(404, 'Webhook not found', 'NOT_FOUND');
  return hookShape(rows[0]);
}

async function cleanHook(input, current) {
  const config = await apiConfig();
  const out = {};
  if (input.name !== undefined || !current) {
    out.name = clean(input.name, 120);
    if (!out.name) throw httpError(400, 'Name the webhook', 'NAME_REQUIRED');
  }
  if (input.description !== undefined) out.description = clean(input.description, 1000) || null;
  if (input.url !== undefined || !current) out.url = await checkUrl(input.url, { allowPrivate: config.webhooksPrivate });
  if (input.events !== undefined || !current) {
    out.events = cleanEvents(input.events);
    if (!out.events.length) throw httpError(400, 'Choose at least one event', 'EVENTS_REQUIRED');
  }
  if (input.userId !== undefined) {
    const { rows } = await query(`SELECT id FROM users WHERE id = $1`, [Number(input.userId)]);
    if (!rows[0]) throw httpError(400, 'Unknown user', 'USER_UNKNOWN');
    out.user_id = rows[0].id;
  }
  if (input.limits !== undefined) out.limits = JSON.stringify(cleanLimits(input.limits));
  if (typeof input.active === 'boolean') {
    out.active = input.active;
    if (input.active) {
      out.disabled_reason = null;
      out.failure_streak = 0;
    }
  }
  return out;
}

export async function createWebhook(actor, input = {}) {
  const config = await apiConfig();
  if (!config.webhooks) throw httpError(403, 'Webhooks are turned off', 'WEBHOOKS_OFF');
  const fields = await cleanHook(input, null);
  if (!fields.user_id) fields.user_id = actor.id;
  const secret = newSecret();
  const columns = ['secret', 'created_by', ...Object.keys(fields)];
  const values = [seal(secret), actor.id, ...Object.values(fields)];
  const { rows } = await query(
    `INSERT INTO api_webhooks (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    values
  );
  hooksCache = null;
  return { webhook: await getWebhook(rows[0].id), secret };
}

export async function updateWebhook(id, input = {}) {
  const { rows } = await query(`SELECT * FROM api_webhooks WHERE id = $1`, [Number(id)]);
  if (!rows[0]) throw httpError(404, 'Webhook not found', 'NOT_FOUND');
  const fields = await cleanHook(input, rows[0]);
  const keys = Object.keys(fields);
  if (keys.length) {
    await query(`UPDATE api_webhooks SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`, [rows[0].id, ...Object.values(fields)]);
  }
  hooksCache = null;
  return getWebhook(rows[0].id);
}

export async function rotateWebhookSecret(id) {
  const secret = newSecret();
  const { rowCount } = await query(`UPDATE api_webhooks SET secret = $2, updated_at = NOW() WHERE id = $1`, [Number(id), seal(secret)]);
  if (!rowCount) throw httpError(404, 'Webhook not found', 'NOT_FOUND');
  hooksCache = null;
  return { secret };
}

export async function deleteWebhook(id) {
  await query(`DELETE FROM api_webhooks WHERE id = $1`, [Number(id)]);
  hooksCache = null;
}

// ── Deliveries ──────────────────────────────────────────────────────────────

let hooksCache = null;
async function activeHooks() {
  if (hooksCache && Date.now() - hooksCache.at < 10_000) return hooksCache.rows;
  const { rows } = await query(`SELECT id, events, user_id, limits FROM api_webhooks WHERE active`);
  hooksCache = { at: Date.now(), rows };
  return rows;
}

function envelope(type, data, eventId = crypto.randomUUID()) {
  return { id: eventId, type, createdAt: new Date().toISOString(), data };
}

async function enqueueEvent(type, data, { visible }) {
  const config = await apiConfig();
  if (!config.webhooks || !config.enabled) return;
  const hooks = (await activeHooks()).filter((hook) => eventMatches(hook.events, type));
  if (!hooks.length) return;
  const event = envelope(type, data);
  let queued = 0;
  for (const hook of hooks) {
    if (visible) {
      const req = hook.user_id ? await requestAs(hook.user_id, hook.limits) : null;
      if (!req) continue;
      const ok = await Promise.resolve(visible(req)).catch(() => false);
      if (!ok) continue;
    }
    await query(`INSERT INTO api_deliveries (webhook_id, event_id, event, payload) VALUES ($1, $2, $3, $4)`, [hook.id, event.id, type, JSON.stringify(event)]);
    queued += 1;
  }
  if (queued) setImmediate(() => deliverDue().catch(() => {}));
}
setEventSink(enqueueEvent);

async function send(hook, payload, deliveryId) {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = unseal(hook.secret);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(hook.url, {
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Portal-Webhooks/1.0',
        'X-Portal-Event': payload.type,
        'X-Portal-Delivery': String(deliveryId),
        'X-Portal-Signature': `t=${timestamp},v1=${signature(secret, timestamp, body)}`,
      },
      body,
    });
    const text = (await response.text().catch(() => '')).slice(0, 2000);
    return { ok: response.status >= 200 && response.status < 300, status: response.status, body: text, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, status: null, error: err.name === 'AbortError' ? 'Timed out after 10 s' : err.message, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

let delivering = false;
/** Sends what is due; run by the scheduler and right after an event. */
export async function deliverDue() {
  if (delivering) return;
  delivering = true;
  try {
    for (let round = 0; round < 10; round += 1) {
      const { rows } = await query(
        `UPDATE api_deliveries d SET next_attempt_at = NOW() + INTERVAL '2 minutes'
         WHERE d.id IN (
           SELECT id FROM api_deliveries WHERE status = 'pending' AND next_attempt_at <= NOW()
           ORDER BY next_attempt_at LIMIT 20 FOR UPDATE SKIP LOCKED
         )
         RETURNING d.*`
      );
      if (!rows.length) break;
      await Promise.all(rows.map((row) => attempt(row)));
    }
  } finally {
    delivering = false;
  }
}

async function attempt(delivery) {
  const { rows } = await query(`SELECT * FROM api_webhooks WHERE id = $1`, [delivery.webhook_id]);
  const hook = rows[0];
  if (!hook || !hook.active) {
    await query(`UPDATE api_deliveries SET status = 'failed', error = 'Webhook is off' WHERE id = $1`, [delivery.id]);
    return;
  }
  const config = await apiConfig();
  let result;
  try {
    await checkUrl(hook.url, { allowPrivate: config.webhooksPrivate });
    result = await send(hook, delivery.payload, delivery.id);
  } catch (err) {
    result = { ok: false, status: null, error: err.message, ms: 0 };
  }
  const attempts = delivery.attempts + 1;
  const final = result.ok || attempts > RETRY_MINUTES.length;
  await query(
    `UPDATE api_deliveries SET attempts = $2, status = $3, response_status = $4, response_body = $5, error = $6, duration_ms = $7,
       delivered_at = CASE WHEN $9::boolean THEN NOW() ELSE delivered_at END,
       next_attempt_at = NOW() + make_interval(mins => $8)
     WHERE id = $1`,
    [delivery.id, attempts, result.ok ? 'ok' : final ? 'failed' : 'pending', result.status, result.body ?? null, result.error ?? null, result.ms, RETRY_MINUTES[Math.min(attempts - 1, RETRY_MINUTES.length - 1)], result.ok]
  );
  if (result.ok) {
    await query(`UPDATE api_webhooks SET failure_streak = 0, last_status = 'ok', last_delivery_at = NOW() WHERE id = $1`, [hook.id]);
  } else if (final) {
    const { rows: updated } = await query(
      `UPDATE api_webhooks SET failure_streak = failure_streak + 1, last_status = 'failed', last_delivery_at = NOW() WHERE id = $1 RETURNING failure_streak`,
      [hook.id]
    );
    if (updated[0]?.failure_streak >= MAX_STREAK) {
      await query(`UPDATE api_webhooks SET active = FALSE, disabled_reason = 'failures' WHERE id = $1`, [hook.id]);
      hooksCache = null;
    }
  } else {
    await query(`UPDATE api_webhooks SET last_status = 'retrying', last_delivery_at = NOW() WHERE id = $1`, [hook.id]);
  }
}

/** Sends a `ping` at once and reports the answer. */
export async function pingWebhook(id) {
  const { rows } = await query(`SELECT * FROM api_webhooks WHERE id = $1`, [Number(id)]);
  if (!rows[0]) throw httpError(404, 'Webhook not found', 'NOT_FOUND');
  const config = await apiConfig();
  await checkUrl(rows[0].url, { allowPrivate: config.webhooksPrivate });
  const event = envelope('ping', { message: 'Webhook is set up correctly', webhook: { id: rows[0].id, name: rows[0].name } });
  const { rows: inserted } = await query(
    `INSERT INTO api_deliveries (webhook_id, event_id, event, payload, status, attempts, next_attempt_at) VALUES ($1, $2, 'ping', $3, 'sending', 0, NOW() + INTERVAL '1 day') RETURNING *`,
    [rows[0].id, event.id, JSON.stringify(event)]
  );
  const result = await send(rows[0], event, inserted[0].id);
  await query(
    `UPDATE api_deliveries SET attempts = 1, status = $2, response_status = $3, response_body = $4, error = $5, duration_ms = $6, delivered_at = CASE WHEN $7::boolean THEN NOW() END WHERE id = $1`,
    [inserted[0].id, result.ok ? 'ok' : 'failed', result.status, result.body ?? null, result.error ?? null, result.ms, result.ok]
  );
  return { ok: result.ok, status: result.status, error: result.error || null, ms: result.ms, body: result.body || '' };
}

export async function listDeliveries({ webhookId, status, event, before, limit = 50 } = {}) {
  const params = [];
  const where = [];
  if (webhookId) {
    params.push(Number(webhookId));
    where.push(`d.webhook_id = $${params.length}`);
  }
  if (['ok', 'failed', 'pending'].includes(status)) {
    params.push(status);
    where.push(`d.status = $${params.length}`);
  }
  if (event) {
    params.push(String(event));
    where.push(`d.event = $${params.length}`);
  }
  if (before) {
    params.push(Number(before));
    where.push(`d.id < $${params.length}`);
  }
  const size = Math.min(200, Math.max(1, Number(limit) || 50));
  params.push(size + 1);
  const { rows } = await query(
    `SELECT d.*, h.name AS webhook_name FROM api_deliveries d JOIN api_webhooks h ON h.id = d.webhook_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.id DESC LIMIT $${params.length}`,
    params
  );
  return {
    deliveries: rows.slice(0, size).map((row) => ({
      id: Number(row.id),
      webhook: { id: row.webhook_id, name: row.webhook_name },
      event: row.event,
      eventId: row.event_id,
      status: row.status,
      attempts: row.attempts,
      nextAttemptAt: row.status === 'pending' ? row.next_attempt_at : null,
      responseStatus: row.response_status,
      responseBody: row.response_body,
      error: row.error,
      ms: row.duration_ms,
      payload: row.payload,
      createdAt: row.created_at,
      deliveredAt: row.delivered_at,
    })),
    more: rows.length > size,
  };
}

/** Sends a delivery again as a new attempt chain. */
export async function redeliver(id) {
  const { rows } = await query(
    `UPDATE api_deliveries SET status = 'pending', attempts = 0, next_attempt_at = NOW(), error = NULL WHERE id = $1 RETURNING id`,
    [Number(id)]
  );
  if (!rows[0]) throw httpError(404, 'Delivery not found', 'NOT_FOUND');
  await deliverDue();
  const { deliveries } = await listDeliveries({ before: Number(id) + 1, limit: 1 });
  return deliveries[0];
}

export async function purgeDeliveries() {
  await query(`DELETE FROM api_deliveries WHERE created_at < NOW() - INTERVAL '30 days' AND status <> 'pending'`);
}
