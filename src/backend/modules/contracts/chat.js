import { decide } from '../../api/scopes.js';
import { registerChatEntity } from '../chat/entities.js';
import { httpError } from './logic.js';
import { canView, contractsContext, contractsSettings, modulesEnabled } from './access.js';
import { contractPeople, contractUrl, loadRow } from './service.js';

/*
 * «Обсуждение»: every contract can have a conversation in the chat module
 * (entity type 'contract'). Its access is the contract's own; the creator,
 * the owner and the lawyer follow it. Messages may point at a risk (the card
 * posts «Риск #N …» with a link back to it); status changes, new versions
 * and risks appear as system lines (frontend: modules/contracts/chatEvents.jsx).
 */

const STATUS_COLOR = { draft: '#94A3B8', approval: '#F59E0B', question: '#F97316', approved: '#6366F1', signed: '#0EA5E9', active: '#10B981', expiring: '#EAB308', completed: '#64748B', rejected: '#EF4444', terminated: '#B91C1C' };

/** Nothing while the module is off or for an API token without the contracts area. */
async function moduleAccess(req) {
  if (!(await modulesEnabled()).contracts) return null;
  const policy = req?.apiToken?.policy;
  if (!policy) return { write: true };
  if (!decide(policy, 'GET', '/app/contracts/contracts').ok) return null;
  return { write: decide(policy, 'POST', '/app/contracts/contracts').ok };
}

export function registerContractChat() {
  registerChatEntity('contract', {
    async access(req, id) {
      const allowed = await moduleAccess(req);
      // Thrown, not null: the chat keeps the person's membership while the module is off.
      if (!allowed) throw httpError(404, 'Not found', 'NOT_FOUND');
      const row = await loadRow(id).catch(() => null);
      if (!row) return null;
      if (!(await canView(contractsContext(req, await contractsSettings()), row))) return { view: false };
      return { view: true, write: allowed.write, title: `${row.number} · ${row.title}`, subtitle: row.counterparty || '', link: contractUrl(row.id), color: STATUS_COLOR[row.status] || '#6366F1' };
    },
    async describe(id) {
      const row = await loadRow(id).catch(() => null);
      return row ? { title: `${row.number} · ${row.title}`, link: contractUrl(row.id) } : null;
    },
    async participants(id) {
      const row = await loadRow(id).catch(() => null);
      return row ? contractPeople(row) : [];
    },
  });
}
