import { query } from '../../config/database.js';
import { getSettings, localeFor, parseSettings, regionalFor } from '../../services/settings.js';
import { formatDateTime } from '../../services/datetime.js';
import { onModuleEvent } from '../../services/hooks.js';
import { requestAs } from '../../api/events.js';
import { httpError } from '../shared/acl.js';
import { crmContext, crmSettings } from '../crm/access.js';
import { requireDeal } from '../crm/deals.js';
import { modulesEnabled, mpContext, requireCrmScope, usersWithRole } from './access.js';
import { readCaps, has } from './rules.js';
import { statusName } from './messages.js';
import { iso, logEvent, money } from './util.js';
import { translator } from '../../services/i18n/index.js';

/*
 * The CRM side of Masterplan (adapted from the spec's Bitrix24 integration, §11):
 *   - a unit is linked to a CRM deal (and through it to a company / person of
 *     Counterparties); the deal is checked with the person's CRM rights;
 *   - status changes write a line into the deal's timeline (crm_events kind
 *     'masterplan') and, when settings.syncDealAmount, the unit's price into
 *     the deal amount;
 *   - a deal moving to a stage listed in settings.stageMap moves its units
 *     (booking / deposit / contract / sold / free), checked by the same
 *     transition rules with the rights of whoever moved the deal;
 *   - GET /deals/:id/units feeds the "Masterplan" block of the deal panel.
 */

/**
 * A deal the person may see in the CRM, open (not lost, not in the trash).
 * `scope`: what an API token must hold in the CRM area — 'write' to link the
 * deal (its timeline gets written), 'read' to show it.
 */
export async function dealForLink(ctx, dealId, { allowClosed = false, scope = 'write' } = {}) {
  if (!(await modulesEnabled()).crm) throw httpError(400, 'The CRM is turned off', 'CRM_DISABLED');
  if (!ctx.request) throw httpError(400, 'No CRM context', 'CRM_DISABLED');
  requireCrmScope(ctx, scope);
  const cctx = crmContext(ctx.request, await crmSettings());
  const { row } = await requireDeal(cctx, dealId);
  if (!allowClosed && row.stage_kind === 'lost') throw httpError(400, 'The deal is closed as lost', 'DEAL_CLOSED');
  return row;
}

/** A system line in a deal's history (the portal's default language and time zone). */
async function dealLine(dealId, body, data, authorId = null) {
  await query(`INSERT INTO crm_events (deal_id, kind, body, data, author_id) VALUES ($1, 'masterplan', $2, $3, $4)`, [dealId, body, JSON.stringify(data), authorId]);
  await query(`UPDATE crm_deals SET updated_at = NOW() WHERE id = $1`, [dealId]);
}

const unitLabel = (node) => node.code || node.name || `#${node.id}`;

export async function afterUnitStatus(ctx, node, { before, after, booking, reason }) {
  const dealId = after.deal_id || before.deal_id;
  if (!dealId || !(await modulesEnabled()).crm) return;
  const regional = await regionalFor(null);
  const locale = await localeFor(null);
  const t = translator(locale);
  const until = booking ? t('masterplan.dealLine.until', { date: formatDateTime(booking.ends_at, regional, locale) }) : '';
  const why = reason ? t('masterplan.dealLine.reason', { reason }) : '';
  const body = t('masterplan.dealLine.text', { unit: unitLabel(node), status: statusName(after.status, locale), until, reason: why });
  await dealLine(dealId, body, { unitId: node.id, projectId: node.project_id, code: node.code, from: before.status, to: after.status, endsAt: booking ? iso(booking.ends_at) : null, link: `/app/masterplan/p/${node.project_id}/plan?node=${node.id}` }, ctx.userId);
  // "Сумма сделки = цена юнита": the units booked or contracted for the deal, summed (a deal may buy several).
  if (ctx.settings.syncDealAmount && ['booking', 'contract'].includes(after.status) && after.deal_id) {
    const currency = (after.currency || '').trim();
    const { rows: held } = await query(
      `SELECT COALESCE(SUM(CASE WHEN status IN ('contract', 'sold', 'handed') THEN COALESCE(contract_amount, price) ELSE price END), 0) AS total
       FROM mp_units WHERE deal_id = $1 AND status IN ('booking', 'deposit', 'contract', 'sold', 'handed') AND currency = $2`,
      [after.deal_id, currency]
    );
    const amount = money(held[0].total);
    if (amount !== null && currency) {
      const { rows } = await query(`SELECT amount, currency FROM crm_deals WHERE id = $1`, [after.deal_id]);
      const deal = rows[0];
      if (deal && (Number(deal.amount) !== amount || (deal.currency || '').trim() !== currency)) {
        await query(`UPDATE crm_deals SET amount = $2, currency = $3, version = version + 1, updated_at = NOW(), updated_by = $4 WHERE id = $1`, [after.deal_id, amount, currency, ctx.userId]);
        await query(`INSERT INTO crm_events (deal_id, kind, data, author_id) VALUES ($1, 'field', $2, $3)`, [
          after.deal_id,
          JSON.stringify({ field: 'amount', label: 'Сумма', from: { amount: money(deal.amount), currency: (deal.currency || '').trim() }, to: { amount, currency } }),
          ctx.userId,
        ]);
      }
    }
  }
}

export async function dealLineAfterExpiry(dealId, node, booking) {
  if (!(await modulesEnabled()).crm) return;
  const t = translator(await localeFor(null));
  await dealLine(dealId, t(`masterplan.dealLine.expired.${booking.kind === 'reserve' ? 'reserve' : 'booking'}`, { unit: unitLabel(node) }), { unitId: node.id, projectId: node.project_id, code: node.code, to: 'free', expired: true });
}

/** Units linked to a deal, for the CRM deal panel; units of projects the person does not see are only counted. */
export async function dealUnits(ctx, dealId) {
  const deal = await dealForLink(ctx, dealId, { allowClosed: true, scope: 'read' });
  const { rows } = await query(
    `SELECT n.id, n.code, n.name, n.project_id,
            (SELECT o.readiness FROM mp_nodes o JOIN mp_types ot ON ot.id = o.type_id WHERE o.id = ANY(n.path) AND ot.stage_set IS NOT NULL AND o.kind <> 'level' ORDER BY o.depth DESC LIMIT 1) AS readiness,
            p.name AS project_name, u.status, u.price, u.currency, u.area_total, u.area_plot, u.version,
            b.ends_at, b.kind AS b_kind, t.name AS type_name, t.icon AS type_icon
     FROM mp_units u JOIN mp_nodes n ON n.id = u.node_id JOIN mp_projects p ON p.id = n.project_id
     LEFT JOIN mp_types t ON t.id = n.type_id
     LEFT JOIN mp_bookings b ON b.id = u.booking_id AND b.status = 'active'
     WHERE u.deal_id = $1 ORDER BY n.id`,
    [deal.id]
  );
  const units = [];
  let hidden = 0;
  for (const row of rows) {
    const caps = readCaps(ctx, row.project_id);
    if (!caps.size) {
      hidden += 1;
      continue;
    }
    units.push({
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type_name,
      icon: row.type_icon,
      project: { id: row.project_id, name: row.project_name },
      status: has(caps, 'status.view') ? row.status : null,
      price: has(caps, 'price.view') ? { amount: money(row.price), currency: (row.currency || '').trim() } : null,
      area: Number(row.area_total || row.area_plot) || null,
      readiness: has(caps, 'build.view') ? Number(row.readiness) : null,
      endsAt: has(caps, 'booking.view') ? iso(row.ends_at) : null,
      link: `/app/masterplan/p/${row.project_id}/plan?node=${row.id}`,
    });
  }
  return { deal: { id: deal.id, title: deal.title }, units, hidden, canPick: Boolean(ctx.globalRoles.size || ctx.assignments.length), statusColors: ctx.settings.statusColors || null };
}

// ── CRM deal stage → unit status (settings.stageMap) ────────────────────────

async function onDealStage({ dealId, to, actorId }) {
  const parsed = parseSettings(await getSettings());
  const module = parsed.modules.masterplan;
  if (!module?.enabled || !to?.id) return;
  const action = module.settings.stageMap?.[String(to.id)];
  if (!action) return;
  const { rows } = await query(`SELECT u.node_id, u.status, n.project_id, n.path, n.code FROM mp_units u JOIN mp_nodes n ON n.id = u.node_id WHERE u.deal_id = $1`, [dealId]);
  if (!rows.length) return;
  const req = actorId ? await requestAs(actorId) : null;
  const { changeStatus } = await import('./sales.js');
  for (const row of rows) {
    if (row.status === action) continue;
    let result = 'applied';
    let code = null;
    try {
      if (!req) throw httpError(403, 'No actor', 'FORBIDDEN');
      const ctx = await mpContext(req, module.settings);
      ctx.request = req;
      await changeStatus(ctx, row.node_id, { to: action, dealId: action === 'free' ? undefined : dealId, reason: `CRM: стадия «${to.name}»` });
    } catch (err) {
      result = 'refused';
      code = err.code || 'ERROR';
    }
    if (result === 'refused') {
      await logEvent(null, { projectId: row.project_id, nodeId: row.node_id, kind: 'crm_stage', data: { dealId, stage: { id: to.id, name: to.name }, action, result, code }, authorId: actorId || null });
      // Someone with the right has to do it by hand: tell the heads of sales.
      const heads = await usersWithRole(['sales_head'], { project_id: row.project_id, path: row.path });
      const { notify } = await import('../../services/notifications.js');
      const { mpMessage } = await import('./messages.js');
      await notify({
        userIds: heads,
        kind: 'masterplan.status',
        module: 'masterplan',
        link: `/app/masterplan/p/${row.project_id}/plan?node=${row.node_id}`,
        render: mpMessage('status', { code: row.code, project: '', to: action, actor: `CRM: «${to.name}» — ${code}`, reason: null }),
      }).catch(() => {});
    }
  }
}

let registered = false;
export function registerCrmHooks() {
  if (registered) return;
  registered = true;
  onModuleEvent('crm.deal.stage', onDealStage);
}
