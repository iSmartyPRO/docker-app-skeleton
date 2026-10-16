import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requestRegional } from '../../../services/regional.js';
import { httpError, intId, wrap } from '../../shared/acl.js';
import { savePassword } from './credentials.js';
import { invalidateGroups } from './directory.js';
import { exportJournal, journalPeople, listJournal, securityEvent } from './journal.js';
import { mountNtfs } from './ntfsRoutes.js';
import { accessFromRequest, journalScope, requireRole, requireWrite } from './policy.js';
import {
  accessSettings,
  adConfig,
  changeMembers,
  copyAccess,
  createGroupPair,
  deleteGroupChange,
  describeGroupChange,
  findPeople,
  folderAt,
  folderCard,
  listFolders,
  moveMembers,
  overview,
  personCard,
  revokeAll,
  undoChange,
} from './service.js';

// Checking a domain password: a few attempts, never a brute-force channel. Each wrong one is a
// real bad-password bind in AD; with a lockout threshold of 5 and the person's own Windows
// logons on top, more than 3 per 15 minutes could lock the account.
export const PASSWORD_ATTEMPTS = { windowMs: 15 * 60 * 1000, max: 3 };

const passwordLimiter = rateLimit({
  ...PASSWORD_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `drive-access-pass:${req.user?.id || req.ip}`,
  handler: (req, res) => res.status(429).json({ success: false, error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' }),
});

// 5xx errors of this section that are outages, not bugs (shown with their own text, no incident).
export const OUTAGE_CODES = new Set(['FA_AD_UNAVAILABLE', 'FA_AD_ERROR', 'FA_JOURNAL_FAILED', 'GATEWAY_DOWN']);

/**
 * /api/app/drive/access — the File server's «Доступ» (docs/drive-access.md): signed-in users with
 * `*` or drive.access, while the File server module and its access block are both on.
 */
export function accessRoutes({ isEnabled = async () => (await accessSettings()).enabled } = {}) {
  const router = Router();

  // API tokens never reach this section; everyone else gets their role (or none).
  router.use(async (req, res, next) => {
    try {
      if (req.apiToken) {
        res.status(403).json({ success: false, error: 'Not available with an API token', code: 'FA_NO_TOKENS' });
        return;
      }
      // The block is off: invisible, like a disabled module.
      if (!(await isEnabled())) {
        res.status(404).json({ success: false, error: 'Access management is turned off', code: 'DRIVE_ACCESS_DISABLED' });
        return;
      }
      req.fa = accessFromRequest(req);
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get('/', wrap(async (req, res) => {
    res.json({ success: true, ...(await overview(req, req.fa)) });
  }));

  router.use((req, res, next) => {
    try {
      requireRole(req.fa);
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get('/folders', wrap(async (req, res) => {
    const refresh = req.query.refresh === '1';
    if (refresh) invalidateGroups();
    res.json({ success: true, folders: await listFolders(req.fa, { refresh, q: req.query.q }) });
  }));

  router.get('/folders/:key', wrap(async (req, res) => {
    res.json({ success: true, ...(await folderCard(req.fa, String(req.params.key).slice(0, 1000))) });
  }));

  // The «Доступ» panel of a File server folder: its group pairs with members, inherited ones above.
  router.get('/at', wrap(async (req, res) => {
    res.json({ success: true, ...(await folderAt(req.fa, { shareId: intId(req.query.shareId), path: String(req.query.path || '').slice(0, 2000) })) });
  }));

  router.get('/people', wrap(async (req, res) => {
    res.json({ success: true, people: await findPeople(req.fa, req.query.q, req.query.kind) });
  }));

  router.get('/person', wrap(async (req, res) => {
    const dn = String(req.query.dn || '').slice(0, 2000);
    if (!dn) throw httpError(400, 'dn is required', 'FA_DN');
    res.json({ success: true, ...(await personCard(req.fa, dn)) });
  }));

  // The acting administrator's domain password (checked by a bind as their own DN).
  router.put('/password', passwordLimiter, wrap(async (req, res) => {
    requireWrite(req.fa);
    try {
      const { login } = await savePassword(await adConfig(), req.user.id, req.body?.password);
      securityEvent(req, 'folder_access_password', `saved for ${login}`);
      res.json({ success: true, login });
    } catch (err) {
      if (err.code === 'FA_PASSWORD_WRONG') securityEvent(req, 'folder_access_password', `rejected (${err.details?.reason || 'AUTH_FAILED'})`, 'warning');
      throw err;
    }
  }));

  router.post('/members', wrap(async (req, res) => {
    res.json({ success: true, ...(await changeMembers(req, req.fa, { groupDn: req.body?.groupDn, members: req.body?.members, action: req.body?.action })) });
  }));

  router.post('/members/move', wrap(async (req, res) => {
    res.json({ success: true, ...(await moveMembers(req, req.fa, { fromDn: req.body?.fromDn, toDn: req.body?.toDn, members: req.body?.members })) });
  }));

  router.post('/members/copy', wrap(async (req, res) => {
    res.json({ success: true, ...(await copyAccess(req, req.fa, { fromDn: req.body?.fromDn, toDn: req.body?.toDn })) });
  }));

  router.post('/members/revoke-all', wrap(async (req, res) => {
    res.json({ success: true, ...(await revokeAll(req, req.fa, { memberDn: req.body?.memberDn, confirm: req.body?.confirm })) });
  }));

  // Superadministrators: group pairs, descriptions, deletion.
  router.post('/groups', wrap(async (req, res) => {
    res.status(201).json({ success: true, ...(await createGroupPair(req, req.fa, { name: req.body?.name, path: req.body?.path, project: req.body?.project, ou: req.body?.ou })) });
  }));

  router.put('/groups/description', wrap(async (req, res) => {
    res.json({ success: true, ...(await describeGroupChange(req, req.fa, { dn: req.body?.dn, description: req.body?.description })) });
  }));

  router.post('/groups/delete', wrap(async (req, res) => {
    res.json({ success: true, ...(await deleteGroupChange(req, req.fa, { dn: req.body?.dn, confirm: req.body?.confirm })) });
  }));

  // NTFS mode (superadministrators): ntfsRoutes.js.
  mountNtfs(router);

  // Journal: system administrators see membership changes, superadministrators everything.
  // System administrators also only see rows of the groups they see (policy.journalScope).
  const journalInput = (req) => ({ ...req.query, viewer: req.user.id });
  const scopeOf = async (req) => journalScope(req.fa.role, await accessSettings());
  router.get('/journal', wrap(async (req, res) => {
    res.json({ success: true, ...(await listJournal(journalInput(req), await scopeOf(req))), viewer: req.user.id });
  }));
  router.get('/journal/people', wrap(async (req, res) => {
    res.json({ success: true, people: await journalPeople(await scopeOf(req)) });
  }));
  router.get('/journal/export.csv', wrap(async (req, res) => {
    await exportJournal(res, journalInput(req), await scopeOf(req), (await requestRegional(req)).timeZone);
  }));
  // `confirm: true` undoes a change even when a later change touched the same person and group.
  router.post('/journal/:id/undo', wrap(async (req, res) => {
    res.json({ success: true, ...(await undoChange(req, req.fa, intId(req.params.id), { confirm: req.body?.confirm === true })) });
  }));

  // Expected outages (AD / gateway down, journal down) keep their code, so the page says what is wrong
  // in the person's language; the shared handler would turn any 5xx into a generic "server error".
  router.use((err, req, res, next) => {
    const status = Number(err?.statusCode || err?.status) || 500;
    if (status < 500 || !OUTAGE_CODES.has(err?.code)) return next(err);
    console.warn(`Drive access: ${req.method} ${req.originalUrl}: ${err.code} ${err.message}`);
    res.status(status).json({ success: false, error: err.message, code: err.code });
  });

  return router;
}
