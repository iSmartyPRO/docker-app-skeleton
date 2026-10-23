import { registerDemo } from '../../services/demo.js';
import { pickerLabel } from '../../platform/pickers.js';
import { cancelRequest, closeRequest, createRequest, logEvent, submitRequest } from './service.js';
import { recordExternalDelivery } from './money.js';
import { APPROVAL_TYPE, procurementSettings } from './access.js';
import { deliveryStateOf, deriveStatus } from './logic.js';
import { decideDemo, dropProcesses, ensureDemoRoute, purgeDemoRoutes, trackProcess } from '../shared/demoApprovals.js';
import { demoMoney, dropEntityChats, dropNotifications, isoDate, removeDemoBlobs, simplePdf, storeDemoBlob } from '../shared/demoAssets.js';

/*
 * Demo data of Procurement (spec §8, docs/procurement.md «Демо-данные»):
 * eleven purchase requests of «ООО «Пример»» in every status — a draft, two
 * in approval (one waits for the head of supply, one for the director, i.e.
 * the administrator's «Ждёт меня»), returned for rework, approved and
 * waiting for payment, partially paid with an overdue pay-by day, paid,
 * delivered, closed, rejected and cancelled — with generated invoice PDFs,
 * payment orders and partial payments, linked to the demo project, supply
 * contract and supplier when those demos are seeded. A two-stage demo route
 * «Руководитель снабжения → Директор» is added only when no route is saved.
 */

const BUYER = { key: 'emp.buyer', name: { ru: 'Татьяна Закупова', en: 'Tatiana Supply', ky: 'Татьяна Закупова' } };
const FOREMAN = { key: 'org.foreman', name: { ru: 'Пётр Прорабов', en: 'Peter Foreman', ky: 'Пётр Прорабов' } };

// flow: draft | head | director | returned | to_pay | partial | paid | delivered | closed | rejected | cancelled
const REQUESTS = [
  { flow: 'draft', category: 'office', author: 'buyer', title: { ru: 'Канцтовары и картриджи на квартал', en: 'Stationery and cartridges for the quarter', ky: 'Чейрекке кеңсе буюмдары жана картридждер', tr: 'Çeyrek için kırtasiye ve kartuşlar', zh: '本季度的文具和墨盒' }, items: [[{ ru: 'Бумага А4, 500 л.', en: 'A4 paper, 500 sheets', ky: 'А4 кагазы, 500 барак', tr: 'A4 kâğıt, 500 yaprak', zh: 'A4 纸，500 张' }, 40, 'уп', 5], [{ ru: 'Картридж для принтера', en: 'Printer cartridge', ky: 'Принтер үчүн картридж', tr: 'Yazıcı kartuşu', zh: '打印机墨盒' }, 6, 'шт', 42]], payBy: 12 },
  { flow: 'head', category: 'materials', author: 'foreman', title: { ru: 'Утеплитель для коттеджей A-1', en: 'Insulation for cottages A-1', ky: 'A-1 коттедждери үчүн жылуулоочу', tr: 'A-1 villaları için yalıtım malzemesi', zh: 'A-1 别墅保温材料' }, items: [[{ ru: 'Минеральная вата 100 мм', en: 'Mineral wool 100 mm', ky: 'Минералдык пахта 100 мм', tr: 'Taş yünü 100 mm', zh: '矿棉 100 mm' }, 120, 'уп', 31]], payBy: 7, project: true, urgency: 'urgent' },
  { flow: 'director', category: 'materials', author: 'foreman', title: { ru: 'Бетон М300 для фундаментов линии A-2', en: 'C25 concrete for line A-2 foundations', ky: 'A-2 линиясынын пайдубалдары үчүн C25 бетону', tr: 'A-2 hattı temelleri için C25 beton', zh: 'A-2 排基础用 C25 混凝土' }, items: [[{ ru: 'Бетон М300, м³', en: 'C25 concrete, m³', ky: 'C25 бетону, м³', tr: 'C25 beton, m³', zh: 'C25 混凝土，m³' }, 64, 'м³', 78], [{ ru: 'Доставка миксером', en: 'Mixer delivery', ky: 'Миксер менен жеткирүү', tr: 'Mikserle teslimat', zh: '搅拌车运送' }, 8, 'рейс', 60]], payBy: 3, project: true, contract: true },
  { flow: 'returned', category: 'equipment', author: 'buyer', title: { ru: 'Генератор 10 кВт для площадки', en: 'A 10 kW generator for the site', ky: 'Курулуш аянтчасы үчүн 10 кВт генератор', tr: 'Şantiye için 10 kW jeneratör', zh: '工地用 10 kW 发电机' }, amount: 4200, payBy: 10, comment: { ru: 'Приложите второй счёт для сравнения цен.', en: 'Attach a second invoice to compare prices.', ky: 'Бааларды салыштыруу үчүн экинчи эсеп-дүмүрчөктү тиркеңиз.', tr: 'Fiyatları karşılaştırmak için ikinci bir fatura ekleyin.', zh: '请附上第二张发票以便比价。' } },
  { flow: 'to_pay', category: 'materials', author: 'buyer', title: { ru: 'Кабель и автоматы для дома 1', en: 'Cable and breakers for building 1', ky: '1-үй үчүн кабель жана автоматтар', tr: '1. Blok için kablo ve sigortalar', zh: '1 号楼用电缆和断路器' }, items: [[{ ru: 'Кабель ВВГнг 3×2,5, бухта', en: 'Cable 3×2.5 mm², coil', ky: 'Кабель 3×2,5 мм², түрмөк', tr: 'Kablo 3×2,5 mm², makara', zh: '电缆 3×2.5 mm²，整卷' }, 10, 'бухта', 92], [{ ru: 'Автоматический выключатель 16 А', en: '16 A circuit breaker', ky: '16 А автоматтык өчүргүч', tr: '16 A otomatik sigorta', zh: '16 A 断路器' }, 60, 'шт', 7]], payBy: 1, project: true, contract: true },
  { flow: 'partial', category: 'materials', author: 'foreman', title: { ru: 'Арматура A500 Ø12 для каркаса', en: 'Rebar A500 Ø12 for the frame', ky: 'Каркас үчүн A500 Ø12 арматурасы', tr: 'Karkas için A500 Ø12 inşaat demiri', zh: '主体结构用 A500 Ø12 钢筋' }, items: [[{ ru: 'Арматура Ø12, т', en: 'Rebar Ø12, t', ky: 'Арматура Ø12, т', tr: 'İnşaat demiri Ø12, t', zh: '钢筋 Ø12，吨' }, 9, 'т', 720]], payBy: -2, paid: 0.5, project: true, terms: 'advance' },
  { flow: 'paid', category: 'it', author: 'buyer', title: { ru: 'Ноутбуки для офиса продаж', en: 'Laptops for the sales office', ky: 'Сатуу кеңсеси үчүн ноутбуктар', tr: 'Satış ofisi için dizüstü bilgisayarlar', zh: '销售办公室用笔记本电脑' }, items: [[{ ru: 'Ноутбук 15"', en: '15" laptop', ky: '15" ноутбук', tr: '15" dizüstü bilgisayar', zh: '15 英寸笔记本电脑' }, 3, 'шт', 850]], payBy: -6, deliverBy: 4 },
  { flow: 'delivered', category: 'materials', author: 'foreman', title: { ru: 'Сухие смеси для штукатурки', en: 'Dry mixes for plastering', ky: 'Шыбак үчүн кургак аралашмалар', tr: 'Sıva için kuru karışımlar', zh: '抹灰用干混砂浆' }, items: [[{ ru: 'Штукатурка гипсовая 30 кг', en: 'Gypsum plaster 30 kg', ky: 'Гипс шыбагы 30 кг', tr: 'Alçı sıva 30 kg', zh: '石膏抹灰 30 kg' }, 200, 'мешок', 8.5]], payBy: -15, deliverBy: -8, contract: true },
  { flow: 'closed', category: 'services', author: 'buyer', title: { ru: 'Вывоз строительного мусора за сентябрь', en: 'Construction waste removal for September', ky: 'Сентябрь үчүн курулуш калдыктарын ташып чыгуу', tr: 'Eylül ayı inşaat atığı nakli', zh: '九月份建筑垃圾清运' }, amount: 1350, payBy: -25, deliverBy: -20 },
  { flow: 'rejected', category: 'transport', author: 'buyer', title: { ru: 'Аренда автокрана на неделю', en: 'Mobile crane hire for a week', ky: 'Бир жумага автокран ижарасы', tr: 'Bir haftalık mobil vinç kiralama', zh: '租用汽车吊一周' }, amount: 6800, payBy: 5, comment: { ru: 'Кран уже есть на объекте по договору подряда.', en: 'A crane is already on site under the works contract.', ky: 'Подряд келишими боюнча объектте кран буга чейин бар.', tr: 'Eser sözleşmesi kapsamında şantiyede zaten bir vinç var.', zh: '根据施工合同，工地上已有一台吊车。' } },
  { flow: 'cancelled', category: 'other', author: 'buyer', title: { ru: 'Сувениры к открытию офиса продаж', en: 'Souvenirs for the sales office opening', ky: 'Сатуу кеңсесинин ачылышына сувенирлер', tr: 'Satış ofisi açılışı için hediyelikler', zh: '销售办公室开业纪念品' }, amount: 600, payBy: 9 },
];

const SUPPLIER = { ru: 'АО «Образец»', en: 'Sample JSC', ky: '«Үлгү» АК', tr: 'Numune A.Ş.', zh: '“样本”股份公司' };

async function attach(ctx, requestId, number, kind, lines, { paymentId = null } = {}) {
  const blob = await storeDemoBlob('procurement', 'pdf', simplePdf(lines));
  const name = `${kind === 'invoice' ? 'invoice' : 'payment-order'}-${number}.pdf`;
  const { rows } = await ctx.query(
    `INSERT INTO proc_documents (request_id, kind, name, ext, size, storage_key, source, payment_id, uploaded_by) VALUES ($1, $2, $3, 'pdf', $4, $5, 'upload', $6, $7) RETURNING id`,
    [requestId, kind, name, blob.size, blob.key, paymentId, ctx.userId]
  );
  await ctx.track('proc_documents', rows[0].id);
}

/** Recomputes paid amount, delivery state and status after demo payments (as money.js does). */
async function recompute(ctx, id) {
  const { rows } = await ctx.query(`SELECT * FROM proc_requests WHERE id = $1`, [id]);
  const row = rows[0];
  const paid = Number((await ctx.query(`SELECT COALESCE(SUM(amount), 0) AS s FROM proc_payments WHERE request_id = $1`, [id])).rows[0].s);
  const deliveries = (await ctx.query(`SELECT partial FROM proc_deliveries WHERE request_id = $1`, [id])).rows;
  const deliveryState = deliveryStateOf(deliveries);
  const status = deriveStatus({ total: row.amount, paid, deliveryState });
  await ctx.query(
    `UPDATE proc_requests SET paid_amount = $2, status = $3::text, paid_at = CASE WHEN $3::text IN ('paid', 'delivered') THEN NOW() ELSE NULL END, updated_at = NOW() WHERE id = $1`,
    [id, paid, status]
  );
  return status;
}

registerDemo({
  module: 'procurement',
  describe: {
    ru: '11 заявок на закупку во всех статусах: на согласовании (одна ждёт директора), к оплате, частичные оплаты с просрочкой, оплачено и доставлено; счета PDF, юрлицо «ООО «Пример»»',
    en: '11 purchase requests in every status: in approval (one waits for the director), to pay, partial payments with an overdue one, paid and delivered; PDF invoices, the «Example LLC» legal entity',
    ky: 'Бардык статустагы 11 сатып алууга өтүнмө: макулдашууда (бирөө директорду күтөт), төлөөгө, мөөнөтү өткөнү менен жарым-жартылай төлөмдөр, төлөндү жана жеткирилди; PDF эсеп-дүмүрчөктөр, «Мисал» ЖЧК юридикалык жагы',
    tr: 'Her durumda 11 satın alma talebi: onayda (biri direktörü bekliyor), ödenecek, biri gecikmiş kısmi ödemeler, ödendi ve teslim edildi; PDF faturalar, «Örnek Ltd. Şti.» tüzel kişisi',
    zh: '11 个各种状态的采购申请：审批中（其中一个等待总监审批）、待付款、含逾期的部分付款、已付款和已交付；PDF 发票，“示例”有限责任公司法人实体',
  },
  after: ['contracts', 'masterplan', 'crm', 'companies', 'org', 'employees'],
  async seed(ctx) {
    const settings = await procurementSettings();
    const currency = (settings.currencies || []).includes(settings.currency) ? settings.currency : (settings.currencies || ['USD'])[0];
    const categories = new Set((settings.categories || []).map((item) => item.key));
    const people = {
      buyer: await ctx.demoUser(BUYER.key, { displayName: ctx.t(BUYER.name) }),
      foreman: await ctx.demoUser(FOREMAN.key, { displayName: ctx.t(FOREMAN.name) }),
    };
    // A real route is in force: the requests stay drafts (real approvers never get demo documents).
    const demoRoute = await ensureDemoRoute(ctx, APPROVAL_TYPE, {
      name: ctx.t({ ru: 'Демо: снабжение → директор', en: 'Demo: supply → director', ky: 'Демо: жабдуу → директор', tr: 'Demo: satın alma → direktör', zh: '演示：采购 → 总监' }),
      stages: [
        { id: 'head', name: ctx.t({ ru: 'Руководитель снабжения', en: 'Head of supply', ky: 'Жабдуу бөлүмүнүн жетекчиси', tr: 'Satın alma müdürü', zh: '采购主管' }), mode: 'any', approvers: [{ kind: 'user', id: people.buyer }], conditions: [] },
        { id: 'director', name: ctx.t({ ru: 'Директор', en: 'Director', ky: 'Директор', tr: 'Direktör', zh: '总监' }), mode: 'any', approvers: [{ kind: 'permission', key: 'procurement.admin' }], conditions: [] },
      ],
    });

    // The paying legal entity: the org structure demo's, else our own.
    let entityId = (await ctx.records('legal_entities', 'org'))[0] || null;
    if (entityId && !(await ctx.query(`SELECT 1 FROM legal_entities WHERE id = $1`, [entityId])).rows.length) entityId = null;
    if (!entityId) {
      const { rows } = await ctx.query(`INSERT INTO legal_entities (name, short_name, note) VALUES ($1, $2, $3) RETURNING id`, [
        ctx.t({ ru: 'Общество с ограниченной ответственностью «Пример»', en: 'Example Limited Liability Company', ky: '«Мисал» жоопкерчилиги чектелген коому', tr: 'Örnek Limited Şirketi', zh: '“示例”有限责任公司' }),
        ctx.t({ ru: 'ООО «Пример»', en: 'Example LLC', ky: '«Мисал» ЖЧК', tr: 'Örnek Ltd. Şti.', zh: '“示例”有限责任公司' }),
        ctx.t({ ru: 'Демо-данные', en: 'Demo data', ky: 'Демо маалыматтар', tr: 'Demo verileri', zh: '演示数据' }),
      ]);
      entityId = rows[0].id;
      await ctx.track('legal_entities', entityId);
    }
    // Links to other demos (validated by the module; dropped when not available).
    // Masterplan and Contracts are other packages: their demo records are read through the core pickers
    // (the «objects» source, the «Связи» provider contracts.contract), never their tables.
    const supplierId = (await ctx.records('cmp_companies', 'companies'))[1] || null;
    const projectId = (await ctx.records('mp_projects', 'masterplan'))[0] || null;
    const projectLabel = projectId ? await pickerLabel(ctx.request, 'projectId', projectId).catch(() => null) : null;
    const project = projectLabel ? { name: projectLabel } : null;
    const contractIds = await ctx.records('ctr_contracts', 'contracts');
    const contractLabel = contractIds[2] ? await pickerLabel(ctx.request, 'contractId', Number(contractIds[2])).catch(() => null) : null;
    const contract = contractLabel ? { id: Number(contractIds[2]), label: contractLabel } : null;

    for (const def of REQUESTS) {
      const items = (def.items || []).map(([name, qty, unit, usd]) => ({ name: ctx.t(name), qty, unit, price: demoMoney(usd, currency) }));
      const input = {
        title: ctx.t(def.title),
        description: ctx.t({ ru: 'Демо-заявка. Удаляется кнопкой «Удалить демо-данные».', en: 'A demo request. «Remove demo data» deletes it.', ky: 'Демо өтүнмө. «Демо маалыматтарды өчүрүү» баскычы аны өчүрөт.', tr: 'Bir demo talep. «Demo verilerini kaldır» onu siler.', zh: '演示申请。“删除演示数据”会将其删除。' }),
        category: categories.has(def.category) ? def.category : undefined,
        currency,
        legalEntityId: entityId,
        paymentTerms: def.terms || 'full',
        advancePercent: def.terms === 'advance' ? 50 : undefined,
        payBy: isoDate(ctx.day(def.payBy)),
        deliverBy: def.deliverBy !== undefined ? isoDate(ctx.day(def.deliverBy)) : isoDate(ctx.day(def.payBy + 5)),
        responsibleId: people.buyer,
        supplierName: ctx.t(SUPPLIER),
        supplierContact: 'sales@sample.example.com, +1 555 0101',
        ...(def.urgency ? { urgency: def.urgency } : {}),
        ...(items.length ? { items, hasItems: true } : { amount: demoMoney(def.amount, currency), hasItems: false }),
      };
      if (supplierId) input.supplierCompanyId = supplierId;
      if (def.project && project) Object.assign(input, { projectId, projectLabel: project.name });
      if (def.contract && contract) Object.assign(input, { contractId: contract.id, contractLabel: contract.label });
      const created = await createRequest(ctx.request, input, { dropLinks: true });
      const id = created.request?.id ?? created.id;
      await ctx.track('proc_requests', id);
      const { rows: base } = await ctx.query(`SELECT number, amount FROM proc_requests WHERE id = $1`, [id]);
      const { number } = base[0];
      const total = Number(base[0].amount);
      await ctx.query(`UPDATE proc_requests SET author_id = $2, created_at = $3 WHERE id = $1`, [id, people[def.author], ctx.day(def.payBy - 14)]);
      await attach(ctx, id, number, 'invoice', [`DEMO INVOICE for ${number}`, `Supplier: Sample JSC (demo)`, `Total: ${total} ${currency}`, `Pay by: ${input.payBy}`]);
      if (def.flow === 'draft') continue;

      if (def.flow === 'cancelled') {
        await cancelRequest(ctx.request, id, { comment: ctx.t({ ru: 'Открытие перенесли', en: 'The opening was postponed', ky: 'Ачылыш жылдырылды', tr: 'Açılış ertelendi', zh: '开业已推迟' }) });
        continue;
      }
      if (!demoRoute) continue;
      await submitRequest(ctx.request, id, {});
      await trackProcess(ctx, APPROVAL_TYPE, id);
      if (def.flow === 'head') continue;
      if (def.flow === 'director') {
        await decideDemo(ctx, APPROVAL_TYPE, id, { stages: 1 });
        continue;
      }
      if (def.flow === 'returned' || def.flow === 'rejected') {
        await decideDemo(ctx, APPROVAL_TYPE, id, { stages: 1, last: def.flow === 'returned' ? 'return' : 'reject', comment: ctx.t(def.comment) });
        continue;
      }
      await decideDemo(ctx, APPROVAL_TYPE, id);
      const { rows: approved } = await ctx.query(`SELECT status FROM proc_requests WHERE id = $1`, [id]);
      if (approved[0]?.status !== 'to_pay') continue; // a saved route the demo could not walk
      if (def.flow === 'to_pay') continue;

      // Money: one partial payment, or the whole amount in two payments.
      const parts = def.flow === 'partial' ? [Math.round(total * def.paid * 100) / 100] : [Math.round(total * 0.4 * 100) / 100, Math.round(total * 0.6 * 100) / 100];
      if (parts.length === 2) parts[1] = Math.round((total - parts[0]) * 100) / 100;
      for (const [index, amount] of parts.entries()) {
        const paidOn = isoDate(ctx.day(def.payBy - (parts.length - index)));
        const { rows } = await ctx.query(
          `INSERT INTO proc_payments (request_id, paid_on, amount, method, reference, note, created_by) VALUES ($1, $2, $3, 'bank', $4, $5, $6) RETURNING id`,
          [id, paidOn, amount, `ПП-${String(id).padStart(4, '0')}-${index + 1}`, ctx.t({ ru: 'Демо-оплата', en: 'Demo payment', ky: 'Демо төлөм', tr: 'Demo ödeme', zh: '演示付款' }), ctx.userId]
        );
        await ctx.track('proc_payments', rows[0].id);
        await attach(ctx, id, `${number}-${index + 1}`, 'payment', [`DEMO PAYMENT ORDER ${number}-${index + 1}`, `Amount: ${amount} ${currency}`, `Date: ${paidOn}`], { paymentId: rows[0].id });
        const status = await recompute(ctx, id);
        await logEvent({ query: ctx.query }, id, ctx.userId, 'payment_added', { amount, currency, paidOn, method: 'bank', status });
      }
      if (['delivered', 'closed'].includes(def.flow)) {
        await recordExternalDelivery({ requestId: id, actorId: people.buyer, partial: false, note: ctx.t({ ru: 'Демо: принято полностью', en: 'Demo: fully received', ky: 'Демо: толук кабыл алынды', tr: 'Demo: tamamı teslim alındı', zh: '演示：已全部收货' }), deliveredOn: isoDate(ctx.day(def.deliverBy)), source: 'demo' });
      }
      if (def.flow === 'closed') await closeRequest(ctx.request, id, { comment: ctx.t({ ru: 'Работы приняты, документы получены', en: 'Work accepted, documents received', ky: 'Иштер кабыл алынды, документтер алынды', tr: 'İş kabul edildi, belgeler alındı', zh: '工程已验收，文件已收到' }) });
    }
  },
  async purge(ctx) {
    const ids = await ctx.records('proc_requests');
    if (ids.length) {
      const { rows } = await ctx.query(`SELECT storage_key FROM proc_documents WHERE request_id = ANY($1::int[])`, [ids]);
      await dropProcesses(ctx, APPROVAL_TYPE, ids);
      await dropEntityChats(ctx.query, 'procurement', ids);
      await dropNotifications(ctx.query, ids.map((id) => `/app/procurement/requests/${id}`));
      // Warehouse receipts made from these requests keep their label, not the id (no foreign key: Warehouse is another package).
      if ((await ctx.query(`SELECT to_regclass('wh_docs') IS NOT NULL AS ok`)).rows[0]?.ok) await ctx.query(`UPDATE wh_docs SET proc_request_id = NULL WHERE proc_request_id = ANY($1::int[])`, [ids]);
      await ctx.query(`DELETE FROM proc_requests WHERE id = ANY($1::int[])`, [ids]);
      await removeDemoBlobs(rows.map((row) => row.storage_key));
    }
    await purgeDemoRoutes(ctx);
  },
});
