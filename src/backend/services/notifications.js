import { query } from '../config/database.js';
import { sendEmail, sendMattermostDirect, sendTelegram } from './integrations.js';
import { publicBase } from './google.js';
import { pushToUser } from './push.js';
import { registerJob } from './scheduler.js';
import { authAvailability, getSettings, localeFor, parseSettings } from './settings.js';

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

export const CHANNELS = ['push', 'email', 'telegram', 'mattermost'];
const DEFAULT_PREFS = { push: true, email: true, telegram: true, mattermost: true };

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

  registerJob({
    name: 'notifications:retention',
    everyMs: 6 * 60 * 60 * 1000,
    run: () => query(`DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '120 days'`),
  });
}

export function resolvePrefs(stored) {
  const prefs = { ...DEFAULT_PREFS };
  for (const channel of CHANNELS) {
    if (typeof stored?.[channel] === 'boolean') prefs[channel] = stored[channel];
  }
  return prefs;
}

/** Which external channels can reach this user right now. */
export function channelReach(user, ready) {
  return {
    push: Number(user.push_devices) > 0,
    email: Boolean(ready.emailCode && user.email),
    telegram: Boolean(ready.telegramCode && user.telegram_id),
    mattermost: Boolean(ready.mattermostCode && user.mattermost),
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

async function deliver(user, message, ready, appName) {
  const prefs = resolvePrefs(user.notify_prefs);
  // A sender may narrow the channels (a task reminder "by e-mail only").
  if (Array.isArray(message.channels)) for (const channel of CHANNELS) if (!message.channels.includes(channel)) prefs[channel] = false;
  const reach = channelReach(user, ready);
  const url = message.link ? `${publicBase()}${message.link}` : '';
  const plain = [message.title, message.body, url].filter(Boolean).join('\n\n');
  const tasks = [];
  if (prefs.push && reach.push) {
    tasks.push(
      pushToUser(user.id, {
        title: message.title,
        body: message.body,
        url: message.link || '/',
        tag: message.kind,
        unread: Number(user.unread) || undefined,
      })
    );
  }
  if (prefs.email && reach.email) {
    tasks.push(
      sendEmail({
        to: user.email,
        subject: message.title,
        text: plain,
        html: emailHtml({ appName, title: message.title, body: message.body, url, locale: user.locale }),
      })
    );
  }
  if (prefs.telegram && reach.telegram) tasks.push(sendTelegram({ chatId: user.telegram_id, text: plain }));
  if (prefs.mattermost && reach.mattermost) {
    tasks.push(sendMattermostDirect({ username: user.mattermost, text: [`**${message.title}**`, message.body, url].filter(Boolean).join('\n') }));
  }
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === 'rejected') console.warn(`Notification delivery to user ${user.id} failed:`, result.reason?.message);
  }
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
    `SELECT id, email, locale, telegram_id, mattermost, notify_prefs,
            (SELECT COUNT(*) FROM push_subscriptions p WHERE p.user_id = users.id)::int AS push_devices
     FROM users
     WHERE id = ANY($1) AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`,
    [ids]
  );
  // People who never chose a language get the portal's default one.
  const fallback = await localeFor(null);
  for (const user of users) user.locale = user.locale === 'ru' || user.locale === 'en' ? user.locale : fallback;
  const messages = users.map((user) => {
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
  await query(`INSERT INTO notifications (user_id, kind, module, title, body, link, actor_id) VALUES ${rows.join(', ')}`, values);

  if (external) {
    setImmediate(async () => {
      try {
        const parsed = parseSettings(await getSettings());
        const ready = authAvailability(parsed).ready;
        // The app-icon badge on phones shows the fresh unread count.
        const unread = await query(
          `SELECT user_id, COUNT(*)::int AS n FROM notifications WHERE user_id = ANY($1) AND read_at IS NULL GROUP BY user_id`,
          [messages.map((message) => message.user.id)]
        );
        for (const message of messages) message.user.unread = unread.rows.find((row) => row.user_id === message.user.id)?.n || 0;
        await Promise.all(messages.map((message) => deliver(message.user, message, ready, parsed.appName)));
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

export async function getPrefs(userId) {
  const { rows } = await query(
    `SELECT email, telegram_id, mattermost, notify_prefs,
            (SELECT COUNT(*) FROM push_subscriptions p WHERE p.user_id = users.id)::int AS push_devices
     FROM users WHERE id = $1`,
    [userId]
  );
  const parsed = parseSettings(await getSettings());
  const ready = authAvailability(parsed).ready;
  return { prefs: resolvePrefs(rows[0]?.notify_prefs), reach: channelReach(rows[0] || {}, ready) };
}

export async function savePrefs(userId, incoming = {}) {
  const { rows } = await query(`SELECT notify_prefs FROM users WHERE id = $1`, [userId]);
  const next = resolvePrefs(rows[0]?.notify_prefs);
  for (const channel of CHANNELS) {
    if (typeof incoming[channel] === 'boolean') next[channel] = incoming[channel];
  }
  await query(`UPDATE users SET notify_prefs = $2 WHERE id = $1`, [userId, JSON.stringify(next)]);
  return getPrefs(userId);
}
