import { query, withTransaction } from '../../config/database.js';
import { getSettings, parseSettings, regionalFor } from '../../services/settings.js';
import { isoDay } from '../../services/datetime.js';
import { notify } from '../../services/notifications.js';
import { httpError } from '../shared/acl.js';
import { STAGE_SETS, STAGE_STATES } from './constants.js';
import { forbidden, notFound, requireAdmin, requireNode, requireProject, usersWithRole, visibleProjectIds } from './access.js';
import { actCaps, has, readCaps, scheduleState, weightedReadiness } from './rules.js';
import { projectSettings } from './projects.js';
import { mediaShape, removeMediaFiles } from './media.js';
import { treeChanged, unitsChanged } from './realtime.js';
import { mpMessage } from './messages.js';
import { dayString, idList, intOr, iso, logEvent, parseDay, parseNumber, text, userName } from './util.js';

/*
 * Construction (spec §7): the stages directory (by stage set, with weights),
 * each object's stage progress (plan / fact / percent), readiness computed
 * from the weights (or entered by hand), the construction journal with photos
 * and optional moderation, the objects list with delays and stale reports.
 */

// ── Directory ───────────────────────────────────────────────────────────────

export async function listStages() {
  const { rows } = await query(`SELECT * FROM mp_stages WHERE archived_at IS NULL ORDER BY set_key, sort, id`);
  const sets = Object.fromEntries(STAGE_SETS.map((key) => [key, []]));
  for (const row of rows) (sets[row.set_key] ||= []).push({ id: row.id, name: row.name, weight: Number(row.weight), sort: row.sort });
  return sets;
}

/** Replaces one set's stages: [{ id?, name, weight }] in order; removed ones are archived (their history stays). */
export async function saveStageSet(ctx, setKey, items) {
  requireAdmin(ctx);
  const key = String(setKey || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
  if (!key) throw httpError(400, 'Unknown stage set', 'INVALID_FIELD');
  const list = (Array.isArray(items) ? items : []).slice(0, 60).map((item) => ({ id: intOr(item?.id), name: text(item?.name, 160), weight: parseNumber(item?.weight) }));
  if (!list.length || list.some((item) => !item.name || Number.isNaN(item.weight) || item.weight === null || item.weight < 0 || item.weight > 1000)) throw httpError(400, 'Each stage needs a name and a weight', 'INVALID_FIELD');
  await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT id FROM mp_stages WHERE set_key = $1 AND archived_at IS NULL`, [key]);
    const keep = new Set();
    for (const [index, item] of list.entries()) {
      if (item.id && rows.some((row) => row.id === item.id)) {
        await client.query(`UPDATE mp_stages SET name = $2, weight = $3, sort = $4 WHERE id = $1`, [item.id, item.name, item.weight, index]);
        keep.add(item.id);
      } else {
        const { rows: created } = await client.query(`INSERT INTO mp_stages (set_key, name, weight, sort) VALUES ($1, $2, $3, $4) RETURNING id`, [key, item.name, item.weight, index]);
        keep.add(created[0].id);
      }
    }
    for (const row of rows) if (!keep.has(row.id)) await client.query(`UPDATE mp_stages SET archived_at = NOW() WHERE id = $1`, [row.id]);
  });
  return listStages();
}

// ── Stage progress and readiness ─────────────────────────────────────────────

async function stagesOfSet(client, setKey) {
  const { rows } = await client.query(`SELECT id, name, weight, sort FROM mp_stages WHERE set_key = $1 AND archived_at IS NULL ORDER BY sort, id`, [setKey]);
  return rows;
}

/** Recomputes an object's readiness and current stage from its stages (unless entered by hand). */
export async function recomputeReadiness(client, nodeId) {
  const { rows } = await client.query(
    `SELECT n.id, n.project_id, n.readiness_manual, t.stage_set, p.settings FROM mp_nodes n JOIN mp_projects p ON p.id = n.project_id LEFT JOIN mp_types t ON t.id = n.type_id WHERE n.id = $1`,
    [nodeId]
  );
  const node = rows[0];
  if (!node?.stage_set) return null;
  const stages = await stagesOfSet(client, node.stage_set);
  const { rows: progress } = await client.query(`SELECT stage_id, percent FROM mp_node_stages WHERE node_id = $1`, [nodeId]);
  const percentOf = new Map(progress.map((row) => [row.stage_id, Number(row.percent)]));
  const list = stages.map((stage) => ({ ...stage, percent: percentOf.get(stage.id) || 0 }));
  const current = [...list].reverse().find((stage) => stage.percent > 0) || null;
  const manual = node.readiness_manual || projectSettings(node.settings).readinessMode === 'manual';
  if (manual) await client.query(`UPDATE mp_nodes SET current_stage_id = $2 WHERE id = $1`, [nodeId, current?.id || null]);
  else await client.query(`UPDATE mp_nodes SET readiness = $2, current_stage_id = $3 WHERE id = $1`, [nodeId, weightedReadiness(list), current?.id || null]);
  return node.project_id;
}

/** Stages of an object with plan / fact / percent, its readiness and schedule state. */
export async function nodeStages(ctx, nodeId) {
  const { rows } = await query(
    `SELECT n.id, n.readiness, n.readiness_manual, t.stage_set FROM mp_nodes n LEFT JOIN mp_types t ON t.id = n.type_id WHERE n.id = $1`,
    [nodeId]
  );
  const node = rows[0];
  if (!node?.stage_set) return { stages: [], readiness: node ? Number(node.readiness) : null, schedule: { state: 'no_plan', delayDays: 0 } };
  const stages = await stagesOfSet({ query }, node.stage_set);
  const { rows: progress } = await query(`SELECT * FROM mp_node_stages WHERE node_id = $1`, [nodeId]);
  const byStage = new Map(progress.map((row) => [row.stage_id, row]));
  const list = stages.map((stage) => {
    const row = byStage.get(stage.id) || {};
    return {
      id: stage.id,
      name: stage.name,
      weight: Number(stage.weight),
      planStart: dayString(row.plan_start),
      planEnd: dayString(row.plan_end),
      factStart: dayString(row.fact_start),
      factEnd: dayString(row.fact_end),
      percent: Number(row.percent || 0),
      state: row.state || 'not_started',
      pauseReason: row.pause_reason || null,
    };
  });
  const today = isoDay(new Date(), (await regionalFor(null)).timeZone);
  return { stages: list, readiness: Number(node.readiness), readinessManual: node.readiness_manual, schedule: scheduleState(list, today), stageSet: node.stage_set };
}

function stagePatch(input) {
  const out = {};
  for (const [key, column] of [['planStart', 'plan_start'], ['planEnd', 'plan_end'], ['factStart', 'fact_start'], ['factEnd', 'fact_end']]) {
    if (input[key] !== undefined) out[column] = parseDay(input[key], key);
  }
  if (input.percent !== undefined) {
    const n = parseNumber(input.percent);
    if (n === null || Number.isNaN(n) || n < 0 || n > 100) throw httpError(400, 'Percent is 0–100', 'INVALID_FIELD');
    out.percent = Math.round(n * 10) / 10;
  }
  if (input.state !== undefined) {
    if (!STAGE_STATES.includes(input.state)) throw httpError(400, 'Unknown stage state', 'INVALID_FIELD');
    out.state = input.state;
  }
  if (input.pauseReason !== undefined) out.pause_reason = text(input.pauseReason, 300) || null;
  return out;
}

/** Writes stage progress; states and fact dates follow the percent when not given. */
async function writeStage(client, ctx, nodeId, stageId, patch, today) {
  const { rows } = await client.query(`SELECT * FROM mp_node_stages WHERE node_id = $1 AND stage_id = $2 FOR UPDATE`, [nodeId, stageId]);
  const current = rows[0] || { percent: 0, state: 'not_started' };
  const next = { ...patch };
  if (next.percent !== undefined && next.state === undefined && current.state !== 'paused') next.state = next.percent >= 100 ? 'done' : next.percent > 0 ? 'in_progress' : 'not_started';
  if (next.percent > 0 && !current.fact_start && next.fact_start === undefined) next.fact_start = today;
  if (next.percent >= 100 && !current.fact_end && next.fact_end === undefined) next.fact_end = today;
  if (next.percent !== undefined && next.percent < 100 && current.fact_end && next.fact_end === undefined) next.fact_end = null;
  const keys = Object.keys(next);
  if (!keys.length) return current;
  if (rows[0]) {
    await client.query(`UPDATE mp_node_stages SET ${keys.map((key, i) => `${key} = $${i + 3}`).join(', ')}, updated_by = $${keys.length + 3}, updated_at = NOW() WHERE node_id = $1 AND stage_id = $2`, [nodeId, stageId, ...keys.map((key) => next[key]), ctx.userId]);
  } else {
    await client.query(
      `INSERT INTO mp_node_stages (node_id, stage_id, ${keys.join(', ')}, updated_by) VALUES ($1, $2, ${keys.map((_, i) => `$${i + 3}`).join(', ')}, $${keys.length + 3})`,
      [nodeId, stageId, ...keys.map((key) => next[key]), ctx.userId]
    );
  }
  return { ...current, ...next };
}

async function today() {
  return isoDay(new Date(), (await regionalFor(null)).timeZone);
}

/** Plan / fact / percent of one stage of an object (build.edit in the zone). */
export async function updateNodeStage(ctx, nodeId, stageId, input = {}) {
  const node = await requireNode(ctx, nodeId);
  if (!has(actCaps(ctx, node), 'build.edit')) throw forbidden('This object is outside your zone', 'OUT_OF_ZONE');
  if (!node.stage_set) throw httpError(400, 'This object has no construction stages', 'NO_STAGES');
  const { rows } = await query(`SELECT * FROM mp_stages WHERE id = $1 AND set_key = $2`, [intOr(stageId, 0), node.stage_set]);
  if (!rows[0]) throw notFound('Stage not found');
  const patch = stagePatch(input);
  const day = await today();
  await withTransaction(async (client) => {
    await writeStage(client, ctx, node.id, rows[0].id, patch, day);
    await recomputeReadiness(client, node.id);
    await logEvent(client, { projectId: node.project_id, nodeId: node.id, kind: 'stage', data: { stage: { id: rows[0].id, name: rows[0].name }, changes: Object.keys(patch), percent: patch.percent }, authorId: ctx.userId });
  });
  treeChanged(node.project_id);
  return nodeStages(ctx, node.id);
}

/** Readiness entered by hand (null → computed from the stages again). */
export async function setReadiness(ctx, nodeId, input = {}) {
  const node = await requireNode(ctx, nodeId);
  if (!has(actCaps(ctx, node), 'build.edit')) throw forbidden('This object is outside your zone', 'OUT_OF_ZONE');
  const value = parseNumber(input.readiness);
  if (Number.isNaN(value) || (value !== null && (value < 0 || value > 100))) throw httpError(400, 'Readiness is 0–100', 'INVALID_FIELD');
  await withTransaction(async (client) => {
    if (value === null) {
      await client.query(`UPDATE mp_nodes SET readiness_manual = FALSE WHERE id = $1`, [node.id]);
      await recomputeReadiness(client, node.id);
    } else {
      await client.query(`UPDATE mp_nodes SET readiness_manual = TRUE, readiness = $2 WHERE id = $1`, [node.id, Math.round(value * 10) / 10]);
    }
    await logEvent(client, { projectId: node.project_id, nodeId: node.id, kind: 'readiness', data: { readiness: value, manual: value !== null }, authorId: ctx.userId });
  });
  treeChanged(node.project_id);
  return nodeStages(ctx, node.id);
}

// ── Journal (§7.3) ──────────────────────────────────────────────────────────

/**
 * Objects whose stages a report moves: construction objects as chosen, the
 * construction objects inside a chosen level, the nearest construction object
 * above a chosen unit or plot.
 */
async function reportTargets(client, projectId, nodeIds) {
  const { rows } = await client.query(
    `SELECT n.id, n.kind, n.path, n.code, n.name, t.stage_set FROM mp_nodes n LEFT JOIN mp_types t ON t.id = n.type_id WHERE n.project_id = $1 AND n.id = ANY($2::int[])`,
    [projectId, nodeIds]
  );
  if (rows.length !== nodeIds.length) throw httpError(400, 'Unknown object', 'INVALID_FIELD');
  const targets = new Map();
  for (const row of rows) {
    if (row.stage_set && row.kind !== 'level') targets.set(row.id, row);
    else if (row.kind === 'level') {
      const { rows: inside } = await client.query(
        `SELECT n.id, n.kind, n.path, n.code, n.name, t.stage_set FROM mp_nodes n JOIN mp_types t ON t.id = n.type_id WHERE n.path @> ARRAY[$1]::int[] AND t.stage_set IS NOT NULL AND n.kind <> 'level'`,
        [row.id]
      );
      for (const item of inside) targets.set(item.id, item);
    } else {
      const { rows: up } = await client.query(
        `SELECT n.id, n.kind, n.path, n.code, n.name, t.stage_set FROM mp_nodes n JOIN mp_types t ON t.id = n.type_id WHERE n.id = ANY($1::int[]) AND n.id <> $2 AND t.stage_set IS NOT NULL AND n.kind <> 'level' ORDER BY n.depth DESC LIMIT 1`,
        [row.path, row.id]
      );
      if (up[0]) targets.set(up[0].id, up[0]);
    }
  }
  return { selected: rows, targets: [...targets.values()] };
}

/** Applies a published report: the stage percent of every target of that stage set, readiness, "last report". */
async function applyReport(client, ctx, report, targets) {
  const { rows } = report.stage_id ? await client.query(`SELECT * FROM mp_stages WHERE id = $1`, [report.stage_id]) : { rows: [] };
  const stage = rows[0];
  const day = dayString(report.fact_date);
  for (const target of targets) {
    if (stage && report.percent !== null && target.stage_set === stage.set_key) {
      await writeStage(client, ctx, target.id, stage.id, { percent: Number(report.percent) }, day);
      await recomputeReadiness(client, target.id);
    }
    await client.query(`UPDATE mp_nodes SET last_report_at = NOW(), stale_notified_at = NULL WHERE id = $1`, [target.id]);
  }
  const ids = targets.map((target) => target.id);
  await client.query(`UPDATE mp_nodes SET last_report_at = NOW() WHERE id IN (SELECT node_id FROM mp_report_nodes WHERE report_id = $1)`, [report.id]);
  return ids;
}

/**
 * New journal entry: { projectId, nodeIds, stageId, percent, factDate, body, mediaIds, submit }.
 * Every chosen object must be in the author's zone (build.edit) — a foreman of
 * sector A cannot report on sector B (403 OUT_OF_ZONE). Without moderation it
 * is published at once.
 */
export async function createReport(ctx, input = {}) {
  const project = await requireProject(ctx, input.projectId);
  const nodeIds = idList(input.nodeIds, 500);
  if (!nodeIds.length) throw httpError(400, 'Choose objects', 'INVALID_FIELD');
  const percent = parseNumber(input.percent);
  if (Number.isNaN(percent) || (percent !== null && (percent < 0 || percent > 100))) throw httpError(400, 'Percent is 0–100', 'INVALID_FIELD');
  const factDate = parseDay(input.factDate, 'factDate') || (await today());
  const mediaIds = idList(input.mediaIds, 30);
  const settings = projectSettings(project.settings);
  let stage = null;
  if (intOr(input.stageId)) {
    const { rows } = await query(`SELECT * FROM mp_stages WHERE id = $1`, [intOr(input.stageId)]);
    if (!rows[0]) throw httpError(400, 'Unknown stage', 'INVALID_FIELD');
    stage = rows[0];
  }
  const out = await withTransaction(async (client) => {
    const { selected, targets } = await reportTargets(client, project.id, nodeIds);
    for (const node of selected) {
      if (!has(actCaps(ctx, { project_id: project.id, path: node.path }), 'build.edit')) throw forbidden(`${node.code || node.name} is outside your zone`, 'OUT_OF_ZONE');
    }
    const moderator = selected.every((node) => has(actCaps(ctx, { project_id: project.id, path: node.path }), 'build.moderate'));
    const status = input.submit === false ? 'draft' : settings.moderation && !moderator ? 'review' : 'published';
    const { rows } = await client.query(
      `INSERT INTO mp_reports (project_id, stage_id, percent, fact_date, body, status, visibility, author_id, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [project.id, stage?.id || null, percent, factDate, text(input.body, 5000) || null, status, input.visibility === 'internal' ? 'internal' : 'sales', ctx.userId, status === 'published' ? new Date() : null]
    );
    const report = rows[0];
    const linked = new Set([...selected.map((node) => node.id), ...targets.map((node) => node.id)]);
    for (const nodeId of linked) await client.query(`INSERT INTO mp_report_nodes (report_id, node_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [report.id, nodeId]);
    if (mediaIds.length) {
      const { rowCount } = await client.query(`UPDATE mp_media SET report_id = $1 WHERE id = ANY($2::int[]) AND project_id = $3 AND created_by = $4 AND report_id IS NULL AND node_id IS NULL`, [report.id, mediaIds, project.id, ctx.userId]);
      if (rowCount !== mediaIds.length) throw httpError(400, 'Some photos are not yours or already used', 'INVALID_MEDIA');
    }
    const touched = status === 'published' ? await applyReport(client, ctx, report, targets) : [];
    for (const node of selected) await logEvent(client, { projectId: project.id, nodeId: node.id, kind: 'report', data: { reportId: report.id, status, stage: stage ? { id: stage.id, name: stage.name } : null, percent }, authorId: ctx.userId });
    return { report, selected, targets, touched };
  });
  if (out.touched.length) treeChanged(project.id);
  afterReport(ctx, project, out.report, out.selected, stage).catch((err) => console.warn('[masterplan] report notifications:', err.message));
  return reportById(ctx, out.report.id);
}

const objectsLabel = (nodes) => {
  const names = nodes.map((node) => node.code || node.name).filter(Boolean);
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
};

async function afterReport(ctx, project, report, selected, stage) {
  const actor = await userName(report.author_id);
  if (report.status === 'review') {
    const heads = new Set();
    for (const node of selected) for (const id of await usersWithRole(['construction_head'], { project_id: project.id, path: node.path })) heads.add(id);
    await notify({ userIds: [...heads], kind: 'masterplan.review', module: 'masterplan', link: `/app/masterplan/p/${project.id}/construction?tab=review`, actorId: ctx.userId, render: mpMessage('reportReview', { objects: objectsLabel(selected), project: project.name, actor }) });
  }
  if (report.status === 'published' && report.visibility !== 'internal') await notifyReportPublished(project, report, selected, stage, ctx.userId, actor);
}

/** "Новый фотоотчёт по коттеджу A-1-02" — to managers holding units there and the sales responsible (§10.4). */
async function notifyReportPublished(project, report, selected, stage, actorId, actor) {
  const { rows } = await query(
    `SELECT DISTINCT u.manager_id FROM mp_units u JOIN mp_nodes n ON n.id = u.node_id
     WHERE u.manager_id IS NOT NULL AND u.status NOT IN ('free', 'not_for_sale')
       AND EXISTS (SELECT 1 FROM mp_report_nodes rn JOIN mp_nodes r ON r.id = rn.node_id WHERE rn.report_id = $1 AND (n.path @> ARRAY[r.id] OR r.path @> ARRAY[n.id]))`,
    [report.id]
  );
  const { rows: responsible } = await query(`SELECT DISTINCT sales_user_id FROM mp_nodes WHERE id IN (SELECT node_id FROM mp_report_nodes WHERE report_id = $1) AND sales_user_id IS NOT NULL`, [report.id]);
  const ids = [...rows.map((row) => row.manager_id), ...responsible.map((row) => row.sales_user_id)];
  await notify({
    userIds: ids,
    kind: 'masterplan.report',
    module: 'masterplan',
    link: `/app/masterplan/p/${project.id}/plan?node=${selected[0].id}&tab=build`,
    actorId,
    render: mpMessage('report', { objects: objectsLabel(selected), stage: stage?.name, percent: report.percent === null ? null : Number(report.percent), project: project.name, actor }),
  });
}

async function loadReport(id) {
  const { rows } = await query(`SELECT r.*, p.name AS project_name, p.settings AS project_settings FROM mp_reports r JOIN mp_projects p ON p.id = r.project_id WHERE r.id = $1`, [intOr(id, 0)]);
  return rows[0] || null;
}

async function reportNodes(reportIds) {
  if (!reportIds.length) return new Map();
  const { rows } = await query(
    `SELECT rn.report_id, n.id, n.code, n.name, n.kind, n.path, n.project_id FROM mp_report_nodes rn JOIN mp_nodes n ON n.id = rn.node_id WHERE rn.report_id = ANY($1::int[]) ORDER BY n.sort, n.id`,
    [reportIds]
  );
  const out = new Map();
  for (const row of rows) {
    if (!out.has(row.report_id)) out.set(row.report_id, []);
    out.get(row.report_id).push(row);
  }
  return out;
}

/** Report visibility: published ones to everyone who sees construction; others to the author and moderators. */
function canSeeReport(ctx, row) {
  const caps = readCaps(ctx, row.project_id);
  if (!has(caps, 'build.view')) return false;
  if (row.status === 'published') return row.visibility !== 'internal' || has(caps, 'build.edit') || has(caps, 'build.drafts');
  return row.author_id === ctx.userId || has(caps, 'build.drafts') || has(caps, 'build.moderate');
}

async function shapeReports(ctx, rows) {
  const nodesOf = await reportNodes(rows.map((row) => row.id));
  const { rows: media } = rows.length ? await query(`SELECT * FROM mp_media WHERE report_id = ANY($1::int[]) ORDER BY id`, [rows.map((row) => row.id)]) : { rows: [] };
  return rows.map((row) => {
    const nodes = nodesOf.get(row.id) || [];
    const moderate = nodes.length > 0 && nodes.every((node) => has(actCaps(ctx, node), 'build.moderate'));
    return {
      id: row.id,
      projectId: row.project_id,
      status: row.status,
      visibility: row.visibility,
      stage: row.stage_id ? { id: row.stage_id, name: row.stage_name } : null,
      percent: row.percent === null ? null : Number(row.percent),
      factDate: dayString(row.fact_date),
      body: row.body,
      author: row.author_id ? { id: row.author_id, name: row.author_name } : null,
      reviewer: row.reviewer_id ? { id: row.reviewer_id, name: row.reviewer_name } : null,
      reviewNote: row.review_note,
      reviewedAt: iso(row.reviewed_at),
      publishedAt: iso(row.published_at),
      createdAt: iso(row.created_at),
      nodes: nodes.map((node) => ({ id: node.id, code: node.code, name: node.name, kind: node.kind })),
      media: media.filter((item) => item.report_id === row.id).map(mediaShape),
      canReview: row.status === 'review' && moderate,
      canDelete: (row.author_id === ctx.userId && row.status !== 'published') || moderate,
    };
  });
}

const REPORT_SELECT = `SELECT r.*, s.name AS stage_name, COALESCE(a.display_name, a.username) AS author_name, COALESCE(v.display_name, v.username) AS reviewer_name
  FROM mp_reports r LEFT JOIN mp_stages s ON s.id = r.stage_id LEFT JOIN users a ON a.id = r.author_id LEFT JOIN users v ON v.id = r.reviewer_id`;

export async function reportById(ctx, id) {
  const { rows } = await query(`${REPORT_SELECT} WHERE r.id = $1`, [intOr(id, 0)]);
  if (!rows[0] || !canSeeReport(ctx, rows[0])) throw notFound('Report not found');
  return (await shapeReports(ctx, rows))[0];
}

/** Journal: { project, node, status, mine, before, limit }. */
export async function listReports(ctx, input = {}) {
  const ids = visibleProjectIds(ctx);
  const params = [];
  const where = [];
  if (ids) {
    params.push(ids);
    where.push(`r.project_id = ANY($${params.length}::int[])`);
  }
  if (intOr(input.project)) {
    params.push(intOr(input.project));
    where.push(`r.project_id = $${params.length}`);
  }
  if (intOr(input.node)) {
    params.push(intOr(input.node));
    // Reports on the node, on objects above it (its building) or below it (a level).
    where.push(`EXISTS (SELECT 1 FROM mp_report_nodes rn JOIN mp_nodes rnn ON rnn.id = rn.node_id, mp_nodes me WHERE me.id = $${params.length} AND rn.report_id = r.id AND (me.path @> ARRAY[rnn.id] OR rnn.path @> ARRAY[me.id]))`);
  }
  if (['draft', 'review', 'published', 'rejected'].includes(input.status)) {
    params.push(input.status);
    where.push(`r.status = $${params.length}`);
  }
  if (input.mine === '1' || input.mine === true) {
    params.push(ctx.userId);
    where.push(`r.author_id = $${params.length}`);
  }
  if (intOr(input.before)) {
    params.push(intOr(input.before));
    where.push(`r.id < $${params.length}`);
  }
  const limit = Math.min(100, Math.max(1, intOr(input.limit, 20)));
  const { rows } = await query(`${REPORT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.fact_date DESC, r.id DESC LIMIT ${limit * 3}`, params);
  const visible = rows.filter((row) => canSeeReport(ctx, row)).slice(0, limit);
  return { reports: await shapeReports(ctx, visible), hasMore: rows.length >= limit * 3 || visible.length === limit };
}

export async function recentReports(ctx, node, { limit = 8 } = {}) {
  const { reports } = await listReports(ctx, { project: node.project_id, node: node.id, status: 'published', limit });
  return reports;
}

/** Moderation: { action: 'publish' | 'reject', note }. */
export async function reviewReport(ctx, id, input = {}) {
  const report = await loadReport(id);
  if (!report || !canSeeReport(ctx, report)) throw notFound('Report not found');
  const nodes = (await reportNodes([report.id])).get(report.id) || [];
  if (!nodes.length || !nodes.every((node) => has(actCaps(ctx, node), 'build.moderate'))) throw forbidden();
  if (!['review', 'draft', 'rejected'].includes(report.status)) throw httpError(409, 'The report is already published', 'ALREADY_PUBLISHED');
  const publish = input.action === 'publish';
  if (!publish && input.action !== 'reject') throw httpError(400, 'Unknown action', 'INVALID_FIELD');
  const note = text(input.note, 500) || null;
  const touched = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE mp_reports SET status = $2::text, reviewer_id = $3, reviewed_at = NOW(), review_note = $4, published_at = CASE WHEN $2::text = 'published' THEN NOW() ELSE published_at END, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [report.id, publish ? 'published' : 'rejected', ctx.userId, note]
    );
    if (!publish) return [];
    const { targets } = await reportTargets(client, report.project_id, nodes.map((node) => node.id));
    return applyReport(client, ctx, rows[0], targets);
  });
  if (touched.length) treeChanged(report.project_id);
  const project = { id: report.project_id, name: report.project_name };
  await notify({ userIds: [report.author_id], kind: 'masterplan.review', module: 'masterplan', link: `/app/masterplan/p/${report.project_id}/construction`, actorId: ctx.userId, render: mpMessage('reportReviewed', { objects: objectsLabel(nodes), published: publish, note }) }).catch(() => {});
  if (publish && report.visibility !== 'internal') {
    const stage = report.stage_id ? (await query(`SELECT name FROM mp_stages WHERE id = $1`, [report.stage_id])).rows[0] : null;
    notifyReportPublished(project, { ...report, status: 'published' }, nodes, stage, ctx.userId, await userName(report.author_id)).catch(() => {});
  }
  return reportById(ctx, report.id);
}

/** Drafts and returned reports by their author; anything by a moderator. */
export async function deleteReport(ctx, id) {
  const report = await reportById(ctx, id);
  if (!report.canDelete) throw forbidden();
  const { rows } = await query(`SELECT storage_key, thumb_key FROM mp_media WHERE report_id = $1`, [report.id]);
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM mp_reports WHERE id = $1`, [report.id]);
    for (const node of report.nodes) await logEvent(client, { projectId: report.projectId, nodeId: node.id, kind: 'report_deleted', data: { reportId: report.id }, authorId: ctx.userId });
  });
  await removeMediaFiles(rows);
}

// ── Objects list (§9.6) ─────────────────────────────────────────────────────

/**
 * Construction objects of a project with readiness, current stage, schedule
 * state, last report and "stale" flag. Filters: stale, behind, mine.
 */
export async function constructionList(ctx, projectId, input = {}) {
  const project = await requireProject(ctx, projectId);
  const caps = readCaps(ctx, project.id);
  if (!has(caps, 'build.view')) throw forbidden();
  const { rows } = await query(
    `SELECT n.id, n.code, n.name, n.kind, n.path, n.parent_id, n.readiness, n.readiness_manual, n.last_report_at, n.build_user_id, n.created_at, n.plan_end,
            t.name AS type_name, t.icon AS type_icon, t.stage_set, s.name AS stage_name, COALESCE(b.display_name, b.username) AS build_user_name,
            u.status AS unit_status
     FROM mp_nodes n JOIN mp_types t ON t.id = n.type_id LEFT JOIN mp_stages s ON s.id = n.current_stage_id LEFT JOIN users b ON b.id = n.build_user_id
     LEFT JOIN mp_units u ON u.node_id = n.id
     WHERE n.project_id = $1 AND t.stage_set IS NOT NULL AND n.kind <> 'level' ORDER BY n.sort, n.id`,
    [project.id]
  );
  const { rows: stages } = await query(
    `SELECT ns.node_id, ns.plan_end, ns.fact_end, ns.percent FROM mp_node_stages ns JOIN mp_nodes n ON n.id = ns.node_id WHERE n.project_id = $1`,
    [project.id]
  );
  const stagesOf = new Map();
  for (const row of stages) {
    if (!stagesOf.has(row.node_id)) stagesOf.set(row.node_id, []);
    stagesOf.get(row.node_id).push({ planEnd: dayString(row.plan_end), factEnd: dayString(row.fact_end), percent: Number(row.percent) });
  }
  const day = await today();
  const staleDays = ctx.settings.staleReportDays;
  const staleBefore = Date.now() - staleDays * 86400000;
  const { rows: parents } = await query(`SELECT id, code, name FROM mp_nodes WHERE project_id = $1 AND kind = 'level'`, [project.id]);
  const parentName = new Map(parents.map((row) => [row.id, row.code || row.name]));
  let items = rows.map((row) => {
    const schedule = scheduleState(stagesOf.get(row.id) || [], day);
    const act = actCaps(ctx, { project_id: project.id, path: row.path });
    const last = row.last_report_at ? new Date(row.last_report_at).getTime() : null;
    const readiness = Number(row.readiness);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type_name,
      icon: row.type_icon,
      stageSet: row.stage_set,
      parent: row.parent_id ? parentName.get(row.parent_id) || null : null,
      path: row.path,
      readiness,
      stage: row.stage_name,
      schedule,
      alert: schedule.state === 'behind' && schedule.delayDays > ctx.settings.delayAlertDays,
      lastReportAt: iso(row.last_report_at),
      stale: readiness < 100 && (last ? last < staleBefore : new Date(row.created_at).getTime() < staleBefore),
      buildUser: row.build_user_id ? { id: row.build_user_id, name: row.build_user_name } : null,
      mine: row.build_user_id === ctx.userId,
      canReport: has(act, 'build.edit'),
      sold: has(caps, 'status.view') ? ['sold', 'contract', 'deposit', 'handed'].includes(row.unit_status) : undefined,
    };
  });
  if (input.filter === 'stale') items = items.filter((item) => item.stale);
  if (input.filter === 'behind') items = items.filter((item) => item.schedule.state === 'behind');
  if (input.filter === 'mine') items = items.filter((item) => item.mine || item.canReport);
  const pending = has(caps, 'build.moderate') || has(caps, 'build.drafts') ? (await query(`SELECT COUNT(*)::int AS n FROM mp_reports WHERE project_id = $1 AND status = 'review'`, [project.id])).rows[0].n : 0;
  return { items, review: pending, staleDays };
}

// ── Daily checks (scheduler job) ─────────────────────────────────────────────

/** Objects without reports for N days and delays over the threshold → one summary per person and project. */
export async function runDailyChecks() {
  const parsed = parseSettings(await getSettings());
  const module = parsed.modules.masterplan;
  if (!module?.enabled) return;
  const settings = module.settings;
  const day = isoDay(new Date(), (await regionalFor(null)).timeZone);
  const { rows } = await query(
    `SELECT n.id, n.project_id, n.code, n.name, n.path, n.build_user_id, n.readiness, n.last_report_at, n.stale_notified_at, n.delay_notified_days, n.created_at, p.name AS project_name
     FROM mp_nodes n JOIN mp_types t ON t.id = n.type_id JOIN mp_projects p ON p.id = n.project_id
     WHERE t.stage_set IS NOT NULL AND n.kind <> 'level' AND p.archived_at IS NULL AND p.status IN ('construction', 'sales') AND n.readiness < 100`
  );
  const staleCut = Date.now() - settings.staleReportDays * 86400000;
  const staleByProject = new Map();
  for (const row of rows) {
    const last = row.last_report_at ? new Date(row.last_report_at).getTime() : new Date(row.created_at).getTime();
    const notified = row.stale_notified_at ? new Date(row.stale_notified_at).getTime() : 0;
    if (last < staleCut && notified < staleCut) {
      if (!staleByProject.has(row.project_id)) staleByProject.set(row.project_id, []);
      staleByProject.get(row.project_id).push(row);
    }
  }
  for (const [projectId, list] of staleByProject) {
    const heads = await usersWithRole(['construction_head'], { project_id: projectId, path: [] });
    const recipients = new Map();
    for (const id of heads) recipients.set(id, list);
    for (const row of list) if (row.build_user_id) recipients.set(row.build_user_id, [...new Set([...(recipients.get(row.build_user_id) || []), row])]);
    for (const [userId, items] of recipients) {
      await notify({
        userIds: [userId],
        kind: 'masterplan.construction',
        module: 'masterplan',
        link: `/app/masterplan/p/${projectId}/construction?filter=stale`,
        render: mpMessage('stale', { count: items.length, days: settings.staleReportDays, project: list[0].project_name, sample: objectsLabel(items) }),
      }).catch(() => {});
    }
    await query(`UPDATE mp_nodes SET stale_notified_at = NOW() WHERE id = ANY($1::int[])`, [list.map((row) => row.id)]);
  }
  // Delays: notify when crossing the threshold, then again every further week of delay.
  for (const row of rows) {
    const { rows: stages } = await query(`SELECT ns.plan_end, ns.fact_end, ns.percent, s.name FROM mp_node_stages ns JOIN mp_stages s ON s.id = ns.stage_id WHERE ns.node_id = $1`, [row.id]);
    const schedule = scheduleState(stages.map((item) => ({ planEnd: dayString(item.plan_end), factEnd: dayString(item.fact_end), percent: Number(item.percent) })), day);
    if (schedule.state !== 'behind' || schedule.delayDays <= settings.delayAlertDays) continue;
    if (row.delay_notified_days && schedule.delayDays < row.delay_notified_days + 7) continue;
    const late = stages.filter((item) => Number(item.percent) < 100 && item.plan_end && dayString(item.plan_end) < day).map((item) => item.name)[0];
    const users = await usersWithRole(['construction_head', 'executive'], row);
    await notify({
      userIds: users,
      kind: 'masterplan.construction',
      module: 'masterplan',
      link: `/app/masterplan/p/${row.project_id}/plan?node=${row.id}&tab=build`,
      render: mpMessage('delay', { code: row.code || row.name, days: schedule.delayDays, stage: late, project: row.project_name }),
    }).catch(() => {});
    await query(`UPDATE mp_nodes SET delay_notified_days = $2 WHERE id = $1`, [row.id, schedule.delayDays]);
  }
}

export { unitsChanged };
