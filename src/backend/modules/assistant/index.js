import { ensureAssistantSchema } from './schema.js';
import { privateRoutes } from './routes.js';

/** Robot assistant: an animated helper on every page with tips for the section the person is in. */
export default {
  id: 'assistant',
  schema: ensureAssistantSchema,
  routes: privateRoutes,
};
