import { getSettings, parseSettings } from '../../services/settings.js';
import { hasPermission } from '../../services/permissions.js';
import { contextFromRequest, withinLimits } from '../shared/acl.js';

/*
 * Who sees what (docs/crm.md, "Access"):
 *   view    crm.admin / crm.all / settings.visibility 'all', otherwise the
 *           deal's owner, a watcher or its creator
 *   edit    anyone who can view
 *   delete  owner, creator, crm.all, crm.admin (also restore)
 *   admin   pipelines, stages, settings: crm.admin
 * An API token narrowed to some pipelines (api/scopes.js, kind crm.pipelines)
 * sees only their deals and never gets the administrator's bypass.
 */

export const LIMIT_KEY = 'crm_pipelines';

export async function crmSettings() {
  const parsed = parseSettings(await getSettings());
  return { ...parsed.modules.crm.settings };
}

export async function modulesEnabled() {
  const parsed = parseSettings(await getSettings());
  return { companies: Boolean(parsed.modules.companies?.enabled), chat: Boolean(parsed.modules.chat?.enabled), crm: Boolean(parsed.modules.crm?.enabled) };
}

/** The access context of a request (or of a request-like object from requestAs). */
export function crmContext(req, settings) {
  const base = contextFromRequest(req, 'crm.admin');
  const perms = req.access?.permissions || [];
  const canAll = hasPermission(perms, 'crm.admin') || hasPermission(perms, 'crm.all');
  return {
    ...base,
    canAdmin: base.isAdmin,
    canAll,
    seesAll: canAll || settings?.visibility !== 'own',
    settings,
    // The person's language: texts the server makes for them (stock stage names).
    locale: req.locale,
  };
}

export const inPipelineLimits = (ctx, pipelineId) => withinLimits(ctx, LIMIT_KEY, pipelineId);

/** `row` is a crm_deals row; `watcherIds` its watchers. */
export function canView(ctx, row, watcherIds = []) {
  if (!row) return false;
  if (!inPipelineLimits(ctx, row.pipeline_id)) return false;
  if (ctx.seesAll) return true;
  return row.owner_id === ctx.userId || row.created_by === ctx.userId || watcherIds.includes(ctx.userId);
}

export function canDelete(ctx, row) {
  if (!inPipelineLimits(ctx, row.pipeline_id)) return false;
  return ctx.canAll || ctx.canAdmin || row.owner_id === ctx.userId || row.created_by === ctx.userId;
}

/**
 * The visibility condition, built once and shared by every list, board total,
 * counter, export and calendar. Conditions over `d` (crm_deals).
 */
export function visibleSql(ctx, p) {
  const out = [];
  const allowed = ctx.limits?.[LIMIT_KEY];
  if (allowed) out.push(`d.pipeline_id = ANY(${p.add([...allowed])}::int[])`);
  if (!ctx.seesAll) {
    const me = p.add(ctx.userId);
    out.push(`(d.owner_id = ${me} OR d.created_by = ${me} OR EXISTS (SELECT 1 FROM crm_deal_watchers vw WHERE vw.deal_id = d.id AND vw.user_id = ${me}))`);
  }
  return out;
}
