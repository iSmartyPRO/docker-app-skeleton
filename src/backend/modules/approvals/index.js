import { ensureApprovalsSchema } from './schema.js';
import { privateRoutes } from './routes.js';
import { registerInboxProvider, setUrgencyRanker } from '../../services/inbox.js';
import { approvalSettings, decide, answer, inboxItems } from './engine.js';
import { urgencyRank } from './logic.js';
import * as api from './api.js';

/*
 * Approvals: a core service (always on). Other modules register document
 * types and start processes through ./api.js; people decide on the «Ждёт
 * меня» page (/app/approvals) and in module cards. Spec: docs/approvals.md.
 */

// The inbox orders every provider's items by the configured urgency levels.
let ranks = null;
setUrgencyRanker((key) => (ranks ? urgencyRank(ranks, key) : { critical: 0, urgent: 1, normal: 2 }[key] ?? 50));
async function refreshRanks() {
  try {
    ranks = await approvalSettings();
  } catch {
    /* the database may not be ready yet */
  }
}

registerInboxProvider(
  'approvals',
  async (ctx) => {
    await refreshRanks();
    return inboxItems(ctx.req || ctx);
  },
  {
    // Inline actions of the inbox page: approve, question, reject, return, delegate, answer.
    act: async (ctx, id, action, payload) => {
      const req = ctx.req || ctx;
      if (action === 'answer') return answer(req, Number(id), payload);
      return decide(req, Number(id), { ...payload, action });
    },
  }
);

export default {
  id: 'approvals',
  schema: ensureApprovalsSchema,
  routes: privateRoutes,
  api,
};
