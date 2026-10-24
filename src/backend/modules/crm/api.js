import { query } from '../../config/database.js';
import { canView, crmContext, crmSettings } from './access.js';
import { dealLink, listDeals, requireDeal } from './deals.js';

/*
 * Public API of the CRM for other modules (docs/crm.md). The CRM is an
 * optional link for every module that uses it (manifest `enhances`), so
 * they reach it at run time:
 *
 *   const crm = modules.get('crm')?.api;          // null while the CRM is off / not installed
 *   const deal = await crm?.dealFor(req, id);     // the deal row, checked with the person's CRM rights (404 otherwise)
 *
 * Link pickers use the «Связи» provider 'crm.deal' (registered in index.js).
 * Everything else in this folder is internal.
 */

/** The person's CRM access context. */
export async function contextFor(req) {
  return crmContext(req, await crmSettings());
}

/** A deal the person may see: the crm_deals row (with stage_name, stage_kind, stage_color); throws 404 otherwise. */
export async function dealFor(req, id) {
  const { row } = await requireDeal(await contextFor(req), id);
  return row;
}

/** Deals for a picker, with the CRM's visibility: { items, total, … } of listDeals. */
export async function searchDeals(req, { q = '', pageSize = 20, group } = {}) {
  const input = { q: String(q || ''), pageSize };
  if (group) input.group = group;
  return listDeals(await contextFor(req), input);
}

/** Of these deal ids, those the person may open in the CRM (a Set). */
export async function visibleDealIds(req, dealIds) {
  if (!req || !dealIds.length) return new Set();
  const crm = await contextFor(req);
  const deals = await query(
    `SELECT d.id, d.pipeline_id, d.owner_id, d.created_by,
            ARRAY(SELECT w.user_id FROM crm_deal_watchers w WHERE w.deal_id = d.id) AS watchers
     FROM crm_deals d WHERE d.id = ANY($1)`,
    [dealIds]
  ).catch(() => ({ rows: [] }));
  return new Set(deals.rows.filter((deal) => canView(crm, deal, deal.watchers || [])).map((deal) => deal.id));
}

/** A line in a deal's history (kind 'masterplan', 'field', …); `touch` also bumps the deal's updated_at. */
export async function addDealEvent(dealId, { kind, body = null, data = {}, authorId = null, touch = true } = {}) {
  if (body === null) await query(`INSERT INTO crm_events (deal_id, kind, data, author_id) VALUES ($1, $2, $3, $4)`, [dealId, kind, JSON.stringify(data), authorId]);
  else await query(`INSERT INTO crm_events (deal_id, kind, body, data, author_id) VALUES ($1, $2, $3, $4, $5)`, [dealId, kind, body, JSON.stringify(data), authorId]);
  if (touch) await query(`UPDATE crm_deals SET updated_at = NOW() WHERE id = $1`, [dealId]);
}

/**
 * For another module catching up with the CRM after it was absent (Masterplan: unit changes made while the
 * CRM was not installed): of `dealIds`, the deals that exist, each with the time of its last history line
 * of `kind` (null when it has none). Map(dealId → Date | null).
 */
export async function dealHistoryMarks(dealIds, kind) {
  const ids = [...new Set((dealIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return new Map();
  const { rows } = await query(
    `SELECT d.id, (SELECT MAX(e.created_at) FROM crm_events e WHERE e.deal_id = d.id AND e.kind = $2) AS last_at
     FROM crm_deals d WHERE d.id = ANY($1::int[])`,
    [ids, String(kind || '')]
  );
  return new Map(rows.map((row) => [Number(row.id), row.last_at ? new Date(row.last_at) : null]));
}

/** Sets a deal's amount and currency when they differ (with a 'field' line in its history). True when changed. */
export async function setDealAmount(dealId, { amount, currency, actorId = null }) {
  const { rows } = await query(`SELECT amount, currency FROM crm_deals WHERE id = $1`, [dealId]);
  const deal = rows[0];
  if (!deal || (Number(deal.amount) === amount && (deal.currency || '').trim() === currency)) return false;
  const was = deal.amount === null || deal.amount === undefined ? null : Math.round(Number(deal.amount) * 100) / 100;
  await query(`UPDATE crm_deals SET amount = $2, currency = $3, version = version + 1, updated_at = NOW(), updated_by = $4 WHERE id = $1`, [dealId, amount, currency, actorId]);
  await addDealEvent(dealId, { kind: 'field', data: { field: 'amount', label: 'Amount', from: { amount: was, currency: (deal.currency || '').trim() }, to: { amount, currency } }, authorId: actorId, touch: false });
  return true;
}

export { dealLink };
export { DEMO_DEALS, DEMO_SELLERS } from './demoData.js';

/** «Связи» provider of CRM deals (contracts, purchase requests point at a deal). */
export const dealLinkProvider = {
  kind: 'crm.deal',
  area: 'crm',
  async search(req, { q = '', pageSize = 20, group } = {}) {
    const result = await searchDeals(req, { q, pageSize, group });
    return result.items.map((deal) => ({
      id: deal.id,
      label: deal.title,
      hint: deal.client?.name || '',
      title: deal.title,
      amount: deal.amount,
      currency: deal.currency,
      stage: deal.stage?.name || deal.stageName || null,
    }));
  },
  async resolve(req, id) {
    const row = await dealFor(req, id).catch(() => null);
    return row ? { id: row.id, label: row.title, url: dealLink(row.id), row } : null;
  },
};
