import { decide } from '../../api/scopes.js';
import { modules } from '../../platform/registry.js';
import { httpError } from '../shared/acl.js';
import { canSee, modulesState, procContext, procurementSettings } from './access.js';
import { loadRow, requestUrl } from './service.js';

// Chat is an optional link: the conversation exists only while the Chat module is installed.
const registerChatEntity = (type, adapter) => modules.whenLoaded('chat', (chat) => chat.registerChatEntity(type, adapter));

/*
 * «Обсуждение»: every purchase request has a conversation in the chat module
 * (docs/chat.md#chats-for-other-modules). Access is the request's own; the
 * author and the responsible person follow it.
 */

const STATUS_COLOR = { draft: '#94A3B8', pending: '#F59E0B', question: '#F97316', returned: '#F97316', to_pay: '#2563EB', partially_paid: '#6366F1', paid: '#10B981', delivered: '#059669', closed: '#64748B', rejected: '#E5484D', cancelled: '#94A3B8' };

async function moduleAccess(req) {
  if (!(await modulesState()).procurement) return null;
  const policy = req?.apiToken?.policy;
  if (!policy) return { write: true };
  if (!decide(policy, 'GET', '/app/procurement/requests').ok) return null;
  return { write: decide(policy, 'POST', '/app/procurement/requests').ok };
}

export function registerRequestChat() {
  registerChatEntity('procurement', {
    async access(req, id) {
      const allowed = await moduleAccess(req);
      // Thrown, not null: the chat keeps memberships while the module is off.
      if (!allowed) throw httpError(404, 'Not found', 'NOT_FOUND');
      const row = await loadRow(id).catch(() => null);
      if (!row) return null;
      if (!(await canSee(procContext(req, await procurementSettings()), row))) return { view: false };
      return { view: true, write: allowed.write, title: `${row.number} · ${row.title || ''}`.trim(), subtitle: row.supplier_name || '', link: requestUrl(row.id), color: STATUS_COLOR[row.status] || '#F97316' };
    },
    async describe(id) {
      const row = await loadRow(id).catch(() => null);
      return row ? { title: `${row.number} · ${row.title || ''}`.trim(), link: requestUrl(row.id) } : null;
    },
    async participants(id) {
      const row = await loadRow(id).catch(() => null);
      if (!row) return [];
      return [...new Set([row.author_id, row.responsible_id].filter(Boolean))];
    },
  });
}
