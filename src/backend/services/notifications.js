import { query } from '../config/database.js';
import { sendEmail, sendMattermostDirect, sendTelegram, sendWhatsapp } from './integrations.js';
import { duplicateContacts, isValidPhone, normalizePhone } from './users.js';
import { publicBase } from './google.js';
import { pushToUser } from './push.js';
import { registerJob } from './scheduler.js';
import { authAvailability, getSettings, invalidateSettings, localeFor, parseSettings } from './settings.js';
import { eventInfo, NOTIFICATION_EVENTS, NOTIFICATION_GROUPS } from './notificationCatalog.js';

const KNOWN_KINDS = new Set(NOTIFICATION_EVENTS.map((event) => event.kind));

/*
 * Notification center shared by every module.
 *
 *   notify({ userIds, kind, module, link, actorId, render })
 *
 * `render(locale)` returns `{ title, body }` in the recipient's language.
 * Every notification lands in the in-app inbox (the bell); external channels
 * (email via SMTP or Gmail, Telegram, Mattermost) follow each user's
 * preferences and what is configured. The actor never notifies themselves.
 * Delivery is asynchronous: a slow mail server never delays the request.
 */

export const CHANNELS = ['push', 'email', 'telegram', 'whatsapp', 'mattermost'];
const DEFAULT_CHANNELS = { push: true, email: true, telegram: true, whatsapp: true, mattermost: true };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function ensureNotificationTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind VARCHAR(48) NOT NULL,
      module VARCHAR(32),
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, id DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_prefs JSONB NOT NULL DEFAULT '{}'`);
  // Where each notification went: { push: 'sent', telegram: 'unreachable', … }
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivery JSONB`);
  // Subscriptions: follow a project or a calendar without taking part in each item.
  await query(`
    CREATE TABLE IF NOT EXISTS notification_subscriptions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type VARCHAR(32) NOT NULL,
      target_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, target_type, target_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS notification_subscriptions_target ON notification_subscriptions (target_type, target_id)`);

  registerJob({
    name: 'notifications:retention',
    everyMs: 6 * 60 * 60 * 1000,
    run: () => query(`DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '120 days'`),
  });
}

/*
 * Preferences (users.notify_prefs):
 *   channels     master switch per channel                 { push, email, telegram, mattermost }
 *   events       per kind: { inbox?, push?, email?, … }      (missing = the catalog default)
 *   quiet        { enabled, from: '22:00', to: '08:00', weekends }  no pushes or messages then
 *   pausedUntil  ISO time: everything external waits until then
 *   tz           the person's time zone, for quiet hours
 * The first version stored only the four channel flags at the top level; they
 * are read as `channels`.
 */
export function resolvePrefs(stored = {}) {
  const source = stored?.channels && typeof stored.channels === 'object' ? stored.channels : stored || {};
  const channels = { ...DEFAULT_CHANNELS };
  for (const channel of CHANNELS) if (typeof source?.[channel] === 'boolean') channels[channel] = source[channel];
  const events = {};
  for (const [kind, value] of Object.entries(stored?.events || {})) {
    if (!value || typeof value !== 'object') continue;
    const clean = {};
    for (const key of ['inbox', ...CHANNELS]) if (typeof value[key] === 'boolean') clean[key] = value[key];
    if (Object.keys(clean).length) events[kind] = clean;
  }
  const quiet = {
    enabled: Boolean(stored?.quiet?.enabled),
    from: TIME.test(stored?.quiet?.from || '') ? stored.quiet.from : '22:00',
    to: TIME.test(stored?.quiet?.to || '') ? stored.quiet.to : '08:00',
    weekends: Boolean(stored?.quiet?.weekends),
  };
  const paused = stored?.pausedUntil && new Date(stored.pausedUntil) > new Date() ? new Date(stored.pausedUntil).toISOString() : null;
  return { channels, events, quiet, pausedUntil: paused, tz: typeof stored?.tz === 'string' ? stored.tz.slice(0, 64) : null };
}

/** Does this event go to this channel for the person (ignoring quiet hours)? */
export function eventAllows(prefs, kind, channel) {
  const event = eventInfo(kind);
  if (!event.channels.includes(channel)) return false;
  if (!prefs.channels[channel]) return false;
  if (event.urgent) return true;
  return prefs.events[kind]?.[channel] ?? Boolean(event.defaults[channel]);
}

export function inboxAllows(prefs, kind) {
  return eventInfo(kind).urgent || prefs.events[kind]?.inbox !== false;
}

function localParts(date, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz || process.env.TZ || 'UTC', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value;
    return { minutes: Number(get('hour')) * 60 + Number(get('minute')), weekday: get('weekday') };
  } catch {
    return { minutes: date.getUTCHours() * 60 + date.getUTCMinutes(), weekday: 'Mon' };
  }
}

/** 'paused' | 'quiet' | null — whether external delivery should hold back now. */
export function quietState(prefs, now = new Date()) {
  if (prefs.pausedUntil && new Date(prefs.pausedUntil) > now) return 'paused';
  if (!prefs.quiet.enabled) return null;
  const { minutes, weekday } = localParts(now, prefs.tz);
  if (prefs.quiet.weekends && (weekday === 'Sat' || weekday === 'Sun')) return 'quiet';
  const toMin = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const from = toMin(prefs.quiet.from);
  const to = toMin(prefs.quiet.to);
  if (from === to) return null;
  const inside = from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
  return inside ? 'quiet' : null;
}

/** Channels the portal can use for notifications: integration ready and allowed by the administrator. */
export function channelsAvailable(ready) {
  const allowed = ready.notify?.channels || {};
  return {
    push: allowed.push !== false,
    email: Boolean(ready.emailCode) && allowed.email !== false,
    telegram: Boolean(ready.telegramCode) && allowed.telegram !== false,
    whatsapp: Boolean(ready.whatsappCode) && allowed.whatsapp !== false,
    mattermost: Boolean(ready.mattermostCode) && allowed.mattermost !== false,
  };
}

/** Which external channels can reach this user right now. */
export function channelReach(user, ready) {
  const available = channelsAvailable(ready);
  return {
    push: available.push && Number(user.push_devices) > 0,
    email: available.email && Boolean(user.email),
    telegram: available.telegram && Boolean(user.telegram_id),
    whatsapp: available.whatsapp && Boolean(user.phone && isValidPhone(user.phone)),
    mattermost: available.mattermost && Boolean(user.mattermost),
  };
}

// ── Administrator settings (settings key notify_config) ─────────────────────

const NOTIFY_DEFAULTS = {
  channels: { push: true, email: true, telegram: true, whatsapp: true, mattermost: true },
  // WhatsApp for notifications: 'auto' follows Sign-in methods; or a fixed provider.
  whatsapp: { provider: 'auto', fallback: true },
};

export function resolveNotifyConfig(raw) {
  let stored = {};
  try {
    stored = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    stored = {};
  }
  const channels = { ...NOTIFY_DEFAULTS.channels };
  for (const channel of CHANNELS) if (typeof stored.channels?.[channel] === 'boolean') channels[channel] = stored.channels[channel];
  return {
    channels,
    whatsapp: {
      provider: ['auto', 'gateway', 'wazzup'].includes(stored.whatsapp?.provider) ? stored.whatsapp.provider : 'auto',
      fallback: typeof stored.whatsapp?.fallback === 'boolean' ? stored.whatsapp.fallback : true,
    },
  };
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

const OPEN_LABEL = { en: 'Open', ru: 'Открыть' };
const FOOTER = {
  en: 'You receive this because notifications are on in your profile.',
  ru: 'Вы получили это письмо, потому что уведомления включены в вашем профиле.',
};

export function emailHtml({ appName, title, body, url, locale }) {
  const lang = locale === 'ru' ? 'ru' : 'en';
  const paragraphs = String(body || '')
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 10px;color:#334155;font-size:15px;line-height:1.55">${escapeHtml(line)}</p>`)
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0">
<tr><td style="padding:22px 28px;border-bottom:1px solid #eef2f7;font-weight:700;font-size:15px;color:#0f172a">${escapeHtml(appName)}</td></tr>
<tr><td style="padding:26px 28px 8px"><h1 style="margin:0 0 14px;font-size:20px;line-height:1.35;color:#0f172a">${escapeHtml(title)}</h1>${paragraphs}</td></tr>
${url ? `<tr><td style="padding:8px 28px 28px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1e3a8a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:10px">${OPEN_LABEL[lang]}</a></td></tr>` : ''}
</table>
<p style="max-width:560px;color:#94a3b8;font-size:12px;margin:14px auto 0">${FOOTER[lang]}</p>
</td></tr></table></body></html>`;
}

/**
 * Sends one notification to one person's external channels and reports what
 * happened per channel: sent · failed · off (switched off) · unreachable (not
 * connected) · quiet (quiet hours or pause) · skipped (not asked for).
 */
async function deliver(user, message, ready, appName, { force = false } = {}) {
  const prefs = resolvePrefs(user.notify_prefs);
  const event = eventInfo(message.kind);
  const reach = channelReach(user, ready);
  const hold = force || event.urgent ? null : quietState(prefs);
  const url = message.link ? `${publicBase()}${message.link}` : '';
  const plain = [message.title, message.body, url].filter(Boolean).join('\n\n');
  const report = {};
  const jobs = [];
  const run = (channel, fn) =>
    jobs.push(
      fn()
        .then(() => {
          report[channel] = 'sent';
        })
        .catch((err) => {
          report[channel] = `failed: ${String(err?.message || err).slice(0, 160)}`;
        })
    );
  for (const channel of CHANNELS) {
    if (Array.isArray(message.channels) && !message.channels.includes(channel)) {
      report[channel] = 'skipped';
      continue;
    }
    if (!event.channels.includes(channel)) {
      report[channel] = 'skipped';
      continue;
    }
    if (!force && !eventAllows(prefs, message.kind, channel)) {
      report[channel] = 'off';
      continue;
    }
    if (!reach[channel]) {
      report[channel] = 'unreachable';
      continue;
    }
    if (hold) {
      report[channel] = hold;
      continue;
    }
    if (channel === 'push') {
      run('push', () =>
        pushToUser(user.id, { title: message.title, body: message.body, url: message.link || '/', tag: message.kind, unread: Number(user.unread) || undefined }).then((delivered) => {
          if (!delivered) throw new Error('no device accepted the push');
        })
      );
    }
    if (channel === 'email') {
      run('email', () => sendEmail({ to: user.email, subject: message.title, text: plain, html: emailHtml({ appName, title: message.title, body: message.body, url, locale: user.locale }) }));
    }
    if (channel === 'telegram') run('telegram', () => sendTelegram({ chatId: user.telegram_id, text: plain }));
    if (channel === 'whatsapp') run('whatsapp', () => sendWhatsapp({ phone: user.phone, text: plain, provider: ready.notify?.whatsapp?.provider, fallback: ready.notify?.whatsapp?.fallback }));
    if (channel === 'mattermost') run('mattermost', () => sendMattermostDirect({ username: user.mattermost, text: [`**${message.title}**`, message.body, url].filter(Boolean).join('\n') }));
  }
  await Promise.all(jobs);
  for (const [channel, result] of Object.entries(report)) {
    if (result.startsWith('failed')) console.warn(`Notification ${message.kind} to user ${user.id} via ${channel} ${result}`);
  }
  return report;
}

/**
 * @param {object} input
 * @param {number[]} input.userIds recipients
 * @param {string} input.kind e.g. "tasks.assigned"
 * @param {string} [input.module] e.g. "tasks"
 * @param {string} [input.link] app path, e.g. "/app/tasks/HR-12"
 * @param {number} [input.actorId] excluded from recipients
 * @param {(locale: string) => {title: string, body?: string}} input.render
 * @param {boolean} [input.external=true] false = in-app only
 * @param {string[]} [input.channels] only these external channels (still within each person's preferences)
 */
export async function notify({ userIds, kind, module = null, link = null, actorId = null, render, external = true, channels = null }) {
  const ids = [...new Set((userIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0 && id !== Number(actorId)))];
  if (!ids.length) return 0;
  const { rows: users } = await query(
    `SELECT id, email, phone, locale, telegram_id, mattermost, notify_prefs,
            (SELECT COUNT(*) FROM push_subscriptions p WHERE p.user_id = users.id)::int AS push_devices
     FROM users
     WHERE id = ANY($1) AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`,
    [ids]
  );
  // People who never chose a language get the portal's default one.
  const fallback = await localeFor(null);
  for (const user of users) user.locale = user.locale === 'ru' || user.locale === 'en' ? user.locale : fallback;
  // A person may switch an event off entirely (not even the bell).
  const messages = users
    .filter((user) => inboxAllows(resolvePrefs(user.notify_prefs), kind))
    .map((user) => {
      const { title, body = '' } = render(user.locale);
      return { user, kind, title: String(title).slice(0, 300), body: String(body || '').slice(0, 2000), link, channels };
    });
  if (!messages.length) return 0;

  const values = [];
  const rows = messages.map((message, index) => {
    const base = index * 7;
    values.push(message.user.id, kind, module, message.title, message.body, link, actorId);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
  });
  const inserted = await query(`INSERT INTO notifications (user_id, kind, module, title, body, link, actor_id) VALUES ${rows.join(', ')} RETURNING id, user_id`, values);
  for (const row of inserted.rows) {
    const message = messages.find((item) => item.user.id === row.user_id && !item.id);
    if (message) message.id = row.id;
  }

  if (external) {
    setImmediate(async () => {
      try {
        const { parsed, ready } = await readiness();
        // The app-icon badge on phones shows the fresh unread count.
        const unread = await query(
          `SELECT user_id, COUNT(*)::int AS n FROM notifications WHERE user_id = ANY($1) AND read_at IS NULL GROUP BY user_id`,
          [messages.map((message) => message.user.id)]
        );
        for (const message of messages) message.user.unread = unread.rows.find((row) => row.user_id === message.user.id)?.n || 0;
        // In small batches: a notification to a whole department must not
        // take every database connection or open hundreds of SMTP sessions.
        for (let i = 0; i < messages.length; i += 10) {
          const batch = messages.slice(i, i + 10);
          const reports = await Promise.all(batch.map((message) => deliver(message.user, message, ready, parsed.appName).catch((err) => ({ error: err.message }))));
          const ids = batch.map((message) => message.id).filter(Boolean);
          if (ids.length) {
            await query(`UPDATE notifications n SET delivery = d.report FROM unnest($1::bigint[], $2::jsonb[]) AS d(id, report) WHERE n.id = d.id`, [
              batch.filter((message) => message.id).map((message) => message.id),
              batch.map((message, index) => (message.id ? JSON.stringify(reports[index]) : null)).filter((value) => value !== null),
            ]);
          }
        }
      } catch (err) {
        console.warn('Notification delivery failed:', err.message);
      }
    });
  }
  return messages.length;
}

// ── Inbox API helpers ───────────────────────────────────────────────────────

function shape(row) {
  return {
    id: Number(row.id),
    kind: row.kind,
    module: row.module,
    title: row.title,
    body: row.body || '',
    link: row.link,
    delivery: row.delivery || null,
    read: Boolean(row.read_at),
    createdAt: row.created_at,
    actor: row.actor_id
      ? { id: row.actor_id, name: row.actor_name, avatarUrl: row.actor_avatar ? `/uploads/avatars/${row.actor_avatar.split('/').pop()}` : null }
      : null,
  };
}

export async function unreadCount(userId) {
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [userId]);
  return rows[0].n;
}

export async function listNotifications(userId, { before, limit = 20, unreadOnly = false } = {}) {
  const params = [userId, Math.min(50, Math.max(1, Number(limit) || 20))];
  let where = 'n.user_id = $1';
  if (before && Number.isInteger(Number(before))) {
    params.push(Number(before));
    where += ` AND n.id < $${params.length}`;
  }
  if (unreadOnly) where += ' AND n.read_at IS NULL';
  const { rows } = await query(
    `SELECT n.*, COALESCE(u.display_name, u.username) AS actor_name, u.avatar_path AS actor_avatar
     FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
     WHERE ${where} ORDER BY n.id DESC LIMIT $2`,
    params
  );
  return { items: rows.map(shape), unread: await unreadCount(userId), more: rows.length === params[1] };
}

export async function markRead(userId, { ids, all }) {
  if (all) {
    await query(`UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`, [userId]);
  } else {
    const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger).slice(0, 200);
    if (list.length) {
      await query(`UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = ANY($2) AND read_at IS NULL`, [userId, list]);
    }
  }
  return unreadCount(userId);
}

async function userForDelivery(userId) {
  const { rows } = await query(
    `SELECT id, email, phone, locale, telegram_id, mattermost, notify_prefs,
            (SELECT COUNT(*) FROM push_subscriptions p WHERE p.user_id = users.id)::int AS push_devices
     FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function readiness() {
  const settings = await getSettings();
  const parsed = parseSettings(settings);
  return { parsed, ready: { ...authAvailability(parsed).ready, notify: resolveNotifyConfig(settings.notify_config) } };
}

export async function getPrefs(userId) {
  const user = await userForDelivery(userId);
  const { ready } = await readiness();
  const prefs = resolvePrefs(user?.notify_prefs);
  return {
    // `prefs` keeps the first version's flat flags for older clients.
    prefs: { ...prefs.channels, ...prefs },
    reach: channelReach(user || {}, ready),
    configured: channelsAvailable(ready),
    contacts: { email: user?.email || '', phone: user?.phone || '', mattermost: user?.mattermost || '', telegram: Boolean(user?.telegram_id) },
    catalog: NOTIFICATION_GROUPS.map((group) => ({
      key: group.key,
      module: group.module,
      events: group.events.filter((event) => !event.hidden).map((event) => ({ kind: event.kind, defaults: event.defaults, urgent: Boolean(event.urgent), subscription: Boolean(event.subscription), channels: event.channels || CHANNELS })),
    })).filter((group) => group.events.length),
    devices: Number(user?.push_devices || 0),
  };
}

export async function savePrefs(userId, incoming = {}) {
  const { rows } = await query(`SELECT notify_prefs FROM users WHERE id = $1`, [userId]);
  const next = resolvePrefs(rows[0]?.notify_prefs);
  const channelsIn = incoming.channels && typeof incoming.channels === 'object' ? incoming.channels : incoming;
  for (const channel of CHANNELS) if (typeof channelsIn[channel] === 'boolean') next.channels[channel] = channelsIn[channel];
  if (incoming.events && typeof incoming.events === 'object') {
    for (const [kind, value] of Object.entries(incoming.events)) {
      if (!KNOWN_KINDS.has(kind) || !value || typeof value !== 'object') continue;
      const clean = { ...(next.events[kind] || {}) };
      for (const key of ['inbox', ...CHANNELS]) {
        if (typeof value[key] === 'boolean') clean[key] = value[key];
        if (value[key] === null) delete clean[key];
      }
      if (Object.keys(clean).length) next.events[kind] = clean;
      else delete next.events[kind];
    }
  }
  if (incoming.resetEvents === true) next.events = {};
  if (incoming.quiet && typeof incoming.quiet === 'object') {
    next.quiet = resolvePrefs({ quiet: { ...next.quiet, ...incoming.quiet } }).quiet;
  }
  if (incoming.pausedUntil !== undefined) {
    const until = incoming.pausedUntil ? new Date(incoming.pausedUntil) : null;
    next.pausedUntil = until && !Number.isNaN(until.getTime()) && until > new Date() ? until.toISOString() : null;
  }
  if (typeof incoming.tz === 'string') {
    try {
      new Intl.DateTimeFormat('en', { timeZone: incoming.tz });
      next.tz = incoming.tz.slice(0, 64);
    } catch {
      /* keep the old one */
    }
  }
  await query(`UPDATE users SET notify_prefs = $2 WHERE id = $1`, [userId, JSON.stringify(next)]);
  return getPrefs(userId);
}

/**
 * A test notification through every connected channel, delivered now, with
 * the result per channel (including the reason when a channel cannot work).
 */
export async function sendTest(userId, { channel = null } = {}) {
  const user = await userForDelivery(userId);
  if (!user) return null;
  const { parsed, ready } = await readiness();
  const locale = user.locale === 'ru' || user.locale === 'en' ? user.locale : await localeFor(null);
  const text =
    locale === 'ru'
      ? { title: 'Проверка уведомлений', body: 'Если вы видите это сообщение, канал работает.' }
      : { title: 'Notification test', body: 'If you can read this, the channel works.' };
  const { rows } = await query(
    `INSERT INTO notifications (user_id, kind, module, title, body, link) VALUES ($1, 'system.test', NULL, $2, $3, '/account/notifications') RETURNING id`,
    [userId, text.title, text.body]
  );
  const prefs = resolvePrefs(user.notify_prefs);
  const only = CHANNELS.includes(channel) ? [channel] : null;
  const report = await deliver(user, { kind: 'system.test', title: text.title, body: text.body, link: '/account/notifications', channels: only }, ready, parsed.appName, { force: true });
  await query(`UPDATE notifications SET delivery = $2 WHERE id = $1`, [rows[0].id, JSON.stringify(report)]);
  return { report, channels: prefs.channels, reach: channelReach(user, ready) };
}

/** The last notifications with where they went (for "why didn't I get it?"). */
export async function deliveryHistory(userId, limit = 15) {
  const { rows } = await query(
    `SELECT id, kind, title, created_at, delivery, read_at FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
    [userId, Math.min(50, Math.max(1, Number(limit) || 15))]
  );
  return rows.map((row) => ({ id: Number(row.id), kind: row.kind, title: row.title, createdAt: row.created_at, delivery: row.delivery || null, read: Boolean(row.read_at) }));
}

// ── Subscriptions ───────────────────────────────────────────────────────────

export const SUBSCRIPTION_TYPES = ['tasks.project', 'calendar.calendar'];

export async function setSubscription(userId, type, targetId, on) {
  if (!SUBSCRIPTION_TYPES.includes(type) || !Number.isInteger(Number(targetId))) {
    const error = new Error('Unknown subscription');
    error.statusCode = 400;
    error.code = 'SUBSCRIPTION_UNKNOWN';
    throw error;
  }
  if (on) {
    await query(`INSERT INTO notification_subscriptions (user_id, target_type, target_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [userId, type, Number(targetId)]);
  } else {
    await query(`DELETE FROM notification_subscriptions WHERE user_id = $1 AND target_type = $2 AND target_id = $3`, [userId, type, Number(targetId)]);
  }
  return isSubscribed(userId, type, targetId);
}

export async function isSubscribed(userId, type, targetId) {
  const { rows } = await query(`SELECT 1 FROM notification_subscriptions WHERE user_id = $1 AND target_type = $2 AND target_id = $3`, [userId, type, Number(targetId)]);
  return Boolean(rows[0]);
}

export async function subscribersOf(type, targetId) {
  const { rows } = await query(`SELECT user_id FROM notification_subscriptions WHERE target_type = $1 AND target_id = $2`, [type, Number(targetId)]);
  return rows.map((row) => row.user_id);
}

export async function listSubscriptions(userId) {
  const { rows } = await query(
    `SELECT s.target_type, s.target_id, s.created_at,
            CASE s.target_type WHEN 'tasks.project' THEN p.name WHEN 'calendar.calendar' THEN c.name END AS name,
            CASE s.target_type WHEN 'tasks.project' THEN p.color WHEN 'calendar.calendar' THEN c.color END AS color,
            CASE s.target_type WHEN 'tasks.project' THEN '/app/tasks/' || p.key WHEN 'calendar.calendar' THEN '/app/calendar' END AS link
     FROM notification_subscriptions s
     LEFT JOIN task_projects p ON s.target_type = 'tasks.project' AND p.id = s.target_id
     LEFT JOIN cal_calendars c ON s.target_type = 'calendar.calendar' AND c.id = s.target_id
     WHERE s.user_id = $1 ORDER BY s.created_at DESC`,
    [userId]
  ).catch(() => ({ rows: [] }));
  return rows.filter((row) => row.name).map((row) => ({ type: row.target_type, id: row.target_id, name: row.name, color: row.color, link: row.link, since: row.created_at }));
}

// ── Administration ──────────────────────────────────────────────────────────

/** Settings plus, per channel: integration state and how many people it can reach. */
export async function notifyOverview() {
  const { parsed, ready } = await readiness();
  const { rows } = await query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE email IS NOT NULL AND email <> '')::int AS email,
           COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone <> '')::int AS whatsapp,
           COUNT(*) FILTER (WHERE telegram_id IS NOT NULL)::int AS telegram,
           COUNT(*) FILTER (WHERE mattermost IS NOT NULL AND mattermost <> '')::int AS mattermost,
           COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = users.id))::int AS push
    FROM users WHERE is_active IS NOT FALSE AND is_blocked IS NOT TRUE`);
  const integration = {
    push: true,
    email: Boolean(ready.emailCode),
    telegram: Boolean(ready.telegramCode),
    whatsapp: Boolean(ready.whatsappCode),
    mattermost: Boolean(ready.mattermostCode),
  };
  const providers = { gateway: Boolean(ready.whatsappGateway), wazzup: Boolean(ready.whatsappWazzup) };
  return {
    config: ready.notify,
    integration,
    providers,
    signinWhatsapp: parsed.auth?.whatsappCode || {},
    coverage: { total: rows[0].total, ...Object.fromEntries(CHANNELS.map((channel) => [channel, rows[0][channel]])) },
    duplicates: await duplicateContacts(),
  };
}

export async function saveNotifyConfig(patch = {}) {
  const current = resolveNotifyConfig((await getSettings()).notify_config);
  const next = resolveNotifyConfig({
    channels: { ...current.channels, ...(patch.channels || {}) },
    whatsapp: { ...current.whatsapp, ...(patch.whatsapp || {}) },
  });
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('notify_config', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(next)]
  );
  invalidateSettings();
  return notifyOverview();
}

/** A test message to any address: e-mail, phone (WhatsApp), Telegram chat id or Mattermost name. */
export async function adminTest({ channel, to, provider }) {
  const { parsed, ready } = await readiness();
  const text = { title: `${parsed.appName}: проверка уведомлений / notification test`, body: 'Если вы видите это сообщение, канал работает. If you can read this, the channel works.' };
  const plain = `${text.title}\n\n${text.body}`;
  const target = String(to || '').trim();
  if (!target) throw Object.assign(new Error('Enter a recipient'), { statusCode: 400, code: 'RECIPIENT_REQUIRED' });
  const started = Date.now();
  try {
    let used = channel;
    if (channel === 'email') await sendEmail({ to: target, subject: text.title, text: plain, html: emailHtml({ appName: parsed.appName, title: text.title, body: text.body, url: '', locale: 'ru' }) });
    else if (channel === 'telegram') await sendTelegram({ chatId: target, text: plain });
    else if (channel === 'mattermost') await sendMattermostDirect({ username: target.replace(/^@/, ''), text: `**${text.title}**\n${text.body}` });
    else if (channel === 'whatsapp') {
      const choice = provider || ready.notify.whatsapp.provider;
      used = `whatsapp:${await sendWhatsapp({ phone: normalizePhone(target), text: plain, provider: choice, fallback: provider ? false : ready.notify.whatsapp.fallback })}`;
    } else throw Object.assign(new Error('Unknown channel'), { statusCode: 400, code: 'CHANNEL_UNKNOWN' });
    return { ok: true, via: used, ms: Date.now() - started };
  } catch (err) {
    if (['RECIPIENT_REQUIRED', 'CHANNEL_UNKNOWN'].includes(err.code)) throw err;
    return { ok: false, error: String(err.message || err).slice(0, 300), ms: Date.now() - started };
  }
}
