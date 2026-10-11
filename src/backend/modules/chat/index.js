import { ensureChatSchema } from './schema.js';
import { privateRoutes } from './routes.js';

/** Chat module descriptor: direct, group and record (task…) conversations with live updates. */
export default {
  id: 'chat',
  schema: ensureChatSchema,
  routes: privateRoutes,
};
