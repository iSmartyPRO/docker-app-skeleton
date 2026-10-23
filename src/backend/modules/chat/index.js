import { ensureChatSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import { closeAllStreams } from './realtime.js';
import * as api from './api.js';

/** Chat module descriptor: direct, group and record (task…) conversations with live updates. */
export default {
  id: 'chat',
  schema: ensureChatSchema,
  routes: privateRoutes,
  api,
  register(ctx) {
    // Live streams end with the process (the boot code runs shutdown hooks).
    ctx.onShutdown(() => closeAllStreams());
  },
};
