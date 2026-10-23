import { ensureRemoteSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import { initRemoteTunnel } from './tunnel.js';
import { initPvncTunnel } from './pvncTunnel.js';

/** Remote access & assistance descriptor: computers, support and announced monitoring, audit. */
export default {
  id: 'remote',
  schema: ensureRemoteSchema,
  routes: privateRoutes,
  register(ctx) {
    // The WebSocket tunnels need the HTTP server (the boot code runs these hooks):
    // Guacamole (guacd) and Portal VNC (mutual-TLS bridge to PortalVNC agents, bypasses guacd).
    ctx.onHttpServer((server) => initRemoteTunnel(server));
    ctx.onHttpServer((server) => initPvncTunnel(server));
  },
};
