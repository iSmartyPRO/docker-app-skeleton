import { ensureJournalTable } from './journal.js';
import { privateRoutes } from './routes.js';

/*
 * Folder access («Доступ к папкам»): who may open which folder on the file
 * server, managed through the Active Directory security groups sg_<org>_<name>_<full|read>.
 * Changes run as the acting administrator's own AD account. Spec: docs/folder-access.md.
 */
export default {
  id: 'folderaccess',
  schema: ensureJournalTable,
  routes: privateRoutes,
};
