import { query, withTransaction } from '../../config/database.js';
import { getSettings, parseSettings } from '../../services/settings.js';
import { hasPermission } from '../../services/permissions.js';
import { notify } from '../../services/notifications.js';
import { emitEvent } from '../../api/events.js';
import { decide as scopeDecision } from '../../api/scopes.js';
import { getApprovalType, listApprovalTypes, requireApprovalType } from './registry.js';
import {
  ACTIVE_STATUSES,
  cleanRoute,
  conditionValues,
  decisionText,
  httpError,
  localized,
  normalizeUrgency,
  planStages,
  replanStages,
  restartIndex,
  slaState,
  stageClosed,
  stageTimes,
  urgencyRank,
} from './logic.js';
import { describeApprovers, matchingPrincipal, peopleOf, principalSets, principalsOf, seatMatchParams, seatMatchSql, usersById } from './people.js';
import { approvalMessage } from './messages.js';

/*
 * The approvals engine (docs/approvals.md). Every state change runs in one
 * transaction holding a row lock on the process (SELECT … FOR UPDATE), so two
 * people pressing «Согласовать» at the same moment never both count, and a
 * decision on a stage that has already moved on is refused (409).
 *
 * Side effects (notifications, webhooks) run after the commit; the module's
 * onStatus callback runs inside the transaction (info.client), so a module
 * can update its document atomically or abort the decision by throwing.
 */

export const ADMIN_PERMISSION = 'approvals.admin';

// ── Settings and context ────────────────────────────────────────────────────

export async function approvalSettings() {
  const parsed = parseSettings(await getSettings());
  return parsed.modules.approvals?.settings || {};
}

async function enabledModules() {
  return parseSettings(await getSettings()).modules;
}

/** A type is usable while its module is on (types of unknown modules, e.g. tests, always). */
export function typeEnabled(modules, type) {
  return !type || !modules[type.module] || modules[type.module].enabled !== false;
}

const userIdOf = (ctx) => (ctx?.user?.id ? Number(ctx.user.id) : null);
const isSystem = (ctx) => ctx?.system === true;
const permissionsOf = (ctx) => ctx?.access?.permissions || ctx?.user?.permissions || [];

/** Approvals administrators and the type's module administrators manage its route and every process. */
export function canManageType(ctx, type) {
  if (isSystem(ctx)) return true;
  const perms = permissionsOf(ctx);
  return hasPermission(perms, ADMIN_PERMISSION) || (type && hasPermission(perms, type.adminPermission));
}

export const isApprovalsAdmin = (ctx) => isSystem(ctx) || hasPermission(permissionsOf(ctx), ADMIN_PERMISSION);

const tokenPolicyOf = (ctx) => ctx?.apiToken?.policy || ctx?.req?.apiToken?.policy || null;

/**
 * API tokens: a document of another module is reachable through the
 * approvals API only when the token's scope reaches that module, as if its
 * own endpoints were called (read for seeing, write for deciding). Session
 * users and system contexts carry no token and are not affected.
 */
export function tokenAllowsType(ctx, type, level = 'read') {
  const policy = tokenPolicyOf(ctx);
  if (!policy || !type) return true;
  return scopeDecision(policy, level === 'write' ? 'POST' : 'GET', `/app/${type.module}`).ok;
}

function assertTokenScope(ctx, type, level) {
  if (!tokenAllowsType(ctx, type, level)) throw httpError(403, `The token lacks the ${type.module}:${level} scope`, 'SCOPE_DENIED');
}

/** Decisions on a type whose module is switched off are refused (its documents are out of reach too). */
async function assertTypeEnabled(type) {
  if (type && !typeEnabled(await enabledModules(), type)) throw httpError(404, 'The module of this document is turned off', 'MODULE_DISABLED');
}

// ── Routes ──────────────────────────────────────────────────────────────────

function fallbackRoute(type) {
  return {
    name: '',
    stages: [{ id: 'admins', name: '', mode: 'any', approvers: [{ kind: 'permission', key: type.adminPermission }], conditions: [] }],
    restartFrom: 'first',
    escalateTo: [],
    fallback: true,
  };
}

/** The route of a type: the saved one, the module's default, or "any administrator of the module". */
export async function routeFor(type, client = { query }) {
  const { rows } = await client.query(`SELECT * FROM approval_routes WHERE type = $1`, [type.key]);
  if (rows[0]) {
    return {
      id: rows[0].id,
      name: rows[0].name,
      stages: rows[0].stages || [],
      restartFrom: rows[0].restart_from,
      escalateTo: rows[0].escalate_to || [],
      updatedAt: rows[0].updated_at,
      saved: true,
    };
  }
  if (type.defaultRoute) return { ...type.defaultRoute, saved: false, isDefault: true };
  return fallbackRoute(type);
}

export async function saveRoute(ctx, typeKey, input) {
  const type = requireApprovalType(typeKey);
  if (!canManageType(ctx, type)) throw httpError(403, 'You cannot change this route', 'FORBIDDEN');
  const route = cleanRoute(input, type.fields);
  if (!route.stages.length) throw httpError(400, 'A route needs at least one stage with an approver', 'ROUTE_EMPTY');
  await query(
    `INSERT INTO approval_routes (type, name, stages, restart_from, escalate_to, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (type) DO UPDATE SET name = EXCLUDED.name, stages = EXCLUDED.stages, restart_from = EXCLUDED.restart_from,
       escalate_to = EXCLUDED.escalate_to, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [type.key, route.name, JSON.stringify(route.stages), route.restartFrom, JSON.stringify(route.escalateTo), userIdOf(ctx)]
  );
  return routeView(type, await routeFor(type));
}

export async function resetRoute(ctx, typeKey) {
  const type = requireApprovalType(typeKey);
  if (!canManageType(ctx, type)) throw httpError(403, 'You cannot change this route', 'FORBIDDEN');
  await query(`DELETE FROM approval_routes WHERE type = $1`, [type.key]);
  return routeView(type, await routeFor(type));
}

/** A route with approver names, for the builder. */
export async function routeView(type, route) {
  const stages = [];
  for (const stage of route.stages) stages.push({ ...stage, approvers: await describeApprovers(stage.approvers) });
  return { ...route, type: type.key, stages, escalateTo: await describeApprovers(route.escalateTo || []) };
}

/** "For a request of $5 000 in Equipment the route will be…": the stages that apply to sample values. */
export async function previewRoute(ctx, typeKey, values = {}, draft = null) {
  const type = requireApprovalType(typeKey);
  if (!canManageType(ctx, type)) throw httpError(403, 'You cannot see this route', 'FORBIDDEN');
  const route = draft ? cleanRoute(draft, type.fields) : await routeFor(type);
  const plan = planStages(route, values || {});
  const stages = [];
  for (const stage of plan.stages) stages.push({ ...stage, approvers: await describeApprovers(stage.approvers) });
  return { stages, skipped: plan.skipped };
}

// ── Process rows ────────────────────────────────────────────────────────────

const PROCESS_COLUMNS = new Set([
  'round', 'status', 'stages', 'skipped', 'restart_from', 'escalate_to', 'current_stage', 'urgency', 'author_id', 'title', 'number',
  'amount', 'currency', 'url', 'doc_due_at', 'started_at', 'stage_started_at', 'due_at', 'remind_at', 'reminded_at', 'escalated_at',
  'paused_at', 'question_to', 'question_by', 'finished_at',
]);

async function updateProcess(client, id, patch) {
  const keys = Object.keys(patch).filter((key) => PROCESS_COLUMNS.has(key));
  const values = keys.map((key) => (key === 'stages' || key === 'skipped' || key === 'escalate_to' ? JSON.stringify(patch[key]) : patch[key]));
  const sets = keys.map((key, index) => `${key} = $${index + 2}`);
  const { rows } = await client.query(`UPDATE approval_processes SET ${[...sets, 'updated_at = NOW()'].join(', ')} WHERE id = $1 RETURNING *`, [id, ...values]);
  return rows[0];
}

async function logEvent(client, process, action, { actorId = null, onBehalfOf = null, targetId = null, comment = null, data = {}, stageIndex } = {}) {
  await client.query(
    `INSERT INTO approval_events (process_id, round, stage_index, action, actor_id, on_behalf_of, target_id, comment, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [process.id, process.round, stageIndex === undefined ? process.current_stage : stageIndex, action, actorId, onBehalfOf, targetId, comment || null, JSON.stringify(data)]
  );
}

function summaryColumns(summary) {
  const amount = summary.amount === null || summary.amount === undefined || summary.amount === '' ? null : Number(summary.amount);
  const dueAt = summary.dueAt ? new Date(summary.dueAt) : null;
  return {
    title: String(summary.title || '').slice(0, 300) || '—',
    number: summary.number ? String(summary.number).slice(0, 40) : null,
    amount: Number.isFinite(amount) ? amount : null,
    currency: summary.currency && /^[A-Za-z]{3}$/.test(summary.currency) ? String(summary.currency).toUpperCase() : null,
    url: summary.url ? String(summary.url).slice(0, 500) : null,
    doc_due_at: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
  };
}

async function loadSummary(type, docId) {
  const summary = await type.load(String(docId));
  if (!summary) throw httpError(404, 'Document not found', 'NOT_FOUND');
  return summary;
}

const snapshotStage = (stage) => ({ id: stage.id, name: stage.name || '', mode: stage.mode === 'any' ? 'any' : 'all', approvers: stage.approvers });

/** Opens stage `index`: seats for its approvers, deadline and reminder from the urgency. */
async function activateStage(client, process, index, settings, now = new Date()) {
  const stage = process.stages[index];
  for (const approver of stage.approvers) {
    await client.query(
      `INSERT INTO approval_seats (process_id, round, stage_index, kind, ref_id, ref_key, activated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [process.id, process.round, index, approver.kind, approver.kind === 'permission' ? null : approver.id, approver.kind === 'permission' ? approver.key : null, now]
    );
  }
  const times = stageTimes(settings, process.urgency, now);
  return updateProcess(client, process.id, {
    current_stage: index,
    stage_started_at: now,
    due_at: times.dueAt,
    remind_at: times.remindAt,
    reminded_at: null,
    escalated_at: null,
    paused_at: null,
    question_to: null,
  });
}

async function stageSeats(client, process, index = process.current_stage, lock = false) {
  const { rows } = await client.query(
    `SELECT * FROM approval_seats WHERE process_id = $1 AND round = $2 AND stage_index = $3 ORDER BY id${lock ? ' FOR UPDATE' : ''}`,
    [process.id, process.round, index]
  );
  return rows;
}

async function lockProcess(client, ref) {
  let rows;
  if (typeof ref === 'object' && ref !== null && ref.type) {
    ({ rows } = await client.query(`SELECT * FROM approval_processes WHERE type = $1 AND doc_id = $2 FOR UPDATE`, [String(ref.type), String(ref.docId)]));
  } else {
    const id = Number(ref);
    if (!Number.isInteger(id) || id < 1) throw httpError(404, 'Approval not found', 'NOT_FOUND');
    ({ rows } = await client.query(`SELECT * FROM approval_processes WHERE id = $1 FOR UPDATE`, [id]));
  }
  if (!rows[0]) throw httpError(404, 'Approval not found', 'NOT_FOUND');
  return rows[0];
}

/** Plain shape for webhooks and onStatus. */
export function processShape(process, type = getApprovalType(process.type)) {
  const stage = process.stages?.[process.current_stage];
  return {
    id: Number(process.id),
    type: process.type,
    module: type?.module || process.type.split('.')[0],
    docId: process.doc_id,
    status: process.status,
    round: process.round,
    urgency: process.urgency,
    stage: stage ? { index: process.current_stage, id: stage.id, name: stage.name } : null,
    stagesTotal: process.stages?.length || 0,
    title: process.title,
    number: process.number,
    amount: process.amount === null ? null : Number(process.amount),
    currency: process.currency,
    url: process.url,
    authorId: process.author_id,
    startedAt: process.started_at,
    dueAt: process.status === 'pending' ? process.due_at : null,
    finishedAt: process.finished_at,
  };
}

async function callOnStatus(type, client, process, info) {
  if (!type?.onStatus) return;
  await type.onStatus(process.doc_id, process.status, { ...info, client, process: processShape(process, type) });
}

// ── Side effects ────────────────────────────────────────────────────────────

function docOf(process, type) {
  return {
    typeTitle: type?.title || process.type,
    title: process.title,
    number: process.number,
    amount: process.amount === null ? null : Number(process.amount),
    currency: process.currency,
    dueAt: process.due_at,
  };
}

const linkOf = (process) => process.url || `/app/approvals?process=${process.id}`;

async function nameOf(userId) {
  if (!userId) return '';
  return (await usersById([userId])).get(userId)?.name || '';
}

/** Runs after the commit; never throws. */
async function runEffects(effects) {
  for (const effect of effects) {
    try {
      await effect();
    } catch (err) {
      console.warn('[approvals] side effect failed:', err.message);
    }
  }
}

function emitApproval(name, process, type, actorId, extra = {}) {
  return () =>
    emitEvent(`approval.${name}`, {
      actorId,
      data: { approval: processShape(process, type), ...extra },
      visible: async (req) => canSeeProcess(req, process),
    });
}

function notifyStage(process, type, actorId, extra = {}) {
  return async () => {
    const seats = await stageSeats({ query }, process);
    const open = seats.filter((seat) => !seat.decision);
    const people = await peopleOf(open);
    const stage = process.stages[process.current_stage];
    if (!people.length) {
      const targets = await escalationPeople(process, type);
      await notify({ userIds: targets, kind: 'approval.escalation', module: 'approvals', link: linkOf(process), render: approvalMessage('noApprovers', { doc: docOf(process, type), stage: stage?.name || `#${process.current_stage + 1}` }) });
      return;
    }
    await notify({
      userIds: people,
      kind: 'approval.request',
      module: 'approvals',
      link: linkOf(process),
      actorId,
      render: approvalMessage('request', { doc: docOf(process, type), stage: stage?.name || '', actor: await nameOf(actorId), ...extra }),
    });
  };
}

function notifyUsers(userIds, kind, message, process, type, actorId, params = {}) {
  return async () => {
    await notify({
      userIds,
      kind,
      module: 'approvals',
      link: linkOf(process),
      actorId,
      render: approvalMessage(message, { doc: docOf(process, type), actor: await nameOf(actorId), ...params }),
    });
  };
}

/** Who hears about an overdue stage: the route's escalation people, else the module's administrators. */
export async function escalationPeople(process, type) {
  const refs = process.escalate_to?.length ? process.escalate_to : [{ kind: 'permission', key: type?.adminPermission || ADMIN_PERMISSION }];
  return peopleOf(refs, { substitutes: false });
}

// ── Starting ────────────────────────────────────────────────────────────────

async function assertCanSee(ctx, type, docId) {
  assertTokenScope(ctx, type, 'write');
  if (isSystem(ctx) || canManageType(ctx, type)) return;
  if (!userIdOf(ctx)) throw httpError(401, 'Sign in', 'UNAUTHORIZED');
  if (!(await type.canView(ctx, String(docId)))) throw httpError(403, 'No access to this document', 'FORBIDDEN');
}

/**
 * Sends a document to approval: plans the route against the document's
 * fields and opens the first stage. A finished process (approved, rejected,
 * withdrawn) starts again as a new round; a returned one goes back through
 * restart() (the author's «Отправить заново»), never through a fresh start.
 */
export async function startApproval(ctx, typeKey, docId, options = {}) {
  const type = requireApprovalType(typeKey);
  await assertTypeEnabled(type);
  await assertCanSee(ctx, type, docId);
  const summary = await loadSummary(type, docId);
  const settings = await approvalSettings();
  const route = await routeFor(type);
  const plan = planStages(route, conditionValues(summary));
  const urgency = normalizeUrgency(settings, options.urgency ?? summary.urgency);
  const authorId = Number(summary.author?.id || summary.authorId || userIdOf(ctx)) || null;
  const actorId = userIdOf(ctx);
  const effects = [];
  const process = await withTransaction(async (client) => {
    const { rows: existing } = await client.query(`SELECT * FROM approval_processes WHERE type = $1 AND doc_id = $2 FOR UPDATE`, [type.key, String(docId)]);
    const now = new Date();
    const base = {
      status: 'pending',
      stages: plan.stages.map(snapshotStage),
      skipped: plan.skipped,
      restart_from: route.restartFrom || 'first',
      escalate_to: route.escalateTo || [],
      current_stage: 0,
      urgency,
      author_id: authorId,
      ...summaryColumns(summary),
      started_at: now,
      stage_started_at: null,
      due_at: null,
      remind_at: null,
      reminded_at: null,
      escalated_at: null,
      paused_at: null,
      question_to: null,
      question_by: null,
      finished_at: null,
    };
    let row;
    if (existing[0]) {
      if (ACTIVE_STATUSES.includes(existing[0].status)) throw httpError(409, 'The document is already in approval', 'ALREADY_RUNNING');
      if (existing[0].status === 'returned') throw httpError(409, 'The document was returned for rework: send it again', 'NOT_RESTART', { status: 'returned' });
      row = await updateProcess(client, existing[0].id, { ...base, round: existing[0].round + 1 });
    } else {
      const inserted = await client.query(
        `INSERT INTO approval_processes (type, doc_id) VALUES ($1, $2) ON CONFLICT (type, doc_id) DO NOTHING RETURNING id`,
        [type.key, String(docId)]
      );
      if (!inserted.rows[0]) throw httpError(409, 'The document is already in approval', 'ALREADY_RUNNING');
      row = await updateProcess(client, inserted.rows[0].id, { ...base, round: 1 });
    }
    await logEvent(client, row, 'started', { actorId, comment: options.comment ? String(options.comment).slice(0, 2000) : null, data: { stages: row.stages.length, skipped: plan.skipped.length, urgency } });
    if (!row.stages.length) {
      row = await updateProcess(client, row.id, { status: 'approved', finished_at: now });
      await logEvent(client, row, 'approved', { data: { auto: true } });
      await callOnStatus(type, client, row, { action: 'start', actorId });
      effects.push(emitApproval('approved', row, type, actorId));
      return row;
    }
    row = await activateStage(client, row, 0, settings, now);
    await callOnStatus(type, client, row, { action: 'start', actorId });
    effects.push(notifyStage(row, type, actorId), emitApproval('started', row, type, actorId));
    return row;
  });
  await runEffects(effects);
  return getProcess(type.key, docId, ctx);
}

// ── Decisions ───────────────────────────────────────────────────────────────

async function finishOrAdvance(client, process, type, settings, actorId, effects) {
  const seats = await stageSeats(client, process);
  const stage = process.stages[process.current_stage];
  if (!stageClosed(stage.mode, seats)) return process;
  // Seats nobody decided in an "any of" stage stay open in history but no longer wait.
  await logEvent(client, process, 'stage_done', { data: { stage: stage.id } });
  const next = process.current_stage + 1;
  if (next >= process.stages.length) {
    const row = await updateProcess(client, process.id, { status: 'approved', finished_at: new Date(), due_at: null, remind_at: null });
    await logEvent(client, row, 'approved', {});
    await callOnStatus(type, client, row, { action: 'approve', actorId });
    effects.push(notifyUsers([row.author_id], 'approval.approved', 'approved', row, type, actorId), emitApproval('approved', row, type, actorId));
    return row;
  }
  const row = await activateStage(client, process, next, settings);
  effects.push(
    notifyUsers([row.author_id], 'approval.progress', 'progress', row, type, actorId, { stage: stage.name || `#${process.current_stage + 1}` }),
    notifyStage(row, type, actorId)
  );
  return row;
}

async function activeUser(id) {
  const target = Number(id);
  if (!Number.isInteger(target) || target < 1) return null;
  const { rows } = await query(`SELECT id FROM users WHERE id = $1 AND is_active IS NOT FALSE AND is_blocked IS NOT TRUE`, [target]);
  return rows[0]?.id || null;
}

/**
 * A decision of the signed-in person on the current stage.
 *   action: 'approve' | 'reject' | 'question' | 'return' | 'delegate'
 *   comment: required for reject / return; the question text for question
 *   to: user id — question: whom to ask (default the author); delegate: who decides instead
 *   round, stage: what the person saw; a mismatch answers 409 STALE
 * `ref` is a process id or { type, docId }.
 */
export async function decide(ctx, ref, input = {}) {
  const userId = userIdOf(ctx);
  if (!userId) throw httpError(401, 'Sign in', 'UNAUTHORIZED');
  const action = String(input.action || '');
  if (!['approve', 'reject', 'question', 'return', 'delegate'].includes(action)) throw httpError(400, 'Unknown decision', 'BAD_ACTION');
  const comment = decisionText(action, input.comment);
  let target = null;
  if (action === 'delegate' || (action === 'question' && input.to)) {
    target = await activeUser(input.to);
    if (!target) throw httpError(400, 'Choose an active person', 'BAD_TARGET');
    if (action === 'delegate' && target === userId) throw httpError(400, 'Choose someone else', 'BAD_TARGET');
  }
  const principals = await principalsOf(userId);
  const settings = await approvalSettings();
  const modules = await enabledModules();
  const effects = [];
  let type = null;
  const row = await withTransaction(async (client) => {
    const process = await lockProcess(client, ref);
    type = getApprovalType(process.type);
    if (!typeEnabled(modules, type)) throw httpError(404, 'The module of this document is turned off', 'MODULE_DISABLED');
    assertTokenScope(ctx, type, 'write');
    if (process.status !== 'pending') throw httpError(409, 'This approval is no longer waiting for a decision', 'NOT_PENDING', { status: process.status });
    if ((input.round !== undefined && Number(input.round) !== process.round) || (input.stage !== undefined && Number(input.stage) !== process.current_stage)) {
      throw httpError(409, 'The approval has moved on; refresh', 'STALE', { round: process.round, stage: process.current_stage });
    }
    const seats = await stageSeats(client, process, process.current_stage, true);
    const mine = seats.filter((seat) => !seat.decision && matchingPrincipal(seat, principals));
    if (!mine.length) {
      if (seats.some((seat) => seat.decided_by === userId)) throw httpError(409, 'You have already decided', 'ALREADY_DECIDED');
      throw httpError(403, 'You are not an approver of this stage', 'NOT_APPROVER');
    }
    const principal = matchingPrincipal(mine[0], principals);
    const onBehalfOf = principal && principal.userId !== userId ? principal.userId : null;
    const ids = mine.map((seat) => seat.id);
    const now = new Date();
    const decideSeats = (decision) =>
      client.query(`UPDATE approval_seats SET decision = $2, decided_by = $3, on_behalf_of = $4, decided_at = $5, comment = $6 WHERE id = ANY($1)`, [ids, decision, userId, onBehalfOf, now, comment || null]);
    const eventOptions = { actorId: userId, onBehalfOf, comment, data: { seats: ids } };

    if (action === 'approve') {
      await decideSeats('approved');
      await logEvent(client, process, 'approve', eventOptions);
      effects.push(emitApproval('decision', process, type, userId, { decision: 'approve', comment }));
      return finishOrAdvance(client, process, type, settings, userId, effects);
    }
    if (action === 'reject' || action === 'return') {
      await decideSeats(action === 'reject' ? 'rejected' : 'returned');
      const status = action === 'reject' ? 'rejected' : 'returned';
      const next = await updateProcess(client, process.id, { status, finished_at: action === 'reject' ? now : null, due_at: null, remind_at: null });
      await logEvent(client, next, action, eventOptions);
      await callOnStatus(type, client, next, { action, actorId: userId, comment });
      effects.push(
        notifyUsers([next.author_id], `approval.${status}`, status, next, type, userId, { comment }),
        emitApproval(status, next, type, userId, { comment })
      );
      return next;
    }
    if (action === 'question') {
      const to = target || process.author_id;
      if (!to) throw httpError(400, 'Choose whom to ask', 'BAD_TARGET');
      const next = await updateProcess(client, process.id, { status: 'question', question_to: to, question_by: userId, paused_at: now });
      await logEvent(client, next, 'question', { ...eventOptions, targetId: to });
      await callOnStatus(type, client, next, { action, actorId: userId, comment, to });
      effects.push(notifyUsers([to], 'approval.question', 'question', next, type, userId, { comment }), emitApproval('question', next, type, userId, { comment, to }));
      return next;
    }
    // delegate
    await client.query(`UPDATE approval_seats SET delegated_to = $2, delegated_by = $3 WHERE id = ANY($1)`, [ids, target, userId]);
    await logEvent(client, process, 'delegate', { ...eventOptions, targetId: target });
    effects.push(
      notifyUsers([target], 'approval.request', 'request', process, type, userId, { delegated: true, comment, stage: process.stages[process.current_stage]?.name || '' }),
      emitApproval('delegated', process, type, userId, { to: target, comment })
    );
    return process;
  });
  await runEffects(effects);
  return getProcess(row.type, row.doc_id, ctx);
}

/** The answer to a question: back to the same stage, the deadline moved by the time spent waiting. */
export async function answer(ctx, ref, input = {}) {
  const userId = userIdOf(ctx);
  if (!userId) throw httpError(401, 'Sign in', 'UNAUTHORIZED');
  const comment = String(input.comment ?? '').trim().slice(0, 4000);
  if (!comment) throw httpError(400, 'Write the answer', 'COMMENT_REQUIRED');
  const modules = await enabledModules();
  const effects = [];
  const row = await withTransaction(async (client) => {
    const process = await lockProcess(client, ref);
    const type = getApprovalType(process.type);
    if (!typeEnabled(modules, type)) throw httpError(404, 'The module of this document is turned off', 'MODULE_DISABLED');
    assertTokenScope(ctx, type, 'write');
    if (process.status !== 'question') throw httpError(409, 'There is no open question', 'NOT_QUESTION', { status: process.status });
    const allowed = [process.question_to, process.author_id].includes(userId) || (await substitutesFor(userId)).includes(process.question_to) || canManageType(ctx, type);
    if (!allowed) throw httpError(403, 'The question is addressed to someone else', 'FORBIDDEN');
    const now = new Date();
    const shift = process.paused_at ? now.getTime() - new Date(process.paused_at).getTime() : 0;
    const moved = (value) => (value ? new Date(new Date(value).getTime() + shift) : value);
    const next = await updateProcess(client, process.id, { status: 'pending', paused_at: null, question_to: null, due_at: moved(process.due_at), remind_at: moved(process.remind_at) });
    await logEvent(client, next, 'answer', { actorId: userId, targetId: process.question_by, comment });
    await callOnStatus(type, client, next, { action: 'answer', actorId: userId, comment });
    effects.push(
      notifyUsers([process.question_by], 'approval.answer', 'answer', next, type, userId, { comment }),
      emitApproval('answered', next, type, userId, { comment }),
      () => refreshApproval(next.type, next.doc_id)
    );
    return next;
  });
  await runEffects(effects);
  return getProcess(row.type, row.doc_id, ctx);
}

async function substitutesFor(userId) {
  return (await principalsOf(userId)).map((p) => p.userId).filter((id) => id !== userId);
}

function assertAuthorOrManager(ctx, process, type) {
  if (isSystem(ctx) || canManageType(ctx, type)) return;
  if (userIdOf(ctx) && userIdOf(ctx) === process.author_id) return;
  throw httpError(403, 'Only the author can do this', 'FORBIDDEN');
}

/** The author takes the document back while it is not approved yet. */
export async function withdraw(ctx, typeKey, docId, input = {}) {
  const effects = [];
  const actorId = userIdOf(ctx);
  const row = await withTransaction(async (client) => {
    const process = await lockProcess(client, { type: typeKey, docId });
    const type = getApprovalType(process.type);
    assertTokenScope(ctx, type, 'write');
    assertAuthorOrManager(ctx, process, type);
    if (![...ACTIVE_STATUSES, 'returned'].includes(process.status)) throw httpError(409, 'Nothing to withdraw', 'NOT_ACTIVE', { status: process.status });
    const wasWaiting = process.status === 'pending' ? await stageSeats(client, process) : [];
    const next = await updateProcess(client, process.id, { status: 'withdrawn', finished_at: new Date(), due_at: null, remind_at: null, question_to: null, paused_at: null });
    const comment = String(input.comment ?? '').trim().slice(0, 2000) || null;
    await logEvent(client, next, 'withdraw', { actorId, comment });
    await callOnStatus(type, client, next, { action: 'withdraw', actorId, comment });
    effects.push(async () => {
      const people = await peopleOf(wasWaiting.filter((seat) => !seat.decision), { substitutes: false });
      await notifyUsers(people, 'approval.withdrawn', 'withdrawn', next, type, actorId)();
    }, emitApproval('withdrawn', next, type, actorId));
    return next;
  });
  await runEffects(effects);
  return getProcess(row.type, row.doc_id, ctx);
}

/**
 * Sends a returned document again. The route is planned anew (the document
 * may have changed) and starts from the first stage, or from the stage that
 * returned it when the route says restartFrom: 'current'.
 */
export async function restart(ctx, typeKey, docId, options = {}) {
  const type = requireApprovalType(typeKey);
  await assertTypeEnabled(type);
  assertTokenScope(ctx, type, 'write');
  const summary = await loadSummary(type, docId);
  const settings = await approvalSettings();
  const route = await routeFor(type);
  const plan = planStages(route, conditionValues(summary));
  const actorId = userIdOf(ctx);
  const effects = [];
  await withTransaction(async (client) => {
    const process = await lockProcess(client, { type: type.key, docId });
    assertAuthorOrManager(ctx, process, type);
    if (process.status !== 'returned') throw httpError(409, 'Only a returned document can be sent again', 'NOT_RETURNED', { status: process.status });
    const fromId = process.stages[process.current_stage]?.id;
    const urgency = normalizeUrgency(settings, options.urgency ?? summary.urgency ?? process.urgency);
    let row = await updateProcess(client, process.id, {
      round: process.round + 1,
      status: 'pending',
      stages: plan.stages.map(snapshotStage),
      skipped: plan.skipped,
      restart_from: route.restartFrom || 'first',
      escalate_to: route.escalateTo || [],
      urgency,
      ...summaryColumns(summary),
      finished_at: null,
      question_by: null,
    });
    const index = restartIndex(row.restart_from, row.stages, fromId);
    await logEvent(client, row, 'restart', { actorId, comment: options.comment ? String(options.comment).slice(0, 2000) : null, data: { from: index }, stageIndex: index });
    if (!row.stages.length) {
      row = await updateProcess(client, row.id, { status: 'approved', finished_at: new Date() });
      await logEvent(client, row, 'approved', { data: { auto: true } });
      await callOnStatus(type, client, row, { action: 'restart', actorId });
      effects.push(emitApproval('approved', row, type, actorId));
      return;
    }
    row = await activateStage(client, row, index, settings);
    await callOnStatus(type, client, row, { action: 'restart', actorId });
    effects.push(notifyStage(row, type, actorId), emitApproval('started', row, type, actorId, { restart: true }));
  });
  await runEffects(effects);
  return getProcess(type.key, docId, ctx);
}

/**
 * Re-reads the document's summary (title, number, amount, link) into the
 * process; call after editing the document. While the process runs
 * (pending / question) the route is also planned again against the new
 * field values for the stages not reached yet: raising the amount above a
 * condition's threshold adds that stage after the current one, lowering it
 * drops a stage nobody has reached. Stages already reached stay as they are.
 */
export async function refreshApproval(typeKey, docId, { actorId = null } = {}) {
  const type = getApprovalType(typeKey);
  if (!type) return null;
  const summary = await type.load(String(docId));
  if (!summary) return null;
  const cols = summaryColumns(summary);
  const route = await routeFor(type);
  const plan = planStages(route, conditionValues(summary));
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM approval_processes WHERE type = $1 AND doc_id = $2 FOR UPDATE`, [type.key, String(docId)]);
    if (!rows[0]) return null;
    let process = await updateProcess(client, rows[0].id, cols);
    if (ACTIVE_STATUSES.includes(process.status)) {
      const next = replanStages(process.stages || [], process.current_stage, plan);
      if (next.changed) {
        process = await updateProcess(client, process.id, { stages: next.stages.map(snapshotStage), skipped: next.skipped });
        await logEvent(client, process, 'replanned', { actorId, data: { added: next.added, removed: next.removed } });
      }
    }
    return process.id;
  });
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** Author, current or past approver (or their substitute), question target, delegate. */
export async function isParticipant(ctx, typeKey, docId) {
  const userId = userIdOf(ctx);
  if (!userId) return false;
  const { rows } = await query(`SELECT * FROM approval_processes WHERE type = $1 AND doc_id = $2`, [String(typeKey), String(docId)]);
  return rows[0] ? participantOf(userId, rows[0]) : false;
}

async function participantOf(userId, process) {
  if ([process.author_id, process.question_to, process.question_by].includes(userId)) return true;
  const principals = await principalsOf(userId);
  const sets = principalSets(principals);
  // A question addressed to someone I stand in for is mine too (as in the inbox and module lists).
  if (process.question_to && sets.userIds.includes(Number(process.question_to))) return true;
  const { rows } = await query(
    `SELECT 1 FROM approval_seats s WHERE s.process_id = $6 AND (s.decided_by = ANY($1) OR s.delegated_by = ANY($1) OR ${seatMatchSql('s')}) LIMIT 1`,
    [...seatMatchParams(sets), process.id]
  );
  return rows.length > 0;
}

/** May this request-like context see the process (for webhooks and the HTTP API)? */
export async function canSeeProcess(ctx, process) {
  const type = getApprovalType(process.type);
  if (!tokenAllowsType(ctx, type, 'read')) return false;
  if (canManageType(ctx, type)) return true;
  const userId = userIdOf(ctx);
  if (!userId) return false;
  if (await participantOf(userId, process)) return true;
  if (!type) return false;
  try {
    return Boolean(await type.canView(ctx, process.doc_id));
  } catch {
    return false;
  }
}

function slaOf(process, settings) {
  if (process.status !== 'pending' || !process.due_at) return { state: 'none', dueAt: null };
  return { state: slaState(process.due_at, settings.soonHours || 24), dueAt: process.due_at };
}

const ms = (from, to) => (from && to ? new Date(to).getTime() - new Date(from).getTime() : null);

/**
 * Everything the path strip and the card need: stages with approvers,
 * ticks and response times, the current stage and its deadline, the open
 * question, history, and what the viewer may do (`my`). Null when the
 * document never went to approval.
 */
export async function getProcess(typeKey, docId, ctx = null) {
  const { rows } = await query(`SELECT * FROM approval_processes WHERE type = $1 AND doc_id = $2`, [String(typeKey), String(docId)]);
  if (!rows[0]) return null;
  return processView(rows[0], ctx);
}

export async function getProcessById(id, ctx) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) throw httpError(404, 'Approval not found', 'NOT_FOUND');
  const { rows } = await query(`SELECT * FROM approval_processes WHERE id = $1`, [n]);
  if (!rows[0]) throw httpError(404, 'Approval not found', 'NOT_FOUND');
  if (ctx && !isSystem(ctx) && !(await canSeeProcess(ctx, rows[0]))) throw httpError(404, 'Approval not found', 'NOT_FOUND');
  return processView(rows[0], ctx);
}

async function processView(process, ctx) {
  const type = getApprovalType(process.type);
  const settings = await approvalSettings();
  const { rows: seats } = await query(`SELECT * FROM approval_seats WHERE process_id = $1 AND round = $2 ORDER BY stage_index, id`, [process.id, process.round]);
  const { rows: events } = await query(`SELECT * FROM approval_events WHERE process_id = $1 ORDER BY id`, [process.id]);
  const userIds = [
    process.author_id,
    process.question_to,
    process.question_by,
    ...seats.flatMap((seat) => [seat.decided_by, seat.on_behalf_of, seat.delegated_to, seat.delegated_by]),
    ...events.flatMap((event) => [event.actor_id, event.on_behalf_of, event.target_id]),
  ];
  const people = await usersById(userIds);
  const person = (id) => (id ? people.get(id) || { id, name: `#${id}` } : null);
  const viewerId = userIdOf(ctx);
  const principals = viewerId ? await principalsOf(viewerId) : [];
  const mineOpen = [];

  const stages = [];
  for (let index = 0; index < process.stages.length; index += 1) {
    const stage = process.stages[index];
    const stageSeatsList = seats.filter((seat) => seat.stage_index === index);
    let state = 'upcoming';
    if (index < process.current_stage || process.status === 'approved') state = 'done';
    else if (index === process.current_stage) {
      state = { pending: 'current', question: 'question', rejected: 'rejected', returned: 'returned', withdrawn: 'withdrawn' }[process.status] || 'current';
    }
    let approvers;
    if (stageSeatsList.length) {
      const labels = await describeApprovers(stageSeatsList.map((seat) => ({ kind: seat.kind, id: seat.ref_id, key: seat.ref_key })));
      approvers = stageSeatsList.map((seat, i) => {
        if (state === 'current' && !seat.decision && principals.length && matchingPrincipal(seat, principals)) mineOpen.push(Number(seat.id));
        return {
          seatId: Number(seat.id),
          ...labels[i],
          delegatedTo: person(seat.delegated_to),
          delegatedBy: person(seat.delegated_by),
          decision: seat.decision,
          decidedBy: person(seat.decided_by),
          onBehalfOf: person(seat.on_behalf_of),
          decidedAt: seat.decided_at,
          comment: seat.comment,
          responseMs: seat.decided_at ? ms(seat.activated_at, seat.decided_at) : null,
        };
      });
    } else {
      approvers = (await describeApprovers(stage.approvers)).map((label) => ({ ...label, decision: null }));
    }
    const decidedTimes = stageSeatsList.map((seat) => seat.decided_at).filter(Boolean).map((value) => new Date(value).getTime());
    stages.push({
      index,
      id: stage.id,
      name: stage.name,
      mode: stage.mode,
      state,
      startedAt: stageSeatsList[0]?.activated_at || null,
      finishedAt: state === 'done' && decidedTimes.length ? new Date(Math.max(...decidedTimes)) : null,
      approvers,
    });
  }

  const lastQuestion = [...events].reverse().find((event) => event.action === 'question' && event.round === process.round);
  const isAuthor = Boolean(viewerId && viewerId === process.author_id);
  const manager = ctx ? canManageType(ctx, type) : false;
  const substituteOf = principals.map((p) => p.userId);
  const urgencyLevel = (settings.urgencies || []).find((level) => level.key === process.urgency) || null;
  return {
    id: Number(process.id),
    type: process.type,
    typeTitle: type?.title || process.type,
    module: type?.module || process.type.split('.')[0],
    docId: process.doc_id,
    status: process.status,
    round: process.round,
    urgency: process.urgency,
    urgencyLevel,
    title: process.title,
    number: process.number,
    amount: process.amount === null ? null : Number(process.amount),
    currency: process.currency,
    url: process.url,
    author: person(process.author_id),
    startedAt: process.started_at,
    finishedAt: process.finished_at,
    currentStage: process.current_stage,
    stageStartedAt: process.stage_started_at,
    dueAt: process.status === 'pending' || process.status === 'question' ? process.due_at : null,
    sla: slaOf(process, settings),
    overdue: process.status === 'pending' && process.due_at && new Date(process.due_at) <= new Date(),
    question:
      process.status === 'question' && lastQuestion
        ? { text: lastQuestion.comment, by: person(lastQuestion.actor_id), to: person(process.question_to), at: lastQuestion.created_at }
        : null,
    stages,
    skipped: process.skipped || [],
    history: events.map((event) => ({
      id: Number(event.id),
      round: event.round,
      stage: event.stage_index,
      stageName: process.stages[event.stage_index]?.name ?? null,
      action: event.action,
      actor: person(event.actor_id),
      onBehalfOf: person(event.on_behalf_of),
      target: person(event.target_id),
      comment: event.comment,
      data: event.data,
      at: event.created_at,
    })),
    my: {
      isAuthor,
      canDecide: process.status === 'pending' && mineOpen.length > 0,
      seatIds: mineOpen,
      canAnswer: process.status === 'question' && Boolean(viewerId) && (viewerId === process.question_to || isAuthor || substituteOf.includes(process.question_to) || manager),
      canWithdraw: [...ACTIVE_STATUSES, 'returned'].includes(process.status) && (isAuthor || manager),
      canRestart: process.status === 'returned' && (isAuthor || manager),
      canStart: !ACTIVE_STATUSES.includes(process.status) && process.status !== 'returned' && (isAuthor || manager),
      canManage: manager,
    },
  };
}

// ── Lists ───────────────────────────────────────────────────────────────────

function listItem(process, type, kind, actions, people, settings, extra = {}) {
  const stage = process.stages?.[process.current_stage];
  const author = process.author_id ? people.get(process.author_id) || null : null;
  const dueAt = kind === 'approval' ? process.due_at : null;
  return {
    key: `approvals:${process.id}`,
    module: type?.module || process.type.split('.')[0],
    kind,
    id: Number(process.id),
    title: process.title,
    number: process.number,
    amount: process.amount === null ? null : Number(process.amount),
    currency: process.currency,
    urgency: process.urgency,
    urgencyRank: urgencyRank(settings, process.urgency),
    author,
    dueAt,
    since: kind === 'approval' ? process.stage_started_at : process.updated_at,
    overdue: Boolean(dueAt && new Date(dueAt) <= new Date()),
    url: process.url,
    actions,
    meta: {
      type: process.type,
      typeTitle: type?.title || process.type,
      docId: process.doc_id,
      processId: Number(process.id),
      round: process.round,
      stage: process.current_stage,
      stageName: stage?.name || '',
      stagesTotal: process.stages?.length || 0,
      status: process.status,
      ...extra,
    },
  };
}

/** Items of the «Ждёт меня» inbox from approvals (the provider registered in index.js). */
export async function inboxItems(ctx) {
  const userId = userIdOf(ctx);
  if (!userId) return [];
  const principals = await principalsOf(userId);
  const sets = principalSets(principals);
  const settings = await approvalSettings();
  const modules = await enabledModules();
  const { rows: waiting } = await query(
    `SELECT DISTINCT p.* FROM approval_processes p
     JOIN approval_seats s ON s.process_id = p.id AND s.round = p.round AND s.stage_index = p.current_stage
     WHERE p.status = 'pending' AND s.decision IS NULL AND ${seatMatchSql('s')}
     ORDER BY p.due_at NULLS LAST LIMIT 500`,
    seatMatchParams(sets)
  );
  const { rows: questions } = await query(
    `SELECT * FROM approval_processes WHERE status = 'question' AND question_to = ANY($1) ORDER BY paused_at LIMIT 200`,
    [sets.userIds]
  );
  const { rows: returned } = await query(`SELECT * FROM approval_processes WHERE status = 'returned' AND author_id = $1 ORDER BY updated_at DESC LIMIT 200`, [userId]);
  const usable = (process) => {
    const type = getApprovalType(process.type);
    return type && typeEnabled(modules, type) && tokenAllowsType(ctx, type, 'read') ? type : null;
  };
  const shown = (list) => list.filter((process) => usable(process));
  const [mineWaiting, mineQuestions, mineReturned] = [shown(waiting), shown(questions), shown(returned)];
  // The last question / return of each process in one query each (no query per row).
  const lastEvents = async (list, action) => {
    if (!list.length) return new Map();
    const { rows } = await query(
      `SELECT DISTINCT ON (process_id) process_id, comment, actor_id FROM approval_events
       WHERE process_id = ANY($1::bigint[]) AND action = $2 ORDER BY process_id, id DESC`,
      [list.map((process) => process.id), action]
    );
    return new Map(rows.map((row) => [Number(row.process_id), row]));
  };
  const [asked, returns] = await Promise.all([lastEvents(mineQuestions, 'question'), lastEvents(mineReturned, 'return')]);
  const people = await usersById([...mineWaiting, ...mineQuestions, ...mineReturned].map((p) => p.author_id).concat([...asked.values()].map((event) => event.actor_id)));
  const items = [];
  for (const process of mineWaiting) {
    items.push(listItem(process, usable(process), 'approval', ['approve', 'question', 'reject', 'return', 'delegate'], people, settings));
  }
  for (const process of mineQuestions) {
    const question = asked.get(Number(process.id));
    const asker = question?.actor_id ? people.get(question.actor_id) || null : null;
    items.push(listItem(process, usable(process), 'question', ['answer'], people, settings, { question: question?.comment || '', askedBy: asker }));
  }
  for (const process of mineReturned) {
    const last = returns.get(Number(process.id));
    items.push(listItem(process, usable(process), 'returned', ['restart'], people, settings, { comment: last?.comment || '' }));
  }
  return items;
}

/** «Мои на согласовании»: my documents in approval, waiting for an answer or returned. */
export async function myProcesses(ctx, { includeFinished = false } = {}) {
  const userId = userIdOf(ctx);
  if (!userId) return [];
  const settings = await approvalSettings();
  const modules = await enabledModules();
  const { rows } = await query(
    `SELECT * FROM approval_processes WHERE author_id = $1 AND (status IN ('pending', 'question', 'returned')
       OR ($2 AND finished_at > NOW() - INTERVAL '30 days'))
     ORDER BY CASE status WHEN 'question' THEN 0 WHEN 'returned' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, due_at NULLS LAST, updated_at DESC LIMIT 300`,
    [userId, includeFinished]
  );
  const shown = rows.filter((process) => {
    const type = getApprovalType(process.type);
    return type && typeEnabled(modules, type) && tokenAllowsType(ctx, type, 'read');
  });
  const people = await usersById(shown.map((p) => p.author_id));
  // Open seats of the current stage of every pending process, in one query; names in one batch.
  const pending = shown.filter((process) => process.status === 'pending');
  const waiting = new Map();
  if (pending.length) {
    const { rows: seats } = await query(
      `SELECT s.* FROM approval_seats s JOIN approval_processes p ON p.id = s.process_id AND s.round = p.round AND s.stage_index = p.current_stage
       WHERE s.process_id = ANY($1::bigint[]) AND s.decision IS NULL ORDER BY s.id`,
      [pending.map((process) => process.id)]
    );
    for (const seat of seats) {
      const list = waiting.get(Number(seat.process_id)) || [];
      if (list.length < 5) list.push({ kind: seat.delegated_to ? 'user' : seat.kind, id: seat.delegated_to || seat.ref_id, key: seat.ref_key });
      waiting.set(Number(seat.process_id), list);
    }
  }
  const entries = [...waiting.values()].flat();
  const labels = entries.length ? await describeApprovers(entries) : [];
  const out = [];
  let offset = 0;
  const labelsOf = new Map();
  for (const [id, list] of waiting) {
    labelsOf.set(id, labels.slice(offset, offset + list.length));
    offset += list.length;
  }
  for (const process of shown) {
    const item = listItem(process, getApprovalType(process.type), 'mine', [], people, settings);
    if (process.status === 'pending') {
      item.dueAt = process.due_at;
      item.overdue = Boolean(process.due_at && new Date(process.due_at) <= new Date());
      item.meta.waitingFor = labelsOf.get(Number(process.id)) || [];
    }
    out.push(item);
  }
  return out;
}

/** «Решённые мной»: processes where I approved, rejected, returned, asked or delegated, newest first. */
export async function decidedByMe(ctx, { before = null, limit = 30 } = {}) {
  const userId = userIdOf(ctx);
  if (!userId) return { items: [], next: null };
  const settings = await approvalSettings();
  const modules = await enabledModules();
  const size = Math.min(100, Math.max(1, Number(limit) || 30));
  const { rows } = await query(
    `SELECT * FROM (
       SELECT DISTINCT ON (e.process_id) e.id AS event_id, e.action, e.comment AS event_comment, e.created_at AS decided_at, p.*
       FROM approval_events e JOIN approval_processes p ON p.id = e.process_id
       WHERE e.actor_id = $1 AND e.action IN ('approve', 'reject', 'return', 'question', 'delegate')
       ORDER BY e.process_id, e.id DESC
     ) t WHERE ($2::bigint IS NULL OR t.event_id < $2) ORDER BY t.event_id DESC LIMIT $3`,
    [userId, before ? Number(before) : null, size + 1]
  );
  const page = rows.slice(0, size);
  const people = await usersById(page.map((p) => p.author_id));
  const items = [];
  for (const row of page) {
    const type = getApprovalType(row.type);
    if (!type || !typeEnabled(modules, type) || !tokenAllowsType(ctx, type, 'read')) continue;
    items.push(listItem(row, type, 'decided', [], people, settings, { decision: row.action, decisionComment: row.event_comment, decidedAt: row.decided_at }));
  }
  return { items, next: rows.length > size ? Number(page[page.length - 1].event_id) : null };
}

/** Registered types for the UI: those whose module is on; `manageable` marks the routes this person may edit. */
export async function typesFor(ctx) {
  const modules = await enabledModules();
  return listApprovalTypes()
    .filter((type) => !type.hidden && typeEnabled(modules, type))
    .map((type) => ({
      key: type.key,
      module: type.module,
      title: type.title,
      fields: type.fields.map(({ loadOptions, ...field }) => field),
      manageable: canManageType(ctx, type),
    }));
}

/** Choices of a field whose options come from the module (`options: async () => […]`). */
export async function fieldOptions(ctx, typeKey, fieldKey) {
  const type = requireApprovalType(typeKey);
  if (!canManageType(ctx, type)) throw httpError(403, 'You cannot see this route', 'FORBIDDEN');
  const field = type.fields.find((item) => item.key === fieldKey);
  if (!field) throw httpError(404, 'Unknown field', 'NOT_FOUND');
  if (field.loadOptions) return (await field.loadOptions(ctx)) || [];
  return field.options || [];
}

// ── Document ids for module lists ───────────────────────────────────────────

/**
 * Ids of the documents of one type the person takes part in: author,
 * approver now or before (roles, groups, substitutes), question asked or
 * addressed, delegate. Lets a module filter its list in SQL with the same
 * rule as isParticipant() — `= ANY($ids)` — instead of one call per row.
 */
export async function participantDocIds(ctx, typeKey) {
  const userId = userIdOf(ctx);
  if (!userId) return [];
  const sets = principalSets(await principalsOf(userId));
  const { rows } = await query(
    `SELECT p.doc_id FROM approval_processes p
     WHERE p.type = $6 AND (p.author_id = $7 OR p.question_to = ANY($1) OR p.question_by = $7 OR EXISTS (
       SELECT 1 FROM approval_seats s WHERE s.process_id = p.id AND (s.decided_by = ANY($1) OR s.delegated_by = ANY($1) OR ${seatMatchSql('s')})
     ))`,
    [...seatMatchParams(sets), String(typeKey), userId]
  );
  return rows.map((row) => row.doc_id);
}

/** Ids of the documents of one type waiting for the person now: an open seat of the current stage, or a question addressed to them. */
export async function waitingDocIds(ctx, typeKey) {
  const userId = userIdOf(ctx);
  if (!userId) return [];
  const sets = principalSets(await principalsOf(userId));
  const { rows } = await query(
    `SELECT DISTINCT p.doc_id FROM approval_processes p
     JOIN approval_seats s ON s.process_id = p.id AND s.round = p.round AND s.stage_index = p.current_stage
     WHERE p.type = $6 AND p.status = 'pending' AND s.decision IS NULL AND ${seatMatchSql('s')}
     UNION
     SELECT doc_id FROM approval_processes WHERE type = $6 AND status = 'question' AND question_to = ANY($1)`,
    [...seatMatchParams(sets), String(typeKey)]
  );
  return rows.map((row) => row.doc_id);
}

export { localized };
