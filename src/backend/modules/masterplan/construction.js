import { query, withTransaction } from '../../config/database.js';
import { getSettings, parseSettings, regionalFor } from '../../services/settings.js';
import { isoDay } from '../../services/datetime.js';
import { notify } from '../../services/notifications.js';
import { avatarOf, httpError } from '../shared/acl.js';
import { STAGE_SETS, STAGE_STATES } from './constants.js';
import { forbidden, notFound, requireAdmin, requireNode, requireProject, usersWithRole, visibleProjectIds } from './access.js';
import { actCaps, editNeedsReview, has, readCaps, reportRights, reportVisible, scheduleState, weightedReadiness } from './rules.js';
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

/** Columns added after the first release of the journal (idempotent). */
export async function ensureReportSchema() {
  // What a report changed: the stage percent before it, and when it was applied (the order of application).
  await query(`ALTER TABLE mp_report_nodes ADD COLUMN IF NOT EXISTS prev_percent NUMERIC(5,1)`);
  await query(`ALTER TABLE mp_report_nodes ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ`);
  await query(`ALTER TABLE mp_reports ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`);
  await query(`ALTER TABLE mp_reports ADD COLUMN IF NOT EXISTS edited_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
}

async function stagePercent(client, nodeId, stageId) {
  const { rows } = await client.query(`SELECT percent FROM mp_node_stages WHERE node_id = $1 AND stage_id = $2`, [nodeId, stageId]);
  return rows[0] ? Number(rows[0].percent) : null;
}

/**
 * Applies a published report: the stage percent of every target of that stage
 * set, readiness, "last report". A report dated before one already published
 * for the same object and stage (published late, or backdated) does not move
 * the percent back: the newer fact stands. For every object it moves, the
 * percent before it and the moment are kept (mp_report_nodes.prev_percent,
 * applied_at) so deleting or correcting the report can undo exactly that.
 */
async function applyReport(client, ctx, report, targets, { touchLast = true } = {}) {
  const { rows } = report.stage_id ? await client.query(`SELECT * FROM mp_stages WHERE id = $1`, [report.stage_id]) : { rows: [] };
  const stage = rows[0];
  const day = dayString(report.fact_date);
  for (const target of targets) {
    if (stage && report.percent !== null && target.stage_set === stage.set_key) {
      const { rows: newer } = await client.query(
        `SELECT 1 FROM mp_reports r JOIN mp_report_nodes rn ON rn.report_id = r.id
         WHERE rn.node_id = $1 AND r.stage_id = $2 AND r.status = 'published' AND r.percent IS NOT NULL AND r.id <> $3 AND r.fact_date > $4 LIMIT 1`,
        [target.id, stage.id, report.id, day]
      );
      if (!newer.length) {
        const before = (await stagePercent(client, target.id, stage.id)) ?? 0;
        await writeStage(client, ctx, target.id, stage.id, { percent: Number(report.percent) }, day);
        await recomputeReadiness(client, target.id);
        await client.query(`UPDATE mp_report_nodes SET prev_percent = $3, applied_at = clock_timestamp() WHERE report_id = $1 AND node_id = $2`, [report.id, target.id, before]);
      }
    }
    if (touchLast) await client.query(`UPDATE mp_nodes SET last_report_at = NOW(), stale_notified_at = NULL WHERE id = $1`, [target.id]);
  }
  const ids = targets.map((target) => target.id);
  if (touchLast) await client.query(`UPDATE mp_nodes SET last_report_at = NOW() WHERE id IN (SELECT node_id FROM mp_report_nodes WHERE report_id = $1)`, [report.id]);
  return ids;
}

/** Objects of a report whose stages it moves (construction objects among its linked nodes). */
async function linkedTargets(client, reportId) {
  const { rows } = await client.query(
    `SELECT n.id, n.kind, n.path, n.code, n.name, t.stage_set FROM mp_report_nodes rn JOIN mp_nodes n ON n.id = rn.node_id JOIN mp_types t ON t.id = n.type_id
     WHERE rn.report_id = $1 AND t.stage_set IS NOT NULL AND n.kind <> 'level'`,
    [reportId]
  );
  return rows;
}

/**
 * "Last report" of objects after a published report stops counting (deleted,
 * or sent back to review): the newest other published report on each, or
 * none; stale reminders are re-armed where it changed.
 */
async function recomputeLastReport(client, reportId, nodeIds) {
  if (!nodeIds.length) return;
  await client.query(
    `UPDATE mp_nodes n SET last_report_at = x.last, stale_notified_at = NULL
     FROM (SELECT m.id, (SELECT MAX(r.published_at) FROM mp_reports r JOIN mp_report_nodes rn ON rn.report_id = r.id
                         WHERE rn.node_id = m.id AND r.status = 'published' AND r.id <> $1) AS last
           FROM mp_nodes m WHERE m.id = ANY($2::int[])) x
     WHERE n.id = x.id AND n.last_report_at IS DISTINCT FROM x.last`,
    [reportId, nodeIds]
  );
}

/**
 * Takes back what a published report did to stage progress (before it is
 * deleted, or before it is re-applied with a corrected percent / date).
 *
 * The reports applied to one object and stage form a chain in the order they
 * were applied; each remembers the percent before it. Removing a link:
 *   - a later report was applied after this one → it inherits our "before"
 *     and the stage keeps its current value (the newer fact stands);
 *   - this was the last one → the stage goes back to our "before", or to the
 *     newest remaining report that was skipped because of ours (a late,
 *     older-dated report), whichever is the newest fact.
 * The stage is only changed while it still shows this report's percent: a
 * later correction by hand (stage editor) is never overwritten. Reports
 * applied before this bookkeeping existed (no applied_at) are handled by
 * date: when it is the newest report, the stage goes back to the newest
 * remaining report's percent, or 0 when nothing else (no report, no edit by
 * hand) ever set that stage. Readiness is recomputed for every object moved.
 */
async function unapplyReport(client, ctx, report) {
  if (report.status !== 'published' || !report.stage_id || report.percent === null) return [];
  const percent = Number(report.percent);
  const { rows: links } = await client.query(`SELECT node_id, prev_percent, applied_at FROM mp_report_nodes WHERE report_id = $1`, [report.id]);
  const day = await today();
  const moved = [];
  for (const link of links) {
    const remaining = await client.query(
      `SELECT r.id, r.percent, rn.applied_at FROM mp_reports r JOIN mp_report_nodes rn ON rn.report_id = r.id
       WHERE rn.node_id = $1 AND r.stage_id = $2 AND r.status = 'published' AND r.percent IS NOT NULL AND r.id <> $3
       ORDER BY r.fact_date DESC, r.id DESC LIMIT 1`,
      [link.node_id, report.stage_id, report.id]
    );
    const newest = remaining.rows[0] || null;
    let restore;
    let adopt = null;
    if (link.applied_at) {
      const { rows: next } = await client.query(
        `SELECT rn.report_id FROM mp_report_nodes rn JOIN mp_reports r ON r.id = rn.report_id
         WHERE rn.node_id = $1 AND r.stage_id = $2 AND r.status = 'published' AND rn.applied_at IS NOT NULL AND r.id <> $3
           AND (rn.applied_at > $4 OR (rn.applied_at = $4 AND r.id > $3))
         ORDER BY rn.applied_at, r.id LIMIT 1`,
        [link.node_id, report.stage_id, report.id, link.applied_at]
      );
      if (next[0]) {
        await client.query(`UPDATE mp_report_nodes SET prev_percent = $3 WHERE report_id = $1 AND node_id = $2`, [next[0].report_id, link.node_id, link.prev_percent]);
        continue;
      }
      if (newest && !newest.applied_at) {
        restore = Number(newest.percent);
        adopt = newest.id;
      } else if (link.prev_percent !== null) restore = Number(link.prev_percent);
    } else {
      // Applied before the bookkeeping (or skipped as an older fact): only the newest report owns the stage.
      const { rows: mine } = await client.query(
        `SELECT 1 FROM mp_reports r JOIN mp_report_nodes rn ON rn.report_id = r.id
         WHERE rn.node_id = $1 AND r.stage_id = $2 AND r.status = 'published' AND r.percent IS NOT NULL AND r.id <> $3
           AND (r.fact_date > $4 OR (r.fact_date = $4 AND r.id > $3)) LIMIT 1`,
        [link.node_id, report.stage_id, report.id, dayString(report.fact_date)]
      );
      if (mine.length) continue;
      if (newest) restore = Number(newest.percent);
      else {
        const { rows: manual } = await client.query(`SELECT 1 FROM mp_events WHERE node_id = $1 AND kind = 'stage' AND (data->'stage'->>'id')::int = $2 LIMIT 1`, [link.node_id, report.stage_id]);
        if (!manual.length) restore = 0;
      }
    }
    if (restore === undefined) continue;
    const current = await stagePercent(client, link.node_id, report.stage_id);
    if (current === null || current !== percent) continue;
    await writeStage(client, ctx, link.node_id, report.stage_id, { percent: restore }, day);
    await recomputeReadiness(client, link.node_id);
    if (adopt) await client.query(`UPDATE mp_report_nodes SET prev_percent = $3, applied_at = clock_timestamp() WHERE report_id = $1 AND node_id = $2`, [adopt, link.node_id, link.prev_percent]);
    moved.push({ nodeId: link.node_id, from: current, to: restore });
  }
  await client.query(`UPDATE mp_report_nodes SET prev_percent = NULL, applied_at = NULL WHERE report_id = $1`, [report.id]);
  return moved;
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
    // Every chosen object and every object whose stages the report moves (the
    // building above a chosen apartment, the objects inside a chosen level).
    for (const node of [...selected, ...targets]) {
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
    for (const node of selected) await logEvent(client, { projectId: project.id, nodeId: node.id, kind: 'report', data: { reportId: report.id, status, ...reportEventScope(report), stage: stage ? { id: stage.id, name: stage.name } : null, percent }, authorId: ctx.userId });
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
    const cache = {};
    for (const node of selected) for (const id of await usersWithRole(['construction_head'], { project_id: project.id, path: node.path }, cache)) heads.add(id);
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

async function reportNodes(reportIds, client = { query }) {
  if (!reportIds.length) return new Map();
  const { rows } = await client.query(
    `SELECT rn.report_id, rn.prev_percent, rn.applied_at, n.id, n.code, n.name, n.kind, n.path, n.project_id, t.stage_set
     FROM mp_report_nodes rn JOIN mp_nodes n ON n.id = rn.node_id LEFT JOIN mp_types t ON t.id = n.type_id
     WHERE rn.report_id = ANY($1::int[]) ORDER BY n.sort, n.id`,
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
  return reportVisible(readCaps(ctx, row.project_id), ctx.userId, row);
}

/** What history entries about a report record so nodeEvents can hide them like the report itself (reportEventVisible). */
const reportEventScope = (row) => ({ reportStatus: row.status, visibility: row.visibility, reportAuthorId: row.author_id });

const rightsOf = (ctx, row, nodes) => reportRights({ report: row, nodeCaps: nodes.map((node) => actCaps(ctx, node)), userId: ctx.userId });

/**
 * The percent of the report's stage before it, for "40 % → 55 %": what it
 * replaced when it was applied; for a report not published yet, the stage as
 * it is now (what publishing would change); for reports applied before that
 * was recorded, the previous published report on the same object and stage.
 */
async function previousPercents(rows, nodesOf) {
  const out = new Map();
  const pending = [];
  for (const row of rows) {
    if (!row.stage_id || row.percent === null) continue;
    const targets = (nodesOf.get(row.id) || []).filter((node) => node.stage_set && node.kind !== 'level');
    const applied = targets.find((node) => node.applied_at && node.prev_percent !== null);
    if (applied) out.set(row.id, Number(applied.prev_percent));
    else if (targets.length) pending.push({ row, nodeId: targets[0].id });
  }
  for (const { row, nodeId } of pending) {
    if (row.status !== 'published') {
      const { rows: now } = await query(`SELECT percent FROM mp_node_stages WHERE node_id = $1 AND stage_id = $2`, [nodeId, row.stage_id]);
      out.set(row.id, now[0] ? Number(now[0].percent) : 0);
      continue;
    }
    const { rows: before } = await query(
      `SELECT r.percent FROM mp_reports r JOIN mp_report_nodes rn ON rn.report_id = r.id
       WHERE rn.node_id = $1 AND r.stage_id = $2 AND r.status = 'published' AND r.percent IS NOT NULL AND r.id <> $3
         AND (r.fact_date < $4 OR (r.fact_date = $4 AND r.id < $3))
       ORDER BY r.fact_date DESC, r.id DESC LIMIT 1`,
      [nodeId, row.stage_id, row.id, dayString(row.fact_date)]
    );
    if (before[0]) out.set(row.id, Number(before[0].percent));
  }
  return out;
}

async function shapeReports(ctx, rows) {
  const nodesOf = await reportNodes(rows.map((row) => row.id));
  const { rows: media } = rows.length ? await query(`SELECT * FROM mp_media WHERE report_id = ANY($1::int[]) ORDER BY taken_at NULLS LAST, id`, [rows.map((row) => row.id)]) : { rows: [] };
  const before = await previousPercents(rows, nodesOf);
  return rows.map((row) => {
    const nodes = nodesOf.get(row.id) || [];
    const rights = rightsOf(ctx, row, nodes);
    return {
      id: row.id,
      projectId: row.project_id,
      status: row.status,
      visibility: row.visibility,
      stage: row.stage_id ? { id: row.stage_id, name: row.stage_name } : null,
      percent: row.percent === null ? null : Number(row.percent),
      prevPercent: before.has(row.id) ? before.get(row.id) : null,
      factDate: dayString(row.fact_date),
      body: row.body,
      author: row.author_id ? { id: row.author_id, name: row.author_name, avatarUrl: avatarOf(row.author_avatar) } : null,
      reviewer: row.reviewer_id ? { id: row.reviewer_id, name: row.reviewer_name } : null,
      reviewNote: row.review_note,
      reviewedAt: iso(row.reviewed_at),
      publishedAt: iso(row.published_at),
      createdAt: iso(row.created_at),
      editedAt: iso(row.edited_at),
      nodes: nodes.map((node) => ({ id: node.id, code: node.code, name: node.name, kind: node.kind })),
      media: media.filter((item) => item.report_id === row.id).map(mediaShape),
      canReview: rights.review,
      canEdit: rights.edit,
      canDelete: rights.delete,
      canSubmit: rights.submit,
      editUntil: rights.editUntil ? iso(rights.editUntil) : null,
    };
  });
}

const REPORT_SELECT = `SELECT r.*, s.name AS stage_name, COALESCE(a.display_name, a.username) AS author_name, a.avatar_path AS author_avatar, COALESCE(v.display_name, v.username) AS reviewer_name
  FROM mp_reports r LEFT JOIN mp_stages s ON s.id = r.stage_id LEFT JOIN users a ON a.id = r.author_id LEFT JOIN users v ON v.id = r.reviewer_id`;

export async function reportById(ctx, id) {
  const { rows } = await query(`${REPORT_SELECT} WHERE r.id = $1`, [intOr(id, 0)]);
  if (!rows[0] || !canSeeReport(ctx, rows[0])) throw notFound('Report not found');
  return (await shapeReports(ctx, rows))[0];
}

/**
 * Journal: { project, node, status, mine, cursor, limit }. Newest state first
 * (date of the state, then id); `cursor` is `nextCursor` of the previous page.
 */
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
  const cursor = /^(\d{4}-\d{2}-\d{2})_(\d+)$/.exec(String(input.cursor || ''));
  if (cursor) {
    params.push(cursor[1], Number(cursor[2]));
    where.push(`(r.fact_date, r.id) < ($${params.length - 1}::date, $${params.length})`);
  } else if (intOr(input.before)) {
    params.push(intOr(input.before));
    where.push(`r.id < $${params.length}`);
  }
  const limit = Math.min(100, Math.max(1, intOr(input.limit, 20)));
  const { rows } = await query(`${REPORT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.fact_date DESC, r.id DESC LIMIT ${limit * 3 + 1}`, params);
  const scanned = rows.slice(0, limit * 3);
  const visible = [];
  let last = null;
  for (const row of scanned) {
    last = row;
    if (canSeeReport(ctx, row)) visible.push(row);
    if (visible.length === limit) break;
  }
  const hasMore = rows.length > limit * 3 || (last !== null && last !== scanned[scanned.length - 1]);
  return { reports: await shapeReports(ctx, visible), hasMore, nextCursor: hasMore && last ? `${dayString(last.fact_date)}_${last.id}` : null };
}

/** The card's journal: everything on and around the object the person may see (drafts only to their author and moderators). */
export async function recentReports(ctx, node, { limit = 8 } = {}) {
  const { reports, hasMore, nextCursor } = await listReports(ctx, { project: node.project_id, node: node.id, limit });
  return Object.assign(reports, { hasMore, nextCursor });
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
    // Only from a state that can still be reviewed: two moderators at once publish (and apply) it once.
    const { rows } = await client.query(
      `UPDATE mp_reports SET status = $2::text, reviewer_id = $3, reviewed_at = NOW(), review_note = $4, published_at = CASE WHEN $2::text = 'published' THEN NOW() ELSE published_at END, updated_at = NOW()
       WHERE id = $1 AND status IN ('review', 'draft', 'rejected') RETURNING *`,
      [report.id, publish ? 'published' : 'rejected', ctx.userId, note]
    );
    if (!rows.length) throw httpError(409, 'The report is already published', 'ALREADY_PUBLISHED');
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

/**
 * Locks a report for a change and checks the rights on the locked row (the
 * status may have changed since the person loaded it). 404 when invisible.
 */
async function lockReport(client, ctx, id, right) {
  const { rows } = await client.query(`SELECT * FROM mp_reports WHERE id = $1 FOR UPDATE`, [intOr(id, 0)]);
  const row = rows[0];
  if (!row || !canSeeReport(ctx, row)) throw notFound('Report not found');
  const nodes = (await reportNodes([row.id], client)).get(row.id) || [];
  const rights = rightsOf(ctx, row, nodes);
  if (!rights[right]) {
    const late = row.author_id === ctx.userId && row.status === 'published' && !rights.moderate;
    throw forbidden(late ? 'A published report can be changed by its author for 24 hours; ask the head of construction' : undefined, late ? 'REPORT_LOCKED' : 'FORBIDDEN');
  }
  return { row, nodes, rights };
}

/**
 * Deletes a report (rights: reportRights). Hard delete with a history event on
 * each of its objects; a published report's effect on stage progress is
 * taken back first (unapplyReport) and readiness recomputed; its photo and
 * video files are removed from disk (they belong to this report only).
 */
export async function deleteReport(ctx, id) {
  const out = await withTransaction(async (client) => {
    const { row, nodes } = await lockReport(client, ctx, id, 'delete');
    const { rows: stage } = row.stage_id ? await client.query(`SELECT name FROM mp_stages WHERE id = $1`, [row.stage_id]) : { rows: [] };
    const moved = await unapplyReport(client, ctx, row);
    const { rows: media } = await client.query(`DELETE FROM mp_media WHERE report_id = $1 RETURNING storage_key, thumb_key`, [row.id]);
    await client.query(`DELETE FROM mp_reports WHERE id = $1`, [row.id]);
    if (row.status === 'published') await recomputeLastReport(client, row.id, nodes.map((node) => node.id));
    for (const node of nodes) {
      const back = moved.find((item) => item.nodeId === node.id);
      await logEvent(client, {
        projectId: row.project_id,
        nodeId: node.id,
        kind: 'report_deleted',
        data: {
          reportId: row.id,
          status: row.status,
          ...reportEventScope(row),
          stage: row.stage_id ? { id: row.stage_id, name: stage[0]?.name || null } : null,
          percent: row.percent === null ? null : Number(row.percent),
          factDate: dayString(row.fact_date),
          authorId: row.author_id,
          photos: media.length,
          restored: back ? { from: back.from, to: back.to } : null,
        },
        authorId: ctx.userId,
      });
    }
    return { media, moved, projectId: row.project_id };
  });
  await removeMediaFiles(out.media);
  if (out.moved.length) treeChanged(out.projectId);
  return { restored: out.moved };
}

/**
 * Corrects a report: { body?, factDate?, percent?, removeMediaIds?, addMediaIds?, submit? }.
 * The objects and the stage stay (delete and report again to change them).
 * A published report with a new percent or date is taken back and applied
 * again, so progress follows the correction; `submit` sends a draft or a
 * returned report to review (or publishes it for a moderator / without
 * moderation). Removed photos leave the disk; added ones must be the
 * person's own uploads not yet attached anywhere.
 */
export async function updateReport(ctx, id, input = {}) {
  const patch = {};
  if (input.body !== undefined) patch.body = text(input.body, 5000) || null;
  if (input.factDate !== undefined) patch.fact_date = parseDay(input.factDate, 'factDate');
  if (input.percent !== undefined) {
    const n = parseNumber(input.percent);
    if (Number.isNaN(n) || (n !== null && (n < 0 || n > 100))) throw httpError(400, 'Percent is 0–100', 'INVALID_FIELD');
    patch.percent = n === null ? null : Math.round(n * 10) / 10;
  }
  if (patch.fact_date === null) delete patch.fact_date;
  const removeIds = idList(input.removeMediaIds, 60);
  const addIds = idList(input.addMediaIds, 30);
  const out = await withTransaction(async (client) => {
    const { row, nodes, rights } = await lockReport(client, ctx, id, 'edit');
    if (patch.percent !== undefined && patch.percent !== null && !row.stage_id) throw httpError(400, 'The report has no stage', 'INVALID_FIELD');
    const project = (await client.query(`SELECT id, name, settings FROM mp_projects WHERE id = $1`, [row.project_id])).rows[0];
    const stageName = row.stage_id ? (await client.query(`SELECT name FROM mp_stages WHERE id = $1`, [row.stage_id])).rows[0]?.name || null : null;
    const changes = {};
    if (patch.body !== undefined && patch.body !== row.body) changes.body = true;
    if (patch.fact_date !== undefined && patch.fact_date !== dayString(row.fact_date)) changes.factDate = { from: dayString(row.fact_date), to: patch.fact_date };
    const oldPercent = row.percent === null ? null : Number(row.percent);
    if (patch.percent !== undefined && patch.percent !== oldPercent) changes.percent = { from: oldPercent, to: patch.percent };
    let status = row.status;
    if (input.submit && rights.submit) {
      const moderator = nodes.every((node) => has(actCaps(ctx, node), 'build.moderate'));
      status = projectSettings(project.settings).moderation && !moderator ? 'review' : 'published';
      if (status !== row.status) changes.status = { from: row.status, to: status };
    }
    // A moderated project: the author's later correction of what is moderated goes back to review (editNeedsReview).
    const backToReview = editNeedsReview({
      moderation: projectSettings(project.settings).moderation,
      moderator: rights.moderate,
      status: row.status,
      percent: changes.percent,
      factDate: changes.factDate,
      photosAdded: addIds.length > 0,
    });
    if (backToReview) {
      status = 'review';
      changes.status = { from: row.status, to: status };
    }
    // Progress: a published report whose percent or date changes is taken back and applied again; one going back to review is taken back.
    const reapply = row.status === 'published' && (changes.percent || changes.factDate || backToReview);
    const moved = reapply ? await unapplyReport(client, ctx, row) : [];
    if (backToReview) await recomputeLastReport(client, row.id, nodes.map((node) => node.id));
    const { rows: removed } = removeIds.length
      ? await client.query(`DELETE FROM mp_media WHERE report_id = $1 AND id = ANY($2::int[]) RETURNING id, storage_key, thumb_key`, [row.id, removeIds])
      : { rows: [] };
    if (addIds.length) {
      const { rows: count } = await client.query(`SELECT COUNT(*)::int AS n FROM mp_media WHERE report_id = $1`, [row.id]);
      if (count[0].n + addIds.length > 30) throw httpError(400, 'A report takes up to 30 photos and videos', 'TOO_MANY');
      const { rowCount } = await client.query(`UPDATE mp_media SET report_id = $1 WHERE id = ANY($2::int[]) AND project_id = $3 AND created_by = $4 AND report_id IS NULL AND node_id IS NULL AND series IS NULL`, [row.id, addIds, row.project_id, ctx.userId]);
      if (rowCount !== addIds.length) throw httpError(400, 'Some photos are not yours or already used', 'INVALID_MEDIA');
    }
    if (removed.length) changes.photosRemoved = removed.length;
    if (addIds.length) changes.photosAdded = addIds.length;
    if (!Object.keys(changes).length) return { row, nodes, removed, moved, status, project, changed: false };
    const { rows: updated } = await client.query(
      `UPDATE mp_reports SET body = $2, fact_date = $3, percent = $4, status = $5::text,
              published_at = CASE WHEN $5::text = 'published' AND status <> 'published' THEN NOW() ELSE published_at END,
              reviewer_id = CASE WHEN $5::text = 'review' AND status <> 'review' THEN NULL ELSE reviewer_id END,
              edited_at = NOW(), edited_by = $6, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [row.id, patch.body !== undefined ? patch.body : row.body, patch.fact_date || dayString(row.fact_date), patch.percent !== undefined ? patch.percent : row.percent, status, ctx.userId]
    );
    const next = updated[0];
    let touched = [];
    if (next.status === 'published' && (reapply || row.status !== 'published')) {
      // Re-applying a correction does not count as a fresh visit to the site ("last report").
      touched = await applyReport(client, ctx, next, await linkedTargets(client, next.id), { touchLast: row.status !== 'published' });
    }
    for (const node of nodes) {
      await logEvent(client, { projectId: row.project_id, nodeId: node.id, kind: 'report_edited', data: { reportId: row.id, ...reportEventScope(next), stage: row.stage_id ? { id: row.stage_id, name: stageName } : null, ...changes }, authorId: ctx.userId });
    }
    return { row: next, nodes, removed, moved, status, project, changed: true, touched, submitted: Boolean(changes.status), stage: stageName ? { name: stageName } : null };
  });
  await removeMediaFiles(out.removed);
  if (out.moved.length || out.touched?.length) treeChanged(out.row.project_id);
  if (out.submitted) {
    afterReport(ctx, out.project, out.row, out.nodes, out.stage).catch((err) => console.warn('[masterplan] report notifications:', err.message));
  }
  return reportById(ctx, out.row.id);
}

/** One photo or video of a report (the same rights as editing the report). */
export async function deleteReportMedia(ctx, reportId, mediaId) {
  const removed = await withTransaction(async (client) => {
    const { row, nodes } = await lockReport(client, ctx, reportId, 'edit');
    const { rows } = await client.query(`DELETE FROM mp_media WHERE id = $1 AND report_id = $2 RETURNING id, name, storage_key, thumb_key`, [intOr(mediaId, 0), row.id]);
    if (!rows[0]) throw notFound('File not found');
    await client.query(`UPDATE mp_reports SET edited_at = NOW(), edited_by = $2, updated_at = NOW() WHERE id = $1`, [row.id, ctx.userId]);
    for (const node of nodes) await logEvent(client, { projectId: row.project_id, nodeId: node.id, kind: 'report_edited', data: { reportId: row.id, ...reportEventScope(row), photosRemoved: 1, name: rows[0].name }, authorId: ctx.userId });
    return rows;
  });
  await removeMediaFiles(removed);
  return reportById(ctx, reportId);
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
  const cache = {};
  for (const [projectId, list] of staleByProject) {
    const heads = await usersWithRole(['construction_head'], { project_id: projectId, path: [] }, cache);
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
  const { rows: allStages } = rows.length
    ? await query(`SELECT ns.node_id, ns.plan_end, ns.fact_end, ns.percent, s.name FROM mp_node_stages ns JOIN mp_stages s ON s.id = ns.stage_id WHERE ns.node_id = ANY($1::int[]) ORDER BY s.sort, s.id`, [rows.map((row) => row.id)])
    : { rows: [] };
  const stagesOf = new Map();
  for (const item of allStages) {
    if (!stagesOf.has(item.node_id)) stagesOf.set(item.node_id, []);
    stagesOf.get(item.node_id).push(item);
  }
  const caughtUp = [];
  for (const row of rows) {
    const stages = stagesOf.get(row.id) || [];
    const schedule = scheduleState(stages.map((item) => ({ planEnd: dayString(item.plan_end), factEnd: dayString(item.fact_end), percent: Number(item.percent) })), day);
    // Back on schedule: the next delay is reported from the threshold again.
    if (schedule.state !== 'behind') {
      if (row.delay_notified_days !== null) caughtUp.push(row.id);
      continue;
    }
    if (schedule.delayDays <= settings.delayAlertDays) continue;
    if (row.delay_notified_days && schedule.delayDays < row.delay_notified_days + 7) continue;
    const late = stages.filter((item) => Number(item.percent) < 100 && item.plan_end && dayString(item.plan_end) < day).map((item) => item.name)[0];
    const users = await usersWithRole(['construction_head', 'executive'], row, cache);
    await notify({
      userIds: users,
      kind: 'masterplan.construction',
      module: 'masterplan',
      link: `/app/masterplan/p/${row.project_id}/plan?node=${row.id}&tab=build`,
      render: mpMessage('delay', { code: row.code || row.name, days: schedule.delayDays, stage: late, project: row.project_name }),
    }).catch(() => {});
    await query(`UPDATE mp_nodes SET delay_notified_days = $2 WHERE id = $1`, [row.id, schedule.delayDays]);
  }
  if (caughtUp.length) await query(`UPDATE mp_nodes SET delay_notified_days = NULL WHERE id = ANY($1::int[])`, [caughtUp]);
}

export { unitsChanged };
