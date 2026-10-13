import { query } from '../../config/database.js';
import { registerApprovalType } from '../approvals/api.js';
import { registerInboxProvider } from '../../services/inbox.js';
import { decide } from '../../api/scopes.js';
import { getUserAccess } from '../../services/rbac.js';
import { hasPermission } from '../../services/permissions.js';
import { listLegalEntities } from '../../services/legalEntities.js';
import { isoDay, wallToInstant } from '../../services/datetime.js';
import { requestRegional } from '../../services/regional.js';
import { APPROVAL_TYPE, canSee, modulesState, procContext, procurementSettings } from './access.js';
import { approvalTarget, httpError, PAYABLE, readyErrors } from './logic.js';
import { isoDayOf, logEvent, notifyToPay, requestUrl, usersByIds, webhook, whenCommitted } from './service.js';

/*
 * The purchase request as an approvals document type (docs/approvals.md):
 * the route conditions see amount + currency, category, project and legal
 * entity; onStatus moves the request inside the decision's transaction
 * (approve → «К оплате» at once, spec §5.2) and refuses sending a request
 * that is not ready (no invoice while the setting requires one) or by
 * someone other than its author, responsible person or an administrator.
 */

const TITLE = { ru: 'Заявка на закупку', en: 'Purchase request' };

async function loadRequest(docId) {
  const id = Number(docId);
  if (!Number.isInteger(id) || id < 1) return null;
  const { rows } = await query(`SELECT * FROM proc_requests WHERE id = $1`, [id]);
  return rows[0] || null;
}

/** The author (or creator), the responsible person or a procurement administrator. */
async function maySend(userId, row) {
  if ([row.author_id, row.created_by, row.responsible_id].includes(Number(userId))) return true;
  const access = await getUserAccess(Number(userId));
  return hasPermission(access?.permissions || [], 'procurement.admin');
}

/** 23:59 of a calendar day in a zone, as an ISO moment. */
function endOfDay(value, timeZone) {
  const [year, month, day] = value.split('-').map(Number);
  return wallToInstant({ year, month, day, hour: 23, minute: 59, second: 59 }, timeZone).toISOString();
}

export function registerProcurementApproval() {
  registerApprovalType({
    key: APPROVAL_TYPE,
    module: 'procurement',
    title: TITLE,
    fields: [
      { key: 'amount', type: 'money', label: { ru: 'Сумма', en: 'Amount' } },
      {
        key: 'category',
        type: 'select',
        label: { ru: 'Категория', en: 'Category' },
        options: async () => ((await procurementSettings()).categories || []).map((item) => ({ value: item.key, label: item.name })),
      },
      {
        key: 'legalEntity',
        type: 'select',
        label: { ru: 'Юрлицо-плательщик', en: 'Paying legal entity' },
        options: async () => (await listLegalEntities()).map((entity) => ({ value: entity.id, label: entity.label })),
      },
      {
        key: 'project',
        type: 'ref',
        label: { ru: 'Проект (Мастерплан)', en: 'Project (Masterplan)' },
        options: async () => {
          if (!(await modulesState()).masterplan) return [];
          const { rows } = await query(`SELECT id, name FROM mp_projects WHERE archived_at IS NULL ORDER BY sort, id`).catch(() => ({ rows: [] }));
          return rows.map((row) => ({ value: row.id, label: row.name }));
        },
      },
      { key: 'paymentTerms', type: 'select', label: { ru: 'Условия оплаты', en: 'Payment terms' }, options: [
        { value: 'full', label: '100 %' },
        { value: 'advance', label: 'Аванс / Advance' },
        { value: 'postpay', label: 'Постоплата / Post-payment' },
      ] },
    ],
    canView: async (ctx, docId) => {
      const row = await loadRequest(docId);
      if (!row) return false;
      return canSee(procContext(ctx, await procurementSettings()), row);
    },
    load: async (docId) => {
      const row = await loadRequest(docId);
      if (!row) return null;
      return {
        title: row.title || row.number,
        number: row.number,
        amount: Number(row.amount),
        currency: row.currency,
        urgency: row.urgency || undefined,
        author: { id: row.author_id },
        dueAt: null,
        url: requestUrl(row.id),
        fields: { category: row.category, legalEntity: row.legal_entity_id, project: row.project_id, paymentTerms: row.payment_terms },
      };
    },
    onStatus: async (docId, status, info) => {
      const { client } = info;
      const { rows } = await client.query(`SELECT * FROM proc_requests WHERE id = $1 FOR UPDATE`, [Number(docId)]);
      const row = rows[0];
      if (!row) throw httpError(404, 'Request not found', 'NOT_FOUND');
      const to = approvalTarget(row.status, status);
      if (['start', 'restart'].includes(info.action)) {
        // However it is sent (the card, the approvals API), only the request's
        // people send it, and an unready request never goes out — also when no
        // stage of the route applies and it would be approved at once.
        if (info.actorId && !(await maySend(info.actorId, row))) {
          throw httpError(403, 'Only the author, the responsible person or an administrator can send the request', 'FORBIDDEN');
        }
        const settings = await procurementSettings();
        const { rows: docs } = await client.query(`SELECT COUNT(*)::int AS n FROM proc_documents WHERE request_id = $1 AND kind = 'invoice'`, [row.id]);
        const missing = readyErrors(row, { invoiceCount: docs[0].n, invoiceRequired: settings.invoiceRequired, currencies: settings.currencies });
        if (missing.length) throw httpError(400, 'Fill in the request before sending it', missing[0], { missing });
      }
      if (to === row.status) return;
      await client.query(
        `UPDATE proc_requests SET status = $2::text,
           submitted_at = CASE WHEN $3::boolean THEN NOW() ELSE submitted_at END,
           approved_at = CASE WHEN $2::text = 'to_pay' THEN NOW() ELSE approved_at END,
           updated_at = NOW()
         WHERE id = $1`,
        [row.id, to, ['start', 'restart'].includes(info.action)]
      );
      await logEvent(client, row.id, info.actorId, 'status', { from: row.status, to, approval: status });
      whenCommitted(row.id, to, async (fresh) => {
        if (to === 'to_pay') {
          await notifyToPay(fresh);
          webhook('procurement.approved', fresh, info.actorId);
        } else if (to === 'rejected') webhook('procurement.rejected', fresh, info.actorId, { comment: info.comment || null });
        webhook('procurement.status_changed', fresh, info.actorId, { from: row.status, to });
      });
    },
    // Spec §10: one stage «Директор» until an administrator builds a route.
    defaultRoute: {
      stages: [{ id: 'director', name: 'Директор', mode: 'any', approvers: [{ kind: 'permission', key: 'procurement.admin' }] }],
    },
    adminPermission: 'procurement.admin',
  });

  // «Ждёт меня» for accountants: approved requests waiting for money.
  registerInboxProvider(
    'procurement.pay',
    async (ctx) => {
      const req = ctx.req || ctx;
      // An API token sees these only with the procurement area in its scope.
      const policy = req?.apiToken?.policy || ctx.apiToken?.policy;
      if (policy && !decide(policy, 'GET', '/app/procurement/requests').ok) return [];
      const pctx = procContext(req, await procurementSettings());
      if (!pctx.canPay || !pctx.userId) return [];
      const regional = await requestRegional(req);
      const today = isoDay(new Date(), regional.timeZone);
      const { rows } = await query(
        `SELECT * FROM proc_requests WHERE status = ANY($1::text[]) ORDER BY pay_by NULLS LAST, id LIMIT 200`,
        [PAYABLE]
      );
      const people = await usersByIds(rows.map((row) => row.author_id));
      return rows.map((row) => {
        const payBy = row.pay_by ? isoDayOf(row.pay_by) : null;
        return {
          key: `procurement.pay:${row.id}`,
          module: 'procurement',
          kind: 'payment',
          id: row.id,
          title: row.title || row.number,
          number: row.number,
          amount: Math.max(0, Number(row.amount) - Number(row.paid_amount)),
          currency: row.currency,
          urgency: row.urgency || null,
          author: people.get(row.author_id) || null,
          // The end of the pay-by day; overdue from the next day on.
          dueAt: payBy ? endOfDay(payBy, regional.timeZone) : null,
          overdue: Boolean(payBy && payBy < today),
          url: `/app/procurement/payments?open=${row.id}`,
          actions: ['open'],
          meta: { status: row.status, payBy, supplier: row.supplier_name || '' },
        };
      });
    },
    { module: 'procurement' }
  );
}
