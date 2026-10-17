import { notify } from '../../services/notifications.js';
import { getUserAccess } from '../../services/rbac.js';
import { registerApprovalType } from '../approvals/api.js';
import { APPROVAL_TYPE, canSeeDoc, logEvent, whContext, warehouseSettings } from './access.js';
import { DOC_TYPES, WRITEOFF_REASONS, docActions, httpError } from './logic.js';
import { afterPosted, docUrl, loadDoc, postInClient } from './documents.js';
import { warehouseMessage } from './messages.js';

/*
 * Write-offs, corrections and inventory acts above the threshold (settings
 * approvalThreshold, $500 by default, spec §12) go through the approvals
 * service as 'warehouse.document'. The document follows the process inside
 * the decision's transaction:
 *   pending / question → «На согласовании» · approved → posted at once
 *   (or «Согласовано», ready to post, when the stock is no longer there)
 *   rejected → «Отклонён» · returned / withdrawn → draft again.
 */

const TYPE_NAMES = {
  writeoff: { ru: 'Списание', en: 'Write-off', ky: 'Эсептен чыгаруу', tr: 'Hurdaya ayırma', zh: '报废' },
  correction: { ru: 'Корректировка', en: 'Correction', ky: 'Оңдоо', tr: 'Düzeltme', zh: '调整' },
  inventory: { ru: 'Акт инвентаризации', en: 'Inventory act', ky: 'Инвентаризация акты', tr: 'Sayım tutanağı', zh: '盘点单' },
  supplier_return: { ru: 'Возврат поставщику', en: 'Return to supplier', ky: 'Жеткирүүчүгө кайтаруу', tr: 'Tedarikçiye iade', zh: '退货给供应商' },
  issue: { ru: 'Выдача', en: 'Issue', ky: 'Берүү', tr: 'Çıkış', zh: '出库' },
};

const deferred = new Set();

function afterCommit(docId, to, actorId, failure) {
  const key = `${docId}:${to}`;
  if (deferred.has(key)) return;
  deferred.add(key);
  setTimeout(async () => {
    deferred.delete(key);
    try {
      const row = await loadDoc(docId);
      if (!row || row.status !== to) return;
      if (to === 'posted') await afterPosted(docId, actorId);
      if (to === 'approved' && failure) {
        notify({ userIds: [row.author_id], kind: 'warehouse.post_failed', module: 'warehouse', link: docUrl(row.id), actorId: null, render: warehouseMessage('postFailed', { doc: { number: row.number }, reason: failure }) }).catch(() => {});
      }
    } catch (err) {
      console.warn(`[warehouse] after approval ${docId} failed:`, err.message);
    }
  }, 600).unref?.();
}

export function registerWarehouseApproval() {
  return registerApprovalType({
    key: APPROVAL_TYPE,
    module: 'warehouse',
    title: { ru: 'Складской документ', en: 'Warehouse document', ky: 'Кампа документи', tr: 'Depo belgesi', zh: '仓库单据' },
    adminPermission: 'warehouse.admin',
    fields: [
      { key: 'amount', type: 'money', label: { ru: 'Сумма', en: 'Amount', ky: 'Сумма', tr: 'Tutar', zh: '金额' } },
      { key: 'docType', type: 'select', label: { ru: 'Тип документа', en: 'Document type', ky: 'Документтин түрү', tr: 'Belge türü', zh: '单据类型' }, options: Object.entries(TYPE_NAMES).map(([value, label]) => ({ value, label: `${label.ru} / ${label.en}` })) },
      { key: 'reason', type: 'select', label: { ru: 'Причина списания', en: 'Write-off reason', ky: 'Эсептен чыгаруунун себеби', tr: 'Hurdaya ayırma nedeni', zh: '报废原因' }, options: WRITEOFF_REASONS.map((value) => ({ value, label: value })) },
      {
        key: 'warehouse',
        type: 'select',
        label: { ru: 'Склад', en: 'Warehouse', ky: 'Кампа', tr: 'Depo', zh: '仓库' },
        options: async () => {
          const { query } = await import('../../config/database.js');
          const { rows } = await query(`SELECT id, name FROM wh_warehouses WHERE archived_at IS NULL ORDER BY sort, name`);
          return rows.map((row) => ({ value: row.id, label: row.name }));
        },
      },
    ],
    canView: async (ctx, docId) => {
      const row = await loadDoc(docId);
      return Boolean(row) && canSeeDoc(await whContext(ctx, await warehouseSettings()), row);
    },
    load: async (docId) => {
      const row = await loadDoc(docId);
      if (!row) return null;
      const settings = await warehouseSettings();
      const name = TYPE_NAMES[row.type] || { ru: row.type };
      // The approvals service shows `amount` to every participant (inbox, card, notifications) and has
      // no per-viewer hook, while warehouse sums are only for people with warehouse.cost: the sum is
      // not published. Route conditions still get it through `fields.amount`; the document card
      // shows it to those who may see it.
      return {
        title: `${name.ru} · ${row.reason_text || row.comment || ''}`.replace(/ · $/, ''),
        number: row.number,
        amount: null,
        currency: null,
        author: { id: row.author_id || row.created_by },
        url: docUrl(row.id),
        fields: { amount: row.total === null ? null : Number(row.total), currency: settings.currency, docType: row.type, reason: row.reason, warehouse: row.warehouse_id },
      };
    },
    onStatus: async (docId, status, info) => {
      const { client, action, actorId } = info;
      const { rows } = await client.query(`SELECT * FROM wh_docs WHERE id = $1 FOR UPDATE`, [Number(docId)]);
      const row = rows[0];
      if (!row) throw httpError(404, 'Document not found', 'NOT_FOUND');
      if (!DOC_TYPES[row.type]) throw httpError(400, 'Unknown document', 'BAD_TYPE');
      const settings = await warehouseSettings();
      // Only someone who may post the document sends it (also through the approvals API).
      if (['start', 'restart'].includes(action) && actorId) {
        const access = await getUserAccess(actorId);
        const ctx = await whContext({ user: { id: actorId }, access }, settings);
        const roles = { src: row.warehouse_id ? ctx.rights(row.warehouse_id) : new Set(), dst: row.to_warehouse_id ? ctx.rights(row.to_warehouse_id) : new Set(), isAuthor: row.author_id === actorId };
        if (!docActions({ ...row, status: 'draft' }, roles).post) throw httpError(403, 'Only those who may post the document send it to approval', 'FORBIDDEN');
      }
      const set = async (to, event, data = {}) => {
        await client.query(`UPDATE wh_docs SET status = $2, updated_at = NOW() WHERE id = $1`, [row.id, to]);
        await logEvent(client, 'doc', row.id, actorId, event, data);
      };
      switch (status) {
        case 'pending':
        case 'question':
          if (!['draft', 'requested', 'pending', 'approved'].includes(row.status)) throw httpError(409, `A document in status "${row.status}" cannot go to approval`, 'BAD_TRANSITION');
          if (row.status !== 'pending') await set('pending', 'approval_started');
          return;
        case 'approved': {
          if (!['pending', 'draft', 'requested'].includes(row.status)) throw httpError(409, `A document in status "${row.status}" cannot be approved`, 'BAD_TRANSITION');
          // Post now; if the stock is gone meanwhile, keep the approval and let the storekeeper post later.
          await client.query('SAVEPOINT wh_approved');
          try {
            await postInClient(client, row, { actorId, settings });
            await client.query('RELEASE SAVEPOINT wh_approved');
            afterCommit(row.id, 'posted', actorId);
          } catch (err) {
            await client.query('ROLLBACK TO SAVEPOINT wh_approved');
            await set('approved', 'approved_not_posted', { error: err.code || 'ERROR', message: err.message });
            afterCommit(row.id, 'approved', actorId, err.message);
          }
          return;
        }
        case 'rejected':
          await set('rejected', 'rejected', { comment: info.comment || '' });
          return;
        case 'returned':
        case 'withdrawn':
          await set('draft', status, { comment: info.comment || '' });
          return;
        default:
      }
    },
  });
}
