import { query } from '../../config/database.js';
import { decide } from '../../api/scopes.js';
import { registerChatEntity } from '../chat/entities.js';
import { httpError } from '../shared/acl.js';
import { canView, crmContext, crmSettings, modulesEnabled } from './access.js';
import { dealLink, loadDealRow } from './deals.js';

/*
 * "Обсудить с коллегами": every deal can have a conversation in the chat
 * module. Access is the deal's own (the same visibility rules); the owner,
 * the watchers and the creator follow it.
 */

async function watcherIds(dealId) {
  const { rows } = await query(`SELECT user_id FROM crm_deal_watchers WHERE deal_id = $1`, [dealId]);
  return rows.map((row) => row.user_id);
}

/**
 * The deal chat as the CRM allows it: nothing while the module is off or to
 * an API token without the crm scope; writing needs crm:write. Session
 * requests (no token) only depend on the module being on.
 */
async function moduleAccess(req) {
  if (!(await modulesEnabled()).crm) return null;
  const policy = req?.apiToken?.policy;
  if (!policy) return { write: true };
  if (!decide(policy, 'GET', '/app/crm/deals').ok) return null;
  return { write: decide(policy, 'POST', '/app/crm/deals').ok };
}

export function registerDealChat() {
  registerChatEntity('deal', {
    async access(req, id) {
      const allowed = await moduleAccess(req);
      // Thrown, not null: the chat treats an error as "not now" and keeps the
      // person's membership, while null would drop them from the conversation.
      if (!allowed) throw httpError(404, 'Not found', 'NOT_FOUND');
      const row = await loadDealRow(id).catch(() => null);
      if (!row || row.deleted_at) return null;
      const ctx = crmContext(req, await crmSettings());
      if (!canView(ctx, row, await watcherIds(row.id))) return { view: false };
      return { view: true, write: allowed.write, title: row.title, subtitle: row.stage_name, link: dealLink(row.id), color: row.stage_color || '#2563EB' };
    },
    async describe(id) {
      const row = await loadDealRow(id).catch(() => null);
      return row ? { title: row.title, link: dealLink(row.id) } : null;
    },
    async participants(id) {
      const row = await loadDealRow(id).catch(() => null);
      if (!row) return [];
      return [...new Set([row.owner_id, row.created_by, ...(await watcherIds(row.id))].filter(Boolean))];
    },
  });
}
