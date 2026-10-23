import { registerJob } from '../../services/scheduler.js';
import { onDirectoryCredential, onDirectorySignIn, provideDirectoryCredentialInfo } from '../../services/hooks.js';
import { createDriveSchema } from './schema.js';
import { privateRoutes, publicRoutes } from './routes.js';
import { drivePreview } from './preview.js';
import { registerDriveWidgets } from './widgets.js';
import { registerOfficeProvider } from './office.js';
import { cleanupCredentials, credentialInfo, rememberLoginCredential, storeDirectoryCredential } from './credentials.js';
import { pruneActivity } from './activity.js';
import { migrateFolderAccess } from './access/migrate.js';
import { sanitizeSettings, upgradeSettings } from './settings.js';
import * as api from './api.js';
import './aclHook.js'; // NTFS engine for «Доступ» ("create folder group pair")
// Demo data entry (Settings → Modules → Demo data): explains that there is none, registerDemo at import time.
import './demo.js';

/*
 * File server (Drive): the company's SMB file servers as one network drive —
 * folders, public links /d/<token> (visitor uploads), the activity log, the
 * online editor (Collabora over the core's WOPI host) and «Доступ» (AD folder
 * access groups and NTFS permissions).
 *
 * Distributed as a module package (docs/module-packages.md), not built into the
 * core: scripts/build-module.mjs bundles this file into server/index.js and
 * copies gateway/smbgate.py + ntacl.py next to it (gate.js starts the gateway
 * from there with the core image's python3, smbprotocol and Pillow; dwg2dxf for
 * drawings is a core image binary too). module.json holds the manifest facts,
 * settings.js the settings defaults, sanitizer and upgrade.
 *
 * register(ctx): the people's AD passwords remembered at sign-in and set by an
 * administrator (core hooks onDirectorySignIn / onDirectoryCredential), their
 * state on the Users page (provideDirectoryCredentialInfo), the online editor's
 * provider, the widgets, link previews and the jobs.
 */
export default {
  id: 'drive',
  // 001 is the schema the File server had while built into the core (+ the move of the former «Доступ к
  // папкам» module): idempotent, so on a portal that already has the drive_* tables it changes nothing.
  // Later changes: migrations/NNN_name.sql|js.
  migrations: [{ id: '001_init', up: createDriveSchema }],
  routes: privateRoutes,
  publicRoutes,
  publicPrefix: '/d',
  sanitizeSettings,
  upgradeSettings,
  api,
  register(ctx) {
    onDirectorySignIn(rememberLoginCredential);
    onDirectoryCredential(storeDirectoryCredential);
    provideDirectoryCredentialInfo(credentialInfo);
    registerOfficeProvider();
    registerJob({ name: 'drive:activity', everyMs: 24 * 60 * 60 * 1000, run: pruneActivity });
    registerJob({ name: 'drive:credentials', everyMs: 60 * 60 * 1000, run: cleanupCredentials });
    // The former «Доступ к папкам» module: a step of migration 001 that failed is retried (idempotent).
    registerJob({ name: 'drive:folderaccess', everyMs: 24 * 60 * 60 * 1000, run: () => migrateFolderAccess() });
    registerDriveWidgets(ctx);
    // Rich previews of public links /d/<token> (services/linkPreview).
    ctx.registerPreviewProvider((route, { facts }) => drivePreview(route.token, { facts }));
  },
};
