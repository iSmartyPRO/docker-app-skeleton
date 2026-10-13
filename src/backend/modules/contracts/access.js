import { query } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { hasPermission } from '../../services/permissions.js';
import { isParticipant, participantDocIds } from '../approvals/api.js';
import { TYPE_KEY } from './logic.js';

/*
 * Who sees and changes a contract (spec §6.6, docs/contracts.md "Access"):
 *
 *   view    contracts.view_all / contracts.legal / contracts.admin: every contract;
 *           otherwise the creator, the business owner and the lawyer, people who
 *           share a (non-default) group with one of them, and the approval's
 *           participants (author, approvers now or before, question, delegate)
 *   edit    fields: creator, owner, lawyer while Проект / Нужен ответ / Отклонён;
 *           contracts.legal and contracts.admin also later (prolongation, dates)
 *   files   new versions: creator, owner, lawyer, legal, admin (not in the archive)
 *   risks   the contract's lawyer, contracts.legal, contracts.admin
 *   status  «Подписан», «Действует», «Завершён», «Расторгнут»: contracts.legal / admin
 *   create  contracts.create (legal and admin too)
 *
 * The default group (everyone is in it) does not count as "a group in common".
 */

export async function contractsSettings() {
  const parsed = parseSettings(await getSettings());
  return { ...parsed.modules.contracts.settings };
}

export async function modulesEnabled() {
  const modules = parseSettings(await getSettings()).modules;
  const on = (id) => Boolean(modules[id]?.enabled);
  return { companies: on('companies'), chat: on('chat'), crm: on('crm'), masterplan: on('masterplan'), procurement: on('procurement'), contracts: on('contracts') };
}

/** The access context of a request (or a request-like object from requestAs). */
export function contractsContext(req, settings = {}) {
  const perms = req?.access?.permissions || req?.user?.permissions || [];
  const limited = Boolean(req?.apiLimits);
  const isAdmin = hasPermission(perms, 'contracts.admin') && !limited;
  const isLegal = isAdmin || (hasPermission(perms, 'contracts.legal') && !limited);
  const viewAll = isLegal || hasPermission(perms, 'contracts.view_all');
  return {
    req,
    userId: req?.user?.id ? Number(req.user.id) : null,
    groupIds: req?.access?.groupIds || [],
    isAdmin,
    isLegal,
    viewAll,
    canCreate: isLegal || hasPermission(perms, 'contracts.create'),
    settings,
  };
}

const peopleOf = (row) => [row.created_by, row.owner_id, row.lawyer_id].filter(Boolean);

/** Own contract: created, owned or handled as the lawyer. */
export const isOwn = (ctx, row) => peopleOf(row).includes(ctx.userId);

/** Does the person share a non-default group with one of the contract's people? */
async function sharesGroup(ctx, row) {
  const people = peopleOf(row);
  if (!people.length || !ctx.groupIds.length) return false;
  const { rows } = await query(
    `SELECT 1 FROM user_group_members m JOIN app_groups g ON g.id = m.group_id AND g.is_default = FALSE
     WHERE m.group_id = ANY($1) AND m.user_id = ANY($2) LIMIT 1`,
    [ctx.groupIds, people]
  );
  return rows.length > 0;
}

export async function canView(ctx, row) {
  if (!row || !ctx.userId) return false;
  if (ctx.viewAll || isOwn(ctx, row)) return true;
  if (await sharesGroup(ctx, row)) return true;
  return isParticipant(ctx.req, TYPE_KEY, row.id);
}

/** May change the card's fields now. */
export function canEdit(ctx, row) {
  if (['completed', 'terminated'].includes(row.status)) return ctx.isAdmin;
  if (ctx.isLegal) return true;
  return isOwn(ctx, row) && ['draft', 'question', 'rejected'].includes(row.status);
}

/** May upload versions and pick the current one. */
export function canWorkFiles(ctx, row) {
  if (['completed', 'terminated'].includes(row.status)) return ctx.isAdmin;
  return ctx.isLegal || isOwn(ctx, row);
}

/** May add and resolve risks. */
export function canManageRisks(ctx, row) {
  if (['completed', 'terminated'].includes(row.status)) return ctx.isAdmin;
  return ctx.isLegal || (ctx.userId && row.lawyer_id === ctx.userId);
}

/** Roles for status transitions (logic.checkTransition). */
export function rolesFor(ctx, row) {
  return { legal: ctx.isLegal, editor: ctx.isLegal || isOwn(ctx, row) };
}

/**
 * The visibility condition for lists, shared by the registry, the counters,
 * the calendar and the picker. `p` collects parameters: p.add(value) → '$n'.
 */
export async function visibleSql(ctx, p, alias = 'c') {
  if (ctx.viewAll) return 'TRUE';
  const me = p.add(ctx.userId);
  const parts = [`${alias}.created_by = ${me}`, `${alias}.owner_id = ${me}`, `${alias}.lawyer_id = ${me}`];
  if (ctx.groupIds.length) {
    const groups = p.add(ctx.groupIds);
    parts.push(`EXISTS (SELECT 1 FROM user_group_members vm JOIN app_groups vg ON vg.id = vm.group_id AND vg.is_default = FALSE
      WHERE vm.group_id = ANY(${groups}::int[]) AND vm.user_id IN (${alias}.created_by, ${alias}.owner_id, ${alias}.lawyer_id))`);
  }
  const docs = await participantDocIds(ctx.req, TYPE_KEY);
  if (docs.length) parts.push(`${alias}.id::text = ANY(${p.add(docs)}::text[])`);
  return `(${parts.join(' OR ')})`;
}

export class Params {
  constructor() {
    this.values = [];
  }

  add(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}
