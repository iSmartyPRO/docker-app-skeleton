import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { wrap } from '../shared/acl.js';
import { PASSWORD_ATTEMPTS } from '../shared/passwordAttempts.js';
import {
  browse,
  bulk,
  checkLogin,
  checkSecureChannel,
  createPortalUser,
  createUserAccount,
  findEmployees,
  findGroups,
  findObjects,
  linkEmployee,
  linkPortalUser,
  listJournal,
  listObjects,
  membership,
  objectCard,
  overview,
  resetPassword,
  saveCredential,
  suggestLogin,
  tree,
  unlinkEmployee,
  unlinkPortalUser,
  unlock,
  updateAttributes,
} from './service.js';

// The administrator's own domain password: a few checks, never a brute-force channel
// (each wrong one is a real bad-password bind in AD).
const credentialLimiter = rateLimit({
  ...PASSWORD_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ad-credential:${req.user?.id || req.ip}`,
  handler: (req, res) => res.status(429).json({ success: false, error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' }),
});

// 5xx answers that are outages of the directory, not bugs: passed on with their code.
const OUTAGES = new Set(['AD_UNAVAILABLE', 'AD_ERROR', 'FA_AD_UNAVAILABLE', 'FA_AD_ERROR', 'FA_STARTTLS_FAILED']);

const dnOf = (value) => String(value || '').slice(0, 2048);

/** /api/app/directory — the AD directory module (docs/directory.md). API tokens never reach it. */
export function directoryRoutes() {
  const router = Router();
  router.use((req, res, next) => {
    if (req.apiToken) {
      res.status(403).json({ success: false, error: 'Not available with an API token', code: 'AD_NO_TOKENS' });
      return;
    }
    next();
  });

  router.get('/', wrap(async (req, res) => res.json({ success: true, ...(await overview(req)) })));
  router.get('/tree', wrap(async (req, res) => res.json({ success: true, ...(await tree(req, req.query.dn ? dnOf(req.query.dn) : null)) })));
  router.get('/objects', wrap(async (req, res) => res.json({ success: true, ...(await listObjects(req, req.query || {})) })));
  router.get('/object', wrap(async (req, res) => res.json({ success: true, ...(await objectCard(req, dnOf(req.query.dn))) })));
  router.get('/groups', wrap(async (req, res) => res.json({ success: true, groups: await findGroups(req, req.query.q) })));
  router.get('/find', wrap(async (req, res) => res.json({ success: true, objects: await findObjects(req, req.query.q, req.query.kinds) })));
  router.get('/login', wrap(async (req, res) => res.json({ success: true, ...(await suggestLogin(req, { first: req.query.first, last: req.query.last, middle: req.query.middle })) })));
  router.get('/login/check', wrap(async (req, res) => res.json({ success: true, ...(await checkLogin(req, { login: req.query.login, upn: req.query.upn })) })));
  router.get('/journal', wrap(async (req, res) => res.json({ success: true, ...(await listJournal(req, req.query || {})) })));
  router.get('/browse', wrap(async (req, res) => res.json({ success: true, ...(await browse(req, req.query.dn ? dnOf(req.query.dn) : null)) })));
  router.get('/employees', wrap(async (req, res) => res.json({ success: true, employees: await findEmployees(req, req.query.q) })));

  // Changes: each runs as the caller's own AD account (or on the demo directory) and is journalled.
  router.post('/users', wrap(async (req, res) => res.status(201).json({ success: true, ...(await createUserAccount(req, req.body || {})) })));
  router.put('/object/attributes', wrap(async (req, res) => res.json({ success: true, ...(await updateAttributes(req, { dn: dnOf(req.body?.dn), changes: req.body?.changes })) })));
  router.post('/bulk', wrap(async (req, res) => res.json({ success: true, ...(await bulk(req, { action: req.body?.action, dns: req.body?.dns, targetOu: req.body?.targetOu, dryRun: req.body?.dryRun === true })) })));
  router.post('/unlock', wrap(async (req, res) => res.json({ success: true, ...(await unlock(req, { dn: dnOf(req.body?.dn) })) })));
  router.post('/password', wrap(async (req, res) => {
    const body = req.body || {};
    res.json({ success: true, ...(await resetPassword(req, { dn: dnOf(body.dn), password: body.password, mustChange: body.mustChange !== false, unlock: body.unlock !== false })) });
  }));
  router.post('/members', wrap(async (req, res) => res.json({ success: true, ...(await membership(req, { groups: req.body?.groups, members: req.body?.members, action: req.body?.action })) })));
  router.put('/credential', credentialLimiter, wrap(async (req, res) => res.json({ success: true, ...(await saveCredential(req, req.body?.password)) })));
  router.post('/secure-check', wrap(async (req, res) => res.json({ success: true, ...(await checkSecureChannel(req)) })));

  // Links: portal accounts (users.manage) and employee cards (employees.hr).
  router.post('/portal-user', wrap(async (req, res) => res.status(201).json({ success: true, ...(await createPortalUser(req, { dn: dnOf(req.body?.dn), username: req.body?.username })) })));
  router.post('/portal-link', wrap(async (req, res) => res.json({ success: true, ...(await linkPortalUser(req, { dn: dnOf(req.body?.dn), userId: req.body?.userId })) })));
  router.post('/portal-unlink', wrap(async (req, res) => res.json({ success: true, ...(await unlinkPortalUser(req, { dn: dnOf(req.body?.dn) })) })));
  router.post('/employee-link', wrap(async (req, res) => res.json({ success: true, ...(await linkEmployee(req, { dn: dnOf(req.body?.dn), employeeId: req.body?.employeeId })) })));
  router.post('/employee-unlink', wrap(async (req, res) => res.json({ success: true, ...(await unlinkEmployee(req, { employeeId: req.body?.employeeId })) })));

  // Directory outages keep their code so the page explains them in the person's language
  // (the shared handler would turn any 5xx into a generic "server error").
  router.use((err, req, res, next) => {
    const status = Number(err?.statusCode || err?.status) || 500;
    if (status < 500 || !OUTAGES.has(err?.code)) return next(err);
    console.warn(`AD directory: ${req.method} ${req.originalUrl}: ${err.code} ${err.message}`);
    return res.status(status).json({ success: false, error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) });
  });
  return router;
}
