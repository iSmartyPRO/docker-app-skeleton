import { registerDemo } from '../../services/demo.js';
import { requestContext, changeStatus, createContract } from './service.js';
import { addPayment, depositStatus, saveDeposit, saveSchedule } from './payments.js';
import { modulesEnabled } from './access.js';
import { TYPE_KEY } from './logic.js';
import { DEMO_CONTRACT_UNITS } from '../masterplan/demo.js';
import { decideDemo, dropProcesses, ensureDemoRoute, purgeDemoRoutes, startDemoApproval } from '../shared/demoApprovals.js';
import { demoMoney, dropEntityChats, dropNotifications, isoDate, removeDemoBlobs, simpleDocx, simplePdf, storeDemoBlob } from '../shared/demoAssets.js';

/*
 * Demo data of Contracts (spec §8, docs/contracts.md «Демо-данные»): eight
 * contracts through the real process — two sales of cottages of the
 * Masterplan demo (deposit received → the unit goes «Задаток», signed → «Договор»,
 * a payment schedule with payments and an overdue instalment), supplier
 * contracts with the lawyer's risks and file versions (generated .docx /
 * .pdf), a lease, one that expires in two weeks, one waiting for the
 * director's approval («Ждёт меня»), a draft and a completed one.
 * A two-stage demo route «Юрист → Директор» is added only when no route is
 * saved for contracts. Purge removes files, processes, chats and rows, and
 * puts the Masterplan units the demo sales took back into «Бронь».
 */

// Payment order prefix of the demo bank references.
const PAYMENT_ORDER = { ru: 'ПП', en: 'PO', ky: 'ТТ', tr: 'ÖT', zh: 'PO' };
const DEMO_LAWYER = { key: 'ctr.lawyer', name: { ru: 'Юлия Юристова', en: 'Julia Lawyer', ky: 'Юлия Юристова' } };
const BUYER = { key: 'emp.buyer', name: { ru: 'Татьяна Закупова', en: 'Tatiana Supply', ky: 'Татьяна Закупова' } };

// flow: draft | approval (waits for the director) | active | expiring | completed
const CONTRACTS = [
  { key: 'sale1', unit: DEMO_CONTRACT_UNITS[0], type: 'property_sale', direction: 'client', flow: 'active', title: { ru: 'Продажа коттеджа {unit} — семья Покупателевых', en: 'Sale of cottage {unit} — the Buyer family', ky: '{unit} коттеджин сатуу — Покупателевдердин үй-бүлөсү', tr: '{unit} villasının satışı — Alıcı ailesi', zh: '别墅 {unit} 销售——“买家”一家' }, counterparty: { ru: 'Покупателев Сергей Иванович', en: 'Sergey Buyer', ky: 'Покупателев Сергей Иванович' }, usd: 158000, start: -45, end: 365, sale: { deposit: 8000, paidRows: 1, months: 6 } },
  { key: 'sale2', unit: DEMO_CONTRACT_UNITS[1], type: 'property_sale', direction: 'client', flow: 'active', title: { ru: 'Продажа коттеджа {unit} — Анна Клиентова', en: 'Sale of cottage {unit} — Anna Client', ky: '{unit} коттеджин сатуу — Анна Клиентова', tr: '{unit} villasının satışı — Anna Client', zh: '别墅 {unit} 销售——Anna Client' }, counterparty: { ru: 'Клиентова Анна Петровна', en: 'Anna Client', ky: 'Клиентова Анна Петровна' }, usd: 164000, start: -75, end: 300, sale: { deposit: 8000, paidRows: 3, months: 8 } },
  { key: 'supply', company: 'sample', type: 'supply', direction: 'supplier', flow: 'active', title: { ru: 'Поставка сухих смесей на 2026 год', en: 'Dry mixes supply for 2026', ky: '2026-жылга кургак аралашмаларды жеткирүү', tr: '2026 yılı kuru karışım tedariki', zh: '2026 年干混料供货' }, counterparty: { ru: 'АО «Образец»', en: 'Sample JSC', ky: '«Үлгү» АК', tr: 'Numune A.Ş.', zh: '“样本”股份公司' }, usd: 48000, start: -60, end: 300, risks: true, versions: 2 },
  { key: 'services', company: 'partner', type: 'services', direction: 'supplier', flow: 'expiring', title: { ru: 'Инженерный надзор на объекте «Северный квартал»', en: 'Engineering supervision at «North Quarter»', ky: '«Түндүк квартал» объектинде инженердик көзөмөл', tr: '«Kuzey Mahallesi»nde mühendislik denetimi', zh: '“北区”工程监理' }, counterparty: { ru: 'ООО «Компания-Партнёр»', en: 'Partner Company LLC', ky: '«Өнөктөш компания» ЖЧК', tr: 'Ortak Şirket Ltd. Şti.', zh: '“合作伙伴”有限责任公司' }, usd: 12000, start: -350, end: 14 },
  { key: 'lease', type: 'lease', direction: 'supplier', flow: 'active', title: { ru: 'Аренда офиса продаж, ул. Центральная, 1', en: 'Lease of the sales office, 1 Central St', ky: 'Сатуу кеңсесинин ижарасы, Борбордук к., 1', tr: 'Satış ofisi kirası, Merkez Sok. No:1', zh: '销售办公室租赁，中央街 1 号' }, counterparty: { ru: 'ООО «Пример-Недвижимость»', en: 'Example Property LLC', ky: '«Мисал-Кыймылсыз мүлк» ЖЧК', tr: 'Örnek Gayrimenkul Ltd. Şti.', zh: '“示例地产”有限责任公司' }, usd: 2400, start: -120, end: 245, autoRenew: true, notice: 30 },
  { key: 'work', company: 'example', type: 'work', direction: 'supplier', flow: 'approval', title: { ru: 'Подряд: благоустройство сектора A', en: 'Works: landscaping of sector A', ky: 'Подряд: A секторун абаттандыруу', tr: 'Eser: A sektörünün çevre düzenlemesi', zh: '施工承包：A 区景观工程' }, counterparty: { ru: 'ООО «Пример»', en: 'Example LLC', ky: '«Мисал» ЖЧК', tr: 'Örnek Ltd. Şti.', zh: '“示例”有限责任公司' }, usd: 36500, start: 20, end: 180, versions: 1 },
  { key: 'nda', company: 'prospect', type: 'nda', direction: 'client', flow: 'draft', title: { ru: 'Соглашение о конфиденциальности', en: 'Non-disclosure agreement', ky: 'Купуялуулук жөнүндө келишим', tr: 'Gizlilik sözleşmesi', zh: '保密协议' }, counterparty: { ru: 'ИП Тестов', en: 'Test Sole Trader', ky: 'Тестов ЖИ', tr: 'Test Şahıs İşletmesi', zh: '测试个体工商户' }, usd: null, start: 0, end: 730 },
  { key: 'done', company: 'sample', type: 'supply', direction: 'supplier', flow: 'completed', title: { ru: 'Поставка арматуры (выполнен)', en: 'Rebar supply (completed)', ky: 'Арматура жеткирүү (аткарылды)', tr: 'İnşaat demiri tedariki (tamamlandı)', zh: '钢筋供货（已履行）' }, counterparty: { ru: 'АО «Образец»', en: 'Sample JSC', ky: '«Үлгү» АК', tr: 'Numune A.Ş.', zh: '“样本”股份公司' }, usd: 9800, start: -200, end: -20 },
];

const RISKS = [
  ['high', 'open', '5.2', { ru: 'Неустойка за просрочку поставки ограничена 1% — ниже нашей стандартной позиции.', en: 'The late-delivery penalty is capped at 1% — below our standard position.', ky: 'Жеткирүүнү кечиктиргени үчүн айып 1% менен чектелген — биздин стандарттык позициядан төмөн.', tr: 'Geç teslim cezası %1 ile sınırlı — standart pozisyonumuzun altında.', zh: '延迟交货违约金上限为 1%——低于我方标准立场。' }],
  ['medium', 'accepted', '7.1', { ru: 'Переход права собственности при отгрузке, а не при приёмке.', en: 'Ownership passes on shipment, not on acceptance.', ky: 'Менчик укугу кабыл алууда эмес, жөнөтүүдө өтөт.', tr: 'Mülkiyet kabulde değil, sevkiyatta geçer.', zh: '所有权在发货时而非验收时转移。' }],
  ['low', 'fixed', '9.4', { ru: 'Не указан порядок обмена документами по ЭДО — добавлено в редакции 2.', en: 'No e-document exchange clause — added in version 2.', ky: 'Электрондук документ алмашуу шарты жок — 2-редакцияда кошулду.', tr: 'E-belge alışverişi maddesi yok — 2. sürümde eklendi.', zh: '缺少电子文件交换条款——已在第 2 版中补充。' }],
];

const COMPANY_KEYS = ['example', 'sample', 'partner', 'prospect'];

async function addFile(ctx, contractId, { no, ext, name, bytes, comment, signed = false }) {
  const blob = await storeDemoBlob('contracts', ext, bytes);
  const mime = ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const { rows } = await ctx.query(
    `INSERT INTO ctr_versions (contract_id, no, name, ext, mime, size, storage_key, comment, signed, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [contractId, no, name, ext, mime, blob.size, blob.key, comment, signed, ctx.userId]
  );
  await ctx.track('ctr_versions', rows[0].id);
  await ctx.query(`UPDATE ctr_contracts SET current_version_id = $2 WHERE id = $1`, [contractId, rows[0].id]);
  await ctx.query(`INSERT INTO ctr_events (contract_id, kind, data, actor_id) VALUES ($1, 'version', $2, $3)`, [contractId, JSON.stringify({ no, name, comment, signed }), ctx.userId]);
  return rows[0].id;
}

registerDemo({
  module: 'contracts',
  describe: {
    ru: '8 договоров: продажи коттеджей «Мастерплана» с задатком, графиком и просроченным платежом, поставка с рисками и версиями, истекающий, на согласовании, черновик и выполненный',
    en: '8 contracts: cottage sales of the Masterplan demo with a deposit, a schedule and an overdue payment, a supply contract with risks and versions, one expiring, one in approval, a draft and a completed one',
    ky: '8 келишим: кепилдик акчасы, графиги жана мөөнөтү өткөн төлөмү бар «Мастерплан» коттедждерин сатуу, тобокелдиктери жана версиялары бар жеткирүү келишими, мөөнөтү бүтүп бараткан, макулдашуудагы, кара жазма жана аткарылган келишимдер',
    tr: '8 sözleşme: kaparo, ödeme planı ve gecikmiş bir ödeme içeren Master plan demosu villa satışları, riskleri ve sürümleri olan bir tedarik sözleşmesi, süresi dolmak üzere olan bir sözleşme, onayda olan biri, bir taslak ve tamamlanmış biri',
    zh: '8 份合同：总体规划演示中的别墅销售合同（含定金、付款计划和一笔逾期付款），带风险和版本的供货合同，一份即将到期、一份审批中、一份草稿和一份已履行的合同',
  },
  after: ['masterplan', 'crm', 'companies', 'org', 'employees'],
  async seed(ctx) {
    const cctx = await requestContext(ctx.request);
    const enabled = await modulesEnabled();
    const currency = cctx.settings.defaultCurrency || 'USD';
    const typeKeys = new Set((cctx.settings.types || []).map((item) => item.key));
    const lawyer = await ctx.demoUser(DEMO_LAWYER.key, { displayName: ctx.t(DEMO_LAWYER.name) });
    const buyer = await ctx.demoUser(BUYER.key, { displayName: ctx.t(BUYER.name) });
    const seller = await ctx.demoUser('emp.sales1', { displayName: ctx.t({ ru: 'Алексей Продажин', en: 'Alexey Seller', ky: 'Алексей Продажин' }) });
    // A real route is in force: the contracts stay drafts (real approvers never get demo documents).
    const demoRoute = await ensureDemoRoute(ctx, TYPE_KEY, {
      name: ctx.t({ ru: 'Демо: юрист → директор', en: 'Demo: lawyer → director', ky: 'Демо: юрист → директор', tr: 'Demo: hukukçu → direktör', zh: '演示：律师 → 总监' }),
      stages: [
        { id: 'lawyer', name: ctx.t({ ru: 'Юрист', en: 'Lawyer', ky: 'Юрист', tr: 'Hukukçu', zh: '律师' }), mode: 'any', approvers: [{ kind: 'user', id: lawyer }], conditions: [] },
        { id: 'director', name: ctx.t({ ru: 'Директор', en: 'Director', ky: 'Директор', tr: 'Direktör', zh: '总监' }), mode: 'any', approvers: [{ kind: 'permission', key: 'contracts.admin' }], conditions: [] },
      ],
    });

    // Links to other demos (when seeded and switched on).
    const companies = enabled.companies ? await ctx.records('cmp_companies', 'companies') : [];
    const { rows: liveCompanies } = await ctx.query(`SELECT id FROM cmp_companies WHERE id = ANY($1::int[])`, [companies]).catch(() => ({ rows: [] }));
    const live = new Set(liveCompanies.map((row) => row.id));
    // The Org demo's «ООО «Пример»» signs, when it is there (else the portal's default legal entity).
    const entityId = (await ctx.records('legal_entities', 'org'))[0] || null;
    const entity = entityId ? (await ctx.query(`SELECT id FROM legal_entities WHERE id = $1`, [entityId])).rows[0] : null;
    const units = {};
    if (enabled.masterplan) {
      const projects = await ctx.records('mp_projects', 'masterplan');
      const { rows } = await ctx.query(`SELECT n.id, n.code, u.price, u.status, TRIM(u.currency) AS currency FROM mp_nodes n JOIN mp_units u ON u.node_id = n.id WHERE n.project_id = ANY($1::int[]) AND n.code = ANY($2::text[])`, [projects, DEMO_CONTRACT_UNITS]);
      for (const row of rows) units[row.code] = row;
    }

    for (const def of CONTRACTS) {
      const unit = def.unit ? units[def.unit] : null;
      const companyId = def.company ? companies[COMPANY_KEYS.indexOf(def.company)] : null;
      // A sale is in the unit's currency (Masterplan may price in another one than Contracts).
      const money = unit?.currency || currency;
      const amount = def.usd === null ? null : unit ? Number(unit.price) : demoMoney(def.usd, money);
      const input = {
        title: ctx.t(def.title).replace('{unit}', def.unit || ''),
        typeKey: typeKeys.has(def.type) ? def.type : '',
        direction: def.direction,
        amount,
        currency: money,
        concludedOn: def.flow === 'draft' || def.flow === 'approval' ? null : isoDate(ctx.day(def.start - 3)),
        startsOn: isoDate(ctx.day(def.start)),
        endsOn: isoDate(ctx.day(def.end)),
        autoRenew: Boolean(def.autoRenew),
        noticeDays: def.notice || null,
        lawyerId: lawyer,
        ownerId: def.direction === 'client' ? seller : buyer,
        paymentTerms: ctx.t(def.sale ? { ru: 'Задаток 5%, остаток по графику платежей.', en: 'A 5% deposit, the rest by the payment schedule.', ky: '5% кепилдик акча, калганы төлөм графиги боюнча.', tr: '%5 kaparo, kalanı ödeme planına göre.', zh: '5% 定金，余款按付款计划支付。' } : { ru: 'Оплата в течение 10 банковских дней после поставки.', en: 'Payment within 10 banking days after delivery.', ky: 'Жеткиргенден кийин 10 банктык күндүн ичинде төлөө.', tr: 'Teslimattan sonra 10 iş günü içinde ödeme.', zh: '交货后 10 个银行工作日内付款。' }),
        description: ctx.t({ ru: 'Демо-договор. Удаляется кнопкой «Удалить демо-данные».', en: 'A demo contract. «Remove demo data» deletes it.', ky: 'Демо келишим. «Демо маалыматтарды өчүрүү» баскычы аны өчүрөт.', tr: 'Bir demo sözleşme. «Demo verilerini kaldır» onu siler.', zh: '演示合同。“删除演示数据”会将其删除。' }),
      };
      if (entity) input.legalEntityId = entity.id;
      if (live.has(companyId)) input.companyId = companyId;
      else input.counterparty = ctx.t(def.counterparty);
      if (unit) input.mpNodeId = unit.id;
      const { contract } = await createContract(cctx, input);
      const id = contract.id;
      await ctx.track('ctr_contracts', id);

      // Files: a Word draft, a reworked version, the signed PDF.
      const versions = def.flow === 'draft' ? 1 : def.versions || 1;
      const title = input.title;
      await addFile(ctx, id, { no: 1, ext: 'docx', name: `${def.key}-v1.docx`, bytes: simpleDocx(title, [ctx.t({ ru: 'Проект договора (демо).', en: 'Draft contract (demo).', ky: 'Келишимдин долбоору (демо).', tr: 'Sözleşme taslağı (demo).', zh: '合同草案（演示）。' }), input.counterparty || ctx.t(def.counterparty)]), comment: ctx.t({ ru: 'Первая редакция', en: 'First draft', ky: 'Биринчи редакция', tr: 'İlk taslak', zh: '初稿' }) });
      if (versions > 1) await addFile(ctx, id, { no: 2, ext: 'docx', name: `${def.key}-v2.docx`, bytes: simpleDocx(title, [ctx.t({ ru: 'Редакция 2 с правками юриста (демо).', en: 'Version 2 with the lawyer’s edits (demo).', ky: 'Юристтин оңдоолору менен 2-редакция (демо).', tr: 'Hukukçunun düzeltmeleriyle 2. sürüm (demo).', zh: '含律师修改意见的第 2 版（演示）。' })]), comment: ctx.t({ ru: 'Учтены замечания юриста', en: 'The lawyer’s notes are in', ky: 'Юристтин сын-пикирлери эске алынды', tr: 'Hukukçunun notları işlendi', zh: '已采纳律师意见' }) });
      if (def.risks) {
        for (const [index, [importance, status, clause, text]] of RISKS.entries()) {
          const { rows } = await ctx.query(
            `INSERT INTO ctr_risks (contract_id, no, text, clause, importance, status, created_by, updated_by, resolved_by, resolved_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9) RETURNING id`,
            [id, index + 1, ctx.t(text), clause, importance, status, lawyer, status === 'open' ? null : lawyer, status === 'open' ? null : ctx.day(-30)]
          );
          await ctx.track('ctr_risks', rows[0].id);
        }
      }
      if (def.flow === 'draft' || !demoRoute) continue;

      await startDemoApproval(ctx, TYPE_KEY, id);
      if (def.flow === 'approval') {
        await decideDemo(ctx, TYPE_KEY, id, { stages: 1 });
        continue;
      }
      await decideDemo(ctx, TYPE_KEY, id);
      // A saved route the demo cannot walk (people who are not here) leaves the contract in approval.
      const { rows: state } = await ctx.query(`SELECT status FROM ctr_contracts WHERE id = $1`, [id]);
      if (state[0]?.status !== 'approved') continue;
      if (def.sale) {
        const deposit = demoMoney(def.sale.deposit, money);
        await saveDeposit(cctx, id, { kind: 'deposit', amount: deposit, dueOn: isoDate(ctx.day(def.start - 5)), terms: ctx.t({ ru: 'Задаток засчитывается в цену объекта.', en: 'The deposit counts toward the price.', ky: 'Кепилдик акча объекттин баасына кошулат.', tr: 'Kaparo fiyattan düşülür.', zh: '定金计入房价。' }) });
        await depositStatus(cctx, id, { status: 'received', receivedOn: isoDate(ctx.day(def.start - 5)), method: 'bank', reference: `${ctx.t(PAYMENT_ORDER)}-${100 + def.sale.months}` });
      }
      // The signed PDF, then «Подписан» (and in force when its start has come).
      const signedVersion = await addFile(ctx, id, { no: versions + 1, ext: 'pdf', name: `${def.key}-signed.pdf`, bytes: simplePdf([`DEMO CONTRACT ${contract.number}`, 'Signed copy (demo data)', `Amount: ${amount ?? '-'} ${money}`]), comment: ctx.t({ ru: 'Подписанный экземпляр', en: 'Signed copy', ky: 'Кол коюлган нуска', tr: 'İmzalı nüsha', zh: '已签署副本' }), signed: true });
      await changeStatus(cctx, id, { to: 'signed', signedVersionId: signedVersion, signedOn: isoDate(ctx.day(def.start - 3)) });
      if (def.sale) {
        const rest = amount - demoMoney(def.sale.deposit, money);
        const first = Math.round(rest * 0.3);
        const monthly = Math.floor((rest - first) / def.sale.months);
        const rows = [{ dueOn: isoDate(ctx.day(def.start)), amount: first, purpose: 'first' }];
        for (let m = 1; m <= def.sale.months; m += 1) rows.push({ dueOn: isoDate(ctx.day(def.start + m * 30)), amount: m === def.sale.months ? rest - first - monthly * (def.sale.months - 1) : monthly, purpose: 'monthly' });
        await saveSchedule(cctx, id, { rows, plan: { mode: 'installments', firstPct: 30, months: def.sale.months, source: 'demo' } });
        // Paid: the first rows; the next one past its date stays overdue.
        for (const row of rows.slice(0, def.sale.paidRows)) await addPayment(cctx, id, { amount: row.amount, paidOn: row.dueOn, method: 'bank', reference: `${ctx.t(PAYMENT_ORDER)}-${row.dueOn.replace(/-/g, '').slice(2)}` });
      }
      // Its end date has passed: the date rules may have completed it already.
      const { rows: now } = await ctx.query(`SELECT status FROM ctr_contracts WHERE id = $1`, [id]);
      if (def.flow === 'completed' && now[0]?.status !== 'completed') await changeStatus(cctx, id, { to: 'completed', comment: ctx.t({ ru: 'Поставка выполнена полностью', en: 'Fully delivered', ky: 'Толук жеткирилди', tr: 'Tamamı teslim edildi', zh: '已全部交货' }) });
    }
  },
  async purge(ctx) {
    const ids = await ctx.records('ctr_contracts');
    if (ids.length) {
      const { rows: files } = await ctx.query(
        `SELECT storage_key AS key FROM ctr_versions WHERE contract_id = ANY($1::int[])
         UNION ALL SELECT file_key FROM ctr_deposits WHERE contract_id = ANY($1::int[]) AND file_key IS NOT NULL
         UNION ALL SELECT file_key FROM ctr_payments WHERE contract_id = ANY($1::int[]) AND file_key IS NOT NULL`,
        [ids]
      );
      // Units of the Masterplan demo the sales took go back on sale.
      const { rows: linked } = await ctx.query(`SELECT mp_node_id FROM ctr_contracts WHERE id = ANY($1::int[]) AND mp_node_id IS NOT NULL`, [ids]);
      const nodes = linked.map((row) => row.mp_node_id);
      for (const nodeId of nodes) {
        // Back to the Masterplan demo's state: the booking the sale converted runs again.
        const { rows: booking } = await ctx.query(`SELECT id FROM mp_bookings WHERE unit_id = $1 AND kind = 'booking' ORDER BY id DESC LIMIT 1`, [nodeId]).catch(() => ({ rows: [] }));
        if (booking[0]) {
          await ctx.query(`UPDATE mp_bookings SET status = 'active', closed_at = NULL, closed_by = NULL, ends_at = GREATEST(ends_at, NOW() + INTERVAL '2 days') WHERE id = $1`, [booking[0].id]);
        }
        await ctx.query(
          `UPDATE mp_units SET status = $2, booking_id = $3, contract_number = NULL, contract_date = NULL, contract_amount = NULL, paid_amount = NULL,
             version = version + 1, status_changed_at = NOW(), updated_at = NOW()
           WHERE node_id = $1`,
          [nodeId, booking[0] ? 'booking' : 'free', booking[0]?.id || null]
        ).catch(() => {});
      }
      await dropProcesses(ctx, TYPE_KEY, ids);
      await dropEntityChats(ctx.query, 'contract', ids);
      await dropNotifications(ctx.query, ids.map((id) => `/app/contracts/${id}`));
      await ctx.query(`UPDATE proc_requests SET contract_id = NULL, contract_label = NULL WHERE contract_id = ANY($1::int[])`, [ids]).catch(() => {});
      await ctx.query(`DELETE FROM ctr_contracts WHERE id = ANY($1::int[])`, [ids]);
      await removeDemoBlobs(files.map((row) => row.key));
    }
    await purgeDemoRoutes(ctx);
  },
});
