import { registerDemo } from '../../services/demo.js';
import { RANK_STEP } from './util.js';
import { crmSettings } from './access.js';
import { CRM_STOCK_LISTS } from '../catalog.js';
import { demoMoney, dropEntityChats, dropNotifications, isoDate } from '../shared/demoAssets.js';
import { DEMO_DEALS, DEMO_SELLERS } from './demoData.js';

export { DEMO_DEALS, DEMO_SELLERS };

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

/**
 * A stock source / lost reason (written in Russian below) as the portal's CRM settings list it
 * (whatever language the stored list has), else in the portal language.
 */
const stockText = (ctx, settings, list, ru) => {
  const entry = CRM_STOCK_LISTS[list].find((item) => item.ru === ru);
  if (!entry) return ru;
  const listed = (settings?.[list] || []).find((value) => Object.values(entry).includes(value));
  return listed || ctx.t(entry);
};


const PIPELINES = [
  {
    key: 'property',
    name: { ru: 'Демо: продажи недвижимости', en: 'Demo: property sales', ky: 'Демо: кыймылсыз мүлк сатуу', tr: 'Demo: gayrimenkul satışları', zh: '演示：房产销售' },
    color: '#0EA5E9',
    stages: [
      [{ ru: 'Новый лид', en: 'New lead', ky: 'Жаңы лид', tr: 'Yeni potansiyel müşteri', zh: '新线索' }, '#94A3B8', 'open'],
      [{ ru: 'Показ', en: 'Viewing', ky: 'Көрсөтүү', tr: 'Gösterim', zh: '看房' }, '#3B82F6', 'open'],
      [{ ru: 'Бронирование', en: 'Booking', ky: 'Брондоо', tr: 'Rezervasyon', zh: '预订' }, '#F59E0B', 'open'],
      [{ ru: 'Задаток и договор', en: 'Deposit and contract', ky: 'Кепилдик акча жана келишим', tr: 'Kaparo ve sözleşme', zh: '定金与合同' }, '#8B5CF6', 'open'],
      [{ ru: 'Сделка закрыта', en: 'Closed won', ky: 'Бүтүм жабылды', tr: 'Kazanıldı', zh: '成交' }, '#10B981', 'won'],
      [{ ru: 'Отказ', en: 'Lost', ky: 'Баш тартуу', tr: 'Kaybedildi', zh: '输单' }, '#EF4444', 'lost'],
    ],
  },
  {
    key: 'wholesale',
    name: { ru: 'Демо: оптовые поставки', en: 'Demo: wholesale', ky: 'Демо: дүң жеткирүүлөр', tr: 'Demo: toptan satış', zh: '演示：批发供货' },
    color: '#F97316',
    stages: [
      [{ ru: 'Новая заявка', en: 'New request', ky: 'Жаңы өтүнмө', tr: 'Yeni talep', zh: '新建申请' }, '#94A3B8', 'open'],
      [{ ru: 'Расчёт', en: 'Estimate', ky: 'Эсептөө', tr: 'Fiyat hesaplama', zh: '报价测算' }, '#3B82F6', 'open'],
      [{ ru: 'КП отправлено', en: 'Quote sent', ky: 'Коммерциялык сунуш жөнөтүлдү', tr: 'Teklif gönderildi', zh: '报价已发送' }, '#8B5CF6', 'open'],
      [{ ru: 'Переговоры', en: 'Negotiation', ky: 'Сүйлөшүүлөр', tr: 'Müzakere', zh: '谈判' }, '#F59E0B', 'open'],
      [{ ru: 'Успешно', en: 'Won', ky: 'Ийгиликтүү', tr: 'Kazanıldı', zh: '赢单' }, '#10B981', 'won'],
      [{ ru: 'Провалена', en: 'Lost', ky: 'Ийгиликсиз', tr: 'Kaybedildi', zh: '输单' }, '#EF4444', 'lost'],
    ],
  },
];


const COMPANY_KEYS = ['example', 'sample', 'partner', 'prospect'];

// Activities: [deal index, kind, title, day offset, time, done]
const ACTIVITIES = [
  [0, 'call', { ru: 'Перезвонить и уточнить бюджет', en: 'Call back about the budget', ky: 'Кайра чалып, бюджетти тактоо', tr: 'Bütçe için geri arayın', zh: '回电确认预算' }, 0, '11:00'],
  [1, 'email', { ru: 'Отправить подборку квартир', en: 'Send a selection of flats', ky: 'Батирлердин тандоосун жөнөтүү', tr: 'Bir daire seçkisi gönderin', zh: '发送公寓推荐清单' }, -1, '10:00'],
  [2, 'meeting', { ru: 'Показ коттеджа A-1-07 на объекте', en: 'Viewing of cottage A-1-07 on site', ky: 'Объектте A-1-07 коттеджин көрсөтүү', tr: 'A-1-07 villasının yerinde gösterimi', zh: '在现场带看别墅 A-1-07' }, 1, '15:00'],
  [3, 'meeting', { ru: 'Повторный показ с супругой клиента', en: 'Second viewing with the client’s spouse', ky: 'Кардардын жубайы менен кайра көрсөтүү', tr: 'Müşterinin eşiyle ikinci gösterim', zh: '与客户配偶第二次看房' }, 0, '16:30'],
  [3, 'call', { ru: 'Подтвердить время показа', en: 'Confirm the viewing time', ky: 'Көрсөтүү убактысын ырастоо', tr: 'Gösterim saatini teyit edin', zh: '确认看房时间' }, -1, '12:00', true],
  [4, 'task', { ru: 'Подготовить договор бронирования', en: 'Prepare the booking agreement', ky: 'Брондоо келишимин даярдоо', tr: 'Rezervasyon sözleşmesini hazırlayın', zh: '准备预订协议' }, -2, '18:00'],
  [5, 'call', { ru: 'Напомнить о сроке брони', en: 'Remind about the booking deadline', ky: 'Брондоонун мөөнөтүн эскертүү', tr: 'Rezervasyon süresini hatırlatın', zh: '提醒预订截止时间' }, 0, '10:30'],
  [6, 'task', { ru: 'Согласовать график платежей', en: 'Agree the payment schedule', ky: 'Төлөм графигин макулдашуу', tr: 'Ödeme planını kararlaştırın', zh: '商定付款计划' }, 2, '12:00'],
  [6, 'call', { ru: 'Первый звонок клиенту', en: 'First call with the client', ky: 'Кардарга биринчи чалуу', tr: 'Müşteriyle ilk görüşme', zh: '与客户首次通话' }, -5, '11:00', true],
  [7, 'meeting', { ru: 'Подписание договора в офисе продаж', en: 'Contract signing at the sales office', ky: 'Сатуу кеңсесинде келишимге кол коюу', tr: 'Satış ofisinde sözleşme imzası', zh: '在销售办公室签约' }, 3, '11:00'],
  [8, 'task', { ru: 'Проверить документы покупателя', en: 'Check the buyer’s documents', ky: 'Сатып алуучунун документтерин текшерүү', tr: 'Alıcının belgelerini kontrol edin', zh: '核查买方证件' }, -3, '17:00'],
  [12, 'call', { ru: 'Уточнить объёмы по позициям', en: 'Clarify the quantities', ky: 'Позициялар боюнча көлөмдөрдү тактоо', tr: 'Miktarları netleştirin', zh: '确认各项数量' }, 0, '14:00'],
  [13, 'task', { ru: 'Сделать расчёт стоимости', en: 'Prepare the estimate', ky: 'Наркты эсептөө', tr: 'Fiyat hesabını hazırlayın', zh: '编制报价测算' }, 1, '18:00'],
  [14, 'email', { ru: 'Отправить коммерческое предложение', en: 'Send the quote', ky: 'Коммерциялык сунушту жөнөтүү', tr: 'Teklifi gönderin', zh: '发送报价单' }, -1, '09:30', true],
  [14, 'call', { ru: 'Обсудить КП с главным инженером', en: 'Discuss the quote with the chief engineer', ky: 'Коммерциялык сунушту башкы инженер менен талкуулоо', tr: 'Teklifi baş mühendisle görüşün', zh: '与总工程师讨论报价' }, 2, '11:00'],
  [15, 'call', { ru: 'Узнать решение по КП', en: 'Ask for a decision on the quote', ky: 'Коммерциялык сунуш боюнча чечимди билүү', tr: 'Teklif hakkında karar isteyin', zh: '询问报价结果' }, -2, '15:00'],
  [16, 'meeting', { ru: 'Переговоры о скидке за объём', en: 'Volume discount negotiation', ky: 'Көлөм үчүн арзандатуу боюнча сүйлөшүүлөр', tr: 'Hacim indirimi müzakeresi', zh: '批量折扣谈判' }, 0, '12:00'],
  [17, 'task', { ru: 'Подготовить допсоглашение о продлении', en: 'Prepare the renewal amendment', ky: 'Узартуу тууралуу кошумча келишимди даярдоо', tr: 'Yenileme ek protokolünü hazırlayın', zh: '准备续签补充协议' }, 4, '18:00'],
  [18, 'call', { ru: 'Поблагодарить за заказ', en: 'Thank the client for the order', ky: 'Буйрутма үчүн ыраазычылык билдирүү', tr: 'Sipariş için müşteriye teşekkür edin', zh: '感谢客户下单' }, -10, '10:00', true],
];

const COMMENTS = [
  [4, { ru: 'Клиент просит рассрочку на 12 месяцев — уточнить у финансов.', en: 'The client asks for a 12-month instalment plan — check with finance.', ky: 'Кардар 12 айга бөлүп төлөөнү сурап жатат — финансы бөлүмүнөн тактоо.', tr: 'Müşteri 12 aylık taksit istiyor — finansla görüşün.', zh: '客户希望 12 个月分期——需与财务确认。' }],
  [7, { ru: 'Задаток поступил, ждём подписания договора.', en: 'The deposit has arrived; waiting for the contract signing.', ky: 'Кепилдик акча келди; келишимге кол коюуну күтүп жатабыз.', tr: 'Kaparo geldi; sözleşme imzası bekleniyor.', zh: '定金已到账，等待签订合同。' }],
  [16, { ru: 'Готовы взять весь объём при скидке 5%.', en: 'Ready to take the whole volume at a 5% discount.', ky: '5% арзандатуу менен бардык көлөмдү алууга даяр.', tr: '%5 indirimle tüm hacmi almaya hazır.', zh: '若有 5% 折扣，愿意采购全部数量。' }],
];

registerDemo({
  module: 'crm',
  describe: {
    ru: 'Две воронки (продажи недвижимости и оптовые поставки), 20 сделок на всех этапах с клиентами из «Контрагентов», звонки, встречи и задачи — часть просрочена и на сегодня',
    en: 'Two pipelines (property sales and wholesale), 20 deals in every stage with clients from Counterparties, calls, meetings and tasks — some overdue and some due today',
    ky: 'Эки воронка (кыймылсыз мүлк сатуу жана дүң жеткирүүлөр), «Контрагенттер» модулунан кардарлары бар бардык баскычтагы 20 бүтүм, чалуулар, жолугушуулар жана тапшырмалар — айрымдарынын мөөнөтү өткөн, айрымдары бүгүнкү',
    tr: 'İki satış hattı (gayrimenkul satışları ve toptan satış), Cari hesaplar\'daki müşterilerle her aşamada 20 fırsat, aramalar, toplantılar ve görevler — bazıları gecikmiş, bazıları bugün',
    zh: '两条销售漏斗（房产销售和批发供货），各阶段共 20 笔交易，客户来自“往来单位”，含电话、会议和任务——部分已逾期，部分今天到期',
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
          def.source ? stockText(ctx, settings, 'sources', def.source) : null,
          ctx.t({ ru: 'Демо-сделка. Удаляется кнопкой «Удалить демо-данные».', en: 'A demo deal. «Remove demo data» deletes it.', ky: 'Демо бүтүм. «Демо маалыматтарды өчүрүү» баскычы аны өчүрөт.', tr: 'Bir demo fırsat. «Demo verilerini kaldır» onu siler.', zh: '演示交易。“删除演示数据”会将其删除。' }),
          isoDate(ctx.day(def.close)),
          def.lost ? stockText(ctx, settings, 'lostReasons', def.lost) : null,
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
          JSON.stringify({ from: { id: from.id, name: from.name, color: from.color, kind: from.kind }, to: { id: stage.id, name: stage.name, color: stage.color, kind: stage.kind }, ...(def.lost ? { lostReason: stockText(ctx, settings, 'lostReasons', def.lost) } : {}) }),
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
