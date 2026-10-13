import { query } from '../../config/database.js';
import { notify } from '../../services/notifications.js';
import { emitEvent } from '../../api/events.js';
import { publicBase } from '../../services/google.js';
import { logEvent as companyEvent } from '../companies/service.js';
import { postSystem } from '../chat/service.js';
import { canView, crmContext, crmSettings, modulesEnabled } from './access.js';
import { dealLink, hydrate, loadDealRow } from './deals.js';
import { crmMessage } from './messages.js';
import { money } from './util.js';

/*
 * What follows a change of a deal, after its transaction: notifications,
 * webhooks (only to webhooks whose person may see the deal), a line in the
 * deal's chat and the Companies timeline. Never fails the change itself.
 */

async function actorName(userId) {
  if (!userId) return '';
  const { rows } = await query(`SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1`, [userId]);
  return rows[0]?.name || '';
}

async function watcherIds(dealId) {
  const { rows } = await query(`SELECT user_id FROM crm_deal_watchers WHERE deal_id = $1`, [dealId]);
  return rows.map((row) => row.user_id);
}

/** A webhook event about a deal (api/events.js), delivered to webhooks whose person may see it. */
export async function dealWebhook(type, row, ctx, extra = {}) {
  try {
    const [deal] = await hydrate(ctx, [row]);
    const watchers = await watcherIds(row.id);
    const settings = await crmSettings();
    const actor = ctx.userId ? { id: ctx.userId, name: await actorName(ctx.userId) } : null;
    await emitEvent(type, {
      data: { deal: { ...deal, url: `${publicBase()}${dealLink(row.id)}` }, actor, ...extra },
      visible: async (req) => canView(crmContext(req, settings), row, watchers),
      actorId: ctx.userId,
    });
  } catch (err) {
    console.warn(`[crm] webhook ${type} failed:`, err.message);
  }
}

/** A line in the Companies timeline of the deal's company and person (kind 'deal'). */
async function clientTimeline(row, action, actorId) {
  const data = {
    dealId: row.id,
    action,
    title: row.title,
    amount: money(row.amount),
    currency: (row.currency || '').trim(),
    stage: { id: row.stage_id, name: row.stage_name, kind: row.stage_kind },
    link: dealLink(row.id),
  };
  try {
    if (row.company_id) await companyEvent(null, { type: 'company', id: row.company_id, kind: 'deal', body: row.title, data, authorId: actorId });
    if (row.person_id) await companyEvent(null, { type: 'person', id: row.person_id, kind: 'deal', body: row.title, data, authorId: actorId });
  } catch (err) {
    console.warn('[crm] companies timeline:', err.message);
  }
}

/** A system line in the deal's conversation — only when the conversation exists already. */
async function chatLine(dealId, actorId, data) {
  try {
    if (!(await modulesEnabled()).chat) return;
    const { rows } = await query(`SELECT 1 FROM chat_rooms WHERE entity_type = 'deal' AND entity_id = $1`, [dealId]);
    if (rows.length) await postSystem('deal', dealId, { actorId, data });
  } catch (err) {
    console.warn(`[crm] chat line for deal ${dealId} failed:`, err.message);
  }
}

/**
 * effects: { type: 'created' } · { type: 'assigned', userId } · { type: 'stage', from, to, silent?, pipeline? }
 *          { type: 'updated', changes } · { type: 'deleted' } · { type: 'client' }
 */
export async function afterDealChange(ctx, dealId, effects = []) {
  try {
    const row = await loadDealRow(dealId);
    if (!row) return;
    const actor = await actorName(ctx.userId);
    for (const effect of effects) {
      if (effect.type === 'created') {
        await clientTimeline(row, 'created', ctx.userId);
        await dealWebhook('deal.created', row, ctx);
      } else if (effect.type === 'assigned') {
        await notify({
          userIds: [effect.userId],
          kind: 'crm.assigned',
          module: 'crm',
          link: dealLink(row.id),
          actorId: ctx.userId,
          render: crmMessage('assigned', { title: row.title, actor, amount: money(row.amount), currency: (row.currency || '').trim() }),
        });
      } else if (effect.type === 'stage') {
        const to = effect.to;
        if (!effect.silent) {
          await notify({
            userIds: await watcherIds(row.id),
            kind: 'crm.stage',
            module: 'crm',
            link: dealLink(row.id),
            actorId: ctx.userId,
            render: crmMessage('stage', { title: row.title, stage: to.name, actor, lostReason: to.kind === 'lost' ? row.lost_reason : null }),
          });
          await chatLine(row.id, ctx.userId, { event: 'deal.stage', from: effect.from, to, lostReason: to.kind === 'lost' ? row.lost_reason : undefined, pipeline: effect.pipeline || undefined });
          await dealWebhook('deal.stage_changed', row, ctx, { from: effect.from, to });
        }
        if (to.kind === 'won' || to.kind === 'lost') {
          await clientTimeline(row, to.kind, ctx.userId);
          await dealWebhook(to.kind === 'won' ? 'deal.won' : 'deal.lost', row, ctx, { lostReason: to.kind === 'lost' ? row.lost_reason : undefined });
        }
      } else if (effect.type === 'updated') {
        await dealWebhook('deal.updated', row, ctx, { changes: effect.changes || [] });
      } else if (effect.type === 'deleted') {
        await dealWebhook('deal.deleted', row, ctx);
      }
    }
  } catch (err) {
    console.warn(`[crm] after change of deal ${dealId}:`, err.message);
  }
}

/** "An activity was assigned to you". */
export async function notifyActivity(ctx, activity, dealRow) {
  if (!activity.owner_id || activity.owner_id === ctx.userId) return;
  try {
    await notify({
      userIds: [activity.owner_id],
      kind: 'crm.activity',
      module: 'crm',
      link: dealLink(dealRow.id),
      actorId: ctx.userId,
      render: crmMessage('activity', { title: activity.title, deal: dealRow.title, actor: await actorName(ctx.userId), dueAt: activity.due_at }),
    });
  } catch (err) {
    console.warn('[crm] activity notification:', err.message);
  }
}
