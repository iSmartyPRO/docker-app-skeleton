import { createRemoteSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import { initRemoteTunnel } from './tunnel.js';
import { initPvncTunnel } from './pvncTunnel.js';
import { sanitizeSettings } from './settings.js';

/*
 * Remote access & assistance descriptor: computers, support and announced monitoring, audit
 * (docs/specs/remote-access.ru.md). Distributed as a module package (docs/module-packages.md), not
 * built into the core: scripts/build-module.mjs bundles this file into server/index.js (`ws`,
 * `guacamole-lite` and `openpgp` stay the core's copies), module.json holds the manifest facts,
 * settings.js the settings defaults and sanitizer.
 */
export default {
  id: 'remote',
  // 001 is the schema Remote access had while built into the core: CREATE … IF NOT EXISTS, so on a
  // portal that already has the remote_* tables it changes nothing. Later changes: migrations/NNN_*.
  migrations: [{ id: '001_init', up: createRemoteSchema }],
  routes: privateRoutes,
  sanitizeSettings,
  register(ctx) {
    // The WebSocket tunnels need the HTTP server (the boot code runs these hooks once the server
    // listens and the modules registered — packages included):
    // Guacamole (guacd) and Portal VNC (mutual-TLS bridge to PortalVNC agents, bypasses guacd).
    ctx.onHttpServer((server) => initRemoteTunnel(server));
    ctx.onHttpServer((server) => initPvncTunnel(server));
  },
};
