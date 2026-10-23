import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { hasPermission } from '../../services/permissions.js';
import { principalSets, principalsOf, seatMatchSql } from '../approvals/api.js';
import { isParticipant } from '../approvals/api.js';
import { AFTER_APPROVAL } from './logic.js';

/*
 * Who sees what (spec §5.4, docs/procurement.md#permissions):
 *
 *   procurement.admin     everything: directories, settings, routes, any request
 *   procurement.view_all  sees every request
 *   procurement.pay       sees approved requests (to pay onward), marks payments
 *   everyone else         their own (author, responsible, creator), those of
 *                         colleagues from their groups (setting groupVisibility;
 *                         drafts stay private; the default group everyone is
 *                         in does not count), and those where they take part
 *                         in the approval (isParticipant: approver, substitute,
 *                         delegate, question target)
 *   procurement.create    files requests (unless anyoneCanCreate is on)
 */

export const APPROVAL_TYPE = 'procurement.request';

export async function procurementSettings() {
  const parsed = parseSettings(await getSettings());
  return { ...parsed.modules.procurement.settings };
}

export async function modulesState() {
  const parsed = parseSettings(await getSettings());
  const on = (id) => Boolean(parsed.modules[id]?.enabled);
  return { procurement: on('procurement'), companies: on('companies'), crm: on('crm'), masterplan: on('masterplan'), chat: on('chat'), files: on('files'), tasks: on('tasks'), contracts: on('contracts') };
}

/** The access context of a request (or a request-like object from requestAs). */
export function procContext(req, settings) {
  const perms = req?.access?.permissions || req?.user?.permissions || [];
  const system = req?.system === true;
  const has = (perm) => system || hasPermission(perms, perm);
  const canAdmin = has('procurement.admin');
  return {
    req,
    userId: req?.user?.id ? Number(req.user.id) : null,
    groupIds: (req?.access?.groupIds || req?.access?.groups?.map?.((group) => group.id) || []).map(Number),
    canAdmin,
    canViewAll: canAdmin || has('procurement.view_all'),
    canPay: canAdmin || has('procurement.pay'),
    canCreate: canAdmin || Boolean(settings?.anyoneCanCreate) || has('procurement.create'),
    settings,
  };
}

/** Small parameter collector for dynamic SQL. */
export class Params {
  constructor() {
    this.values = [];
  }
  add(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** The person (and the people they substitute for) as seat principals. */
async function principalParams(ctx) {
  if (!ctx._sets) ctx._sets = principalSets(await principalsOf(ctx.userId));
  return ctx._sets;
}

/**
 * SQL condition over `r` (proc_requests) for "may see", or null when the
 * person sees everything. Shared by lists, counters, exports, the registry
 * and the summary so they always agree.
 */
export async function visibleSql(ctx, p) {
  if (ctx.canViewAll) return null;
  if (!ctx.userId) return 'FALSE';
  const me = p.add(ctx.userId);
  const parts = [`r.author_id = ${me}`, `r.responsible_id = ${me}`, `r.created_by = ${me}`];
  if (ctx.settings?.groupVisibility && ctx.groupIds.length) {
    // The default group (everyone is in it) is not "a group in common".
    parts.push(`(r.status <> 'draft' AND EXISTS (SELECT 1 FROM user_group_members gm JOIN app_groups gg ON gg.id = gm.group_id AND gg.is_default = FALSE
      WHERE gm.user_id = r.author_id AND gm.group_id = ANY(${p.add(ctx.groupIds)}::int[])))`);
  }
  if (ctx.canPay) parts.push(`r.status = ANY(${p.add(AFTER_APPROVAL)}::text[])`);
  const sets = await principalParams(ctx);
  // seatMatchSql numbers its five parameters from `base + 1`: add them in that order.
  const base = p.values.length;
  const users = p.add(sets.userIds);
  p.add(sets.roleIds);
  p.add(sets.groupIds);
  p.add(sets.permissions);
  p.add(sets.star);
  // The same rule as isParticipant() of the approvals service, for many rows at once.
  const seat = seatMatchSql('s', base);
  parts.push(`EXISTS (SELECT 1 FROM approval_processes ap WHERE ap.type = '${APPROVAL_TYPE}' AND ap.doc_id = r.id::text
      AND (ap.author_id = ${me} OR ap.question_to = ANY(${users}) OR ap.question_by = ${me}
        OR EXISTS (SELECT 1 FROM approval_seats s WHERE s.process_id = ap.id AND (s.decided_by = ANY(${users}) OR s.delegated_by = ANY(${users}) OR ${seat}))))`);
  return `(${parts.join(' OR ')})`;
}

/** Roles of the person on one request row. */
export function rolesOn(ctx, row) {
  return {
    author: Boolean(ctx.userId && (row.author_id === ctx.userId || row.created_by === ctx.userId)),
    responsible: Boolean(ctx.userId && row.responsible_id === ctx.userId),
    admin: ctx.canAdmin,
    pay: ctx.canPay,
  };
}

/** May the person see this request row? */
export async function canSee(ctx, row) {
  if (!row) return false;
  if (ctx.canViewAll) return true;
  if (!ctx.userId) return false;
  const roles = rolesOn(ctx, row);
  if (roles.author || roles.responsible) return true;
  if (ctx.canPay && AFTER_APPROVAL.includes(row.status)) return true;
  if (ctx.settings?.groupVisibility && row.status !== 'draft' && ctx.groupIds.length && row.author_id) {
    const { rows } = await query(
      `SELECT 1 FROM user_group_members m JOIN app_groups g ON g.id = m.group_id AND g.is_default = FALSE
       WHERE m.user_id = $1 AND m.group_id = ANY($2::int[]) LIMIT 1`,
      [row.author_id, ctx.groupIds]
    );
    if (rows.length) return true;
  }
  return isParticipant(ctx.req, APPROVAL_TYPE, String(row.id));
}
