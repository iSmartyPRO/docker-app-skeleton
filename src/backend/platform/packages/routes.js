import { Router } from 'express';
import multer from 'multer';
import { APP_VERSION } from '../../config/version.js';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { hasPermission } from '../../services/permissions.js';
import { PACKAGE_LIMITS, PackageError } from './archive.js';
import { backupNow, installStaged, purgeModuleData, stagePackage, uninstallPackage } from './installer.js';
import { packageStates, shellPackages } from './loader.js';
import { listBackups } from './backup.js';
import { IncomingError, listIncoming, readIncoming } from './incoming.js';
import { devMode } from './paths.js';
import { inventory } from './inventory.js';
import { BOOT_ID, restartPending } from './restart.js';

/*
 * HTTP side of module packages (mounted under /api by modules/index.js):
 *
 *   GET    /modules/installed                       packages for the browser shell (signed in; anonymous: bootId only)
 *   GET    /admin/modules/packages                  rows of installed_modules + backups (settings admins)
 *   POST   /admin/modules/packages/upload           multipart `file` → { token, preview, problems }   (superadmin)
 *   GET    /admin/modules/incoming                  zips in $MODULES_DIR/incoming («Пакеты на сервере»)  (superadmin)
 *   POST   /admin/modules/incoming/stage            { file } → same as upload: { token, preview, problems } (superadmin)
 *   POST   /admin/modules/packages/install          { token } → install / update, then restart       (superadmin)
 *   DELETE /admin/modules/packages/:id              remove the code (data kept), then restart         (superadmin)
 *   POST   /admin/modules/packages/:id/backup       back up the module's tables now                   (superadmin)
 *   POST   /admin/modules/packages/:id/purge        { confirm: id } backup (tables + uploads/<id>), then drop its data and files (superadmin)
 *   GET    /admin/modules/inventory[?challenge=…]   installed modules, core version, portal id (store, spec §6.6); the challenge is signed with it
 *
 * Refusals answer { success: false, code, error, problems: [{ code, params, message: { ru, en } }] }.
 */

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PACKAGE_LIMITS.maxUploadBytes, files: 1, fields: 5 } });

const isSuperadmin = (req) => Boolean(req.access?.permissions && hasPermission(req.access.permissions, '*')) || Boolean(req.actor?.permissions?.has?.('*'));

const refuse = (res, status, code, ru, en) => res.status(status).json({ success: false, code, error: en, problems: [{ code, params: {}, message: { ru, en } }] });

/** Installing, updating and removing modules: a superadministrator in their own session (not a token, not «sign in as»). */
function superadminOnly(req, res, next) {
  if (!isSuperadmin(req)) return refuse(res, 403, 'SUPERADMIN_ONLY', 'Это может только суперадминистратор', 'Only a superadministrator can do this');
  if (req.apiToken && req.method !== 'GET') return refuse(res, 403, 'SESSION_REQUIRED', 'Модули устанавливаются из консоли', 'Modules are managed from the console');
  if (req.auth?.imp && req.method !== 'GET') return refuse(res, 403, 'IMPERSONATION_LIMIT', 'Недоступно в режиме «войти как»', 'Not available while signed in as another user');
  return next();
}

function settingsAdmins(req, res, next) {
  const permissions = req.access?.permissions;
  if (isSuperadmin(req) || (permissions && ['settings.view', 'settings.modules', 'console.access'].some((item) => hasPermission(permissions, item)))) return next();
  return refuse(res, 403, 'FORBIDDEN', 'Нет доступа', 'You do not have permission for this action');
}

const wrap = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    if (err instanceof IncomingError) return res.status(err.statusCode).json({ success: false, code: err.code, error: err.message, problems: err.problems });
    if (err instanceof PackageError) return res.status(422).json({ success: false, code: 'BAD_PACKAGE', error: err.problem.message.en, problems: [{ code: err.problem.code, params: {}, message: err.problem.message }] });
    if (Array.isArray(err.problems)) return res.status(err.statusCode || 409).json({ success: false, code: err.code, error: err.message, problems: err.problems });
    console.error(`[module packages] ${req.method} ${req.originalUrl}:`, err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', error: 'A server error occurred. Try again later.', detail: String(err.message || '').slice(0, 300) });
  }
};

const who = (req) => req.user?.username || req.userRow?.username || null;

export function packageRoutes() {
  const router = Router();

  // Anonymous visitors (the sign-in page) get the boot id only: which modules run is not public. On a public page
  // of a package (`?path=/d/<token>`, manifest web.publicPaths) they get that one package, when it is on.
  router.get('/modules/installed', optionalAuth, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const signedIn = Boolean(req.userRow && req.userRow.is_active !== false && req.userRow.is_blocked !== true);
    const path = typeof req.query.path === 'string' ? req.query.path.slice(0, 300) : '';
    res.json({ success: true, ...(await shellPackages({ signedIn, path })), restarting: Boolean(restartPending()) });
  }));

  const admin = Router();
  admin.use(requireAuth);
  admin.get('/packages', settingsAdmins, wrap(async (req, res) => {
    const packages = await packageStates();
    res.json({
      success: true,
      restartPending: Boolean(restartPending()),
      packages: packages.map((item) => (item.source === 'package' ? { ...item, backups: listBackups(item.id).slice(0, 5).map(({ file, format, createdAt, reason, bytes, version }) => ({ file: file.split('/').pop(), format, createdAt, reason, bytes, version })) } : item)),
      canManage: isSuperadmin(req),
      devMode: devMode(),
      maxUploadMb: Math.round(PACKAGE_LIMITS.maxUploadBytes / 1024 / 1024),
      coreVersion: APP_VERSION,
      bootId: BOOT_ID,
    });
  }));
  admin.post('/packages/upload', superadminOnly, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return refuse(res, 413, 'FILE_TOO_LARGE', `Файл больше ${PACKAGE_LIMITS.maxUploadBytes / 1024 / 1024} МБ`, `The file is larger than ${PACKAGE_LIMITS.maxUploadBytes / 1024 / 1024} MB`);
      return refuse(res, 400, 'BAD_UPLOAD', 'Не удалось принять файл', 'The file could not be received');
    });
  }, wrap(async (req, res) => {
    if (!req.file?.buffer) return refuse(res, 400, 'NO_FILE', 'Выберите zip-файл модуля', 'Choose the module zip file');
    const staged = await stagePackage(req.file.buffer, { actor: who(req), ip: req.ip });
    return res.json({ success: true, ...staged });
  }));
  // «Пакеты на сервере»: files the host operator put into incoming/ — staged exactly like an upload.
  admin.get('/incoming', superadminOnly, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, files: listIncoming(), maxUploadMb: Math.round(PACKAGE_LIMITS.maxUploadBytes / 1024 / 1024) });
  }));
  admin.post('/incoming/stage', superadminOnly, wrap(async (req, res) => {
    const file = req.body?.file;
    const { buffer, sha256 } = readIncoming(file);
    const staged = await stagePackage(buffer, { actor: who(req), ip: req.ip, incoming: { file, sha256 } });
    return res.json({ success: true, ...staged, file });
  }));
  admin.post('/packages/install', superadminOnly, wrap(async (req, res) => {
    const result = await installStaged(req.body?.token, { actor: who(req), ip: req.ip });
    res.json({ success: true, ...result });
  }));
  admin.delete('/packages/:id', superadminOnly, wrap(async (req, res) => {
    res.json({ success: true, ...(await uninstallPackage(req.params.id, { actor: who(req), ip: req.ip })) });
  }));
  admin.post('/packages/:id/backup', superadminOnly, wrap(async (req, res) => {
    const backup = await backupNow(req.params.id, { actor: who(req), ip: req.ip });
    res.json({ success: true, backup: { file: backup.file.split('/').pop(), format: backup.format, bytes: backup.bytes, tables: backup.tables, createdAt: backup.createdAt } });
  }));
  admin.post('/packages/:id/purge', superadminOnly, wrap(async (req, res) => {
    const result = await purgeModuleData(req.params.id, { actor: who(req), ip: req.ip, confirm: req.body?.confirm });
    const uploads = result.backup.uploads;
    res.json({
      success: true,
      id: result.id,
      tables: result.tables,
      files: result.files,
      backup: { file: result.backup.file.split('/').pop(), format: result.backup.format, bytes: result.backup.bytes, uploads: uploads ? { file: uploads.file.split('/').pop(), files: uploads.files, bytes: uploads.bytes } : null },
    });
  }));
  admin.get('/inventory', settingsAdmins, wrap(async (req, res) => {
    const challenge = typeof req.query.challenge === 'string' && req.query.challenge ? req.query.challenge : null;
    res.json({ success: true, inventory: await inventory({ challenge }) });
  }));
  router.use('/admin/modules', admin);
  return router;
}
