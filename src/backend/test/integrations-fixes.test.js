import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createCipheriv, randomBytes } from 'node:crypto';
import config from '../config/app.js';
import { decryptionKeys, openSealed, seal, unseal } from '../services/crypto.js';
import { authAvailability, sanitizeAuth, sanitizeCaCert, whatsappSignInReady } from '../services/settings.js';
import { pruneDirectoryGroupMap } from '../services/rbac.js';
import { directoryGuid, tlsOptionsFor } from '../services/ldap.js';
import { isKeyMismatch } from '../services/push.js';
import { keepWebhooksOfDeletedUser } from '../api/webhooks.js';
import { directoryLockKey } from '../services/signin.js';

// ── 2: sealed secrets survive key rotation ────────────────────────────────

/** Seals like the old code did, with an explicit key source. */
function sealWith(source, plain) {
  const key = createHash('sha256').update(source).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

function withEnv(values, fn) {
  const saved = {};
  for (const key of Object.keys(values)) {
    saved[key] = key === 'JWT' ? config.auth.jwtSecret : process.env[key];
    if (key === 'JWT') config.auth.jwtSecret = values[key];
    else if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (key === 'JWT') config.auth.jwtSecret = value;
      else if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('rotated JWT_SECRET: values open with JWT_SECRET_PREVIOUS and are marked stale', () => {
  const old = sealWith('old-jwt-secret:seal', 'refresh-1');
  withEnv({ JWT: 'new-jwt-secret', ENCRYPTION_KEY: undefined, ENCRYPTION_KEY_PREVIOUS: undefined, JWT_SECRET_PREVIOUS: undefined }, () => {
    assert.equal(unseal(old), null, 'without the previous secret it does not open');
    assert.equal(openSealed(old).failed, true);
  });
  withEnv({ JWT: 'new-jwt-secret', ENCRYPTION_KEY: undefined, ENCRYPTION_KEY_PREVIOUS: undefined, JWT_SECRET_PREVIOUS: 'other, old-jwt-secret' }, () => {
    const opened = openSealed(old);
    assert.deepEqual(opened, { value: 'refresh-1', stale: true, failed: false });
    // Re-sealing uses the current key: it opens without being stale.
    assert.deepEqual(openSealed(seal('refresh-1')), { value: 'refresh-1', stale: false, failed: false });
  });
});

test('rotated ENCRYPTION_KEY opens with ENCRYPTION_KEY_PREVIOUS; introducing one keeps JWT-derived values', () => {
  const old = sealWith('key-one', 'secret-a');
  withEnv({ JWT: 'jwt', ENCRYPTION_KEY: 'key-two', ENCRYPTION_KEY_PREVIOUS: 'key-one', JWT_SECRET_PREVIOUS: undefined }, () => {
    assert.equal(unseal(old), 'secret-a');
  });
  const derived = sealWith('jwt:seal', 'secret-b');
  withEnv({ JWT: 'jwt', ENCRYPTION_KEY: 'brand-new', ENCRYPTION_KEY_PREVIOUS: undefined, JWT_SECRET_PREVIOUS: undefined }, () => {
    assert.deepEqual(openSealed(derived), { value: 'secret-b', stale: true, failed: false });
    assert.equal(new Set(decryptionKeys().map((key) => key.toString('hex'))).size, decryptionKeys().length);
  });
});

// ── 3: push subscriptions made for other VAPID keys ───────────────────────

test('push: a 403 key mismatch is recognised, other 403s are not', () => {
  assert.ok(isKeyMismatch({ statusCode: 403, body: 'the VAPID credentials in the authorization header do not correspond to the credentials used to create the subscriptions.' }));
  assert.ok(isKeyMismatch({ statusCode: 403, body: '{"reason":"VapidPkHashMismatch"}' }));
  assert.ok(!isKeyMismatch({ statusCode: 403, body: '{"reason":"BadJwtToken"}' }));
  assert.ok(!isKeyMismatch({ statusCode: 500, body: 'mismatch' }));
});

// ── 5: group mapping pointing at a deleted group ──────────────────────────

function fakeClient(authValue) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push([sql, params]);
      if (/SELECT value FROM app_settings/.test(sql)) return { rows: authValue == null ? [] : [{ value: authValue }] };
      return { rows: [], rowCount: 1 };
    },
  };
}

test('deleting a group prunes it from the Active Directory group map', async () => {
  const auth = { ldap: { enabled: true, groupMap: [{ adGroup: 'Sales', groupId: 4 }, { adGroup: 'IT', groupId: 7 }] }, password: { enabled: true } };
  const client = fakeClient(JSON.stringify(auth));
  assert.equal(await pruneDirectoryGroupMap(client, 4), 1);
  const written = JSON.parse(client.calls.at(-1)[1][0]);
  assert.deepEqual(written.ldap.groupMap, [{ adGroup: 'IT', groupId: 7 }]);
  assert.equal(written.password.enabled, true);

  const untouched = fakeClient(JSON.stringify(auth));
  assert.equal(await pruneDirectoryGroupMap(untouched, 99), 0);
  assert.equal(untouched.calls.length, 1, 'nothing written when no rule matches');
  assert.equal(await pruneDirectoryGroupMap(fakeClient(null), 4), 0);
});

// ── 6, 7, 9: directory object id, lock key, CA certificate ────────────────

test('AD objectGUID is turned into its usual text form; entryUUID is used as is', () => {
  // {3F2504E0-4F89-11D3-9A0C-0305E82C3301} as AD stores it (first three groups little-endian).
  const raw = Buffer.from('E004253F894FD3119A0C0305E82C3301', 'hex');
  assert.equal(directoryGuid({ objectguid: raw }), '3f2504e0-4f89-11d3-9a0c-0305e82c3301');
  assert.equal(directoryGuid({ entryuuid: 'A1B2C3D4-0000-1111-2222-333344445555' }), 'a1b2c3d4-0000-1111-2222-333344445555');
  assert.equal(directoryGuid({ objectguid: 'garbled text' }), null);
  assert.equal(directoryGuid({}), null);
});

test('first directory sign-ins lock per person: object id first, else DN', () => {
  assert.equal(directoryLockKey({ guid: 'ABC', dn: 'CN=x' }), 'directory:guid:abc');
  assert.equal(directoryLockKey({ dn: 'CN=X,DC=corp' }), 'directory:dn:cn=x,dc=corp');
});

test('LDAP CA certificate: PEM only, used for TLS', () => {
  assert.equal(sanitizeCaCert(''), '');
  assert.throws(() => sanitizeCaCert('not a certificate'), { code: 'CA_CERT_INVALID' });
  assert.throws(() => sanitizeCaCert('-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----'), { code: 'CA_CERT_INVALID' });
  assert.equal(tlsOptionsFor({ caCert: '' }), undefined);
  assert.deepEqual(tlsOptionsFor({ caCert: ' PEM ' }), { ca: ['PEM'] });
});

// ── 10, 12: webhooks of a deleted person ──────────────────────────────────

test('deleting a person keeps their webhooks, paused and without a run-as person', async () => {
  const client = fakeClient(null);
  await keepWebhooksOfDeletedUser(client, 42);
  const [sql, params] = client.calls[0];
  assert.match(sql, /UPDATE api_webhooks SET user_id = NULL, active = FALSE, disabled_reason = 'user_deleted'/);
  assert.deepEqual(params, [42]);
});

// ── 13: WhatsApp code readiness follows the chosen provider ───────────────

function parsedWith({ gateway, wazzup, provider, fallback, enabled = true }) {
  return {
    integrations: {
      whatsapp: gateway ? { enabled: true, serverUrl: 'https://gw', apiKey: 'k' } : { enabled: false },
      wazzup: wazzup ? { enabled: true, apiKey: 'k', channels: { whatsapp: 'c1' } } : { enabled: false },
      google: {},
      activeDirectory: {},
      telegram: {},
      email: {},
      mattermost: {},
    },
    auth: { password: { enabled: true }, whatsappCode: { enabled, provider, fallback }, magicLink: { enabled: false } },
  };
}

test('WhatsApp codes: gateway chosen, no fallback, only Wazzup configured → not available', () => {
  const available = authAvailability(parsedWith({ wazzup: true, provider: 'gateway', fallback: false }));
  assert.equal(available.ready.whatsappCode, true, 'a provider exists (the method can be switched on)');
  assert.equal(available.ready.whatsappSignIn, false);
  assert.equal(available.whatsappCode, false);
  assert.equal(authAvailability(parsedWith({ wazzup: true, provider: 'gateway', fallback: true })).whatsappCode, true);
  assert.equal(authAvailability(parsedWith({ wazzup: true, provider: 'wazzup', fallback: false })).whatsappCode, true);
  assert.equal(authAvailability(parsedWith({ gateway: true, provider: 'wazzup', fallback: false })).whatsappCode, false);
  assert.equal(whatsappSignInReady({ whatsappGateway: true }, {}), true, 'no choice: whichever is configured');
});

test('WhatsApp codes: saving an unworkable provider choice is refused, existing saves are not', () => {
  const ready = authAvailability(parsedWith({ wazzup: true, provider: 'wazzup', fallback: false })).ready;
  const current = { password: { enabled: true }, whatsappCode: { enabled: true, provider: 'wazzup', fallback: false }, magicLink: { enabled: false } };
  assert.throws(() => sanitizeAuth(current, { whatsappCode: { provider: 'gateway', fallback: false } }, ready), { code: 'WHATSAPP_PROVIDER_NOT_READY' });
  assert.equal(sanitizeAuth(current, { whatsappCode: { provider: 'gateway', fallback: true } }, ready).whatsappCode.provider, 'gateway');
  // Unrelated saves of a stored broken choice still go through (no new friction).
  const broken = { ...current, whatsappCode: { enabled: true, provider: 'gateway', fallback: false } };
  assert.doesNotThrow(() => sanitizeAuth(broken, { password: { enabled: true } }, ready));
});

// ── Database (set INTEGRATIONS_DB_TEST=1 and a test database) ─────────────

const enabled = process.env.INTEGRATIONS_DB_TEST === '1';
const skip = enabled ? false : 'set INTEGRATIONS_DB_TEST=1 and a test database to run';
let db = null;
const cleanup = { users: [], hooks: [], groups: [] };

after(async () => {
  if (!db) return;
  if (cleanup.hooks.length) await db.query(`DELETE FROM api_webhooks WHERE id = ANY($1)`, [cleanup.hooks]);
  if (cleanup.users.length) await db.query(`DELETE FROM users WHERE id = ANY($1)`, [cleanup.users]);
  if (cleanup.groups.length) await db.query(`DELETE FROM app_groups WHERE id = ANY($1)`, [cleanup.groups]);
  await db.closePool();
});

test('database: provisioning skips deleted groups; Telegram usernames; webhooks of deleted people', { skip }, async () => {
  db = await import('../config/database.js');
  const { ensureUsersTable, provisionExternalUser, findUserByTelegramUsername, refreshTelegramUsername } = await import('../services/users.js');
  await ensureUsersTable();
  const stamp = Date.now().toString(36);

  // 5: a mapped group id that no longer exists does not fail the first sign-in.
  const user = await db.withTransaction((client) =>
    provisionExternalUser(client, { username: `fx5${stamp}`, displayName: 'Fx5', source: 'ldap', externalId: `CN=fx5${stamp},DC=test`, directoryGuid: `00000000-0000-0000-0000-${stamp.padStart(12, '0').slice(-12)}`, groupIds: [2147480000] })
  );
  cleanup.users.push(user.id);
  assert.equal(user.directory_guid.length, 36);

  // 14: two accounts with one Telegram username → nobody; a sign-in refresh fixes it.
  const name = `fx5u${stamp}`.slice(0, 30);
  const { rows: pair } = await db.query(
    `INSERT INTO users (username, password_hash, telegram_id, telegram_username) VALUES ($1, '!', $3, $5), ($2, '!', $4, $5) RETURNING id`,
    [`fx5a${stamp}`, `fx5b${stamp}`, 9_000_000_000 + Math.floor(Math.random() * 1e6), 9_100_000_000 + Math.floor(Math.random() * 1e6), name]
  );
  cleanup.users.push(...pair.map((row) => row.id));
  assert.equal(await findUserByTelegramUsername(name), null, 'ambiguous: not sent');
  await refreshTelegramUsername(pair[1].id, { username: name });
  assert.equal((await findUserByTelegramUsername(name)).id, pair[1].id);

  // 10/12: a webhook outlives its person; an event for a vanished hook does not stop the loop.
  const { ensureApiTables } = await import('../api/schema.js');
  await ensureApiTables();
  const { rows: hook } = await db.query(
    `INSERT INTO api_webhooks (name, url, secret, events, user_id) VALUES ('fx5', 'https://example.com/h', $1, '{task.created}', $2) RETURNING id`,
    [seal('whsec_test'), pair[0].id]
  );
  cleanup.hooks.push(hook[0].id);
  const { runBeforeUserDelete } = await import('../services/hooks.js');
  await db.withTransaction(async (client) => {
    await runBeforeUserDelete(client, pair[0].id, { actor: { id: 0 } });
    await client.query(`DELETE FROM users WHERE id = $1`, [pair[0].id]);
  });
  const { rows: kept } = await db.query(`SELECT user_id, active, disabled_reason FROM api_webhooks WHERE id = $1`, [hook[0].id]);
  assert.deepEqual(kept[0], { user_id: null, active: false, disabled_reason: 'user_deleted' });

  // 12: a webhook deleted while the active list is cached does not stop the fan-out to the others.
  const { apiConfig } = await import('../api/config.js');
  const config = await apiConfig();
  if (config.enabled && config.webhooks) {
    const { emitEvent } = await import('../api/events.js');
    const { rows: pairHooks } = await db.query(
      `INSERT INTO api_webhooks (name, url, secret, events) VALUES
         ('fx5-gone', 'https://example.invalid/a', $1, '{fx5.probe}'), ('fx5-kept', 'https://example.invalid/b', $1, '{fx5.probe}')
       RETURNING id`,
      [seal('whsec_test')]
    );
    cleanup.hooks.push(...pairHooks.map((row) => row.id));
    const countFor = async (id) =>
      Number((await db.query(`SELECT COUNT(*) FROM api_deliveries WHERE webhook_id = $1`, [id])).rows[0].count);
    await emitEvent('fx5.probe', { data: { n: 1 } }); // caches the active list with both hooks
    assert.equal(await countFor(pairHooks[1].id), 1);
    await db.query(`DELETE FROM api_webhooks WHERE id = $1`, [pairHooks[0].id]);
    await emitEvent('fx5.probe', { data: { n: 2 } });
    assert.equal(await countFor(pairHooks[1].id), 2, 'the remaining webhook still gets the event');
    await db.query(`UPDATE api_webhooks SET active = FALSE WHERE id = $1`, [pairHooks[1].id]);
  }
});
