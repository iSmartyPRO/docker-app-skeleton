/*
 * @portal/sdk — what a module package's server code may use from the core
 * (docs/module-packages.md «Server SDK»). Package bundles import it by name;
 * platform/sdkLoader.mjs resolves the name to this file at run time, so the
 * package uses the portal's own services (one database pool, one settings
 * cache, one scheduler…), never copies of them.
 *
 * The list follows what the modules use today (imports of ../../config,
 * ../../services, ../../middleware, ../../api). Adding a name is a minor SDK
 * change; renaming or removing one is a major change of the core (bump
 * SDK_VERSION's first number and the packages' `core`).
 *
 * Transitional: code converted from src/backend/modules/<id> keeps its
 * relative imports of core files; scripts/build-module.mjs rewrites them to
 * @portal/sdk/core/<path>, which the loader maps to the core file itself.
 */

export const SDK_VERSION = '1.0.0';

// ── Database ────────────────────────────────────────────────────────────────
export { query, withTransaction, getPool } from '../../config/database.js';

// ── Configuration ──────────────────────────────────────────────────────────
export { default as appConfig } from '../../config/app.js';
export { APP_VERSION } from '../../config/version.js';
export { uploadRoot } from '../../config/paths.js';

// ── Access ──────────────────────────────────────────────────────────────────
export { requireAuth, optionalAuth, requirePermission, refuseImpersonation } from '../../middleware/auth.js';
export { hasPermission } from '../../services/permissions.js';
export { getUserAccess, getAccessMap } from '../../services/rbac.js';

// ── Settings and regional formats ──────────────────────────────────────────
export { getSettings, getSettingsView, parseSettings, getSetting, setSetting, invalidateSettings, updateAdminSettings, localeFor, recipientLocale, regionalFor } from '../../services/settings.js';
export { portalRegional, regionalOfUser, requestRegional, requestZone } from '../../services/regional.js';
export { REGIONAL_DEFAULTS, formatDate, formatDateTime, formatTime, isValidTimeZone, isoDay, startOfDay, startOfWeek, wallToInstant, zoneLabel, zoneOffsetMinutes, zonedParts } from '../../services/datetime.js';

// ── Languages ───────────────────────────────────────────────────────────────
export { tr, translator, plural, pick, localeOrDefault, localeTag, SUPPORTED, formatNumber, moneyText, decimalSeparator, exportLocale } from '../../services/i18n/index.js';

// ── Notifications, inbox, events, jobs ─────────────────────────────────────
export { notify, eventAllows, prefsWithZone, quietState, subscribersOf, listNotifications, unreadCount } from '../../services/notifications.js';
export { pushToUser } from '../../services/push.js';
export { registerInboxProvider, inboxFor, inboxAct, setUrgencyRanker } from '../../services/inbox.js';
export { emitEvent, requestAs } from '../../api/events.js';
export { onModuleEvent, emitModuleEvent, onBeforeUserDelete, onDirectorySignIn, onDirectoryCredential } from '../../services/hooks.js';
export { registerJob } from '../../services/scheduler.js';

// ── Journal (Settings → Activity) ──────────────────────────────────────────
export { recordSecurityEvent } from '../../services/security.js';

// ── People, legal entities, secrets, documents, demo data ──────────────────
export { createUser, updateUser, assertCanManage, isValidPhone, normalizePhone, findUserById } from '../../services/users.js';
export { listLegalEntities, getLegalEntity, getDefaultLegalEntity } from '../../services/legalEntities.js';
export { seal, unseal } from '../../services/crypto.js';
export { convertToPdf } from '../../services/integrations.js';
export { registerDemo } from '../../services/demo.js';
export { decide, limitsByTable } from '../../api/scopes.js';

// ── Core extension points (platform/registry.js, events.js, widgets.js, pickers.js) ──
// The same functions are on register(ctx), where registrations are tagged with the module
// (hidden while it is off) — prefer ctx inside register().
export { modules, registerLinkProvider, linkProvider, registerObjectSource, objectSource, registerSearchProvider, searchAll, registerPreviewProvider, registerFollowable, canFollow, registerTokenResources, onHttpServer, onShutdown, registerWidget, registerWidgetSection } from '../registry.js';
export { events } from '../events.js';
export * as widgets from '../widgets.js';
export * as pickers from '../pickers.js';

// ── Small helpers ───────────────────────────────────────────────────────────

/** An Error the API error handler answers with `status` and `code`. */
export function httpError(status, message, code) {
  return Object.assign(new Error(message), { statusCode: status, status, ...(code ? { code } : {}) });
}

/** Console logger prefixed with the module id. */
export function logger(id) {
  const prefix = `[${id}]`;
  return {
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}
