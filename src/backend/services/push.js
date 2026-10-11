import webpush from 'web-push';
import { query } from '../config/database.js';
import { seal, unseal } from './crypto.js';
import { publicBase } from './google.js';
import { getSetting, setSetting } from './settings.js';

/*
 * Web Push for the installed app (PWA): Android, desktop browsers and iOS
 * 16.4+ when the app was added to the home screen.
 *
 * VAPID keys are generated on first use and stored in app_settings
 * (`webpush`), the private key sealed. Each device subscription belongs to a
 * user; subscriptions the push service reports as gone (404/410) are removed.
 */

let keysCache = null;

export async function ensurePushTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent VARCHAR(300),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id)`);
}

export async function vapidKeys() {
  if (keysCache) return keysCache;
  let stored = null;
  try {
    stored = JSON.parse((await getSetting('webpush')) || 'null');
  } catch {
    stored = null;
  }
  let privateKey = stored ? unseal(stored.privateKey) : null;
  if (!stored?.publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    stored = { publicKey: generated.publicKey, privateKey: seal(generated.privateKey) };
    privateKey = generated.privateKey;
    await setSetting('webpush', JSON.stringify(stored));
  }
  keysCache = { publicKey: stored.publicKey, privateKey };
  return keysCache;
}

function subject() {
  const base = publicBase();
  return /^https:\/\//.test(base) ? base : `mailto:${process.env.PUSH_CONTACT || 'admin@example.com'}`;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

/** Push services of Chrome/Edge (FCM), Firefox, Safari and Windows. Nothing else is called. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
];

export function isPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((pattern) => pattern.test(url.hostname));
  } catch {
    return false;
  }
}

export async function saveSubscription(userId, subscription, userAgent) {
  const endpoint = String(subscription?.endpoint || '');
  const p256dh = String(subscription?.keys?.p256dh || '');
  const auth = String(subscription?.keys?.auth || '');
  if (!isPushEndpoint(endpoint) || endpoint.length > 2000 || !/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) {
    throw badRequest('Invalid push subscription');
  }
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent`,
    [userId, endpoint, p256dh.slice(0, 200), auth.slice(0, 100), String(userAgent || '').slice(0, 300)]
  );
}

export async function removeSubscription(userId, endpoint) {
  await query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [userId, String(endpoint || '')]);
}

export async function countSubscriptions(userId) {
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id = $1`, [userId]);
  return rows[0].n;
}

/** Sends one payload to every device of a user. Returns how many accepted it. */
export async function pushToUser(userId, payload) {
  const { rows } = await query(`SELECT * FROM push_subscriptions WHERE user_id = $1`, [userId]);
  if (!rows.length) return 0;
  const keys = await vapidKeys();
  const body = JSON.stringify(payload);
  let delivered = 0;
  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          {
            vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
            TTL: 24 * 60 * 60,
            urgency: payload.urgency || 'normal',
            timeout: 10000,
          }
        );
        delivered += 1;
        await query(`UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = $1`, [row.id]);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await query(`DELETE FROM push_subscriptions WHERE id = $1`, [row.id]);
        } else {
          console.warn(`Push to user ${userId} failed:`, err.statusCode || '', err.body || err.message);
        }
      }
    })
  );
  return delivered;
}
