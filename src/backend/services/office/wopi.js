import { randomBytes } from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getSettings, parseSettings } from '../settings.js';
import { getSessionUser, toPublicUser } from '../users.js';
import { getSession, sessionState } from '../sessions.js';
import { editingFrom } from './config.js';
import { LOCK_MAX, currentLock, firstSaveOf, refreshLock, relock, releaseLock, takeLock } from './locks.js';
import { maskToken, verifyWopiToken } from './tokens.js';

/*
 * WOPI host: the endpoints the Collabora server calls, server to server,
 * with ?access_token=… (never a cookie):
 *
 *   GET  /api/wopi/files/:fileId             CheckFileInfo
 *   GET  /api/wopi/files/:fileId/contents    GetFile
 *   POST /api/wopi/files/:fileId/contents    PutFile
 *   POST /api/wopi/files/:fileId             Lock, GetLock, RefreshLock, Unlock,
 *                                            UnlockAndRelock (X-WOPI-Override);
 *                                            PutRelativeFile/RenameFile → 501
 *   GET  /api/wopi/ping                      "this is the portal" (settings check)
 *
 * File ids name a provider: "files-<node id>" (modules/files/office.js) or
 * "drive-<opaque id>" (modules/drive/office.js). Every call verifies the token,
 * then the portal session it came from (active, same token version), the
 * person (active, not blocked), the module and the editor (enabled), and the
 * person's current access to the file. Anything missing answers 401, so a
 * withdrawn share or a sign-out ends editing at once.
 */

const providers = new Map();

/**
 * Registers a provider: { prefix, module, resolve(claims, who), read(handle, req, res),
 * write(handle, req, info) }. See modules/files/office.js for the contract.
 */
export function registerProvider(provider) {
  providers.set(provider.prefix, provider);
}

export function providerOf(fileId) {
  const match = /^([a-z]+)-([A-Za-z0-9_-]{1,64})$/.exec(String(fileId || ''));
  if (!match) return null;
  const provider = providers.get(match[1]);
  return provider ? { provider, localId: match[2] } : null;
}

// One random id per process: the settings check finds out whether wopiBaseUrl reaches this portal.
export const INSTANCE = randomBytes(8).toString('hex');

function wopiError(status, code, message) {
  const error = new Error(message || code);
  error.statusCode = status;
  error.code = code;
  return error;
}

const unauthorized = (reason) => wopiError(401, 'WOPI_UNAUTHORIZED', reason);

function tokenOf(req) {
  if (req.query?.access_token) return String(req.query.access_token);
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
  return bearer ? bearer[1] : '';
}

/** Who is calling: the verified claims, the person and their access. Throws 401. */
export async function authorize(req, fileId) {
  let claims;
  try {
    claims = verifyWopiToken(tokenOf(req), fileId);
  } catch (err) {
    throw unauthorized(`token: ${err.message}`);
  }
  const found = providerOf(fileId);
  if (!found) throw wopiError(404, 'WOPI_NOT_FOUND', 'Unknown file');
  const parsed = parseSettings(await getSettings());
  const editing = editingFrom(parsed);
  if (!editing.enabled) throw unauthorized('editing is disabled');
  if (!parsed.modules?.[found.provider.module]?.enabled) throw unauthorized('module is disabled');
  const session = await getSessionUser(Number(claims.sub));
  if (!session) throw unauthorized('no such user');
  const { row, access } = session;
  if (row.is_active === false || row.is_blocked === true) throw unauthorized('account disabled');
  if (Number(claims.tv || 0) !== Number(row.token_version || 0)) throw unauthorized('token version changed');
  const portalSession = await getSession(claims.sid);
  if (!portalSession || sessionState(portalSession) !== 'active' || Number(portalSession.user_id) !== Number(row.id)) throw unauthorized('portal session ended');
  const who = { claims, row, access, user: toPublicUser(row, access), editing };
  const handle = await found.provider.resolve(found.localId, who);
  if (!handle || !handle.canRead) throw unauthorized('no access to the file');
  return { ...who, provider: found.provider, handle, canWrite: claims.perm === 'edit' && Boolean(handle.canWrite) };
}

function setLockHeader(res, value, reason) {
  res.setHeader('X-WOPI-Lock', value || '');
  if (reason) res.setHeader('X-WOPI-LockFailureReason', reason);
}

function conflict(res, current, reason) {
  // Header values must stay ASCII: no person's name here (it may be Cyrillic).
  setLockHeader(res, current?.lock_value || '', reason || (current ? 'Locked by another editing session' : 'Not locked'));
  res.status(409).end();
}

function lockValueOf(req) {
  const value = String(req.get('x-wopi-lock') || '');
  if (!value || value.length > LOCK_MAX) return null;
  return value;
}

/** WOPI time format: ISO 8601 UTC with milliseconds. */
export function wopiTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

export function checkFileInfo(ctx) {
  const { handle, row, claims, canWrite } = ctx;
  return {
    BaseFileName: handle.name,
    Size: Number(handle.size) || 0,
    Version: String(handle.version),
    OwnerId: String(handle.ownerId ?? 'portal'),
    UserId: String(row.id),
    UserFriendlyName: row.display_name || row.username,
    UserExtraInfo: ctx.user?.avatarUrl ? { avatar: ctx.user.avatarUrl } : {},
    LastModifiedTime: wopiTime(handle.lastModified),
    UserCanWrite: canWrite,
    ReadOnly: !canWrite,
    UserCanNotWriteRelative: true,
    UserCanRename: false,
    SupportsRename: false,
    SupportsLocks: true,
    SupportsGetLock: true,
    SupportsExtendedLockLength: true,
    SupportsUpdate: true,
    SupportsDeleteFile: false,
    PostMessageOrigin: claims.o || undefined,
    HidePrintOption: false,
    HideSaveOption: false,
    HideExportOption: false,
    DisablePrint: false,
    DisableExport: false,
    DisableCopy: false,
    EnableOwnerTermination: false,
    EnableInsertRemoteImage: false,
    EnableShare: false,
    IsAnonymousUser: false,
    ...(handle.breadcrumb ? { BreadcrumbFolderName: handle.breadcrumb } : {}),
  };
}

function log(req, ctx, op, extra = '') {
  const user = ctx?.row ? `user=${ctx.row.id}` : '';
  console.log(`[wopi] ${op} ${req.params.fileId} ${user} ${extra}`.trim());
}

const wopiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `wopi:${req.ip}`,
  handler: (req, res) => res.status(429).end(),
});

const wrap = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error(`[wopi] ${req.method} ${req.params.fileId || ''} failed:`, err.message);
    else if (status === 401) console.warn(`[wopi] 401 ${req.method} ${req.params.fileId || ''}: ${err.message}`);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (status === 409 && err.coolStatus) {
      res.status(409).json({ COOLStatusCode: err.coolStatus, LOOLStatusCode: err.coolStatus });
      return;
    }
    // WOPI clients only look at the status; no details (and never the token) go back.
    res.status(status >= 400 && status < 600 ? status : 500).end();
  }
};

export function wopiRoutes() {
  const router = Router();
  // Tokens never reach a log line: every logger reads originalUrl after this.
  router.use((req, res, next) => {
    req.originalUrl = maskToken(req.originalUrl);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.use(wopiLimiter);

  router.get('/ping', (req, res) => res.json({ wopi: 'portal', instance: INSTANCE }));

  // CheckFileInfo
  router.get('/files/:fileId', wrap(async (req, res) => {
    const ctx = await authorize(req, req.params.fileId);
    res.json(checkFileInfo(ctx));
  }));

  // GetFile
  router.get('/files/:fileId/contents', wrap(async (req, res) => {
    const ctx = await authorize(req, req.params.fileId);
    res.setHeader('X-WOPI-ItemVersion', String(ctx.handle.version));
    log(req, ctx, 'GetFile');
    await ctx.provider.read(ctx.handle, req, res, ctx);
  }));

  // PutFile
  router.post('/files/:fileId/contents', wrap(async (req, res) => {
    const ctx = await authorize(req, req.params.fileId);
    if (!ctx.canWrite) throw unauthorized('read-only token or no edit access');
    const { handle } = ctx;
    const lockValue = String(req.get('x-wopi-lock') || '');
    const current = await currentLock(handle.lockKey);
    if (current && current.lock_value !== lockValue) {
      req.resume();
      conflict(res, current, 'Lock mismatch');
      return;
    }
    // Changed elsewhere since Collabora loaded it (another program, another portal path).
    const seen = req.get('x-cool-wopi-timestamp') || req.get('x-lool-wopi-timestamp');
    if (seen && wopiTime(seen) !== wopiTime(handle.lastModified)) {
      req.resume();
      log(req, ctx, 'PutFile', 'conflict=changed-elsewhere');
      const error = wopiError(409, 'WOPI_CHANGED');
      error.coolStatus = 1010;
      throw error;
    }
    const flag = (name) => String(req.get(`x-cool-wopi-${name}`) || req.get(`x-lool-wopi-${name}`) || '').toLowerCase() === 'true';
    const info = {
      exitSave: flag('isexitsave'),
      autosave: flag('isautosave'),
      modifiedByUser: flag('ismodifiedbyuser'),
      firstSave: current ? await firstSaveOf(handle.lockKey, lockValue) : true,
      lockValue: current ? lockValue : null,
    };
    const saved = await ctx.provider.write(handle, req, info, ctx);
    log(req, ctx, 'PutFile', `bytes=${saved.size ?? '?'} first=${info.firstSave} exit=${info.exitSave} autosave=${info.autosave}`);
    res.setHeader('X-WOPI-ItemVersion', String(saved.version ?? ''));
    res.json({ LastModifiedTime: wopiTime(saved.lastModified) });
  }));

  // Locks and the operations WOPI multiplexes on POST /files/:id
  router.post('/files/:fileId', wrap(async (req, res) => {
    const override = String(req.get('x-wopi-override') || '').toUpperCase();
    const ctx = await authorize(req, req.params.fileId);
    const { handle } = ctx;
    const who = { fileId: req.params.fileId, userId: ctx.row.id, userName: ctx.row.display_name || ctx.row.username };
    if (override === 'GET_LOCK') {
      const current = await currentLock(handle.lockKey);
      setLockHeader(res, current?.lock_value || '');
      res.status(200).end();
      return;
    }
    if (['PUT_RELATIVE', 'RENAME_FILE', 'DELETE', 'PUT_USER_INFO'].includes(override)) {
      // Not offered (UserCanNotWriteRelative, SupportsRename: false…); user info is not stored.
      res.status(override === 'PUT_USER_INFO' ? 200 : 501).end();
      return;
    }
    if (!['LOCK', 'REFRESH_LOCK', 'UNLOCK'].includes(override)) {
      res.status(501).end();
      return;
    }
    if (!ctx.canWrite) throw unauthorized('read-only token or no edit access');
    const value = lockValueOf(req);
    if (!value) {
      res.status(400).end();
      return;
    }
    let result;
    if (override === 'LOCK') {
      const old = String(req.get('x-wopi-oldlock') || '');
      result = old ? await relock(handle.lockKey, old, value) : await takeLock(handle.lockKey, value, who);
    } else if (override === 'REFRESH_LOCK') {
      result = await refreshLock(handle.lockKey, value);
    } else {
      result = await releaseLock(handle.lockKey, value);
    }
    if (!result.ok) {
      log(req, ctx, override, 'conflict');
      conflict(res, result.current);
      return;
    }
    if (override !== 'REFRESH_LOCK') log(req, ctx, override);
    res.setHeader('X-WOPI-ItemVersion', String(handle.version));
    res.status(200).end();
  }));

  router.use((req, res) => res.status(404).end());
  return router;
}
