import { query } from '../../config/database.js';
import { getSettings, localeFor, parseSettings, regionalFor } from '../../services/settings.js';
import { formatDateTime } from '../../services/datetime.js';
import { onModuleEvent } from '../../services/hooks.js';
import { requestAs } from '../../api/events.js';
import { httpError } from '../shared/acl.js';
import { modules } from '../../platform/registry.js';
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
  const crm = modules.loaded('crm')?.api;
  if (!crm) throw httpError(400, 'The CRM is turned off', 'CRM_DISABLED');
  const row = await crm.dealFor(ctx.request, dealId);
  if (!allowClosed && row.stage_kind === 'lost') throw httpError(400, 'The deal is closed as lost', 'DEAL_CLOSED');
  return row;
}

/**
 * Is the CRM installed (loaded, switched on or not)? While it is not, status changes of units with a deal are
 * marked crmPending and caught up after its install. (While it is installed but switched off nothing is kept
 * for later — as before: the CRM's own switch.)
 */
export const crmInstalled = () => Boolean(modules.loaded('crm')?.api);

/** A system line in a deal's history (the portal's default language and time zone). */
async function dealLine(dealId, body, data, authorId = null) {
  const crm = modules.loaded('crm')?.api;
  if (crm) await crm.addDealEvent(dealId, { kind: 'masterplan', body, data, authorId });
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
    const crm = modules.loaded('crm')?.api;
    if (amount !== null && currency && crm) await crm.setDealAmount(after.deal_id, { amount, currency, actorId: ctx.userId });
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

// ── Catching up with the CRM after it was absent ────────────────────────────

/*
 * While the CRM is not installed (a package of its own since core 1.21), a unit's status
 * changes write no line into its deal's history and do not set the deal amount (afterUnitStatus returns
 * early) — units keep their deal ids (mp_units.deal_id, mp_events data.deal) and such events are marked
 * data.crmPending (sales.js). Once per install of the CRM (its installed_modules.installed_at), as
 * Contracts' scheduleContractResync, Masterplan replays them: for every existing deal, each marked status
 * change / expiry of its units newer than the deal's last «masterplan» line becomes that line
 * (data.resync: true, data.at: when it happened), and with
 * syncDealAmount the deal amount is set again from the units it holds. Idempotent: a second run finds
 * the lines written. The CRM's stage is not touched — Masterplan never moves a deal's stage (the
 * stageMap goes the other way), so there is nothing of the kind to replay.
 * Recorded in app_settings masterplan_crm_resync: { at, crmInstalledAt, deals, lines, amounts }.
 */
const CRM_RESYNC_FLAG = 'masterplan_crm_resync';
const REPLAYED = ['status', 'expired'];

async function readJsonFlag(key) {
  const { rows } = await query(`SELECT value FROM app_settings WHERE key = $1`, [key]);
  try {
    return rows[0] ? JSON.parse(rows[0].value) : null;
  } catch {
    return null;
  }
}

/** When the CRM package was installed (not updated), or null (built into the core, or not installed). */
export async function crmInstalledAt() {
  try {
    const { rows } = await query(`SELECT installed_at, state, source FROM installed_modules WHERE id = 'crm'`);
    const row = rows[0];
    if (!row || row.source !== 'package' || row.state === 'removed' || !row.installed_at) return null;
    return new Date(row.installed_at).toISOString();
  } catch {
    return null;
  }
}

/** Replays the deal-side effects missed while the CRM was absent. → { deals, lines, amounts } or { unavailable }. */
export async function resyncCrmDeals(crmApi) {
  const summary = { deals: 0, lines: 0, amounts: 0 };
  if (!crmApi?.dealHistoryMarks || !crmApi.addDealEvent) return { ...summary, unavailable: true };
  const parsed = parseSettings(await getSettings());
  if (!parsed.modules.masterplan?.enabled || !parsed.modules.crm?.enabled) return { ...summary, unavailable: true };
  const mpSettings = parsed.modules.masterplan.settings || {};
  const { rows: linked } = await query(
    `SELECT DISTINCT (data->'deal'->>'id')::int AS deal_id FROM mp_events
     WHERE kind = ANY($1) AND data->>'crmPending' = 'true' AND data->'deal'->>'id' ~ '^[0-9]+$'`,
    [REPLAYED]
  );
  const marks = await crmApi.dealHistoryMarks(linked.map((row) => row.deal_id), 'masterplan');
  if (!marks.size) return summary;
  const regional = await regionalFor(null);
  const locale = await localeFor(null);
  const t = translator(locale);
  const optional = (key, params) => {
    const text = t(key, params);
    return text === key ? '' : text;
  };
  for (const [dealId, lastAt] of marks) {
    const { rows: events } = await query(
      `SELECT e.id, e.kind, e.data, e.created_at, e.node_id, e.project_id, e.author_id, n.code, n.name
       FROM mp_events e LEFT JOIN mp_nodes n ON n.id = e.node_id
       WHERE e.kind = ANY($1) AND e.data->>'crmPending' = 'true' AND e.data->'deal'->>'id' = $2 AND ($3::timestamptz IS NULL OR e.created_at > $3)
       ORDER BY e.created_at, e.id`,
      [REPLAYED, String(dealId), lastAt]
    );
    if (!events.length) continue;
    summary.deals += 1;
    for (const event of events) {
      const node = { id: event.node_id, project_id: event.project_id, code: event.code, name: event.name };
      const data = event.data || {};
      const when = formatDateTime(event.created_at, regional, locale);
      const note = optional('masterplan.dealLine.resync', { date: when });
      const body =
        event.kind === 'expired'
          ? `${t('masterplan.dealLine.expired.booking', { unit: unitLabel(node) })}${note}`
          : t('masterplan.dealLine.text', {
              unit: unitLabel(node),
              status: statusName(data.to, locale),
              until: data.endsAt ? t('masterplan.dealLine.until', { date: formatDateTime(data.endsAt, regional, locale) }) : '',
              reason: `${data.reason ? t('masterplan.dealLine.reason', { reason: data.reason }) : ''}${note}`,
            });
      await crmApi.addDealEvent(dealId, {
        kind: 'masterplan',
        body,
        data: { unitId: node.id, projectId: node.project_id, code: node.code, from: data.from, to: data.to, endsAt: data.endsAt || null, expired: event.kind === 'expired' || undefined, link: `/app/masterplan/p/${node.project_id}/plan?node=${node.id}`, resync: true, at: iso(event.created_at), event: Number(event.id) },
        authorId: event.author_id || null,
      });
      summary.lines += 1;
    }
    // "Сумма сделки = цена юнита", from the units the deal holds now (as afterUnitStatus does).
    if (mpSettings.syncDealAmount && crmApi.setDealAmount) {
      const { rows: held } = await query(
        `SELECT currency, COALESCE(SUM(CASE WHEN status IN ('contract', 'sold', 'handed') THEN COALESCE(contract_amount, price) ELSE price END), 0) AS total
         FROM mp_units WHERE deal_id = $1 AND status IN ('booking', 'deposit', 'contract', 'sold', 'handed') GROUP BY currency`,
        [dealId]
      );
      // One currency only: a deal amount has one (several currencies: left to a person, as live).
      if (held.length === 1 && (held[0].currency || '').trim()) {
        const amount = money(held[0].total);
        if (amount !== null && (await crmApi.setDealAmount(dealId, { amount, currency: held[0].currency.trim(), actorId: null }))) summary.amounts += 1;
      }
    }
  }
  return summary;
}

/** Once per CRM install: replay, then record (not recorded while either module is off: the next try runs it). */
export async function autoCrmResync(crmApi, { installedAt = null } = {}) {
  const crmAt = installedAt || (await crmInstalledAt());
  if (!crmAt) return null;
  const flag = await readJsonFlag(CRM_RESYNC_FLAG);
  if (flag?.crmInstalledAt === crmAt) return null;
  const summary = await resyncCrmDeals(crmApi);
  if (summary.unavailable) return summary;
  const record = { at: new Date().toISOString(), crmInstalledAt: crmAt, deals: summary.deals, lines: summary.lines, amounts: summary.amounts };
  await query(`INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [CRM_RESYNC_FLAG, JSON.stringify(record)]);
  console.log(`[masterplan] caught up with the CRM after its install: ${summary.lines} deal history lines for ${summary.deals} deals, ${summary.amounts} amounts`);
  return summary;
}

/**
 * register(ctx): once the CRM is loaded (ctx.modules.whenLoaded), MASTERPLAN_RESYNC_DELAY_MS (20 s) after the
 * boot, then every 15 minutes until it ran for this CRM install (the CRM or Masterplan may be switched on later
 * without a restart). Nothing when the CRM is not a package (built in: it was never absent).
 */
export function scheduleCrmResync(ctx, { delayMs = Number(process.env.MASTERPLAN_RESYNC_DELAY_MS ?? 20_000), everyMs = 15 * 60_000 } = {}) {
  const whenLoaded = ctx?.modules?.whenLoaded;
  if (typeof whenLoaded !== 'function') return;
  whenLoaded.call(ctx.modules, 'crm', (api) => {
    let timer = null;
    const run = async () => {
      let done = false;
      try {
        const result = await autoCrmResync(api);
        done = result === null || !result.unavailable;
      } catch (err) {
        console.warn('[masterplan] catching up with the CRM failed:', err.message);
      }
      if (!done) {
        timer = setTimeout(run, everyMs);
        timer.unref?.();
      }
    };
    timer = setTimeout(run, Math.max(0, delayMs || 0));
    timer.unref?.();
  });
}
