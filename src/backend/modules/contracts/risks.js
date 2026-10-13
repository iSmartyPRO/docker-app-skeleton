import { query, withTransaction } from '../../config/database.js';
import { cleanRisk, httpError } from './logic.js';
import { canManageRisks, canView } from './access.js';
import { actorNameOf, emitContract, loadRow, logEvent, notifyPeople, postChat, requireContract, riskShape } from './service.js';

/*
 * «На что обратить внимание»: the lawyer's checklist of risks. Each has a
 * number within the contract (#1, #2…), the clause, an importance and a
 * status (open → accepted / fixed). Approvers see the open high ones next to
 * their decision buttons. A new high risk notifies the owner and the creator.
 */

async function riskRow(ctx, riskId) {
  const n = Number(riskId);
  if (!Number.isInteger(n) || n < 1) throw httpError(404, 'Risk not found', 'NOT_FOUND');
  const { rows } = await query(`SELECT * FROM ctr_risks WHERE id = $1`, [n]);
  if (!rows[0]) throw httpError(404, 'Risk not found', 'NOT_FOUND');
  const contract = await loadRow(rows[0].contract_id);
  if (!contract || !(await canView(ctx, contract))) throw httpError(404, 'Risk not found', 'NOT_FOUND');
  return { risk: rows[0], contract };
}

async function shaped(id) {
  const { rows } = await query(
    `SELECT r.*, COALESCE(u.display_name, u.username) AS author_name, COALESCE(rv.display_name, rv.username) AS resolver_name
     FROM ctr_risks r LEFT JOIN users u ON u.id = r.created_by LEFT JOIN users rv ON rv.id = r.resolved_by WHERE r.id = $1`,
    [id]
  );
  return riskShape(rows[0]);
}

export async function addRisk(ctx, contractId, input = {}) {
  const contract = await requireContract(ctx, contractId);
  if (!canManageRisks(ctx, contract)) throw httpError(403, 'Only the lawyer adds risks', 'FORBIDDEN');
  const data = cleanRisk(input);
  const risk = await withTransaction(async (client) => {
    await client.query(`SELECT id FROM ctr_contracts WHERE id = $1 FOR UPDATE`, [contract.id]);
    const { rows: next } = await client.query(`SELECT COALESCE(MAX(no), 0) + 1 AS no FROM ctr_risks WHERE contract_id = $1`, [contract.id]);
    const { rows } = await client.query(
      `INSERT INTO ctr_risks (contract_id, no, text, clause, importance, status, created_by, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
      [contract.id, next[0].no, data.text, data.clause, data.importance, data.status || 'open', ctx.userId]
    );
    await logEvent(client, contract.id, 'risk', { no: rows[0].no, text: data.text, importance: data.importance, clause: data.clause }, ctx.userId);
    return rows[0];
  });
  const shape = await shaped(risk.id);
  if (shape.importance === 'high') {
    await notifyPeople([contract.owner_id, contract.created_by], 'contracts.risk', 'risk', { risk: shape, actor: await actorNameOf(ctx.userId) }, contract, ctx.userId);
  }
  await postChat(contract.id, ctx.userId, { event: 'contract.risk', no: shape.no, importance: shape.importance, text: shape.text.slice(0, 200) });
  emitContract('risk_changed', contract, ctx.userId, { risk: shape, change: 'added' });
  return shape;
}

export async function updateRisk(ctx, riskId, input = {}) {
  const { risk, contract } = await riskRow(ctx, riskId);
  if (!canManageRisks(ctx, contract)) throw httpError(403, 'Only the lawyer changes risks', 'FORBIDDEN');
  const data = cleanRisk(input, true);
  if (!Object.keys(data).length) return shaped(risk.id);
  const resolving = data.status && data.status !== risk.status;
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE ctr_risks SET text = COALESCE($2, text), clause = CASE WHEN $3 THEN $4 ELSE clause END, importance = COALESCE($5, importance),
         status = COALESCE($6, status), updated_by = $7, updated_at = NOW(),
         resolved_by = CASE WHEN $8 THEN (CASE WHEN $6 = 'open' THEN NULL ELSE $7 END) ELSE resolved_by END,
         resolved_at = CASE WHEN $8 THEN (CASE WHEN $6 = 'open' THEN NULL ELSE NOW() END) ELSE resolved_at END
       WHERE id = $1`,
      [risk.id, data.text ?? null, 'clause' in data, data.clause ?? null, data.importance ?? null, data.status ?? null, ctx.userId, Boolean(resolving)]
    );
    await logEvent(client, contract.id, 'risk_update', { no: risk.no, ...(resolving ? { status: { from: risk.status, to: data.status } } : {}), ...(data.importance && data.importance !== risk.importance ? { importance: { from: risk.importance, to: data.importance } } : {}), ...(data.text && data.text !== risk.text ? { text: data.text } : {}) }, ctx.userId);
  });
  const shape = await shaped(risk.id);
  if (resolving) await postChat(contract.id, ctx.userId, { event: 'contract.risk_status', no: shape.no, status: shape.status });
  emitContract('risk_changed', contract, ctx.userId, { risk: shape, change: 'updated' });
  return shape;
}

export async function deleteRisk(ctx, riskId) {
  const { risk, contract } = await riskRow(ctx, riskId);
  if (!canManageRisks(ctx, contract)) throw httpError(403, 'Only the lawyer removes risks', 'FORBIDDEN');
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM ctr_risks WHERE id = $1`, [risk.id]);
    await logEvent(client, contract.id, 'risk_delete', { no: risk.no, text: risk.text.slice(0, 200) }, ctx.userId);
  });
  emitContract('risk_changed', contract, ctx.userId, { risk: { id: risk.id, no: risk.no }, change: 'deleted' });
}
