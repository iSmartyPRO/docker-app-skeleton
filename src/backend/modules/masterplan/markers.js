import { query, withTransaction } from '../../config/database.js';
import { httpError } from '../shared/acl.js';
import { requirePlan } from './projects.js';
import { treeChanged } from './realtime.js';
import { intOr, logEvent, text } from './util.js';

/*
 * Point markers on a site plan (docs/masterplan.md "Point markers"): instead
 * of a polygon an object can be placed as a circle with its number. A marker
 * is (plan, node) → centre x, y and radius r in plan coordinates, plus an
 * optional label that replaces the node's code on the plan.
 *
 * An object has ONE placement per plan: a contour or a marker. Saving a
 * marker removes the node's contour on that plan and saving a contour removes
 * its marker (projects.js → saveContours), so switching is one action and the
 * plan never shows the same number twice. Levels (sectors, phases) stay
 * contours: they are areas, not points.
 */

/** Size presets as a share of the plan's longer side (radius). */
export const MARKER_SIZE_SHARE = { S: 0.0055, M: 0.008, L: 0.0115 };
export const MARKER_LABEL_MAX = 12;
export const MARKER_BATCH_MAX = 2000;

/** Radius bounds of a plan in plan units: 0.2 % … 8 % of the longer side (at least 2 units). */
export function markerBounds(plan) {
  const side = Math.max(Number(plan?.width) || 0, Number(plan?.height) || 0, 1);
  return { min: Math.max(2, Math.round(side * 0.002 * 10) / 10), max: Math.round(side * 0.08 * 10) / 10, side };
}

/** A preset's radius for a plan ('S' | 'M' | 'L'), rounded to 0.1. */
export function presetRadius(plan, size = 'M') {
  const { side } = markerBounds(plan);
  return Math.round(side * (MARKER_SIZE_SHARE[size] || MARKER_SIZE_SHARE.M) * 10) / 10;
}

/**
 * A marker as sent by the editor → { x, y, r, label } or null when invalid.
 * The centre must lie on the plan (0..width × 0..height); r is a number within
 * the plan's bounds, or a preset name ('S' | 'M' | 'L'), or missing (M);
 * the label is optional text up to 12 characters (empty → null).
 */
export function cleanMarker(input, plan) {
  if (!input || typeof input !== 'object' || !plan) return null;
  const x = Number(input.x);
  const y = Number(input.y);
  if (input.x === null || input.y === null || input.x === '' || input.y === '') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x > plan.width || y > plan.height) return null;
  const bounds = markerBounds(plan);
  let r;
  if (input.r === undefined || input.r === null || input.r === '') r = presetRadius(plan, input.size || 'M');
  else if (typeof input.r === 'string' && MARKER_SIZE_SHARE[input.r]) r = presetRadius(plan, input.r);
  else {
    r = Number(input.r);
    if (!Number.isFinite(r) || r < bounds.min || r > bounds.max) return null;
  }
  if (input.label !== undefined && input.label !== null && typeof input.label !== 'string' && typeof input.label !== 'number') return null;
  const label = text(input.label, MARKER_LABEL_MAX) || null;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(r * 10) / 10, label };
}

export const markerShape = (row) => ({ planId: row.plan_id, nodeId: row.node_id, x: Number(row.x), y: Number(row.y), r: Number(row.r), label: row.label || null });

/**
 * Sets markers of a plan (administrators of the project):
 *   { markers: [{ nodeId, x, y, r?, label? } | { nodeId, remove: true }] }
 * All or nothing, in one transaction. A node may appear once per call; a
 * marker replaces the node's contour on this plan. Returns { changed, markers }.
 */
export async function saveMarkers(ctx, planId, input) {
  const plan = await requirePlan(ctx, planId);
  const items = Array.isArray(input?.markers) ? input.markers : [];
  if (items.length > MARKER_BATCH_MAX) throw httpError(400, `At most ${MARKER_BATCH_MAX} markers at once`, 'INVALID_MARKER');
  const nodeIds = items.map((item) => intOr(item?.nodeId)).filter(Boolean);
  if (new Set(nodeIds).size !== nodeIds.length) throw httpError(400, 'An object can have one marker per plan', 'DUPLICATE');
  const { rows: known } = await query(`SELECT id, kind FROM mp_nodes WHERE project_id = $1 AND id = ANY($2::int[])`, [plan.project_id, nodeIds]);
  const kinds = new Map(known.map((row) => [row.id, row.kind]));
  const plain = [];
  for (const item of items) {
    const nodeId = intOr(item?.nodeId);
    if (!kinds.has(nodeId)) throw httpError(400, 'Unknown object', 'INVALID_FIELD');
    if (item.remove === true) {
      plain.push({ nodeId, remove: true });
      continue;
    }
    if (kinds.get(nodeId) === 'level') throw httpError(400, 'Sectors and other levels are drawn as contours', 'INVALID_MARKER');
    const marker = cleanMarker(item, plan);
    if (!marker) throw httpError(400, 'A marker needs a centre on the plan and a radius within its bounds', 'INVALID_MARKER');
    plain.push({ nodeId, marker });
  }
  const saved = [];
  await withTransaction(async (client) => {
    for (const item of plain) {
      if (item.remove) {
        await client.query(`DELETE FROM mp_markers WHERE plan_id = $1 AND node_id = $2`, [plan.id, item.nodeId]);
        continue;
      }
      const { x, y, r, label } = item.marker;
      const { rows } = await client.query(
        `INSERT INTO mp_markers (plan_id, node_id, x, y, r, label) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (plan_id, node_id) DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y, r = EXCLUDED.r, label = EXCLUDED.label, updated_at = NOW()
         RETURNING *`,
        [plan.id, item.nodeId, x, y, r, label]
      );
      // One placement per plan: the point replaces the contour.
      await client.query(`DELETE FROM mp_contours WHERE plan_id = $1 AND node_id = $2`, [plan.id, item.nodeId]);
      saved.push(markerShape(rows[0]));
    }
    if (plain.length) {
      await logEvent(client, { projectId: plan.project_id, kind: 'contours', data: { planId: plan.id, markers: plain.length, removed: plain.filter((item) => item.remove).length }, authorId: ctx.userId });
    }
  });
  if (plain.length) treeChanged(plan.project_id);
  return { changed: plain.length, markers: saved };
}
