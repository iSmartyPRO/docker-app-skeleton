import { withTransaction } from '../../config/database.js';
import { registerDemo } from '../../services/demo.js';
import { objectSource } from '../../platform/registry.js';
import { createBins, createWarehouse } from './warehouses.js';
import { createItem, saveNorms } from './items.js';
import { createDoc, postDoc, requestDoc, shipDoc } from './documents.js';
import { createReserve } from './stock.js';
import { createSession } from './inventory.js';
import { APPROVAL_TYPE, warehouseSettings } from './access.js';
import { ensureDemoRoute, purgeDemoRoutes, trackProcess } from '../shared/demoApprovals.js';
import { demoMoney, dropNotifications, isoDate, removeDemoBlobs } from '../shared/demoAssets.js';

/*
 * Demo data of the Warehouse (spec §8, docs/warehouse.md «Демо-данные»):
 * the central warehouse with addressed bins and the site warehouse of
 * «Северный квартал», 30 items (by quantity, by batch with expiry dates,
 * serial tools), opening balances, a receipt from the supplier, an issue to
 * the foreman, a requisition waiting for the storekeeper, a transfer in
 * transit, a write-off above the threshold waiting for approval, a reserve
 * for the demo apartment building, stock below the minimum and a running
 * inventory count. Everything goes through the module's own documents and
 * posting, so the stock register and the movement journal agree.
 *
 * The movement journal is append-only (a trigger); the purge removes the
 * demo documents' movements inside one transaction with `wh.purge` on —
 * movements of real documents are never touched, and an item or a
 * warehouse real documents use is kept.
 */

const STOREKEEPER = { key: 'emp.store1', name: { ru: 'Андрей Кладовщиков', en: 'Andrey Store', ky: 'Андрей Кладовщиков' } };
const FOREMAN = { key: 'org.foreman', name: { ru: 'Пётр Прорабов', en: 'Peter Foreman', ky: 'Пётр Прорабов' } };

const CATEGORIES = [
  ['materials', null, { ru: 'Демо: материалы', en: 'Demo: materials', ky: 'Демо: материалдар', tr: 'Demo: malzemeler', zh: '演示：材料' }],
  ['dry', 'materials', { ru: 'Сухие смеси', en: 'Dry mixes', ky: 'Кургак аралашмалар', tr: 'Kuru karışımlar', zh: '干混料' }],
  ['electric', 'materials', { ru: 'Электрика', en: 'Electrics', ky: 'Электрика', tr: 'Elektrik', zh: '电气' }],
  ['fasteners', 'materials', { ru: 'Крепёж', en: 'Fasteners', ky: 'Бекиткичтер', tr: 'Bağlantı elemanları', zh: '紧固件' }],
  ['finish', 'materials', { ru: 'Отделка', en: 'Finishing', ky: 'Жасалга', tr: 'İç yapı', zh: '装修' }],
  ['tools', null, { ru: 'Демо: инструмент', en: 'Demo: tools', ky: 'Демо: шаймандар', tr: 'Demo: aletler', zh: '演示：工具' }],
  ['ppe', null, { ru: 'Демо: СИЗ и расходники', en: 'Demo: PPE and consumables', ky: 'Демо: ЖКК жана сарпталуучу материалдар', tr: 'Demo: KKD ve sarf malzemeleri', zh: '演示：劳保用品和耗材' }],
];

// key, sku, name, category, base unit, pack [unit, factor] | null, tracking, price (USD per base unit), expiry
const ITEMS = [
  ['cement', 'DEMO-CEM500', { ru: 'Цемент М500, мешок 50 кг', en: 'Cement 42.5, 50 kg bag', ky: 'Цемент 42.5, 50 кг кап', tr: 'Çimento 42.5, 50 kg torba', zh: '水泥 42.5，50 kg 袋装' }, 'dry', 'мешок', null, 'batch', 7, true],
  ['plaster', 'DEMO-PLS30', { ru: 'Штукатурка гипсовая 30 кг', en: 'Gypsum plaster 30 kg', ky: 'Гипс шыбагы 30 кг', tr: 'Alçı sıva 30 kg', zh: '石膏抹灰 30 kg' }, 'dry', 'мешок', null, 'batch', 8.5, true],
  ['glue', 'DEMO-GLU25', { ru: 'Клей плиточный 25 кг', en: 'Tile adhesive 25 kg', ky: 'Плитка клейи 25 кг', tr: 'Seramik yapıştırıcısı 25 kg', zh: '瓷砖胶 25 kg' }, 'dry', 'мешок', null, 'batch', 6, true],
  ['putty', 'DEMO-PUT20', { ru: 'Шпаклёвка финишная 20 кг', en: 'Finishing putty 20 kg', ky: 'Финиш шпаклевкасы 20 кг', tr: 'Son kat macun 20 kg', zh: '面层腻子 20 kg' }, 'dry', 'мешок', null, 'quantity', 9],
  ['sealant', 'DEMO-SEAL', { ru: 'Герметик силиконовый 280 мл', en: 'Silicone sealant 280 ml', ky: 'Силикон герметиги 280 мл', tr: 'Silikon mastik 280 ml', zh: '硅酮密封胶 280 ml' }, 'finish', 'шт', null, 'batch', 3.2, true],
  ['foam', 'DEMO-FOAM', { ru: 'Пена монтажная 750 мл', en: 'Expanding foam 750 ml', ky: 'Монтаждык көбүк 750 мл', tr: 'Poliüretan köpük 750 ml', zh: '发泡胶 750 ml' }, 'finish', 'шт', null, 'batch', 5.5, true],
  ['cable25', 'DEMO-CAB25', { ru: 'Кабель 3×2,5 мм²', en: 'Cable 3×2.5 mm²', ky: 'Кабель 3×2,5 мм²', tr: 'Kablo 3×2,5 mm²', zh: '电缆 3×2.5 mm²' }, 'electric', 'м', ['бухта', 100], 'quantity', 0.9],
  ['cable15', 'DEMO-CAB15', { ru: 'Кабель 3×1,5 мм²', en: 'Cable 3×1.5 mm²', ky: 'Кабель 3×1,5 мм²', tr: 'Kablo 3×1,5 mm²', zh: '电缆 3×1.5 mm²' }, 'electric', 'м', ['бухта', 100], 'quantity', 0.6],
  ['breaker', 'DEMO-BRK16', { ru: 'Автоматический выключатель 16 А', en: 'Circuit breaker 16 A', ky: 'Автоматтык өчүргүч 16 А', tr: 'Otomatik sigorta 16 A', zh: '断路器 16 A' }, 'electric', 'шт', null, 'quantity', 7],
  ['socket', 'DEMO-SOCK2', { ru: 'Розетка двойная с заземлением', en: 'Double socket, earthed', ky: 'Жерге туташтырылган кош розетка', tr: 'Topraklı ikili priz', zh: '带接地双插座' }, 'electric', 'шт', null, 'quantity', 4.5],
  ['lamp', 'DEMO-LED36', { ru: 'Светильник LED 36 Вт', en: 'LED panel 36 W', ky: 'LED панели 36 Вт', tr: 'LED panel 36 W', zh: 'LED 面板灯 36 W' }, 'electric', 'шт', null, 'quantity', 18],
  ['screw', 'DEMO-SCR75', { ru: 'Саморез по дереву 4,2×75', en: 'Wood screw 4.2×75', ky: 'Жыгачка шуруп 4,2×75', tr: 'Ahşap vidası 4,2×75', zh: '木螺钉 4.2×75' }, 'fasteners', 'шт', ['уп', 200], 'quantity', 0.04],
  ['dowel', 'DEMO-DWL640', { ru: 'Дюбель-гвоздь 6×40', en: 'Nail plug 6×40', ky: 'Мык-дюбель 6×40', tr: 'Çivi dübel 6×40', zh: '钉式膨胀管 6×40' }, 'fasteners', 'шт', ['уп', 100], 'quantity', 0.05],
  ['anchor', 'DEMO-ANC10', { ru: 'Анкерный болт 10×100', en: 'Anchor bolt 10×100', ky: 'Анкер болту 10×100', tr: 'Ankraj cıvatası 10×100', zh: '锚栓 10×100' }, 'fasteners', 'шт', null, 'quantity', 0.6],
  ['paint', 'DEMO-PNT10', { ru: 'Краска фасадная белая 10 л', en: 'White facade paint 10 l', ky: 'Ак фасад боегу 10 л', tr: 'Beyaz dış cephe boyası 10 l', zh: '白色外墙涂料 10 l' }, 'finish', 'шт', null, 'batch', 32, true],
  ['primer', 'DEMO-PRM10', { ru: 'Грунтовка глубокого проникновения 10 л', en: 'Deep primer 10 l', ky: 'Терең сиңүүчү грунтовка 10 л', tr: 'Derin nüfuzlu astar 10 l', zh: '深层渗透底漆 10 l' }, 'finish', 'шт', null, 'quantity', 12],
  ['tile', 'DEMO-TIL3060', { ru: 'Плитка керамическая 30×60', en: 'Ceramic tile 30×60', ky: 'Керамикалык плитка 30×60', tr: 'Seramik karo 30×60', zh: '瓷砖 30×60' }, 'finish', 'м²', null, 'quantity', 11],
  ['laminate', 'DEMO-LAM33', { ru: 'Ламинат 33 класс', en: 'Laminate, class 33', ky: 'Ламинат, 33-класс', tr: 'Laminat parke, 33. sınıf', zh: '强化地板，33 级' }, 'finish', 'м²', null, 'quantity', 14],
  ['drill', 'DEMO-RH26', { ru: 'Перфоратор SDS-plus 800 Вт', en: 'SDS-plus rotary hammer 800 W', ky: 'SDS-plus перфоратору 800 Вт', tr: 'SDS-plus kırıcı-delici 800 W', zh: 'SDS-plus 电锤 800 W' }, 'tools', 'шт', null, 'serial', 180],
  ['driver', 'DEMO-CD18', { ru: 'Шуруповёрт аккумуляторный 18 В', en: 'Cordless drill 18 V', ky: 'Аккумулятордук бурагыч 18 В', tr: 'Akülü vidalama 18 V', zh: '充电式电钻 18 V' }, 'tools', 'шт', null, 'serial', 120],
  ['grinder', 'DEMO-AG125', { ru: 'Угловая шлифмашина 125 мм', en: 'Angle grinder 125 mm', ky: 'Бурчтук жылмалагыч 125 мм', tr: 'Avuç taşlama 125 mm', zh: '角磨机 125 mm' }, 'tools', 'шт', null, 'serial', 75],
  ['laser', 'DEMO-LL360', { ru: 'Лазерный уровень 360°', en: '360° laser level', ky: '360° лазердик деңгээл', tr: '360° lazer nivo', zh: '360° 激光水平仪' }, 'tools', 'шт', null, 'serial', 160],
  ['generator', 'DEMO-GEN5', { ru: 'Генератор бензиновый 5 кВт', en: 'Petrol generator 5 kW', ky: 'Бензин генератору 5 кВт', tr: 'Benzinli jeneratör 5 kW', zh: '汽油发电机 5 kW' }, 'tools', 'шт', null, 'serial', 650],
  ['gloves', 'DEMO-GLV', { ru: 'Перчатки рабочие', en: 'Work gloves', ky: 'Жумушчу мээлей', tr: 'İş eldiveni', zh: '劳保手套' }, 'ppe', 'пар', null, 'quantity', 1.2],
  ['helmet', 'DEMO-HLM', { ru: 'Каска строительная', en: 'Safety helmet', ky: 'Курулуш каскасы', tr: 'Baret', zh: '安全帽' }, 'ppe', 'шт', null, 'quantity', 6],
  ['vest', 'DEMO-VST', { ru: 'Жилет сигнальный', en: 'High-visibility vest', ky: 'Сигналдык жилет', tr: 'Reflektörlü yelek', zh: '反光背心' }, 'ppe', 'шт', null, 'quantity', 3],
  ['disc', 'DEMO-DSC125', { ru: 'Круг отрезной по металлу 125 мм', en: 'Metal cutting disc 125 mm', ky: 'Металл кесүүчү диск 125 мм', tr: 'Metal kesme diski 125 mm', zh: '金属切割片 125 mm' }, 'ppe', 'шт', null, 'quantity', 0.8],
  ['bits', 'DEMO-BIT2', { ru: 'Бита PH2, набор 10 шт.', en: 'PH2 bits, set of 10', ky: 'PH2 биталары, 10 даана топтом', tr: 'PH2 uç, 10\'lu set', zh: 'PH2 批头，10 件套' }, 'ppe', 'уп', null, 'quantity', 3],
  ['tape', 'DEMO-TAPE', { ru: 'Лента малярная 50 мм', en: 'Masking tape 50 mm', ky: 'Малярдык тасма 50 мм', tr: 'Maskeleme bandı 50 mm', zh: '美纹纸胶带 50 mm' }, 'ppe', 'шт', null, 'quantity', 1.5],
  ['bags', 'DEMO-BAG120', { ru: 'Мешки для строительного мусора', en: 'Construction waste bags', ky: 'Курулуш таштандылары үчүн каптар', tr: 'İnşaat atığı torbaları', zh: '建筑垃圾袋' }, 'ppe', 'шт', null, 'quantity', 0.4],
];

// Opening balances of the central warehouse: [item, qty (base units), bin, batch, expires in days]
const OPENING_MAIN = [
  ['cement', 120, 'A-01', 'P-0925', 40], ['plaster', 80, 'A-01', 'G-0812', 150], ['glue', 6, 'A-02', 'K-0701', 25], ['putty', 40, 'A-02'],
  ['sealant', 60, 'B-01', 'S-1102', 300], ['foam', 8, 'B-01', 'F-0930', 9], ['cable25', 800, 'B-01'], ['cable15', 500, 'B-01'], ['breaker', 140, 'B-02'],
  ['socket', 90, 'B-02'], ['lamp', 24, 'B-02'], ['screw', 6000, 'A-02'], ['dowel', 4000, 'A-02'], ['anchor', 300, 'A-02'], ['paint', 30, 'A-01', 'W-0815', 420],
  ['primer', 20, 'A-01'], ['tile', 160, 'A-02'], ['laminate', 210, 'A-02'], ['gloves', 30, 'B-02'], ['helmet', 25, 'B-02'], ['vest', 30, 'B-02'], ['disc', 400, 'B-02'], ['bits', 20, 'B-02'], ['tape', 60, 'B-02'], ['bags', 500, 'B-02'],
];
// Minimum stock: [item, min, reorder] — glue, foam and gloves fall below it.
const NORMS = [['cement', 60, 200], ['glue', 20, 60], ['foam', 24, 60], ['gloves', 50, 200], ['breaker', 40, 120], ['cable25', 300, 1000]];
const SERIALS = [
  ['drill', [['DEMO-INV-001', 'RH26-10441'], ['DEMO-INV-002', 'RH26-10442']]],
  ['driver', [['DEMO-INV-003', 'CD18-55101'], ['DEMO-INV-004', 'CD18-55102'], ['DEMO-INV-005', 'CD18-55103']]],
  ['grinder', [['DEMO-INV-006', 'AG125-7781']]],
  ['laser', [['DEMO-INV-007', 'LL360-0042']]],
  ['generator', [['DEMO-INV-008', 'GEN5-31907']]],
];

async function freeCode(ctx, code) {
  const { rows } = await ctx.query(`SELECT 1 FROM wh_warehouses WHERE LOWER(code) = LOWER($1)`, [code]);
  return rows.length ? null : code;
}

registerDemo({
  module: 'warehouse',
  describe: {
    ru: 'Центральный склад с ячейками и склад объекта, 30 позиций (количество, партии, инструмент с серийными номерами), приход, выдача, перемещение в пути, списание на согласовании, остатки ниже минимума и инвентаризация',
    en: 'A central warehouse with bins and a site warehouse, 30 items (quantity, batches, serial tools), a receipt, an issue, a transfer in transit, a write-off in approval, stock below minimum and an inventory count',
    ky: 'Уячалары бар борбордук кампа жана объекттин кампасы, 30 позиция (саны, партиялар, сериялык номерлүү шаймандар), кирим, берүү, жолдогу которуу, макулдашуудагы эсептен чыгаруу, минимумдан төмөн калдыктар жана инвентаризация',
    tr: 'Lokasyonlu bir merkez depo ve bir şantiye deposu, 30 stok kartı (miktar, partiler, seri numaralı aletler), bir giriş, bir çıkış, yoldaki bir transfer, onaydaki bir hurdaya ayırma, asgari seviyenin altında stok ve bir sayım',
    zh: '带库位的中心仓库和一个工地仓库，30 个物料（按数量、批次、带序列号的工具），一张入库单、一张出库单、一笔在途调拨、一张审批中的报废单、低于最低库存的物料和一次盘点',
  },
  after: ['procurement', 'masterplan', 'companies', 'org', 'employees'],
  async seed(ctx) {
    const settings = await warehouseSettings();
    const currency = settings.currency || 'USD';
    const price = (usd) => Math.max(0.01, Math.round(demoMoney(usd * 100, currency)) / 100);
    const keeper = await ctx.demoUser(STOREKEEPER.key, { displayName: ctx.t(STOREKEEPER.name) });
    const foreman = await ctx.demoUser(FOREMAN.key, { displayName: ctx.t(FOREMAN.name) });
    const req = ctx.request;
    // Masterplan is another package: its demo project and building come through the core «objects» source.
    const projectId = Number((await ctx.records('mp_projects', 'masterplan'))[0]) || null;
    const objects = projectId ? await objectSource() : null;
    const projectName = objects ? await objects.projectLabel(req, projectId).catch(() => null) : null;
    const project = projectName ? { id: projectId, name: projectName } : null;
    const supplierId = (await ctx.records('cmp_companies', 'companies'))[1] || null;
    const supplierName = ctx.t({ ru: 'АО «Образец»', en: 'Sample JSC', ky: '«Үлгү» АК', tr: 'Numune A.Ş.', zh: '“样本”股份公司' });

    // ── Warehouses and bins ────────────────────────────────────────────────
    const main = await createWarehouse(req, { name: ctx.t({ ru: 'Демо: центральный склад', en: 'Demo: central warehouse', ky: 'Демо: борбордук кампа', tr: 'Demo: merkez depo', zh: '演示：中心仓库' }), code: await freeCode(ctx, 'DEMO-C'), kind: 'main', molId: keeper, address: ctx.t({ ru: 'г. Пример, ул. Складская, 7', en: '7 Store St, Example City', ky: 'Мисал ш., Кампа к., 7', tr: 'Depo Sok. No:7, Örnek Şehir', zh: '示例市仓库街 7 号' }), binsEnabled: true, note: ctx.t({ ru: 'Демо-данные', en: 'Demo data', ky: 'Демо маалыматтар', tr: 'Demo verileri', zh: '演示数据' }) });
    const mainId = main.warehouse?.id ?? main.id;
    await ctx.track('wh_warehouses', mainId);
    const site = await createWarehouse(req, { name: ctx.t({ ru: 'Демо: склад объекта «Северный квартал»', en: 'Demo: «North Quarter» site store', ky: 'Демо: «Түндүк квартал» объектинин кампасы', tr: 'Demo: «Kuzey Mahallesi» şantiye deposu', zh: '演示：“北区”工地仓库' }), code: await freeCode(ctx, 'DEMO-S'), kind: 'site', molId: foreman, address: ctx.t({ ru: 'г. Северный, ул. Строителей, 5', en: '5 Builders St, North Town', ky: 'Түндүк ш., Курулушчулар к., 5', tr: 'İnşaatçılar Sok. No:5, Kuzey Kent', zh: '北城建设者街 5 号' }), ...(project ? { projectId: project.id, projectLabel: project.name } : {}) });
    const siteId = site.warehouse?.id ?? site.id;
    await ctx.track('wh_warehouses', siteId);
    await createBins(req, mainId, { kind: 'zone', codes: ['A', 'B'] });
    const zones = Object.fromEntries((await ctx.query(`SELECT id, code FROM wh_bins WHERE warehouse_id = $1 AND parent_id IS NULL`, [mainId])).rows.map((row) => [row.code, row.id]));
    await createBins(req, mainId, { kind: 'rack', parentId: zones.A, codes: ['A-01', 'A-02'] });
    await createBins(req, mainId, { kind: 'rack', parentId: zones.B, codes: ['B-01', 'B-02'] });
    const { rows: binRows } = await ctx.query(`SELECT id, code FROM wh_bins WHERE warehouse_id = $1 ORDER BY id`, [mainId]);
    for (const row of binRows) await ctx.track('wh_bins', row.id);
    const bins = Object.fromEntries(binRows.map((row) => [row.code, row.id]));

    // ── Categories and items ───────────────────────────────────────────────
    const cats = {};
    for (const [key, parent, name] of CATEGORIES) {
      const { rows } = await ctx.query(`INSERT INTO wh_categories (name, parent_id, attrs, sort) VALUES ($1, $2, '[]'::jsonb, $3) RETURNING id`, [ctx.t(name), parent ? cats[parent] : null, Object.keys(cats).length]);
      cats[key] = rows[0].id;
      await ctx.track('wh_categories', rows[0].id);
    }
    const items = {};
    for (const [index, [key, sku, name, cat, unit, pack, tracking, usd, expiry]] of ITEMS.entries()) {
      const { rows: taken } = await ctx.query(`SELECT 1 FROM wh_items WHERE LOWER(sku) = LOWER($1)`, [sku]);
      const created = await createItem(req, {
        name: ctx.t(name),
        sku: taken.length ? null : sku,
        categoryId: cats[cat],
        baseUnit: unit,
        units: pack ? [{ code: pack[0], factor: pack[1] }] : [],
        receiptUnit: pack ? pack[0] : undefined,
        tracking,
        trackExpiry: Boolean(expiry),
        serviceIntervalDays: tracking === 'serial' ? 180 : undefined,
        supplierName,
        ...(supplierId ? { supplierCompanyId: supplierId } : {}),
        description: ctx.t({ ru: 'Демо-позиция.', en: 'A demo item.', ky: 'Демо позиция.', tr: 'Bir demo stok kartı.', zh: '演示物料。' }),
        barcodes: [{ code: `2990000${String(index + 1).padStart(5, '0')}`, ...(pack ? { unit: pack[0] } : {}) }],
      });
      const item = created.item || created;
      items[key] = { id: item.id, usd, tracking, unit };
      await ctx.track('wh_items', item.id);
    }
    for (const [key, min, reorder] of NORMS) await saveNorms(req, items[key].id, [{ warehouseId: mainId, minQty: min, reorderQty: reorder }]);

    const docs = [];
    const doc = async (input, then) => {
      const created = await createDoc(req, input);
      const id = created.document?.id ?? created.id;
      docs.push(id);
      await ctx.track('wh_docs', id);
      if (then) await then(id);
      return id;
    };

    // ── Opening balances: the central warehouse (bins, batches, serial tools) and the site ─
    await doc(
      {
        type: 'opening',
        toWarehouseId: mainId,
        date: ctx.day(-40, '09:00').toISOString(),
        comment: ctx.t({ ru: 'Демо: начальные остатки', en: 'Demo: opening balances', ky: 'Демо: баштапкы калдыктар', tr: 'Demo: açılış stokları', zh: '演示：期初库存' }),
        lines: [
          ...OPENING_MAIN.map(([key, qty, bin, batch, expires]) => ({
            itemId: items[key].id,
            qty,
            unit: items[key].unit,
            price: price(items[key].usd),
            toBinId: bins[bin],
            ...(batch ? { batchNumber: batch, expiresOn: expires ? isoDate(ctx.day(expires)) : null } : {}),
          })),
          ...SERIALS.map(([key, list]) => ({ itemId: items[key].id, qty: list.length, price: price(items[key].usd), toBinId: bins['B-02'], serials: list.map(([inventoryNo, serialNo]) => ({ inventoryNo, serialNo })) })),
        ],
      },
      (id) => postDoc(req, id)
    );
    await doc(
      {
        type: 'opening',
        toWarehouseId: siteId,
        date: ctx.day(-35, '09:00').toISOString(),
        comment: ctx.t({ ru: 'Демо: остатки на объекте', en: 'Demo: site balances', ky: 'Демо: объекттеги калдыктар', tr: 'Demo: şantiye stokları', zh: '演示：工地库存' }),
        lines: [['cement', 40, 'P-0901', 30], ['putty', 12], ['screw', 2000], ['gloves', 20], ['helmet', 10], ['breaker', 30], ['cable25', 200]].map(([key, qty, batch, expires]) => ({
          itemId: items[key].id,
          qty,
          unit: items[key].unit,
          price: price(items[key].usd),
          ...(batch ? { batchNumber: batch, expiresOn: isoDate(ctx.day(expires)) } : {}),
        })),
      },
      (id) => postDoc(req, id)
    );
    // Service of one tool is due in five days.
    await ctx.query(`UPDATE wh_instances SET next_service_on = $2, warranty_until = $3, purchased_on = $4 WHERE LOWER(inventory_no) = LOWER($1)`, ['DEMO-INV-002', isoDate(ctx.day(5)), isoDate(ctx.day(300)), isoDate(ctx.day(-200))]);
    const { rows: instances } = await ctx.query(`SELECT id, inventory_no FROM wh_instances WHERE item_id = ANY($1::int[]) ORDER BY id`, [Object.values(items).map((item) => item.id)]);
    for (const row of instances) await ctx.track('wh_instances', row.id);
    const instanceOf = (no) => instances.find((row) => row.inventory_no.toLowerCase() === no.toLowerCase())?.id;

    // ── A receipt from the supplier ────────────────────────────────────────
    await doc(
      {
        type: 'receipt',
        toWarehouseId: mainId,
        date: ctx.day(-6, '11:00').toISOString(),
        supplierName,
        ...(supplierId ? { supplierCompanyId: supplierId } : {}),
        currency,
        comment: ctx.t({ ru: 'Демо: поставка по счёту № 118', en: 'Demo: delivery on invoice 118', ky: 'Демо: № 118 эсеп-дүмүрчөк боюнча жеткирүү', tr: 'Demo: 118 numaralı fatura ile teslimat', zh: '演示：按 118 号发票到货' }),
        lines: [
          { itemId: items.cement.id, qty: 60, price: price(7.2), toBinId: bins['A-01'], batchNumber: 'P-1006', expiresOn: isoDate(ctx.day(85)) },
          { itemId: items.screw.id, qty: 10, unit: 'уп', price: price(8), toBinId: bins['A-02'] },
          { itemId: items.lamp.id, qty: 12, price: price(18), toBinId: bins['B-02'] },
        ],
      },
      (id) => postDoc(req, id)
    );
    // ── Issued to the foreman: a rotary hammer, a drill and consumables ─────
    await doc(
      {
        type: 'issue',
        warehouseId: mainId,
        toHolderType: 'employee',
        toHolderId: foreman,
        returnBy: isoDate(ctx.day(25)),
        date: ctx.day(-3, '08:30').toISOString(),
        comment: ctx.t({ ru: 'Демо: на работы по линии A-1', en: 'Demo: for line A-1 works', ky: 'Демо: A-1 линиясындагы иштер үчүн', tr: 'Demo: A-1 hattı işleri için', zh: '演示：用于 A-1 排施工' }),
        lines: [
          { itemId: items.drill.id, instanceId: instanceOf('DEMO-INV-001'), qty: 1, binId: bins['B-02'] },
          { itemId: items.driver.id, instanceId: instanceOf('DEMO-INV-003'), qty: 1, binId: bins['B-02'] },
          { itemId: items.disc.id, qty: 50, binId: bins['B-02'] },
          { itemId: items.gloves.id, qty: 12, binId: bins['B-02'] },
        ],
      },
      (id) => postDoc(req, id)
    );
    // ── A requisition waiting for the storekeeper ──────────────────────────
    await doc(
      {
        type: 'issue',
        warehouseId: mainId,
        toHolderType: 'employee',
        toHolderId: foreman,
        comment: ctx.t({ ru: 'Демо: заявка прораба на завтра', en: 'Demo: the foreman’s request for tomorrow', ky: 'Демо: прорабдын эртеңки талабы', tr: 'Demo: şantiye şefinin yarın için talebi', zh: '演示：工长明天的领料申请' }),
        lines: [
          { itemId: items.foam.id, qty: 6 },
          { itemId: items.sealant.id, qty: 10 },
          { itemId: items.tape.id, qty: 8 },
        ],
      },
      (id) => requestDoc(req, id)
    );
    // ── A transfer to the site, in transit ─────────────────────────────────
    await doc(
      {
        type: 'transfer',
        warehouseId: mainId,
        toWarehouseId: siteId,
        comment: ctx.t({ ru: 'Демо: электрика для дома 1', en: 'Demo: electrics for building 1', ky: 'Демо: 1-үй үчүн электрика', tr: 'Demo: 1. Blok için elektrik malzemesi', zh: '演示：1 号楼电气材料' }),
        lines: [
          { itemId: items.cable25.id, qty: 300, unit: 'м', binId: bins['B-01'] },
          { itemId: items.breaker.id, qty: 40, binId: bins['B-02'] },
          { itemId: items.socket.id, qty: 30, binId: bins['B-02'] },
        ],
      },
      (id) => shipDoc(req, id)
    );
    // ── A write-off above the threshold: goes to approval (the administrator's «Ждёт меня»).
    // Only through a demo route: with a real route in force the write-off stays a draft,
    // so real approvers never get a made-up document (review R1).
    const demoRoute = await ensureDemoRoute(ctx, APPROVAL_TYPE, {
      name: ctx.t({ ru: 'Демо: списание → администратор склада', en: 'Demo: write-off → warehouse administrator', ky: 'Демо: эсептен чыгаруу → кампанын администратору', tr: 'Demo: hurdaya ayırma → depo yöneticisi', zh: '演示：报废 → 仓库管理员' }),
      stages: [{ id: 'admin', name: ctx.t({ ru: 'Администратор склада', en: 'Warehouse administrator', ky: 'Кампанын администратору', tr: 'Depo yöneticisi', zh: '仓库管理员' }), mode: 'any', approvers: [{ kind: 'permission', key: 'warehouse.admin' }], conditions: [] }],
    });
    const writeoff = await doc(
      {
        type: 'writeoff',
        warehouseId: mainId,
        reason: 'damage',
        reasonText: ctx.t({ ru: 'Демо: повреждено при разгрузке, акт № 7', en: 'Demo: damaged while unloading, report 7', ky: 'Демо: түшүрүүдө бузулду, № 7 акт', tr: 'Demo: boşaltma sırasında hasar gördü, 7 numaralı tutanak', zh: '演示：卸货时损坏，第 7 号单据' }),
        lines: [{ itemId: items.laminate.id, qty: 45, binId: bins['A-02'] }],
      },
      demoRoute ? (id) => postDoc(req, id) : null
    );
    if (demoRoute) await trackProcess(ctx, APPROVAL_TYPE, writeoff);
    // ── A reserve for the demo apartment building (or a general one) ───────
    const building = project ? (await objects.objects(req, { project: projectId, q: 'D1' }).catch(() => [])).filter((node) => /^D1( · |$)/.test(node.label)).map((node) => ({ id: node.id, name: node.label.replace(/^D1 · /, '') })) : [];
    const reserve = await createReserve(req, {
      itemId: items.lamp.id,
      warehouseId: mainId,
      qty: 16,
      targetType: building[0] ? 'object' : 'other',
      targetId: building[0]?.id || null,
      targetLabel: building[0]?.name || ctx.t({ ru: 'Демо: офис продаж', en: 'Demo: sales office', ky: 'Демо: сатуу кеңсеси', tr: 'Demo: satış ofisi', zh: '演示：销售办公室' }),
      expiresOn: isoDate(ctx.day(20)),
      note: ctx.t({ ru: 'Демо: светильники для подъездов', en: 'Demo: lights for the entrances', ky: 'Демо: подъезддер үчүн шамчырактар', tr: 'Demo: giriş holleri için aydınlatma', zh: '演示：楼道照明灯具' }),
    });
    const reserveId = reserve.reserve?.id ?? reserve.id ?? (await ctx.query(`SELECT id FROM wh_reserves WHERE item_id = $1 ORDER BY id DESC LIMIT 1`, [items.lamp.id])).rows[0]?.id;
    if (reserveId) await ctx.track('wh_reserves', reserveId);

    // ── An inventory count at the site, half done ──────────────────────────
    const session = await createSession(req, { warehouseId: siteId, title: ctx.t({ ru: 'Демо: инвентаризация объекта', en: 'Demo: site inventory', ky: 'Демо: объекттин инвентаризациясы', tr: 'Demo: şantiye sayımı', zh: '演示：工地盘点' }), freezePolicy: 'record', counters: [foreman, keeper], comment: ctx.t({ ru: 'Пересчитать до конца недели', en: 'Count by the end of the week', ky: 'Жуманын аягына чейин кайра эсептөө', tr: 'Hafta sonuna kadar sayın', zh: '本周末前完成盘点' }) });
    const sessionId = session.session?.id ?? session.id;
    await ctx.track('wh_inv_sessions', sessionId);
    for (const [key, qty] of [['cement', 38], ['putty', 12], ['helmet', 9]]) {
      await ctx.query(`INSERT INTO wh_inv_counts (session_id, counter_id, bin_id, item_id, qty) VALUES ($1, $2, NULL, $3, $4)`, [sessionId, foreman, items[key].id, qty]);
    }
    // The storekeeper of the central warehouse has his rights there.
    await ctx.query(`INSERT INTO wh_assignments (warehouse_id, subject_type, subject_id, rights, created_by) VALUES ($1, 'user', $2, $3, $4) ON CONFLICT DO NOTHING`, [mainId, keeper, ['operate', 'inventory', 'writeoff'], ctx.userId]).catch(() => {});
  },
  async purge(ctx) {
    const docs = await ctx.records('wh_docs');
    const warehouses = await ctx.records('wh_warehouses');
    const sessions = await ctx.records('wh_inv_sessions');
    const reserves = await ctx.records('wh_reserves');
    const items = await ctx.records('wh_items');
    const files = [];
    await withTransaction(async (client) => {
      // The journal is append-only: only this transaction may take the demo movements back.
      await client.query(`SET LOCAL wh.purge = 'on'`);
      // Documents the demo made, plus the ones the system made from them (inventory acts, storno).
      const { rows: derived } = await client.query(`SELECT id FROM wh_docs WHERE base_doc_id = ANY($1::int[]) OR id IN (SELECT doc_id FROM wh_inv_sessions WHERE id = ANY($2::int[]) AND doc_id IS NOT NULL)`, [docs, sessions]);
      const all = [...new Set([...docs, ...derived.map((row) => row.id)])];
      const { rows: blobRows } = await client.query(`SELECT storage_key FROM wh_files WHERE owner_type = 'doc' AND owner_id = ANY($1::int[])`, [all]);
      files.push(...blobRows.map((row) => row.storage_key));
      await client.query(`DELETE FROM approval_processes WHERE type = $1 AND doc_id = ANY($2::text[])`, [APPROVAL_TYPE, all.map(String)]);
      await client.query(`DELETE FROM wh_inv_sessions WHERE id = ANY($1::int[])`, [sessions]);
      await client.query(`DELETE FROM wh_moves WHERE doc_id = ANY($1::int[])`, [all]);
      await client.query(`DELETE FROM wh_files WHERE owner_type = 'doc' AND owner_id = ANY($1::int[])`, [all]);
      await client.query(`DELETE FROM wh_events WHERE entity_type = 'doc' AND entity_id = ANY($1::int[])`, [all]);
      await client.query(`DELETE FROM wh_reserves WHERE id = ANY($1::int[])`, [reserves]);
      await client.query(`DELETE FROM wh_docs WHERE id = ANY($1::int[])`, [all]);
      // Stock of demo items in demo warehouses has no movements left; costs and norms with it.
      const { rows: realMoves } = await client.query(`SELECT DISTINCT item_id FROM wh_moves WHERE item_id = ANY($1::int[])`, [items]);
      const busy = new Set(realMoves.map((row) => row.item_id));
      const free = items.filter((id) => !busy.has(id));
      await client.query(`DELETE FROM wh_stock WHERE item_id = ANY($1::int[]) OR (warehouse_id = ANY($2::int[]) AND NOT EXISTS (SELECT 1 FROM wh_moves m WHERE m.warehouse_id = wh_stock.warehouse_id))`, [free, warehouses]);
      await client.query(`DELETE FROM wh_events WHERE entity_type = 'item' AND entity_id = ANY($1::int[])`, [free]);
      const { rows: itemFiles } = await client.query(`SELECT storage_key FROM wh_files WHERE owner_type IN ('item', 'instance') AND owner_id = ANY($1::int[])`, [free]);
      files.push(...itemFiles.map((row) => row.storage_key));
      await client.query(`DELETE FROM wh_files WHERE owner_type = 'item' AND owner_id = ANY($1::int[])`, [free]);
      // A warehouse real documents still use stays (and stays tracked).
      const { rows: used } = await client.query(`SELECT DISTINCT unnest(ARRAY[warehouse_id, to_warehouse_id]) AS id FROM wh_docs WHERE warehouse_id = ANY($1::int[]) OR to_warehouse_id = ANY($1::int[])`, [warehouses]);
      for (const row of used) if (row.id && warehouses.includes(row.id)) await client.query(`DELETE FROM demo_records WHERE module = 'warehouse' AND table_name = 'wh_warehouses' AND record_key = $1`, [String(row.id)]);
    });
    await dropNotifications(ctx.query, docs.map((id) => `/app/warehouse/documents/${id}`));
    await removeDemoBlobs(files);
    await purgeDemoRoutes(ctx);
  },
});
