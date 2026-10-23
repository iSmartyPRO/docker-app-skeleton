import { ensureDriveSchema } from './schema.js';
import { privateRoutes, publicRoutes } from './routes.js';
import { drivePreview } from './preview.js';
import { registerDriveWidgets } from './widgets.js';
import * as api from './api.js';
import './aclHook.js'; // NTFS engine for «Доступ» ("create folder group pair")

/** Drive module descriptor: company file servers as one network drive. */
export default {
  id: 'drive',
  schema: ensureDriveSchema,
  routes: privateRoutes,
  publicRoutes,
  publicPrefix: '/d',
  api,
  register(ctx) {
    registerDriveWidgets(ctx);
    // Rich previews of public links /d/<token> (services/linkPreview).
    ctx.registerPreviewProvider((route, { facts }) => drivePreview(route.token, { facts }));
  },
};
