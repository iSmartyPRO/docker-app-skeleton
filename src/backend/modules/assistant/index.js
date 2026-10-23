import { createAssistantSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import { sanitizeSettings } from './settings.js';

/*
 * Robot assistant: an animated helper on every page with tips for the section the person is in
 * (docs/assistant.md). Distributed as a module package (docs/module-packages.md), not built into
 * the core; it has no page of its own (module.json `web.page: false`): its browser part adds the
 * overlay, the Account → Appearance section and the maintenance picture through contributions.
 */
export default {
  id: 'assistant',
  // 001 is the schema it had while built into the core (CREATE TABLE IF NOT EXISTS: keeps the data).
  migrations: [{ id: '001_init', up: createAssistantSchema }],
  routes: privateRoutes,
  sanitizeSettings,
};
