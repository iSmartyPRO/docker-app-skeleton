import { Router } from 'express';
import { query } from '../config/database.js';
import { optionalAuth, requireAuth, requirePermission } from '../middleware/auth.js';
import { hasAnyPermission, hasPermission } from '../services/permissions.js';
import { getSettings, parseSettings } from '../services/settings.js';
import { publicBase } from '../services/google.js';
import { apiConfig, updateApiConfig } from './config.js';
import { AREAS, RESOURCE_KINDS } from './scopes.js';
import { createToken, deleteToken, getToken, listTokens, revokeToken, rotateToken, updateToken } from './tokens.js';
import { areaList, createTemplate, deleteTemplate, listTemplates, resourceOptions, updateTemplate } from './templates.js';
import { listRequests, requestStats } from './log.js';
import { createWebhook, deleteWebhook, getWebhook, listDeliveries, listWebhooks, pingWebhook, redeliver, rotateWebhookSecret, updateWebhook } from './webhooks.js';
import { EVENT_CATALOG } from './events.js';
import { endpoints } from './introspect.js';
import { openApi } from './openapi.js';
import { ERRORS, SECTIONS } from './reference.js';

/*
 *   /api/admin/api/*     the API console (permission api.admin)
 *   /api/account/api/*   personal tokens (permission api.tokens)
 *   /api/developer/*     the developer reference (public when allowed)
 *
 * Tokens can never reach the first two (see scopes.js BLOCKED).
 */

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const originOf = (req) => publicBase() || `${req.protocol}://${req.get('host')}`;

async function modulesState() {
  return parseSettings(await getSettings()).modules;
}

// ── Console ─────────────────────────────────────────────────────────────────

export function adminApiRoutes() {
  const router = Router();
  router.use(requirePermission('api.admin'));

  router.get('/', wrap(async (req, res) => {
    const [config, stats, tokens, hooks, templates] = await Promise.all([apiConfig(), requestStats({ days: 1 }), listTokens(), listWebhooks(), listTemplates()]);
    res.json({
      success: true,
      config,
      origin: originOf(req),
      stats,
      counts: {
        tokens: tokens.filter((token) => token.state === 'active').length,
        revoked: tokens.filter((token) => token.state !== 'active').length,
        webhooks: hooks.filter((hook) => hook.active).length,
        templates: templates.length,
        expiringSoon: tokens.filter((token) => token.state === 'active' && token.expiresAt && new Date(token.expiresAt) - Date.now() < 7 * 86400000).length,
        failing: hooks.filter((hook) => hook.lastStatus === 'failed' || hook.disabledReason).map((hook) => ({ id: hook.id, name: hook.name })),
        unusedMonth: tokens.filter((token) => token.state === 'active' && (!token.lastUsedAt || Date.now() - new Date(token.lastUsedAt) > 30 * 86400000)).length,
      },
    });
  }));
  router.put('/config', wrap(async (req, res) => res.json({ success: true, config: await updateApiConfig(req.body || {}) })));

  router.get('/meta', wrap(async (req, res) => {
    const [modules, resources] = await Promise.all([modulesState(), resourceOptions(req, { all: true })]);
    const { rows: people } = await query(
      `SELECT id, username, COALESCE(display_name, username) AS name, avatar_path FROM users WHERE is_active IS NOT FALSE ORDER BY LOWER(COALESCE(display_name, username)) LIMIT 2000`
    );
    res.json({ success: true, areas: areaList(modules), resources, resourceKinds: RESOURCE_KINDS.map((kind) => ({ key: kind.key, module: kind.module })), events: EVENT_CATALOG, people: people.map((p) => ({ id: p.id, name: p.name, username: p.username })) });
  }));

  // Tokens
  router.get('/tokens', wrap(async (req, res) => res.json({ success: true, tokens: await listTokens({ userId: req.query.userId, state: req.query.state, q: req.query.q }) })));
  router.post('/tokens', wrap(async (req, res) => res.status(201).json({ success: true, ...(await createToken(req.actor, req.body || {})) })));
  router.get('/tokens/:id', wrap(async (req, res) => res.json({ success: true, token: await getToken(req.params.id) })));
  router.put('/tokens/:id', wrap(async (req, res) => res.json({ success: true, token: await updateToken(req.actor, req.params.id, req.body || {}) })));
  router.post('/tokens/:id/revoke', wrap(async (req, res) => res.json({ success: true, token: await revokeToken(req.actor, req.params.id) })));
  router.post('/tokens/:id/rotate', wrap(async (req, res) => res.json({ success: true, ...(await rotateToken(req.actor, req.params.id)) })));
  router.delete('/tokens/:id', wrap(async (req, res) => {
    await deleteToken(req.actor, req.params.id);
    res.json({ success: true });
  }));

  // Templates
  router.get('/templates', wrap(async (req, res) => res.json({ success: true, templates: await listTemplates() })));
  router.post('/templates', wrap(async (req, res) => res.status(201).json({ success: true, template: await createTemplate(req.actor, req.body || {}) })));
  router.put('/templates/:id', wrap(async (req, res) => res.json({ success: true, template: await updateTemplate(req.params.id, req.body || {}) })));
  router.delete('/templates/:id', wrap(async (req, res) => {
    await deleteTemplate(req.params.id);
    res.json({ success: true });
  }));

  // Webhooks
  router.get('/webhooks', wrap(async (req, res) => res.json({ success: true, webhooks: await listWebhooks() })));
  router.post('/webhooks', wrap(async (req, res) => res.status(201).json({ success: true, ...(await createWebhook(req.actor, req.body || {})) })));
  router.get('/webhooks/:id', wrap(async (req, res) => res.json({ success: true, webhook: await getWebhook(req.params.id) })));
  router.put('/webhooks/:id', wrap(async (req, res) => res.json({ success: true, webhook: await updateWebhook(req.params.id, req.body || {}) })));
  router.post('/webhooks/:id/ping', wrap(async (req, res) => res.json({ success: true, result: await pingWebhook(req.params.id) })));
  router.post('/webhooks/:id/secret', wrap(async (req, res) => res.json({ success: true, ...(await rotateWebhookSecret(req.params.id)) })));
  router.delete('/webhooks/:id', wrap(async (req, res) => {
    await deleteWebhook(req.params.id);
    res.json({ success: true });
  }));
  router.get('/deliveries', wrap(async (req, res) => res.json({ success: true, ...(await listDeliveries(req.query)) })));
  router.post('/deliveries/:id/redeliver', wrap(async (req, res) => res.json({ success: true, delivery: await redeliver(req.params.id) })));

  // Log
  router.get('/requests', wrap(async (req, res) => res.json({ success: true, ...(await listRequests(req.query)) })));
  router.get('/stats', wrap(async (req, res) => res.json({ success: true, stats: await requestStats({ tokenId: req.query.tokenId, days: req.query.days }) })));
  return router;
}

// ── Personal tokens ─────────────────────────────────────────────────────────

export function accountApiRoutes() {
  const router = Router();
  router.use(requireAuth, wrap(async (req, res, next) => {
    const config = await apiConfig();
    const admin = hasPermission(req.access.permissions, 'api.admin');
    if (!admin && (!config.personalTokens || !hasPermission(req.access.permissions, 'api.tokens'))) {
      res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'You cannot create API tokens' });
      return;
    }
    req.apiConfig = config;
    next();
  }));

  router.get('/', wrap(async (req, res) => {
    const [tokens, templates, modules, resources, stats] = await Promise.all([
      listTokens({ userId: req.user.id }),
      listTemplates(),
      modulesState(),
      resourceOptions(req),
      requestStats({ userId: req.user.id, days: 7 }),
    ]);
    const admin = hasAnyPermission(req.access.permissions, ['console.access']);
    res.json({
      success: true,
      origin: originOf(req),
      config: { maxLifetimeDays: req.apiConfig.maxLifetimeDays, defaultRateLimit: req.apiConfig.defaultRateLimit, enabled: req.apiConfig.enabled },
      tokens,
      // Administration areas only matter to people who administer something.
      areas: areaList(modules).filter((area) => admin || !area.key.startsWith('admin.')),
      templates,
      resources,
      resourceKinds: RESOURCE_KINDS.map((kind) => ({ key: kind.key, module: kind.module })),
      stats,
    });
  }));
  router.post('/tokens', wrap(async (req, res) => {
    const { userId, ...body } = req.body || {};
    res.status(201).json({ success: true, ...(await createToken({ id: req.user.id, permissions: [] }, body)) });
  }));
  router.put('/tokens/:id', wrap(async (req, res) => res.json({ success: true, token: await updateToken({ id: req.user.id, permissions: [] }, req.params.id, req.body || {}) })));
  router.post('/tokens/:id/revoke', wrap(async (req, res) => res.json({ success: true, token: await revokeToken({ id: req.user.id, permissions: [] }, req.params.id) })));
  router.post('/tokens/:id/rotate', wrap(async (req, res) => res.json({ success: true, ...(await rotateToken({ id: req.user.id, permissions: [] }, req.params.id)) })));
  router.delete('/tokens/:id', wrap(async (req, res) => {
    await deleteToken({ id: req.user.id, permissions: [] }, req.params.id);
    res.json({ success: true });
  }));
  router.get('/requests', wrap(async (req, res) => res.json({ success: true, ...(await listRequests({ ...req.query, userId: req.user.id })) })));
  return router;
}

// ── Developer reference ─────────────────────────────────────────────────────

export function developerRoutes() {
  const router = Router();
  router.use(optionalAuth, wrap(async (req, res, next) => {
    const config = await apiConfig();
    if (!config.docsPublic && !req.user) {
      res.status(401).json({ success: false, code: 'SESSION_REQUIRED', error: 'Sign in to read the API reference' });
      return;
    }
    req.apiConfig = config;
    next();
  }));

  router.get('/reference', wrap(async (req, res) => {
    const parsed = parseSettings(await getSettings());
    const modules = parsed.modules;
    const list = endpoints().filter((endpoint) => {
      const area = AREAS.find((item) => item.key === endpoint.area);
      return !area?.module || modules[area.module]?.enabled;
    });
    const canTokens = req.user ? hasAnyPermission(req.access.permissions, ['api.tokens', 'api.admin']) : false;
    res.json({
      success: true,
      app: { name: parsed.appName, version: parsed.appVersion },
      origin: originOf(req),
      base: `${originOf(req)}/api/v1`,
      sections: SECTIONS.filter((section) => list.some((endpoint) => endpoint.section === section.key)),
      endpoints: list,
      areas: areaList(modules).filter((area) => !area.module || modules[area.module]?.enabled),
      errors: ERRORS,
      events: EVENT_CATALOG.filter((event) => {
        const area = AREAS.find((item) => item.key === event.area);
        return !area?.module || modules[area.module]?.enabled;
      }),
      config: { enabled: req.apiConfig.enabled, defaultRateLimit: req.apiConfig.defaultRateLimit, webhooks: req.apiConfig.webhooks },
      viewer: req.user ? { signedIn: true, canTokens, isAdmin: hasPermission(req.access.permissions, 'api.admin') } : { signedIn: false },
    });
  }));

  router.get('/openapi.json', wrap(async (req, res) => {
    const parsed = parseSettings(await getSettings());
    const spec = openApi({ origin: originOf(req), lang: req.query.lang === 'ru' ? 'ru' : 'en', appName: parsed.appName, version: parsed.appVersion || '1.0.0' });
    if (req.query.download === '1') res.setHeader('Content-Disposition', 'attachment; filename="openapi.json"');
    res.json(spec);
  }));
  return router;
}
