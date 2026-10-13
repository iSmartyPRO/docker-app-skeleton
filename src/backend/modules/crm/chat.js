import { query } from '../../config/database.js';
import { registerChatEntity } from '../chat/entities.js';
import { canView, crmContext, crmSettings } from './access.js';
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

export function registerDealChat() {
  registerChatEntity('deal', {
    async access(req, id) {
      const row = await loadDealRow(id).catch(() => null);
      if (!row || row.deleted_at) return null;
      const ctx = crmContext(req, await crmSettings());
      if (!canView(ctx, row, await watcherIds(row.id))) return { view: false };
      return { view: true, write: true, title: row.title, subtitle: row.stage_name, link: dealLink(row.id), color: row.stage_color || '#2563EB' };
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
