import { ensureKbSchema } from './schema.js';
import { privateRoutes, publicRoutes } from './routes.js';
import { kbPreview } from './preview.js';
import { registerKbWidgets } from './widgets.js';

/** Knowledge base module descriptor (see modules/index.js for the contract). */
export default {
  id: 'kb',
  schema: ensureKbSchema,
  routes: privateRoutes,
  publicRoutes,
  publicPrefix: '/s',
  register(ctx) {
    registerKbWidgets(ctx);
    // Rich previews of public links /s/<slug>[/f|d/<id>] (services/linkPreview).
    ctx.registerPreviewProvider((route) => kbPreview(route.token, { folderId: route.folderId, itemId: route.itemId }));
  },
};
