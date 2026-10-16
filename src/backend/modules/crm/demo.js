import { registerDemo } from '../../services/demo.js';
import { RANK_STEP } from './util.js';
import { crmSettings } from './access.js';
import { demoMoney, dropEntityChats, dropNotifications, isoDate } from '../shared/demoAssets.js';

/*
 * Demo data of the CRM (spec §8, docs/crm.md «Демо-данные»): two pipelines —
 * property sales of the «Посёлок «Пример»» demo project and wholesale
 * supplies — with about twenty deals in every stage, owned by demo sales
 * people and the administrator, linked to the Counterparties demo companies
 * when that module is seeded, and activities (calls, meetings, tasks) of
 * which some are overdue and some are due today.
 *
 * Rows are written directly (no webhooks, no notifications); purge deletes
 * the deals (their activities, events and watchers cascade), the stages and
 * the pipelines. Masterplan's demo links its units to the property deals by
 * `unit` (DEMO_DEALS is tracked in this order).
 */

export const DEMO_SELLERS = {
  sales1: { key: 'emp.sales1', name: { ru: 'Алексей Продажин', en: 'Alexey Seller' } },
  sales3: { key: 'emp.sales3', name: { ru: 'Ольга Сделкина', en: 'Olga Deal' } },
  north: { key: 'org.north', name: { ru: 'Игорь Северов', en: 'Igor North' } },
};

const PIPELINES = [
  {
    key: 'property',
    name: { ru: 'Демо: продажи недвижимости', en: 'Demo: property sales' },
    color: '#0EA5E9',
    stages: [
      [{ ru: 'Новый лид', en: 'New lead' }, '#94A3B8', 'open'],
      [{ ru: 'Показ', en: 'Viewing' }, '#3B82F6', 'open'],
      [{ ru: 'Бронирование', en: 'Booking' }, '#F59E0B', 'open'],
      [{ ru: 'Задаток и договор', en: 'Deposit and contract' }, '#8B5CF6', 'open'],
      [{ ru: 'Сделка закрыта', en: 'Closed won' }, '#10B981', 'won'],
      [{ ru: 'Отказ', en: 'Lost' }, '#EF4444', 'lost'],
    ],
  },
  {
    key: 'wholesale',
    name: { ru: 'Демо: оптовые поставки', en: 'Demo: wholesale' },
    color: '#F97316',
    stages: [
      [{ ru: 'Новая заявка', en: 'New request' }, '#94A3B8', 'open'],
      [{ ru: 'Расчёт', en: 'Estimate' }, '#3B82F6', 'open'],
      [{ ru: 'КП отправлено', en: 'Quote sent' }, '#8B5CF6', 'open'],
      [{ ru: 'Переговоры', en: 'Negotiation' }, '#F59E0B', 'open'],
      [{ ru: 'Успешно', en: 'Won' }, '#10B981', 'won'],
      [{ ru: 'Провалена', en: 'Lost' }, '#EF4444', 'lost'],
    ],
  },
];

// pipeline, stage index, title, amount (USD), owner, company key, person index, source, close in days, unit (masterplan code)
export const DEMO_DEALS = [
  { p: 0, s: 0, title: { ru: 'Заявка с сайта: коттедж до 150 тыс.', en: 'Website lead: a cottage under 150k' }, usd: 150000, owner: 'sales1', source: 'Сайт', close: 30 },
  { p: 0, s: 0, title: { ru: 'Звонок: квартира с двумя спальнями', en: 'Call: a two-bedroom flat' }, usd: 82000, owner: 'sales3', source: 'Звонок', close: 40 },
  { p: 0, s: 1, title: { ru: 'Коттедж A-1-07 — показ семье Примеровых', en: 'Cottage A-1-07 — viewing for the Example family' }, usd: 168000, owner: 'sales1', source: 'Рекомендация', close: 21, unit: 'A-1-07' },
  { p: 0, s: 1, title: { ru: 'Коттедж A-2-01 — повторный показ', en: 'Cottage A-2-01 — second viewing' }, usd: 172000, owner: 'me', source: 'Выставка', close: 14, unit: 'A-2-01' },
  { p: 0, s: 2, title: { ru: 'Коттедж A-1-03 — бронь, семья Покупателевых', en: 'Cottage A-1-03 — booking, the Buyer family' }, usd: 158000, owner: 'sales1', source: 'Сайт', close: 10, unit: 'A-1-03' },
  { p: 0, s: 2, title: { ru: 'Коттедж A-1-05 — бронь, Анна Клиентова', en: 'Cottage A-1-05 — booking, Anna Client' }, usd: 164000, owner: 'sales3', source: 'Звонок', close: 12, unit: 'A-1-05' },
  { p: 0, s: 2, title: { ru: 'Квартира D1-10 — бронь', en: 'Flat D1-10 — booking' }, usd: 76000, owner: 'me', source: 'Instagram', close: 7, unit: 'D1-10' },
  { p: 0, s: 3, title: { ru: 'Коттедж A-1-06 — задаток получен', en: 'Cottage A-1-06 — deposit received' }, usd: 161000, owner: 'sales1', source: 'Рекомендация', close: 5, unit: 'A-1-06' },
  { p: 0, s: 3, title: { ru: 'Коттедж A-2-03 — подготовка договора', en: 'Cottage A-2-03 — contract in preparation' }, usd: 175000, owner: 'north', source: 'Сайт', close: 3, unit: 'A-2-03' },
  { p: 0, s: 4, title: { ru: 'Коттедж A-1-01 — продан', en: 'Cottage A-1-01 — sold' }, usd: 149000, owner: 'sales1', source: 'Сайт', close: -20, unit: 'A-1-01' },
  { p: 0, s: 4, title: { ru: 'Квартира D1-2 — продана', en: 'Flat D1-2 — sold' }, usd: 69000, owner: 'sales3', source: 'Звонок', close: -35, unit: 'D1-2' },
  { p: 0, s: 5, title: { ru: 'Коттедж B-1-04 — клиент выбрал другой вариант', en: 'Cottage B-1-04 — the client chose another option' }, usd: 155000, owner: 'north', source: 'Выставка', close: -10, lost: 'Выбрали конкурента' },
  { p: 1, s: 0, title: { ru: 'ООО «Пример»: отделочные материалы на квартал', en: 'Example LLC: finishing materials for the quarter' }, usd: 24000, owner: 'me', company: 'example', person: 0, source: 'Сайт', close: 25 },
  { p: 1, s: 1, title: { ru: 'ИП Тестов: поставка сантехники', en: 'Test Sole Trader: plumbing supply' }, usd: 8600, owner: 'sales3', company: 'prospect', source: 'Звонок', close: 18 },
  { p: 1, s: 2, title: { ru: 'ООО «Компания-Партнёр»: кабельная продукция', en: 'Partner Company LLC: cables' }, usd: 15400, owner: 'sales1', company: 'partner', person: 2, source: 'Рекомендация', close: 9 },
  { p: 1, s: 2, title: { ru: 'ООО «Пример»: инструмент для бригад', en: 'Example LLC: tools for the crews' }, usd: 6200, owner: 'me', company: 'example', person: 0, source: 'WhatsApp', close: 6 },
  { p: 1, s: 3, title: { ru: 'АО «Образец»: годовой контракт на смеси', en: 'Sample JSC: annual dry-mix contract' }, usd: 48000, owner: 'north', company: 'sample', person: 1, source: 'Выставка', close: 4 },
  { p: 1, s: 3, title: { ru: 'ООО «Пример»: продление договора поставки', en: 'Example LLC: supply contract renewal' }, usd: 31000, owner: 'sales3', company: 'example', person: 0, source: 'Звонок', close: 2 },
  { p: 1, s: 4, title: { ru: 'ООО «Компания-Партнёр»: светильники для офиса', en: 'Partner Company LLC: office lighting' }, usd: 4300, owner: 'sales1', company: 'partner', person: 2, source: 'Сайт', close: -12 },
  { p: 1, s: 5, title: { ru: 'ИП Тестов: двери и фурнитура', en: 'Test Sole Trader: doors and fittings' }, usd: 5100, owner: 'sales3', company: 'prospect', source: 'Instagram', close: -6, lost: 'Дорого' },
];

const COMPANY_KEYS = ['example', 'sample', 'partner', 'prospect'];

// Activities: [deal index, kind, title, day offset, time, done]
const ACTIVITIES = [
  [0, 'call', { ru: 'Перезвонить и уточнить бюджет', en: 'Call back about the budget' }, 0, '11:00'],
  [1, 'email', { ru: 'Отправить подборку квартир', en: 'Send a selection of flats' }, -1, '10:00'],
  [2, 'meeting', { ru: 'Показ коттеджа A-1-07 на объекте', en: 'Viewing of cottage A-1-07 on site' }, 1, '15:00'],
  [3, 'meeting', { ru: 'Повторный показ с супругой клиента', en: 'Second viewing with the client’s spouse' }, 0, '16:30'],
  [3, 'call', { ru: 'Подтвердить время показа', en: 'Confirm the viewing time' }, -1, '12:00', true],
  [4, 'task', { ru: 'Подготовить договор бронирования', en: 'Prepare the booking agreement' }, -2, '18:00'],
  [5, 'call', { ru: 'Напомнить о сроке брони', en: 'Remind about the booking deadline' }, 0, '10:30'],
  [6, 'task', { ru: 'Согласовать график платежей', en: 'Agree the payment schedule' }, 2, '12:00'],
  [6, 'call', { ru: 'Первый звонок клиенту', en: 'First call with the client' }, -5, '11:00', true],
  [7, 'meeting', { ru: 'Подписание договора в офисе продаж', en: 'Contract signing at the sales office' }, 3, '11:00'],
  [8, 'task', { ru: 'Проверить документы покупателя', en: 'Check the buyer’s documents' }, -3, '17:00'],
  [12, 'call', { ru: 'Уточнить объёмы по позициям', en: 'Clarify the quantities' }, 0, '14:00'],
  [13, 'task', { ru: 'Сделать расчёт стоимости', en: 'Prepare the estimate' }, 1, '18:00'],
  [14, 'email', { ru: 'Отправить коммерческое предложение', en: 'Send the quote' }, -1, '09:30', true],
  [14, 'call', { ru: 'Обсудить КП с главным инженером', en: 'Discuss the quote with the chief engineer' }, 2, '11:00'],
  [15, 'call', { ru: 'Узнать решение по КП', en: 'Ask for a decision on the quote' }, -2, '15:00'],
  [16, 'meeting', { ru: 'Переговоры о скидке за объём', en: 'Volume discount negotiation' }, 0, '12:00'],
  [17, 'task', { ru: 'Подготовить допсоглашение о продлении', en: 'Prepare the renewal amendment' }, 4, '18:00'],
  [18, 'call', { ru: 'Поблагодарить за заказ', en: 'Thank the client for the order' }, -10, '10:00', true],
];

const COMMENTS = [
  [4, { ru: 'Клиент просит рассрочку на 12 месяцев — уточнить у финансов.', en: 'The client asks for a 12-month instalment plan — check with finance.' }],
  [7, { ru: 'Задаток поступил, ждём подписания договора.', en: 'The deposit has arrived; waiting for the contract signing.' }],
  [16, { ru: 'Готовы взять весь объём при скидке 5%.', en: 'Ready to take the whole volume at a 5% discount.' }],
];

registerDemo({
  module: 'crm',
  describe: {
    ru: 'Две воронки (продажи недвижимости и оптовые поставки), 20 сделок на всех этапах с клиентами из «Контрагентов», звонки, встречи и задачи — часть просрочена и на сегодня',
    en: 'Two pipelines (property sales and wholesale), 20 deals in every stage with clients from Counterparties, calls, meetings and tasks — some overdue and some due today',
  },
  after: ['companies', 'employees'],
  async seed(ctx) {
    const settings = await crmSettings();
    const currency = settings.currency || 'USD';
    const owners = { me: ctx.userId };
    for (const [key, person] of Object.entries(DEMO_SELLERS)) owners[key] = await ctx.demoUser(person.key, { displayName: ctx.t(person.name) });
    // Counterparties demo (when seeded): companies in their order, people in theirs.
    const companyIds = await ctx.records('cmp_companies', 'companies');
    const peopleIds = await ctx.records('cmp_people', 'companies');
    const alive = async (table, ids) => new Set((await ctx.query(`SELECT id FROM ${table} WHERE id = ANY($1::int[])`, [ids])).rows.map((row) => row.id));
    const liveCompanies = await alive('cmp_companies', companyIds);
    const livePeople = await alive('cmp_people', peopleIds);

    const stageIds = [];
    for (const [index, def] of PIPELINES.entries()) {
      const sort = (await ctx.query(`SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM crm_pipelines`)).rows[0].n;
      const { rows } = await ctx.query(`INSERT INTO crm_pipelines (name, color, sort, is_default) VALUES ($1, $2, $3, FALSE) RETURNING id`, [ctx.t(def.name), def.color, sort + index]);
      await ctx.track('crm_pipelines', rows[0].id);
      const ids = [];
      for (const [order, [name, color, kind]] of def.stages.entries()) {
        const stage = await ctx.query(`INSERT INTO crm_stages (pipeline_id, name, color, sort, kind) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, color, kind`, [rows[0].id, ctx.t(name), color, order, kind]);
        await ctx.track('crm_stages', stage.rows[0].id);
        ids.push(stage.rows[0]);
      }
      stageIds.push({ pipelineId: rows[0].id, name: ctx.t(def.name), stages: ids });
    }

    const dealIds = [];
    for (const [index, def] of DEMO_DEALS.entries()) {
      const pipeline = stageIds[def.p];
      const stage = pipeline.stages[def.s];
      const companyId = def.company ? companyIds[COMPANY_KEYS.indexOf(def.company)] : null;
      const personId = def.person !== undefined ? peopleIds[def.person] : null;
      const closed = stage.kind !== 'open';
      const created = ctx.day(-(12 + ((index * 5) % 25)), '10:00');
      const { rows } = await ctx.query(
        `INSERT INTO crm_deals (pipeline_id, stage_id, title, amount, currency, company_id, person_id, owner_id, source, comment, close_date, lost_reason,
                                rank, stage_changed_at, closed_at, created_by, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16, $17, NOW()) RETURNING id`,
        [
          pipeline.pipelineId,
          stage.id,
          ctx.t(def.title),
          demoMoney(def.usd, currency),
          currency,
          liveCompanies.has(companyId) ? companyId : null,
          livePeople.has(personId) ? personId : null,
          owners[def.owner],
          def.source,
          ctx.t({ ru: 'Демо-сделка. Удаляется кнопкой «Удалить демо-данные».', en: 'A demo deal. «Remove demo data» deletes it.' }),
          isoDate(ctx.day(def.close)),
          def.lost || null,
          (index + 1) * RANK_STEP,
          ctx.day(-Math.max(1, (index * 3) % 9), '12:00'),
          closed ? ctx.day(def.close, '17:00') : null,
          ctx.userId,
          created,
        ]
      );
      const dealId = rows[0].id;
      dealIds.push(dealId);
      await ctx.track('crm_deals', dealId);
      await ctx.query(`INSERT INTO crm_events (deal_id, kind, data, author_id, created_at) VALUES ($1, 'created', $2, $3, $4)`, [
        dealId,
        JSON.stringify({ stage: { id: pipeline.stages[0].id, name: pipeline.stages[0].name, color: pipeline.stages[0].color, kind: 'open' }, pipeline: { id: pipeline.pipelineId, name: pipeline.name } }),
        owners[def.owner],
        created,
      ]);
      if (def.s > 0) {
        const kind = stage.kind === 'won' ? 'won' : stage.kind === 'lost' ? 'lost' : 'stage';
        const from = pipeline.stages[stage.kind === 'open' ? def.s - 1 : 3];
        await ctx.query(`INSERT INTO crm_events (deal_id, kind, data, author_id, created_at) VALUES ($1, $2, $3, $4, $5)`, [
          dealId,
          kind,
          JSON.stringify({ from: { id: from.id, name: from.name, color: from.color, kind: from.kind }, to: { id: stage.id, name: stage.name, color: stage.color, kind: stage.kind }, ...(def.lost ? { lostReason: def.lost } : {}) }),
          owners[def.owner],
          ctx.day(-Math.max(1, (index * 3) % 9), '12:00'),
        ]);
      }
      // The administrator follows the deals of the sales people in the property pipeline.
      if (def.p === 0 && def.owner !== 'me') await ctx.query(`INSERT INTO crm_deal_watchers (deal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [dealId, ctx.userId]);
    }

    for (const [deal, kind, title, offset, at, done] of ACTIVITIES) {
      const def = DEMO_DEALS[deal];
      const owner = owners[def.owner];
      const { rows } = await ctx.query(
        `INSERT INTO crm_activities (deal_id, kind, title, due_at, owner_id, remind_minutes, reminded_at, done_at, done_by, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, 30, $6, $7, $8, $9, $10) RETURNING id`,
        [dealIds[deal], kind, ctx.t(title), ctx.day(offset, at), owner, offset <= 0 ? new Date() : null, done ? ctx.day(offset, at) : null, done ? owner : null, ctx.userId, ctx.day(Math.min(offset, 0) - 2, '09:00')]
      );
      await ctx.track('crm_activities', rows[0].id);
      await ctx.query(`INSERT INTO crm_events (deal_id, kind, data, author_id, created_at) VALUES ($1, 'activity_added', $2, $3, $4)`, [
        dealIds[deal],
        JSON.stringify({ activity: { id: rows[0].id, kind, title: ctx.t(title), dueAt: ctx.day(offset, at).toISOString() }, ownerId: owner }),
        ctx.userId,
        ctx.day(Math.min(offset, 0) - 2, '09:00'),
      ]);
    }
    for (const [deal, body] of COMMENTS) {
      const author = owners[DEMO_DEALS[deal].owner];
      await ctx.query(`INSERT INTO crm_events (deal_id, kind, body, data, author_id, created_at) VALUES ($1, 'comment', $2, $3, $4, $5)`, [dealIds[deal], ctx.t(body), JSON.stringify({ body: ctx.t(body), authorId: author }), author, ctx.day(-1, '17:20')]);
    }
  },
  async purge(ctx) {
    const deals = await ctx.records('crm_deals');
    await dropEntityChats(ctx.query, 'deal', deals);
    await dropNotifications(ctx.query, deals.map((id) => `/app/crm/deals/${id}`));
    // Units of the Masterplan demo keep no link to a removed deal (ON DELETE SET NULL does it too; contracts and requests store plain ids).
    await ctx.query(`UPDATE ctr_contracts SET deal_id = NULL WHERE deal_id = ANY($1::int[])`, [deals]).catch(() => {});
    await ctx.query(`UPDATE proc_requests SET deal_id = NULL, deal_label = NULL WHERE deal_id = ANY($1::int[])`, [deals]).catch(() => {});
  },
});
