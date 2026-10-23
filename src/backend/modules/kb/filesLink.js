import { modules } from '../../platform/registry.js';
import { httpError } from './access.js';

/*
 * The knowledge base keeps its attachments in the Files module's storage
 * (modules/files/api.js). Files is an optional link: while it is not
 * installed, uploads and attachments answer 404 FILES_MISSING and the rest of
 * the knowledge base works.
 */
export function filesApi() {
  const api = modules.loaded('files')?.api;
  if (!api) throw httpError(404, 'The Files module is not installed', 'FILES_MISSING');
  return api;
}
