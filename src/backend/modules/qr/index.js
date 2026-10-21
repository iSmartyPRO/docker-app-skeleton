import { ensureQrSchema } from './schema.js';
import { privateRoutes, publicRoutes } from './routes.js';

/** QR codes module descriptor: branded codes from templates, dynamic links with scan counts. */
export default {
  id: 'qr',
  schema: ensureQrSchema,
  routes: privateRoutes,
  publicRoutes,
  publicPrefix: '/qr',
};
