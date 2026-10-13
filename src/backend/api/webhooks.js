import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { query } from '../config/database.js';
import { openSealed, seal } from '../services/crypto.js';
import { onBeforeUserDelete } from '../services/hooks.js';
import { apiConfig } from './config.js';
import { cleanEvents, eventMatches, requestAs, setEventSink } from './events.js';
import { cleanLimits } from './scopes.js';
import { assertMayActFor, httpError } from './tokens.js';

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
 * "Send again" keeps the event id (receivers dedupe on it) and adds
 * X-Portal-Redelivery: 1.
 *
 * A signing secret that cannot be decrypted (the encryption key changed) is
 * not a receiver failure: the webhook is paused with reason
 * `secret_unreadable`, its deliveries stay pending, administrators are told,
 * and rotating the secret (or restoring the old key and resuming) continues.
 *
 * When the person a webhook runs as is deleted, the webhook stays (paused,
 * reason `user_deleted`, no run-as person) instead of cascading away; resuming
 * it without choosing someone runs it as whoever resumes it.
 *
 * A webhook runs as a person: it only receives events about things that
 * person may see, optionally narrowed to some projects, calendars or spaces.
 */

const RETRY_MINUTES = [1, 5, 30, 120, 360];
const MAX_STREAK = 20;
const TIMEOUT_MS = 10_000;
// One attempt (address check, request, bookkeeping) never holds the queue longer than this.
const ATTEMPT_MS = 30_000;
const BODY_MAX = 4000;

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

function newSecret() {
  return `whsec_${crypto.randomBytes(24).toString('base64url')}`;
}

export function signature(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

// ── Address safety ──────────────────────────────────────────────────────────

// Loopback, private, link-local, carrier-grade NAT, benchmark and multicast.
// IPv4 and IPv6 are kept apart: a BlockList matches IPv4 against ::ffff:/96.
const PRIVATE_V4 = new net.BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]]) {
  PRIVATE_V4.addSubnet(address, prefix, 'ipv4');
}
const PRIVATE_V6 = new net.BlockList();
for (const [address, prefix] of [['::', 127], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
  PRIVATE_V6.addSubnet(address, prefix, 'ipv6');
}

/** IPv6 forms that wrap an IPv4 address (::ffff:a.b.c.d, ::ffff:7f00:1, 64:ff9b::…). */
function embeddedV4(ip) {
  const lower = ip.toLowerCase();
  const tail = lower.match(/^(?:::ffff:|64:ff9b::)(.+)$/);
  if (!tail) return null;
  if (net.isIPv4(tail[1])) return tail[1];
  const hex = tail[1].split(':');
  if (hex.length !== 2) return null;
  const [high, low] = hex.map((part) => parseInt(part, 16));
  if (Number.isNaN(high) || Number.isNaN(low)) return null;
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

export function isPrivateAddress(ip) {
  const family = net.isIP(ip);
  if (!family) return true;
  if (family === 4) return PRIVATE_V4.check(ip, 'ipv4');
  const v4 = embeddedV4(ip);
  if (v4) return PRIVATE_V4.check(v4, 'ipv4');
  return PRIVATE_V6.check(ip, 'ipv6');
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

async function cleanHook(input, current, actor) {
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
  // Choosing whom the hook runs as, or where and what it sends while running
  // as someone, is acting for that person: only for people no stronger than the actor.
  const runAs = out.user_id ?? current?.user_id ?? actor.id;
  if (!current || ['user_id', 'url', 'events', 'limits'].some((key) => key in out)) await assertMayActFor(actor, runAs);
  if (typeof input.active === 'boolean') {
    out.active = input.active;
    if (input.active) {
      out.disabled_reason = null;
      out.failure_streak = 0;
      // Its person was deleted: it runs as whoever resumes it, unless someone else was chosen.
      if (current && !current.user_id && !out.user_id) out.user_id = actor.id;
    }
  }
  return out;
}

export async function createWebhook(actor, input = {}) {
  const config = await apiConfig();
  if (!config.webhooks) throw httpError(403, 'Webhooks are turned off', 'WEBHOOKS_OFF');
  const fields = await cleanHook(input, null, actor);
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

export async function updateWebhook(actor, id, input = {}) {
  const { rows } = await query(`SELECT * FROM api_webhooks WHERE id = $1`, [Number(id)]);
  if (!rows[0]) throw httpError(404, 'Webhook not found', 'NOT_FOUND');
  const fields = await cleanHook(input, rows[0], actor);
  const keys = Object.keys(fields);
  if (keys.length) {
    await query(`UPDATE api_webhooks SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`, [rows[0].id, ...Object.values(fields)]);
  }
  hooksCache = null;
  return getWebhook(rows[0].id);
}

export async function rotateWebhookSecret(id) {
  const secret = newSecret();
  // A webhook paused because its old secret became unreadable resumes with the new one.
  const { rowCount } = await query(
    `UPDATE api_webhooks SET secret = $2, updated_at = NOW(),
       active = CASE WHEN disabled_reason = 'secret_unreadable' THEN TRUE ELSE active END,
       disabled_reason = CASE WHEN disabled_reason = 'secret_unreadable' THEN NULL ELSE disabled_reason END
     WHERE id = $1`,
    [Number(id), seal(secret)]
  );
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

/** Forgets the cached list of active webhooks (after changes made elsewhere). */
export function invalidateWebhookCache() {
  hooksCache = null;
}

async function enqueueEvent(type, data, { visible }) {
  const config = await apiConfig();
  if (!config.webhooks || !config.enabled) return;
  const hooks = (await activeHooks()).filter((hook) => eventMatches(hook.events, type));
  if (!hooks.length) return;
  const event = envelope(type, data);
  let queued = 0;
  for (const hook of hooks) {
    // One webhook (e.g. deleted since the list was cached) never stops the others.
    try {
      if (visible) {
        const req = hook.user_id ? await requestAs(hook.user_id, hook.limits) : null;
        if (!req) continue;
        const ok = await Promise.resolve(visible(req)).catch(() => false);
        if (!ok) continue;
      }
      await query(`INSERT INTO api_deliveries (webhook_id, event_id, event, payload) VALUES ($1, $2, $3, $4)`, [hook.id, event.id, type, JSON.stringify(event)]);
      queued += 1;
    } catch (err) {
      if (err.code === '23503') hooksCache = null;
      else console.warn(`Webhook ${hook.id}: event ${type} not queued:`, err.message);
    }
  }
  if (queued) setImmediate(() => deliverDue().catch(() => {}));
}
setEventSink(enqueueEvent);

/**
 * A `lookup` for http(s).request that refuses private addresses at connect
 * time (no DNS rebinding between the check and the request). Every address
 * of the name is checked; with `options.all` (Node's happy eyeballs asks for
 * that) the whole list is handed back, otherwise the first one.
 */
export function guardedLookup({ allowPrivate }) {
  return (hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    } else if (typeof options === 'number') options = { family: options };
    const opts = options || {};
    dnsLookup(hostname, { ...opts, all: true }, (err, addresses) => {
      if (err) return callback(err);
      if (!addresses?.length) {
        const error = new Error(`The host name ${hostname} does not resolve`);
        error.code = 'ENOTFOUND';
        return callback(error);
      }
      if (!allowPrivate && addresses.some((entry) => isPrivateAddress(entry.address))) {
        return callback(new Error('The address resolves to a private network'));
      }
      if (opts.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

/**
 * POSTs `body`; → { status, text }. The whole exchange has a hard deadline
 * (a receiver trickling bytes cannot hold it open), and at most BODY_MAX
 * characters of the answer are read.
 */
export function post(url, headers, body, { allowPrivate, timeoutMs = TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    let done = false;
    let deadline = null;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      fn(value);
    };
    const request = lib.request(
      target,
      { method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }, lookup: guardedLookup({ allowPrivate }), timeout: timeoutMs },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        const answer = () => finish(resolve, { status: response.statusCode, text: text.slice(0, 2000) });
        response.on('data', (chunk) => {
          text += chunk;
          if (text.length >= BODY_MAX) {
            // Enough to show; stop reading the rest.
            answer();
            request.destroy();
          }
        });
        response.on('end', answer);
        response.on('error', (err) => finish(reject, err));
        response.on('close', () => finish(reject, new Error('The connection closed before the answer ended')));
      }
    );
    deadline = setTimeout(() => request.destroy(new Error(`Timed out after ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
    deadline.unref?.();
    request.on('timeout', () => request.destroy(new Error(`Timed out after ${Math.round(timeoutMs / 1000)} s`)));
    request.on('error', (err) => finish(reject, err));
    request.end(body);
  });
}

/** The webhook's signing secret; re-sealed when it was opened with an older key. null = unreadable. */
async function signingSecret(hook) {
  const opened = openSealed(hook.secret, { label: `Webhook "${hook.name}" signing secret` });
  if (opened.failed || !opened.value) return null;
  if (opened.stale) {
    await query(`UPDATE api_webhooks SET secret = $2 WHERE id = $1 AND secret = $3`, [hook.id, seal(opened.value), hook.secret]).catch(() => {});
  }
  return opened.value;
}

const SECRET_UNREADABLE = 'The signing secret cannot be decrypted (the encryption key changed). Rotate the secret, or restore the previous key and resume the webhook.';

async function send(hook, payload, deliveryId, { redelivery = false } = {}) {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = await signingSecret(hook);
  if (!secret) return { ok: false, status: null, error: SECRET_UNREADABLE, ms: 0, secretUnreadable: true };
  const started = Date.now();
  const { webhooksPrivate } = await apiConfig();
  try {
    const response = await post(
      hook.url,
      {
        'Content-Type': 'application/json',
        'User-Agent': 'Portal-Webhooks/1.0',
        'X-Portal-Event': payload.type,
        'X-Portal-Delivery': String(deliveryId),
        'X-Portal-Signature': `t=${timestamp},v1=${signature(secret, timestamp, body)}`,
        ...(redelivery ? { 'X-Portal-Redelivery': '1' } : {}),
      },
      body,
      { allowPrivate: webhooksPrivate }
    );
    return { ok: response.status >= 200 && response.status < 300, status: response.status, body: response.text, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, status: null, error: err.message, ms: Date.now() - started };
  }
}

const webhooksOn = (config) => Boolean(config.webhooks && config.enabled);

/** Resolves when `promise` does, or after `ms` (the work may go on, the caller moves on). */
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Gave up after ${Math.round(ms / 1000)} s`)), ms);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

// Start of the running pass (0 = none). A pass older than the longest it can
// take is treated as lost, so the queue never stays blocked.
let delivering = 0;
const PASS_MS = 10 * (ATTEMPT_MS + 5000);
/** Sends what is due; run by the scheduler and right after an event. */
export async function deliverDue() {
  if (delivering && Date.now() - delivering < PASS_MS) return;
  // Switched off: pending deliveries stay pending until it is turned back on.
  if (!webhooksOn(await apiConfig())) return;
  const pass = Date.now();
  delivering = pass;
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
      await Promise.allSettled(rows.map((row) => withTimeout(attempt(row), ATTEMPT_MS)));
      if (!webhooksOn(await apiConfig())) break;
    }
  } finally {
    if (delivering === pass) delivering = 0;
  }
}

async function attempt(delivery) {
  const { rows } = await query(`SELECT * FROM api_webhooks WHERE id = $1`, [delivery.webhook_id]);
  const hook = rows[0];
  if (hook && !hook.active && hook.disabled_reason === 'secret_unreadable') {
    // Paused until the secret is readable again: keep it for then.
    await query(`UPDATE api_deliveries SET next_attempt_at = NOW() + INTERVAL '1 hour', error = $2 WHERE id = $1`, [delivery.id, SECRET_UNREADABLE]);
    return;
  }
  if (!hook || !hook.active) {
    await query(`UPDATE api_deliveries SET status = 'failed', error = 'Webhook is off' WHERE id = $1`, [delivery.id]);
    return;
  }
  const config = await apiConfig();
  if (!webhooksOn(config)) {
    // Turned off meanwhile: leave it pending, untouched, for when it is back on.
    await query(`UPDATE api_deliveries SET next_attempt_at = NOW() WHERE id = $1 AND status = 'pending'`, [delivery.id]);
    return;
  }
  let result;
  try {
    await checkUrl(hook.url, { allowPrivate: config.webhooksPrivate });
    result = await send(hook, delivery.payload, delivery.id, { redelivery: delivery.redelivery });
  } catch (err) {
    result = { ok: false, status: null, error: err.message, ms: 0 };
  }
  if (result.secretUnreadable) {
    // Not the receiver's fault: no attempt is charged and the failure streak is untouched.
    await query(`UPDATE api_deliveries SET next_attempt_at = NOW() + INTERVAL '1 hour', error = $2 WHERE id = $1`, [delivery.id, result.error]);
    await query(
      `UPDATE api_webhooks SET active = FALSE, disabled_reason = 'secret_unreadable', last_status = 'failed', updated_at = NOW() WHERE id = $1`,
      [hook.id]
    );
    hooksCache = null;
    return;
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
  if (!webhooksOn(config)) throw httpError(403, config.enabled ? 'Webhooks are turned off' : 'The API is turned off', 'WEBHOOKS_OFF');
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

/**
 * Sends a delivery again as a new attempt chain. The event id stays the same
 * (it is the same event); the request carries X-Portal-Redelivery: 1 so a
 * receiver that dedupes on the id can tell a deliberate resend apart.
 */
export async function redeliver(id) {
  const { rows } = await query(
    `UPDATE api_deliveries SET status = 'pending', attempts = 0, next_attempt_at = NOW(), error = NULL, redelivery = TRUE WHERE id = $1 RETURNING id`,
    [Number(id)]
  );
  if (!rows[0]) throw httpError(404, 'Delivery not found', 'NOT_FOUND');
  await deliverDue();
  const { deliveries } = await listDeliveries({ before: Number(id) + 1, limit: 1 });
  return deliveries[0];
}

/**
 * Before a person is deleted: their webhooks would cascade away (with their
 * delivery history), silently cutting off an integration. Keep them, paused,
 * without a run-as person, for an administrator to reassign and resume.
 */
export async function keepWebhooksOfDeletedUser(client, userId) {
  const { rowCount } = await client.query(
    `UPDATE api_webhooks SET user_id = NULL, active = FALSE, disabled_reason = 'user_deleted', updated_at = NOW() WHERE user_id = $1`,
    [userId]
  );
  hooksCache = null;
  return rowCount;
}
onBeforeUserDelete(keepWebhooksOfDeletedUser);

export async function purgeDeliveries() {
  await query(`DELETE FROM api_deliveries WHERE created_at < NOW() - INTERVAL '30 days' AND status <> 'pending'`);
}
