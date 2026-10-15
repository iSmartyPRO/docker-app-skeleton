import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

/*
 * Link previews against a test database (never production!): what the page
 * shell and the preview picture say for Files links (/l), knowledge base
 * shares (/s) and Drive links (/d, through the mock SMB gateway), that
 * password-protected and refused links stay generic, and that crawlers and
 * HEAD requests never count as views.
 *
 *   FILES_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/link-preview.db.test.js
 *   DRIVE_DB_TEST=1 ENV_FILE_PATH=/path/to/test.env node --test test/link-preview.db.test.js
 *
 * Needs the account plainuser (Files) and admin (knowledge base). Skipped
 * without the variables, so `npm test` stays database-free.
 */

const filesOn = process.env.FILES_DB_TEST === '1';
const driveOn = process.env.DRIVE_DB_TEST === '1';
const enabled = filesOn || driveOn;
const skipFiles = filesOn ? false : 'set FILES_DB_TEST=1 and a test database to run';
const skipDrive = driveOn ? false : 'set DRIVE_DB_TEST=1 and a test database to run';

const WHATSAPP = 'WhatsApp/2.23.20.0 A';
const TELEGRAM = 'TelegramBot (like TwitterBot)';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

const work = enabled ? mkdtempSync(join(tmpdir(), 'link-preview-')) : '';
let db;
let mods;
let server;
let base;
let savedModules = null;
const cleanup = { fsRoots: [], fsLinks: [], kbFolders: [], users: [], servers: [] };

/** A page as nginx hands it over: { status, html, headers }. */
async function page(path, { ua = CHROME, method = 'GET' } = {}) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'User-Agent': ua, 'X-Portal-Shell': '1' } });
  return { status: res.status, html: await res.text(), headers: res.headers };
}

const meta = (html, property) => {
  const match = new RegExp(`<meta (?:property|name)="${property.replace(/[:.]/g, '\\$&')}" content="([^"]*)"`).exec(html);
  return match ? match[1] : null;
};

const decode = (value) => String(value ?? '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function patchModules(patch) {
  const { getSettings, parseSettings, setSetting, getSetting } = mods.settings;
  const { sanitizeModules } = await import('../modules/catalog.js');
  if (savedModules === null) savedModules = (await getSetting('modules', null)) ?? '';
  const parsed = parseSettings(await getSettings({ fresh: true }));
  await setSetting('modules', JSON.stringify(sanitizeModules(parsed.modules, patch)));
  mods.preview.clearPreviewMemo();
}

/** A PNG's width and height. */
const pngSize = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

before(async () => {
  if (!enabled) return;
  process.env.DISABLE_SCHEDULER = 'true';
  process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || join(work, 'uploads');
  mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
  // A built index.html stand-in with the markers of src/frontend/index.html.
  const dist = join(work, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(
    join(dist, 'index.html'),
    '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <!-- link-preview:start -->\n    <title>Портал</title>\n    <!-- link-preview:end -->\n  </head>\n  <body><div id="root"></div><script type="module" src="/assets/index.js"></script></body>\n</html>\n'
  );
  process.env.FRONTEND_DIST = dist;
  // The public address messengers get (behind the proxy it comes from PUBLIC_URL or the request).
  process.env.PUBLIC_URL = 'https://portal.test';
  if (driveOn) {
    process.env.SMBGATE_PYTHON = fileURLToPath(new URL('../test-fixtures/mock-smbgate.mjs', import.meta.url));
    process.env.MOCK_SMB_ROOT = work;
    process.env.MOCK_SMB_ACL = join(work, 'acl.json');
    writeFileSync(process.env.MOCK_SMB_ACL, JSON.stringify({ known: true, users: { svc: { password: 'pw1', write: true, delete: true } } }));
  }

  db = await import('../config/database.js');
  const { bootstrapSchema } = await import('../services/schema.js');
  await bootstrapSchema();
  mods = {
    settings: await import('../services/settings.js'),
    preview: await import('../services/linkPreview/index.js'),
  };
  await patchModules({
    files: { enabled: true, settings: { publicLinks: true, writeLinks: true, requireWriteLinkPassword: false, linkSharing: 'owners', requireLinkPassword: false } },
    kb: { enabled: true, settings: { publicLinks: true } },
    drive: { enabled: true, settings: { publicLinks: true, linkWrite: true, requireWritePassword: false, linkAudience: 'any', requireLinkPassword: false, maxLinkDays: 0 } },
  });

  const express = (await import('express')).default;
  const filesRoutes = await import('../modules/files/routes.js');
  const kbRoutes = await import('../modules/kb/routes.js');
  const driveRoutes = await import('../modules/drive/routes.js');
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(mods.preview.shellMiddleware());
  app.use(express.json());
  app.use('/api/og', mods.preview.previewImageRoutes());
  app.use('/api/l', filesRoutes.publicRoutes());
  app.use('/api/s', kbRoutes.publicRoutes());
  app.use('/api/d', driveRoutes.publicRoutes());
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false, code: err.code, error: err.message }));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!enabled) return;
  server?.close();
  try {
    if (cleanup.fsLinks.length) await db.query(`DELETE FROM fs_links WHERE id = ANY($1)`, [cleanup.fsLinks]);
    if (cleanup.fsRoots.length) {
      const service = await import('../modules/files/service.js');
      for (const id of cleanup.fsRoots) await service.purgeSubtree(id).catch(() => {});
    }
    if (cleanup.kbFolders.length) await db.query(`DELETE FROM kb_folders WHERE id = ANY($1)`, [cleanup.kbFolders]);
    if (cleanup.users.length) {
      await db.query(`DELETE FROM drive_activity WHERE user_id = ANY($1) OR link_id IN (SELECT id FROM drive_links WHERE created_by = ANY($1))`, [cleanup.users]).catch(() => {});
      await db.query(`DELETE FROM drive_links WHERE created_by = ANY($1)`, [cleanup.users]);
    }
    if (cleanup.servers.length) await db.query(`DELETE FROM drive_servers WHERE id = ANY($1)`, [cleanup.servers]);
    if (cleanup.users.length) {
      await db.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [cleanup.users]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [cleanup.users]);
    }
    if (savedModules !== null) {
      if (savedModules) await mods.settings.setSetting('modules', savedModules);
      else await db.query(`DELETE FROM app_settings WHERE key = 'modules'`);
    }
    if (driveOn) (await import('../modules/drive/gate.js')).stopGate();
  } finally {
    await db.closePool();
    rmSync(work, { recursive: true, force: true });
  }
});

// ── Files ───────────────────────────────────────────────────────────────────

test('page shell: an address the IP rules refuse gets the plain page, no link facts', { skip: skipFiles, timeout: 60000 }, async () => {
  const links = await import('../modules/files/links.js');
  const service = await import('../modules/files/service.js');
  const { getUserAccess } = await import('../services/rbac.js');
  const { contextFromRequest } = await import('../modules/shared/acl.js');
  const { rows } = await db.query(`SELECT id FROM users WHERE username = 'plainuser'`);
  const ctx = contextFromRequest({ user: { id: rows[0].id }, access: await getUserAccess(rows[0].id) }, 'files.admin');
  const folder = await service.createFolder(ctx, { name: `Allow-list check ${Date.now()}` });
  cleanup.fsRoots.push(folder.id);
  const shared = await links.createLink(ctx, folder.id, { permissions: ['view'], title: 'Board minutes' });
  cleanup.fsLinks.push(shared.id);
  const visit = (ip) => fetch(`${base}/l/${shared.token}`, { headers: { 'User-Agent': WHATSAPP, 'X-Portal-Shell': '1', 'X-Forwarded-For': ip } }).then((res) => res.text());
  assert.ok((await visit('203.0.113.7')).includes('Board minutes'), 'allowed: the link card');
  const saved = await mods.settings.getSetting('security', null);
  const security = JSON.parse(saved || '{}');
  await mods.settings.setSetting('security', JSON.stringify({ ...security, whitelistEnabled: true }));
  try {
    const refused = await visit('203.0.113.7');
    assert.ok(!refused.includes('Board minutes'), 'no link facts for a refused address');
    assert.ok(refused.includes('<title>Портал</title>'), 'the static page as it is');
    assert.ok(!refused.includes('og:title'));
  } finally {
    if (saved === null) await db.query(`DELETE FROM app_settings WHERE key = 'security'`);
    else await mods.settings.setSetting('security', saved);
    mods.preview.clearPreviewMemo();
  }
});

test('files links: page tags per link state, no leaks, no view counting', { skip: skipFiles, timeout: 60000 }, async () => {
  const { getUserAccess } = await import('../services/rbac.js');
  const { contextFromRequest } = await import('../modules/shared/acl.js');
  const service = await import('../modules/files/service.js');
  const links = await import('../modules/files/links.js');
  const storage = await import('../modules/shared/storage.js');
  const { rows } = await db.query(`SELECT id, COALESCE(display_name, username) AS name FROM users WHERE username = 'plainuser'`);
  assert.ok(rows[0], 'the test database needs the account plainuser');
  const owner = rows[0];
  const ctx = contextFromRequest({ user: { id: owner.id }, access: await getUserAccess(owner.id) }, 'files.admin');

  const folder = await service.createFolder(ctx, { name: `Документы для банка ${Date.now()}` });
  cleanup.fsRoots.push(folder.id);
  await service.createFolder(ctx, { parentId: folder.id, name: 'Сканы' });
  const store = async (name, body) => {
    const key = await storage.newStorageKey(storage.extOf(name));
    await writeFile(storage.storagePath(key), body);
    const [row] = await service.storeUploads(ctx, { parentId: folder.id, spaceId: null, ownerId: owner.id }, [{ originalname: name, path: storage.storagePath(key), size: body.length, storageKey: key }]);
    return row;
  };
  const pdf = await store('Договор "2026" <b>.pdf', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2.4 * 1024 * 1024 - 9, 0x20)]));
  await store('notes.txt', Buffer.from('hello'));
  const create = async (nodeId, input) => {
    const link = await links.createLink(ctx, nodeId, input);
    cleanup.fsLinks.push(link.id);
    return link;
  };
  const fileLink = await create(pdf.id, { permissions: ['view', 'download'], expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });
  const folderLink = await create(folder.id, { permissions: ['view', 'download', 'upload'], title: 'Пакет для банка' });
  const dropLink = await create(folder.id, { permissions: ['upload'], title: '' });
  const lockedLink = await create(pdf.id, { permissions: ['view', 'download'], password: 'secret-pass' });
  const revoked = await create(pdf.id, { permissions: ['view'] });
  await links.updateLink(ctx, revoked.id, { revoked: true });
  const expired = await create(pdf.id, { permissions: ['view'] });
  await db.query(`UPDATE fs_links SET expires_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [expired.id]);

  // A file: name, type and size, rights, expiry and sender; a picture of 1200×630.
  const file = await page(`/l/${fileLink.token}`, { ua: WHATSAPP });
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type'), /text\/html/);
  assert.equal(file.headers.get('cache-control'), 'no-cache');
  assert.equal(decode(meta(file.html, 'og:title')), pdf.name);
  const description = decode(meta(file.html, 'og:description'));
  assert.match(description, /^PDF · 2,4 МБ · Можно скачать · Доступно до \d\d\.\d\d\.\d{4} · Отправитель: /);
  assert.ok(description.includes(owner.name));
  assert.ok(!file.html.includes('<b>'), 'the file name is escaped');
  assert.equal(meta(file.html, 'og:url'), `https://portal.test/l/${fileLink.token}`);
  assert.equal(meta(file.html, 'twitter:card'), meta(file.html, 'og:image') ? 'summary_large_image' : 'summary');
  assert.equal(meta(file.html, 'robots'), 'noindex, nofollow');
  assert.ok(file.html.includes('<script type="module" src="/assets/index.js"></script>'), 'the SPA stays intact');
  assert.ok(file.html.startsWith('<!DOCTYPE html>\n<html lang="ru">'));

  const image = meta(file.html, 'og:image');
  if (image) {
    assert.match(image, new RegExp(`^https://portal\\.test/api/og/l/${fileLink.token}\\.png\\?v=[0-9a-f]{32}$`));
    assert.equal(meta(file.html, 'og:image:width'), '1200');
    assert.equal(meta(file.html, 'og:image:height'), '630');
    assert.equal(meta(file.html, 'og:image:secure_url'), image);
    const res = await fetch(`${base}${new URL(decode(image)).pathname}${new URL(decode(image)).search}`, { headers: { 'User-Agent': WHATSAPP } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.match(res.headers.get('cache-control'), /public, max-age=86400/);
    const png = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(pngSize(png), { width: 1200, height: 630 });
    assert.ok(png.length < 300 * 1024, `${png.length} bytes`);
  }

  // A folder: the custom title, the real name and the item count, what one can do.
  const folderPage = await page(`/l/${folderLink.slug || folderLink.token}`, { ua: TELEGRAM });
  assert.equal(decode(meta(folderPage.html, 'og:title')), 'Пакет для банка');
  assert.match(decode(meta(folderPage.html, 'og:description')), /· Папка · 2 файла, 1 папка · Можно скачать · Можно загрузить файлы/);

  // Upload-only: an invitation, never the contents.
  const drop = await page(`/l/${dropLink.token}`, { ua: WHATSAPP });
  const dropText = decode(meta(drop.html, 'og:description'));
  assert.match(dropText, /Отправьте файлы — их получит/);
  assert.ok(!/файла|Договор|notes/.test(dropText));

  // Password: nothing about the file.
  const locked = await page(`/l/${lockedLink.token}`, { ua: WHATSAPP });
  assert.equal(decode(meta(locked.html, 'og:title')), '🔒 Доступ по паролю');
  assert.ok(!locked.html.includes('Договор'));
  assert.ok(!locked.html.includes('PDF'));

  // Revoked, expired and unknown links look the same.
  const generic = [];
  for (const token of [revoked.token, expired.token, 'NoSuchLink123']) {
    const res = await page(`/l/${token}`, { ua: WHATSAPP });
    assert.equal(decode(meta(res.html, 'og:title')), 'Ссылка недействительна или истекла');
    assert.ok(!res.html.includes('Договор'));
    generic.push(meta(res.html, 'og:description'));
  }
  assert.equal(new Set(generic).size, 1);

  // Crawlers, HEAD and the page shell never count as views; a person's GET does.
  const views = async () => (await db.query(`SELECT view_count FROM fs_links WHERE id = $1`, [fileLink.id])).rows[0].view_count;
  const before = await views();
  await page(`/l/${fileLink.token}`, { ua: CHROME });
  await fetch(`${base}/api/l/${fileLink.token}`, { headers: { 'User-Agent': WHATSAPP } });
  await fetch(`${base}/api/l/${fileLink.token}`, { headers: { 'User-Agent': 'facebookexternalhit/1.1' } });
  await fetch(`${base}/api/l/${fileLink.token}`, { method: 'HEAD', headers: { 'User-Agent': CHROME } });
  assert.equal(await views(), before);
  await fetch(`${base}/api/l/${fileLink.token}`, { headers: { 'User-Agent': CHROME } });
  assert.equal(await views(), before + 1);

  // The share dialog's preview data matches the page.
  const json = await (await fetch(`${base}/api/og/preview?path=${encodeURIComponent(`/l/${fileLink.token}`)}`)).json();
  assert.equal(json.preview.title, pdf.name);

  // An image that may be viewed: its own picture goes into the card.
  const { renderPng, rendererAvailable } = await import('../services/linkPreview/card.js');
  if (await rendererAvailable()) {
    const photo = await store('Фасад.png', await renderPng('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#3a7"/><circle cx="600" cy="300" r="200" fill="#fd0"/></svg>'));
    const photoLink = await create(photo.id, { permissions: ['view', 'download'] });
    const photoPage = await page(`/l/${photoLink.token}`, { ua: WHATSAPP });
    assert.match(decode(meta(photoPage.html, 'og:description')), /^Изображение PNG · /);
    const url = new URL(decode(meta(photoPage.html, 'og:image')));
    const png = Buffer.from(await (await fetch(`${base}${url.pathname}${url.search}`)).arrayBuffer());
    assert.deepEqual(pngSize(png), { width: 1200, height: 630 });
    assert.ok(png.length < 300 * 1024);
    const { writeFileSync: save } = await import('fs');
    if (process.env.OG_SAMPLES) save(join(process.env.OG_SAMPLES, 'db-photo.png'), png);
  }

  // Any other page: the portal card; requests without the nginx mark are not answered with HTML.
  const home = await page('/app/files');
  assert.ok(meta(home.html, 'og:title'));
  assert.equal(meta(home.html, 'robots'), null);
  assert.equal((await fetch(`${base}/l/${fileLink.token}`)).status, 404);
});

// ── Knowledge base ──────────────────────────────────────────────────────────

test('knowledge base shares: folder and article previews, password stays generic', { skip: skipFiles, timeout: 60000 }, async () => {
  const { rows } = await db.query(`SELECT id FROM users WHERE username = 'admin'`);
  assert.ok(rows[0], 'the test database needs the account admin');
  const admin = rows[0].id;
  const stamp = Date.now().toString(36);
  const folder = (await db.query(`INSERT INTO kb_folders (name, description, created_by) VALUES ($1, 'Всё для новых сотрудников', $2) RETURNING id`, [`Онбординг ${stamp}`, admin])).rows[0];
  cleanup.kbFolders.push(folder.id);
  const article = (
    await db.query(
      `INSERT INTO kb_items (folder_id, kind, title, content, created_by) VALUES ($1, 'article', 'Первый день', $2, $3) RETURNING id`,
      [folder.id, '# Первый день\n\nВ первый день вы получаете пропуск, ноутбук и <script>доступы</script> к порталу. Встреча с наставником в 10:00.', admin]
    )
  ).rows[0];
  const open = `kb-${stamp}`;
  const locked = `kb-${stamp}-x`;
  await db.query(`INSERT INTO kb_shares (folder_id, slug, title, created_by) VALUES ($1, $2, 'Онбординг для новичков', $3)`, [folder.id, open, admin]);
  await db.query(`INSERT INTO kb_shares (folder_id, slug, password_hash, created_by) VALUES ($1, $2, '$2a$10$abcdefghijklmnopqrstuuUOmY7Yb3ZQ0V3cQ4i4nq2PVfnN7I1i6', $3)`, [folder.id, locked, admin]);

  const root = await page(`/s/${open}`, { ua: TELEGRAM });
  assert.equal(decode(meta(root.html, 'og:title')), 'Онбординг для новичков');
  assert.match(decode(meta(root.html, 'og:description')), /^Всё для новых сотрудников · База знаний · 1 материал$/);

  const item = await page(`/s/${open}/d/${article.id}`, { ua: TELEGRAM });
  assert.equal(decode(meta(item.html, 'og:title')), 'Первый день');
  const text = decode(meta(item.html, 'og:description'));
  assert.ok(text.startsWith('В первый день вы получаете пропуск, ноутбук и'), text);
  assert.ok(!/<script|доступы/.test(text));
  assert.equal(meta(item.html, 'og:url'), `https://portal.test/s/${open}/d/${article.id}`);

  const lockedPage = await page(`/s/${locked}`, { ua: WHATSAPP });
  assert.equal(decode(meta(lockedPage.html, 'og:title')), '🔒 Доступ по паролю');
  assert.ok(!lockedPage.html.includes('Онбординг'));
  const unknown = await page(`/s/no-such-share-${stamp}`, { ua: WHATSAPP });
  assert.equal(decode(meta(unknown.html, 'og:title')), 'Ссылка недействительна или истекла');

  const views = async () => (await db.query(`SELECT view_count FROM kb_shares WHERE slug = $1`, [open])).rows[0].view_count;
  const before = await views();
  await fetch(`${base}/api/s/${open}`, { headers: { 'User-Agent': 'Slackbot-LinkExpanding 1.0' } });
  await fetch(`${base}/api/s/${open}`, { method: 'HEAD', headers: { 'User-Agent': CHROME } });
  assert.equal(await views(), before);
});

// ── Drive ───────────────────────────────────────────────────────────────────

test('drive links: facts from the file server for crawlers, generic cards otherwise', { skip: skipDrive, timeout: 120000 }, async () => {
  const share = (...parts) => join(work, 'Data', ...parts);
  mkdirSync(share('Clients', 'Acme', 'Inside'), { recursive: true });
  writeFileSync(share('Clients', 'Acme', 'plan.pdf'), Buffer.alloc(150 * 1024, 0x20));
  writeFileSync(share('Clients', 'Acme', 'b.txt'), 'b');
  writeFileSync(share('Clients', 'Acme', '.hidden'), 'h');

  const { seal } = await import('../services/crypto.js');
  const links = await import('../modules/drive/links.js');
  const name = `lp${Date.now().toString(36)}`;
  const userId = (await db.query(`INSERT INTO users (username, email, password_hash, role, display_name) VALUES ($1, $2, '!', 'user', 'Анна Смирнова') RETURNING id`, [name, `${name}@test.invalid`])).rows[0].id;
  cleanup.users.push(userId);
  const serverId = (
    await db.query(`INSERT INTO drive_servers (name, host, auth, use_login, service_user, service_secret) VALUES ('Mock', 'mock.invalid', 'service', FALSE, 'svc', $1) RETURNING id`, [seal('pw1')])
  ).rows[0].id;
  cleanup.servers.push(serverId);
  const shareId = (await db.query(`INSERT INTO drive_shares (server_id, title, share, allow_links) VALUES ($1, 'Data', 'Data', TRUE) RETURNING id`, [serverId])).rows[0].id;
  const ctx = { userId, groupIds: new Set(), isAdmin: false };

  const fileLink = await links.createLink(ctx, shareId, 'Clients/Acme/plan.pdf', { permissions: ['view', 'download'] });
  const folderLink = await links.createLink(ctx, shareId, 'Clients/Acme', { permissions: ['view', 'download'], note: 'Финальная версия' });
  const dropLink = await links.createLink(ctx, shareId, 'Clients/Acme', { permissions: ['upload'], title: 'Сканы паспортов' });
  const lockedLink = await links.createLink(ctx, shareId, 'Clients/Acme/plan.pdf', { permissions: ['view'], password: 'secret-pass' });
  const employees = await links.createLink(ctx, shareId, 'Clients/Acme/plan.pdf', { permissions: ['view'], audience: 'employees' });
  const revoked = await links.createLink(ctx, shareId, 'Clients/Acme/plan.pdf', { permissions: ['view'] });
  await db.query(`UPDATE drive_links SET revoked_at = NOW() WHERE id = $1`, [revoked.id]);
  mods.preview.clearPreviewMemo();

  const file = await page(`/d/${fileLink.token}`, { ua: WHATSAPP });
  assert.equal(decode(meta(file.html, 'og:title')), 'plan.pdf');
  assert.match(decode(meta(file.html, 'og:description')), /^PDF · 150 КБ · Можно скачать · Отправитель: Анна Смирнова$/);
  assert.match(file.headers.get('vary') || '', /User-Agent/);
  // People get the page at once: no file-server facts (the size is left out).
  mods.preview.clearPreviewMemo();
  const person = await page(`/d/${fileLink.token}`, { ua: CHROME });
  assert.match(decode(meta(person.html, 'og:description')), /^PDF · Можно скачать/);

  const folder = await page(`/d/${folderLink.token}`, { ua: TELEGRAM });
  assert.equal(decode(meta(folder.html, 'og:title')), 'Acme');
  assert.match(decode(meta(folder.html, 'og:description')), /^Финальная версия · Папка · 2 файла, 1 папка · Можно скачать/);
  const image = meta(folder.html, 'og:image');
  if (image) {
    const url = new URL(decode(image));
    const res = await fetch(`${base}${url.pathname}${url.search}`, { headers: { 'User-Agent': TELEGRAM } });
    assert.equal(res.status, 200);
    const png = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(pngSize(png), { width: 1200, height: 630 });
    assert.ok(png.length < 300 * 1024);
  }

  const drop = await page(`/d/${dropLink.token}`, { ua: WHATSAPP });
  assert.equal(decode(meta(drop.html, 'og:title')), 'Сканы паспортов');
  assert.match(decode(meta(drop.html, 'og:description')), /Отправьте файлы — их получит Анна Смирнова/);
  assert.ok(!/plan|b\.txt|файла/.test(decode(meta(drop.html, 'og:description'))));

  const locked = await page(`/d/${lockedLink.token}`, { ua: WHATSAPP });
  assert.equal(decode(meta(locked.html, 'og:title')), '🔒 Доступ по паролю');
  assert.ok(!locked.html.includes('plan'));
  assert.equal(decode(meta((await page(`/d/${employees.token}`, { ua: WHATSAPP })).html, 'og:title')), 'Ссылка для сотрудников');
  for (const token of [revoked.token, 'NoSuchDriveLink']) {
    const res = await page(`/d/${token}`, { ua: WHATSAPP });
    assert.equal(decode(meta(res.html, 'og:title')), 'Ссылка недействительна или истекла');
    assert.ok(!res.html.includes('plan'));
  }

  const views = async () => (await db.query(`SELECT view_count FROM drive_links WHERE id = $1`, [fileLink.id])).rows[0].view_count;
  const before = await views();
  await fetch(`${base}/api/d/${fileLink.token}`, { headers: { 'User-Agent': WHATSAPP } });
  await fetch(`${base}/api/d/${fileLink.token}`, { method: 'HEAD', headers: { 'User-Agent': CHROME } });
  assert.equal(await views(), before);
  await fetch(`${base}/api/d/${fileLink.token}`, { headers: { 'User-Agent': CHROME } });
  assert.equal(await views(), before + 1);
});
