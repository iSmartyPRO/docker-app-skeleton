import { query, withTransaction } from '../../config/database.js';
import { HEX, clean, httpError, intId } from '../shared/acl.js';
import { inPipelineLimits, visibleSql } from './access.js';
import { Params, RANK_STEP } from './util.js';

/*
 * Pipelines and their stages. Every pipeline keeps its open stages first,
 * then exactly one 'won' and one 'lost' stage. Changing them is for crm.admin.
 */

export const STAGE_KINDS = ['open', 'won', 'lost'];
const MAX_STAGES = 30;

export const stageShape = (row) => ({ id: row.id, pipelineId: row.pipeline_id, name: row.name, color: row.color, sort: row.sort, kind: row.kind });

export function pipelineShape(row, stages, counts) {
  return {
    id: row.id,
    name: row.name,
    color: row.color || null,
    sort: row.sort,
    isDefault: Boolean(row.is_default),
    archived: Boolean(row.archived_at),
    stages: stages.filter((stage) => stage.pipeline_id === row.id).map(stageShape),
    ...(counts ? { counts: { open: counts.get(row.id) || 0 } } : {}),
  };
}

export function requireAdmin(ctx) {
  if (!ctx.canAdmin) throw httpError(403, 'Only CRM administrators can change pipelines and settings', 'FORBIDDEN');
}

/** Pipelines the person may use (an API token may be narrowed to some), with stages and open-deal counts. */
export async function listPipelines(ctx, { archived = false, counts = true } = {}) {
  const [pipelines, stages] = await Promise.all([
    query(`SELECT * FROM crm_pipelines ${archived ? '' : 'WHERE archived_at IS NULL'} ORDER BY sort, id`),
    query(`SELECT * FROM crm_stages ORDER BY pipeline_id, sort, id`),
  ]);
  let countMap = null;
  if (counts) {
    const p = new Params();
    const where = ['d.deleted_at IS NULL', `s.kind = 'open'`, ...visibleSql(ctx, p)];
    const { rows } = await query(
      `SELECT d.pipeline_id, COUNT(*)::int AS n FROM crm_deals d JOIN crm_stages s ON s.id = d.stage_id WHERE ${where.join(' AND ')} GROUP BY d.pipeline_id`,
      p.values
    );
    countMap = new Map(rows.map((row) => [row.pipeline_id, row.n]));
  }
  return pipelines.rows.filter((row) => inPipelineLimits(ctx, row.id)).map((row) => pipelineShape(row, stages.rows, countMap));
}

export async function loadPipeline(ctx, id, { allowArchived = true } = {}) {
  const pipelineId = intId(id);
  if (!inPipelineLimits(ctx, pipelineId)) throw httpError(404, 'Pipeline not found', 'NOT_FOUND');
  const { rows } = await query(`SELECT * FROM crm_pipelines WHERE id = $1`, [pipelineId]);
  if (!rows[0] || (!allowArchived && rows[0].archived_at)) throw httpError(404, 'Pipeline not found', 'NOT_FOUND');
  const stages = await query(`SELECT * FROM crm_stages WHERE pipeline_id = $1 ORDER BY sort, id`, [pipelineId]);
  return { row: rows[0], stages: stages.rows, shape: pipelineShape(rows[0], stages.rows) };
}

export async function defaultPipelineId(ctx) {
  const { rows } = await query(`SELECT id FROM crm_pipelines WHERE archived_at IS NULL ORDER BY is_default DESC, sort, id`);
  return rows.find((row) => inPipelineLimits(ctx, row.id))?.id || null;
}

/**
 * Stages as sent by the editor → ordered list: open stages in the given order,
 * then the won stage, then the lost one. Exactly one of each closed kind.
 */
export function normalizeStages(list) {
  const items = (Array.isArray(list) ? list : [])
    .map((item) => ({
      id: Number.isInteger(Number(item?.id)) && Number(item?.id) > 0 ? Number(item.id) : null,
      name: clean(item?.name, 80),
      color: HEX.test(item?.color || '') ? item.color.toUpperCase() : null,
      kind: STAGE_KINDS.includes(item?.kind) ? item.kind : 'open',
    }))
    .filter((item) => item.name);
  const open = items.filter((item) => item.kind === 'open');
  const won = items.filter((item) => item.kind === 'won');
  const lost = items.filter((item) => item.kind === 'lost');
  if (!open.length) throw httpError(400, 'Keep at least one open stage', 'STAGES_INVALID');
  if (won.length !== 1 || lost.length !== 1) throw httpError(400, 'A pipeline needs exactly one won and one lost stage', 'STAGES_INVALID');
  if (open.length + 2 > MAX_STAGES) throw httpError(400, `At most ${MAX_STAGES} stages`, 'STAGES_INVALID');
  const palette = ['#94A3B8', '#3B82F6', '#8B5CF6', '#F59E0B', '#0EA5E9', '#EC4899', '#14B8A6', '#6366F1'];
  return [...open.map((item, index) => ({ ...item, color: item.color || palette[index % palette.length] })), { ...won[0], color: won[0].color || '#10B981' }, { ...lost[0], color: lost[0].color || '#EF4444' }];
}

const DEFAULT_NEW_STAGES = [
  { name: 'Новая', kind: 'open' },
  { name: 'В работе', kind: 'open' },
  { name: 'Успешно', kind: 'won' },
  { name: 'Провалена', kind: 'lost' },
];

export async function createPipeline(ctx, input = {}) {
  requireAdmin(ctx);
  const name = clean(input.name, 120);
  if (!name) throw httpError(400, 'Pipeline name is required', 'NAME_REQUIRED');
  const stages = normalizeStages(Array.isArray(input.stages) && input.stages.length ? input.stages.map((stage) => ({ ...stage, id: null })) : DEFAULT_NEW_STAGES);
  const id = await withTransaction(async (client) => {
    const sort = await client.query(`SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM crm_pipelines`);
    const any = await client.query(`SELECT 1 FROM crm_pipelines WHERE archived_at IS NULL LIMIT 1`);
    const { rows } = await client.query(
      `INSERT INTO crm_pipelines (name, color, sort, is_default) VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, HEX.test(input.color || '') ? input.color.toUpperCase() : '#2563EB', sort.rows[0].n, !any.rows.length]
    );
    for (const [index, stage] of stages.entries()) {
      await client.query(`INSERT INTO crm_stages (pipeline_id, name, color, sort, kind) VALUES ($1, $2, $3, $4, $5)`, [rows[0].id, stage.name, stage.color, index, stage.kind]);
    }
    return rows[0].id;
  });
  return (await loadPipeline(ctx, id)).shape;
}

/**
 * Renames / recolours / archives a pipeline and replaces its stages. Removing
 * a stage that still has deals needs `moveTo`: a stage id kept in the list,
 * or a map { removedStageId: keptStageId }.
 */
export async function updatePipeline(ctx, id, input = {}) {
  requireAdmin(ctx);
  const { row } = await loadPipeline(ctx, id);
  await withTransaction(async (client) => {
    const sets = [];
    const values = [];
    const set = (column, value) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (input.name !== undefined) {
      const name = clean(input.name, 120);
      if (!name) throw httpError(400, 'Pipeline name is required', 'NAME_REQUIRED');
      set('name', name);
    }
    if (input.color !== undefined) set('color', HEX.test(input.color || '') ? input.color.toUpperCase() : null);
    if (typeof input.archived === 'boolean') {
      if (input.archived && row.is_default) throw httpError(400, 'Make another pipeline the default one first', 'DEFAULT_PIPELINE');
      set('archived_at', input.archived ? new Date() : null);
    }
    if (input.isDefault === true) {
      if (row.archived_at && input.archived !== false) throw httpError(400, 'An archived pipeline cannot be the default one', 'ARCHIVED');
      await client.query(`UPDATE crm_pipelines SET is_default = FALSE WHERE is_default AND id <> $1`, [row.id]);
      set('is_default', true);
    }
    if (sets.length) {
      values.push(row.id);
      await client.query(`UPDATE crm_pipelines SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    }
    if (Array.isArray(input.stages)) await saveStages(client, row.id, input.stages, input.moveTo);
  });
  return (await loadPipeline(ctx, row.id)).shape;
}

async function saveStages(client, pipelineId, list, moveTo) {
  const incoming = normalizeStages(list);
  const existing = (await client.query(`SELECT id, kind FROM crm_stages WHERE pipeline_id = $1 FOR UPDATE`, [pipelineId])).rows;
  const known = new Set(existing.map((stage) => stage.id));
  // Ids of other pipelines are treated as new stages.
  for (const item of incoming) if (item.id && !known.has(item.id)) item.id = null;
  const keptIds = new Set(incoming.filter((item) => item.id).map((item) => item.id));
  const removed = existing.filter((stage) => !keptIds.has(stage.id));

  // Where deals of removed stages go: checked before anything changes.
  const targets = new Map();
  if (removed.length) {
    const counts = await client.query(
      `SELECT stage_id, COUNT(*)::int AS n FROM crm_deals WHERE stage_id = ANY($1) GROUP BY stage_id`,
      [removed.map((stage) => stage.id)]
    );
    const busy = counts.rows.filter((entry) => entry.n > 0);
    for (const entry of busy) {
      const target = moveTo && typeof moveTo === 'object' ? Number(moveTo[entry.stage_id]) : Number(moveTo);
      if (!keptIds.has(target)) {
        const error = httpError(409, 'Some removed stages still have deals: choose where to move them (moveTo)', 'STAGE_HAS_DEALS');
        error.details = { stages: busy.map((item) => ({ id: item.stage_id, count: item.n })) };
        throw error;
      }
      targets.set(entry.stage_id, target);
    }
  }

  const finalIds = [];
  for (const [index, item] of incoming.entries()) {
    if (item.id) {
      await client.query(`UPDATE crm_stages SET name = $2, color = $3, sort = $4, kind = $5 WHERE id = $1`, [item.id, item.name, item.color, index, item.kind]);
      finalIds.push(item.id);
    } else {
      const { rows } = await client.query(
        `INSERT INTO crm_stages (pipeline_id, name, color, sort, kind) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [pipelineId, item.name, item.color, index, item.kind]
      );
      finalIds.push(rows[0].id);
    }
  }
  for (const [from, to] of targets) {
    // Moved deals go below the target column, keeping their order.
    const edge = await client.query(`SELECT COALESCE(MAX(rank), 0) AS edge FROM crm_deals WHERE stage_id = $1`, [to]);
    await client.query(
      `UPDATE crm_deals d SET stage_id = $2, rank = $3 + r.n * ${RANK_STEP}, stage_changed_at = NOW(), updated_at = NOW(), version = version + 1
       FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY rank, id) AS n FROM crm_deals WHERE stage_id = $1) r
       WHERE r.id = d.id`,
      [from, to, Number(edge.rows[0].edge)]
    );
  }
  if (removed.length) await client.query(`DELETE FROM crm_stages WHERE id = ANY($1)`, [removed.map((stage) => stage.id)]);
  // A stage that changed kind: closed_at follows it (lost_reason is kept for history).
  await client.query(
    `UPDATE crm_deals d SET closed_at = CASE WHEN s.kind = 'open' THEN NULL ELSE COALESCE(d.closed_at, NOW()) END
     FROM crm_stages s WHERE s.id = d.stage_id AND d.pipeline_id = $1
       AND ((s.kind = 'open') <> (d.closed_at IS NULL))`,
    [pipelineId]
  );
  return finalIds;
}

/** Deletes a pipeline; its deals (also those in the trash) must move first: `moveTo` = another pipeline id. */
export async function deletePipeline(ctx, id, moveTo) {
  requireAdmin(ctx);
  const { row, stages } = await loadPipeline(ctx, id);
  const { rows: count } = await query(`SELECT COUNT(*)::int AS n FROM crm_deals WHERE pipeline_id = $1`, [row.id]);
  const others = await query(`SELECT id FROM crm_pipelines WHERE id <> $1`, [row.id]);
  if (!others.rows.length) throw httpError(400, 'The last pipeline cannot be deleted', 'LAST_PIPELINE');
  await withTransaction(async (client) => {
    if (count[0].n > 0) {
      const target = Number(moveTo);
      if (!target || target === row.id) {
        const error = httpError(409, 'The pipeline has deals: choose a pipeline to move them to (moveTo)', 'PIPELINE_HAS_DEALS');
        error.details = { count: count[0].n };
        throw error;
      }
      const targetStages = (await client.query(`SELECT id, kind FROM crm_stages WHERE pipeline_id = $1 ORDER BY sort, id`, [target])).rows;
      if (!targetStages.length) throw httpError(404, 'Pipeline not found', 'NOT_FOUND');
      // Open deals go to the first open stage; won and lost stay won and lost.
      for (const stage of stages) {
        const to = targetStages.find((item) => item.kind === stage.kind) || targetStages[0];
        await client.query(`UPDATE crm_deals SET pipeline_id = $3, stage_id = $2, updated_at = NOW(), version = version + 1 WHERE stage_id = $1`, [stage.id, to.id, target]);
      }
    }
    await client.query(`DELETE FROM crm_pipelines WHERE id = $1`, [row.id]);
    if (row.is_default) {
      await client.query(
        `UPDATE crm_pipelines SET is_default = TRUE WHERE id = (SELECT id FROM crm_pipelines ORDER BY archived_at IS NOT NULL, sort, id LIMIT 1)`
      );
    }
  });
}

export async function orderPipelines(ctx, ids) {
  requireAdmin(ctx);
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
  await withTransaction(async (client) => {
    for (const [index, pipelineId] of list.entries()) await client.query(`UPDATE crm_pipelines SET sort = $2 WHERE id = $1`, [pipelineId, index]);
  });
  return listPipelines(ctx);
}
