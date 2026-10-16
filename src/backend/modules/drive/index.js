import { ensureDriveSchema } from './schema.js';
import { privateRoutes, publicRoutes } from './routes.js';
import './aclHook.js'; // NTFS engine for «Доступ» ("create folder group pair")

/** Drive module descriptor: company file servers as one network drive. */
export default {
  id: 'drive',
  schema: ensureDriveSchema,
  routes: privateRoutes,
  publicRoutes,
  publicPrefix: '/d',
};
