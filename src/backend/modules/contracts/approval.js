import { getSettings, parseSettings } from '../../services/settings.js';
import { getUserAccess } from '../../services/rbac.js';
import { hasPermission } from '../../services/permissions.js';
import { listLegalEntities } from '../../services/legalEntities.js';
import { registerApprovalType } from '../approvals/api.js';
import { TYPE_KEY, httpError, statusFromApproval } from './logic.js';
import { canView, contractsContext, contractsSettings } from './access.js';
import { COLUMNS, afterStatus, contractPeople, contractUrl, loadRow, notifyPeople, writeStatus } from './service.js';

/*
 * Contracts go through the approvals service (docs/approvals.md) as the
 * document type 'contracts.contract'. The route (Settings → Approvals) may
 * test the amount, the type, the direction and the legal entity. The
 * contract follows the process in onStatus, inside the decision's
 * transaction (statusFromApproval in logic.js):
 *   pending → На согласовании · question → Нужен ответ · approved → Согласован
 *   rejected → Отклонён · returned / withdrawn → Проект
 * Sending is refused unless the contract is a draft (or rejected), has a
 * file version, and the sender is its creator, owner, lawyer or a lawyer of
 * the company (contracts.legal / contracts.admin).
 */

export async function approvalSettingsForContracts() {
  return parseSettings(await getSettings()).modules.approvals?.settings || {};
}

const STOCK_TYPE_NAMES = {
  supply: { ru: 'Поставка', en: 'Supply' },
  services: { ru: 'Услуги', en: 'Services' },
  lease: { ru: 'Аренда', en: 'Lease' },
  work: { ru: 'Подряд', en: 'Works' },
  employment: { ru: 'Трудовой', en: 'Employment' },
  sale: { ru: 'Купли-продажи', en: 'Sale' },
  agency: { ru: 'Агентский', en: 'Agency' },
  loan: { ru: 'Займ', en: 'Loan' },
  nda: { ru: 'NDA', en: 'NDA' },
  other: { ru: 'Другое', en: 'Other' },
};

/** A type's name: the administrator's label, else the stock name. */
export function typeName(settings, key, locale = 'ru') {
  const type = (settings.types || []).find((item) => item.key === key);
  if (type?.label) return type.label;
  return STOCK_TYPE_NAMES[key]?.[locale] || key || '';
}

const deferred = new Set();

/** Side effects of an approval-driven status change, after the decision's transaction committed. */
function afterCommit(contractId, from, to, actorId, comment) {
  const key = `${contractId}:${to}`;
  if (deferred.has(key)) return;
  deferred.add(key);
  setTimeout(async () => {
    deferred.delete(key);
    try {
      const row = await loadRow(contractId);
      // Rolled back (or changed again): nothing to tell.
      if (!row || row.status !== to) return;
      // The author already hears from the approvals service about approved / rejected.
      await afterStatus(row, from, to, { actorId, comment, notifyStatus: false });
      if (['approved', 'rejected'].includes(to)) {
        const author = row.owner_id || row.created_by;
        await notifyPeople(contractPeople(row).filter((id) => id !== author), 'contracts.status', 'status', { status: to, comment }, row, actorId);
      }
    } catch (err) {
      console.warn(`[contracts] after approval ${contractId} failed:`, err.message);
    }
  }, 800).unref?.();
}

export function registerContractApproval() {
  return registerApprovalType({
    key: TYPE_KEY,
    module: 'contracts',
    title: { ru: 'Договор', en: 'Contract' },
    adminPermission: 'contracts.admin',
    fields: [
      { key: 'amount', type: 'money', label: { ru: 'Сумма', en: 'Amount' } },
      {
        key: 'type',
        type: 'select',
        label: { ru: 'Тип договора', en: 'Contract type' },
        options: async () => {
          const settings = await contractsSettings();
          return (settings.types || []).map((type) => ({ value: type.key, label: typeName(settings, type.key) }));
        },
      },
      {
        key: 'direction',
        type: 'select',
        label: { ru: 'Направление', en: 'Direction' },
        options: [
          { value: 'supplier', label: 'С поставщиком / Supplier' },
          { value: 'client', label: 'С клиентом / Client' },
        ],
      },
      {
        key: 'legalEntity',
        type: 'select',
        label: { ru: 'Юрлицо', en: 'Legal entity' },
        options: async () => (await listLegalEntities()).map((entity) => ({ value: entity.id, label: entity.label })),
      },
      { key: 'framework', type: 'bool', label: { ru: 'Рамочный', en: 'Framework' } },
    ],
    canView: async (ctx, docId) => {
      const row = await loadRow(docId);
      return Boolean(row) && canView(contractsContext(ctx, await contractsSettings()), row);
    },
    load: async (docId) => {
      const row = await loadRow(docId);
      if (!row) return null;
      return {
        title: row.counterparty ? `${row.title} · ${row.counterparty}` : row.title,
        number: row.number,
        amount: row.framework || row.amount === null ? null : Number(row.amount),
        currency: row.currency ? row.currency.trim() : null,
        author: { id: row.owner_id || row.created_by },
        url: contractUrl(row.id),
        fields: { type: row.type_key, direction: row.direction, legalEntity: row.legal_entity_id, framework: row.framework },
      };
    },
    onStatus: async (docId, status, info) => {
      const { client, action, actorId, comment } = info;
      const { rows } = await client.query(`SELECT ${COLUMNS} FROM ctr_contracts c WHERE c.id = $1 FOR UPDATE`, [Number(docId)]);
      const row = rows[0];
      if (!row) throw httpError(404, 'Contract not found', 'NOT_FOUND');
      if (['start', 'restart'].includes(action) && actorId) {
        const access = await getUserAccess(actorId);
        const legal = hasPermission(access?.permissions || [], 'contracts.legal') || hasPermission(access?.permissions || [], 'contracts.admin');
        if (!legal && ![row.created_by, row.owner_id, row.lawyer_id].includes(actorId)) {
          throw httpError(403, 'Only the contract’s people or a lawyer can send it to approval', 'FORBIDDEN');
        }
        const versions = await client.query(`SELECT 1 FROM ctr_versions WHERE contract_id = $1 LIMIT 1`, [row.id]);
        if (!versions.rows.length) throw httpError(400, 'Upload the contract file before sending it to approval', 'VERSION_REQUIRED');
      }
      const to = statusFromApproval(row.status, status, action);
      if (to === row.status) return;
      await writeStatus(client, row, to, { actorId, comment, source: 'approval' });
      afterCommit(row.id, row.status, to, actorId, comment);
    },
  });
}
