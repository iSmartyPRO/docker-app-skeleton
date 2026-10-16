import { resolve } from 'path';
import { registerDemo } from '../../services/demo.js';
import { uploadRoot } from '../../config/paths.js';
import { mpContext, mpSettings } from './access.js';
import { createProject, createPlan, saveContours } from './projects.js';
import { bulkCreate, createNode } from './nodes.js';
import { createGrid } from './pricing.js';
import { createReport } from './construction.js';
import { removeMediaFiles } from './media.js';
import { DEMO_DEALS, DEMO_SELLERS } from '../crm/demo.js';
import { demoMoney, dropNotifications, isoDate, sitePhoto } from '../shared/demoAssets.js';
import { mkdir, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';

/*
 * Demo data of the Masterplan (spec §8, docs/masterplan.md «Демо-данные»):
 * the project «Посёлок «Пример»» — two sectors with lines of cottages
 * (20 houses) and an apartment building with 24 flats, a site plan drawn
 * here as SVG with a contour for every object, a mix of sales statuses
 * (free, reserve and booking with running timers, deposit, contract, sold,
 * not for sale), a price grid with instalment plans, construction stages
 * moved by a few photo reports (generated pictures).
 *
 * Statuses are written directly (the demo does not walk the sales process,
 * so CRM rules like «бронь только со сделкой» do not block it); the
 * property deals of the CRM demo are linked to their units when seeded.
 * Purge removes the media files, then the project (everything cascades).
 */

/** Units the Contracts demo turns into sale contracts (they wait in «Бронь»). */
export const DEMO_CONTRACT_UNITS = ['A-1-03', 'A-1-05'];

const W = 1600;
const H = 1000;

// Lines of cottages: code prefix, count, left x, top y, lot width, lot height, step.
const LINES = [
  { sector: 'A', code: 'A-1', count: 8, x: 70, y: 110, w: 76, h: 170, step: 86 },
  { sector: 'A', code: 'A-2', count: 6, x: 70, y: 610, w: 100, h: 180, step: 113 },
  { sector: 'B', code: 'B-1', count: 6, x: 870, y: 110, w: 100, h: 170, step: 110 },
];
const BUILDING = { x: 960, y: 600, w: 300, h: 230 };

// Status of each sellable unit: [status, extra]. Missing codes stay free.
const STATUS = {
  'A-1-01': ['sold', { manager: 'sales1', client: { ru: 'Семья Примеровых', en: 'The Example family' }, days: 40 }],
  'A-1-02': ['sold', { manager: 'sales3', client: { ru: 'Пётр Покупателев', en: 'Peter Buyer' }, days: 55 }],
  'A-1-03': ['booking', { manager: 'sales1', client: { ru: 'Семья Покупателевых', en: 'The Buyer family' }, hours: 50 }],
  'A-1-04': ['contract', { manager: 'sales3', client: { ru: 'Марина Образцова', en: 'Marina Sample' }, days: 12, paid: 0.3 }],
  'A-1-05': ['booking', { manager: 'sales3', client: { ru: 'Анна Клиентова', en: 'Anna Client' }, hours: 98 }],
  'A-1-06': ['deposit', { manager: 'sales1', client: { ru: 'Олег Новосёлов', en: 'Oleg Newhome' }, days: 4, paid: 0.05 }],
  'A-1-07': ['reserve', { manager: 'sales1', client: { ru: 'Семья Примеровых', en: 'The Example family' }, hours: 20 }],
  'A-2-01': ['reserve', { manager: 'me', client: { ru: 'Игорь Домов', en: 'Igor Home' }, hours: 2 }],
  'A-2-03': ['deposit', { manager: 'north', client: { ru: 'Светлана Садова', en: 'Svetlana Garden' }, days: 6, paid: 0.05 }],
  'A-2-06': ['not_for_sale', {}],
  'B-1-01': ['contract', { manager: 'north', client: { ru: 'Алексей Участков', en: 'Alexey Plot' }, days: 20, paid: 0.6 }],
  'B-1-03': ['booking', { manager: 'sales3', client: { ru: 'Дмитрий Новиков', en: 'Dmitry New' }, hours: 140 }],
  'D1-1': ['sold', { manager: 'sales3', client: { ru: 'Ирина Этажова', en: 'Irina Floor' }, days: 70 }],
  'D1-2': ['sold', { manager: 'sales3', client: { ru: 'Николай Квартиров', en: 'Nikolay Flat' }, days: 35 }],
  'D1-3': ['contract', { manager: 'sales1', client: { ru: 'Елена Лифтова', en: 'Elena Lift' }, days: 9, paid: 0.4 }],
  'D1-5': ['sold', { manager: 'north', client: { ru: 'Сергей Балконов', en: 'Sergey Balcony' }, days: 25 }],
  'D1-9': ['deposit', { manager: 'sales1', client: { ru: 'Ольга Окнова', en: 'Olga Window' }, days: 3, paid: 0.05 }],
  'D1-10': ['booking', { manager: 'me', client: { ru: 'Виктор Ключев', en: 'Victor Key' }, hours: 26 }],
  'D1-14': ['reserve', { manager: 'sales3', client: { ru: 'Татьяна Видова', en: 'Tatiana View' }, hours: 30 }],
};

const MEDIA_ROOT = resolve(uploadRoot, 'masterplan');

function planSvg(t) {
  const lots = LINES.flatMap((line) => Array.from({ length: line.count }, (_, i) => `<rect x="${line.x + i * line.step}" y="${line.y}" width="${line.w}" height="${line.h}" rx="4" fill="#EEF6E6" stroke="#9DB88C" stroke-dasharray="6 4"/>`)).join('');
  const trees = Array.from({ length: 26 }, (_, i) => `<circle cx="${40 + ((i * 263) % 1520)}" cy="${330 + ((i * 97) % 220)}" r="${10 + (i % 3) * 4}" fill="#7DB36A" opacity=".75"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#DCEFD2"/>
  <rect x="790" y="0" width="44" height="${H}" fill="#C9C4B8"/>
  <rect x="0" y="470" width="${W}" height="44" fill="#C9C4B8"/>
  <line x1="812" y1="0" x2="812" y2="${H}" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="18 14"/>
  <line x1="0" y1="492" x2="${W}" y2="492" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="18 14"/>
  ${trees}
  ${lots}
  <rect x="${BUILDING.x - 20}" y="${BUILDING.y - 20}" width="${BUILDING.w + 40}" height="${BUILDING.h + 40}" rx="8" fill="#E8E4DA" stroke="#B8B0A0"/>
  <ellipse cx="1430" cy="760" rx="120" ry="70" fill="#9CCBEA" stroke="#6AA5CF"/>
  <rect x="1330" y="580" width="120" height="70" rx="10" fill="#F6E7B8" stroke="#D8BF6A"/>
  <text x="70" y="80" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#3F5A35">${t({ ru: 'Сектор A', en: 'Sector A' })}</text>
  <text x="870" y="80" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#3F5A35">${t({ ru: 'Сектор B', en: 'Sector B' })}</text>
  <text x="1430" y="765" font-family="Arial, sans-serif" font-size="18" text-anchor="middle" fill="#2F5F7F">${t({ ru: 'Пруд', en: 'Pond' })}</text>
  <text x="1390" y="620" font-family="Arial, sans-serif" font-size="15" text-anchor="middle" fill="#7A6420">${t({ ru: 'Площадка', en: 'Playground' })}</text>
  <text x="850" y="${H - 20}" font-family="Arial, sans-serif" font-size="16" fill="#5B6B52">${t({ ru: 'Демо-генплан «Посёлок «Пример»»', en: 'Demo site plan «Example Village»' })}</text>
</svg>`;
}

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** Writes a file into the Masterplan media folder → storage key. */
async function storeMedia(ext, bytes) {
  const now = new Date();
  const dir = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  await mkdir(resolve(MEDIA_ROOT, dir), { recursive: true });
  const key = `${dir}/demo-${randomBytes(12).toString('hex')}.${ext}`;
  await writeFile(resolve(MEDIA_ROOT, key), bytes);
  return key;
}

async function insertMedia(ctx, projectId, { kind, name, mime, bytes, ext, width, height, takenAt = null }) {
  const key = await storeMedia(ext, bytes);
  const { rows } = await ctx.query(
    `INSERT INTO mp_media (project_id, kind, name, mime, size, storage_key, width, height, taken_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [projectId, kind, name, mime, bytes.length, key, width, height, takenAt, ctx.userId]
  );
  await ctx.track('mp_media', rows[0].id);
  return rows[0].id;
}

registerDemo({
  module: 'masterplan',
  describe: {
    ru: 'Проект «Посёлок «Пример»»: 20 коттеджей и дом на 24 квартиры, генплан с контурами, все статусы продаж и брони с таймерами, сетка цен, этапы стройки и фотоотчёты',
    en: 'The «Example Village» project: 20 cottages and a 24-flat building, a site plan with contours, every sales status and bookings with timers, a price grid, construction stages and photo reports',
  },
  after: ['crm', 'companies', 'employees'],
  async seed(ctx) {
    const settings = await mpSettings();
    const mp = await mpContext(ctx.request, settings);
    const currency = (settings.currency || 'USD').trim();
    const money = (usd) => demoMoney(usd, currency);
    const people = { me: ctx.userId };
    for (const [key, person] of Object.entries(DEMO_SELLERS)) people[key] = await ctx.demoUser(person.key, { displayName: ctx.t(person.name) });
    const foreman = await ctx.demoUser('org.foreman', { displayName: ctx.t({ ru: 'Пётр Прорабов', en: 'Peter Foreman' }) });

    const { rows: typeRows } = await ctx.query(`SELECT id, key FROM mp_types WHERE key = ANY($1::text[])`, [['cottage', 'apartment_building', 'apartment', 'playground']]);
    const types = Object.fromEntries(typeRows.map((row) => [row.key, row.id]));
    for (const key of ['cottage', 'apartment_building', 'apartment']) if (!types[key]) throw Object.assign(new Error(`The Masterplan object type «${key}» is missing`), { statusCode: 409, code: 'DEMO_TYPES' });

    const project = await createProject(mp, {
      name: ctx.t({ ru: 'Посёлок «Пример» (демо)', en: 'Example Village (demo)' }),
      code: 'DEMO',
      address: ctx.t({ ru: 'г. Северный, ул. Строителей, 5', en: '5 Builders St, North Town' }),
      class: 'comfort',
      status: 'sales',
      currency,
      startDate: isoDate(ctx.day(-240)),
      finishDate: isoDate(ctx.day(420)),
      managerId: people.north,
      description: ctx.t({ ru: 'Демо-проект: коттеджный посёлок и многоквартирный дом. Удаляется кнопкой «Удалить демо-данные».', en: 'A demo project: a cottage village and an apartment building. «Remove demo data» deletes it.' }),
    });
    await ctx.track('mp_projects', project.id);
    const projectId = project.id;
    const track = (id) => ctx.track('mp_nodes', id);

    // ── Tree: sectors → lines → cottages; the building with its flats ──────
    const nodes = {};
    const sectors = {};
    for (const key of ['A', 'B']) {
      const sector = await createNode(mp, { projectId, kind: 'level', levelKey: 'sector', code: key, name: ctx.t({ ru: `Сектор ${key}`, en: `Sector ${key}` }) });
      sectors[key] = sector.id;
      await track(sector.id);
    }
    const cottageSpecs = [];
    for (const [lineIndex, line] of LINES.entries()) {
      const level = await createNode(mp, { projectId, parentId: sectors[line.sector], kind: 'level', levelKey: 'line', code: line.code, name: ctx.t({ ru: `Линия ${line.code}`, en: `Line ${line.code}` }) });
      await track(level.id);
      nodes[line.code] = level.id;
      const { ids } = await bulkCreate(mp, {
        projectId,
        parentId: level.id,
        kind: 'object',
        typeId: types.cottage,
        prefix: `${line.code}-`,
        from: 1,
        count: line.count,
        pad: 2,
        nameTemplate: ctx.t({ ru: 'Коттедж {code}', en: 'Cottage {code}' }),
      });
      for (const [i, id] of ids.entries()) {
        const code = `${line.code}-${String(i + 1).padStart(2, '0')}`;
        nodes[code] = id;
        await track(id);
        const area = 118 + ((i * 13 + lineIndex * 7) % 64);
        const plot = 600 + ((i * 71 + lineIndex * 40) % 420);
        cottageSpecs.push({ code, id, lineIndex, i, area, plot, line });
        await ctx.query(
          `UPDATE mp_units SET area_total = $2, area_living = $3, area_plot = $4, area_terrace = $5, rooms = $6, bedrooms = $7, bathrooms = $8, levels = 2, ceiling = 2.8,
             finishing = $9, payment_forms = $10, price = $11, min_price = $12, currency = $13 WHERE node_id = $1`,
          [id, area, Math.round(area * 0.62), plot, 18 + (i % 3) * 6, 4 + (i % 2), 3 + (i % 2), 2, i % 3 === 0 ? 'whitebox' : 'rough', ['full', 'installment', 'mortgage'], money(1000 * Math.round((area * 950 + plot * 40) / 1000)), money(1000 * Math.round((area * 880 + plot * 35) / 1000)), currency]
        );
        await ctx.query(`UPDATE mp_nodes SET plan_start = $2, plan_end = $3, contractor = $4, build_user_id = $5, sales_user_id = $6, area = $7 WHERE id = $1`, [
          id,
          isoDate(ctx.day(-200 + lineIndex * 60)),
          isoDate(ctx.day(160 + lineIndex * 90 + i * 5)),
          ctx.t({ ru: 'ООО «Пример-Строй»', en: 'Example Build LLC' }),
          foreman,
          lineIndex === 2 ? people.north : people.sales1,
          plot,
        ]);
      }
    }
    const building = await createNode(mp, {
      projectId,
      parentId: sectors.B,
      kind: 'object',
      typeId: types.apartment_building,
      code: 'D1',
      name: ctx.t({ ru: 'Дом 1 (6 этажей)', en: 'Building 1 (6 floors)' }),
      contractor: ctx.t({ ru: 'ООО «Пример-Строй»', en: 'Example Build LLC' }),
      planStart: isoDate(ctx.day(-150)),
      planEnd: isoDate(ctx.day(380)),
      buildUserId: foreman,
    });
    nodes.D1 = building.id;
    await track(building.id);
    const flats = await bulkCreate(mp, { projectId, parentId: building.id, kind: 'unit', typeId: types.apartment, prefix: 'D1-', grid: { floorFrom: 1, floorTo: 6, perFloor: 4, startNumber: 1, numbering: 'through' }, nameTemplate: ctx.t({ ru: 'Квартира {n}', en: 'Flat {n}' }) });
    const FLAT_TYPES = [[1, 38.5], [2, 56.2], [3, 78.4], [2, 61.9]];
    for (const [index, id] of flats.ids.entries()) {
      const code = `D1-${index + 1}`;
      nodes[code] = id;
      await track(id);
      const [rooms, area] = FLAT_TYPES[index % 4];
      const floor = Math.floor(index / 4) + 1;
      const ppm = 1150 + floor * 25;
      await ctx.query(
        `UPDATE mp_units SET area_total = $2, area_living = $3, rooms = $4, bedrooms = $5, bathrooms = $6, ceiling = 2.75, finishing = $7, payment_forms = $8, price = $9, min_price = $10, currency = $11 WHERE node_id = $1`,
        [id, area, Math.round(area * 0.58 * 10) / 10, rooms, Math.max(1, rooms - 1), rooms > 2 ? 2 : 1, floor > 4 ? 'whitebox' : 'pso', ['full', 'installment', 'mortgage'], money(Math.round((area * ppm) / 100) * 100), money(Math.round((area * (ppm - 60)) / 100) * 100), currency]
      );
    }
    if (types.playground) {
      const playground = await createNode(mp, { projectId, parentId: sectors.B, kind: 'object', typeId: types.playground, code: 'P1', name: ctx.t({ ru: 'Детская площадка', en: 'Playground' }) });
      nodes.P1 = playground.id;
      await track(playground.id);
    }

    // ── Site plan: the SVG background and a contour per object ─────────────
    const svg = Buffer.from(planSvg(ctx.t), 'utf8');
    const planMedia = await insertMedia(ctx, projectId, { kind: 'plan', name: 'demo-site-plan.svg', mime: 'image/svg+xml', bytes: svg, ext: 'svg', width: W, height: H });
    const plan = await createPlan(mp, projectId, { mediaId: planMedia, name: ctx.t({ ru: 'Генплан', en: 'Site plan' }), width: W, height: H });
    await ctx.track('mp_plans', plan.id);
    const contours = [
      { nodeId: sectors.A, points: rect(50, 95, 730, 710) },
      { nodeId: sectors.B, points: rect(850, 95, 700, 760) },
      ...cottageSpecs.map((spec) => ({ nodeId: spec.id, points: rect(spec.line.x + spec.i * spec.line.step, spec.line.y, spec.line.w, spec.line.h) })),
      { nodeId: nodes.D1, points: rect(BUILDING.x, BUILDING.y, BUILDING.w, BUILDING.h) },
    ];
    if (nodes.P1) contours.push({ nodeId: nodes.P1, points: rect(1330, 580, 120, 70) });
    await saveContours(mp, plan.id, { contours });

    // ── Price grid: base price, instalments; flats by price per m² ─────────
    const grid = await createGrid(mp, projectId, {
      effectiveFrom: isoDate(ctx.day(-30)),
      plans: [
        { key: 'full', name: ctx.t({ ru: '100% оплата', en: 'Full payment' }), mode: 'base', firstPct: 100 },
        { key: 'i12', name: ctx.t({ ru: 'Рассрочка 12 мес.', en: '12-month instalments' }), mode: 'markup', markupPct: 6, firstPct: 30, months: 12 },
        { key: 'i24', name: ctx.t({ ru: 'Рассрочка 24 мес.', en: '24-month instalments' }), mode: 'markup', markupPct: 11, firstPct: 30, months: 24 },
      ],
      note: ctx.t({ ru: 'Демо: базовая сетка проекта', en: 'Demo: the project’s base grid' }),
    });
    await ctx.track('mp_price_grids', grid.id);
    const flatsGrid = await createGrid(mp, projectId, {
      typeId: types.apartment,
      effectiveFrom: isoDate(ctx.day(-30)),
      plans: [
        { key: 'full', name: ctx.t({ ru: '100% оплата', en: 'Full payment' }), mode: 'base', firstPct: 100 },
        { key: 'i18', name: ctx.t({ ru: 'Рассрочка 18 мес.', en: '18-month instalments' }), mode: 'markup', markupPct: 8, firstPct: 40, months: 18 },
      ],
      plannedPpm: money(1450),
      note: ctx.t({ ru: 'Демо: квартиры дорожают после сдачи каркаса', en: 'Demo: flats get dearer once the frame is done' }),
    });
    await ctx.track('mp_price_grids', flatsGrid.id);
    // One price change in the history.
    const raised = nodes['A-1-08'];
    const { rows: before } = await ctx.query(`SELECT price FROM mp_units WHERE node_id = $1`, [raised]);
    const newPrice = Math.round(Number(before[0].price) * 1.04);
    await ctx.query(`UPDATE mp_units SET price = $2 WHERE node_id = $1`, [raised, newPrice]);
    await ctx.query(`INSERT INTO mp_price_history (unit_id, old_price, new_price, currency, reason, author_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [raised, before[0].price, newPrice, currency, ctx.t({ ru: 'Демо: последний коттедж линии', en: 'Demo: the last cottage of the line' }), ctx.userId, ctx.day(-7)]);

    // ── Sales statuses (written directly) ──────────────────────────────────
    const dealIds = await ctx.records('crm_deals', 'crm');
    const { rows: liveDeals } = await ctx.query(`SELECT id FROM crm_deals WHERE id = ANY($1::int[])`, [dealIds]);
    const live = new Set(liveDeals.map((row) => row.id));
    const dealOf = (code) => {
      const index = DEMO_DEALS.findIndex((deal) => deal.unit === code);
      const id = index >= 0 ? dealIds[index] : null;
      return live.has(id) ? id : null;
    };
    let contractNo = 0;
    for (const [code, [status, extra]] of Object.entries(STATUS)) {
      const nodeId = nodes[code];
      if (!nodeId) continue;
      const { rows } = await ctx.query(`SELECT price FROM mp_units WHERE node_id = $1`, [nodeId]);
      const price = Number(rows[0].price);
      const manager = extra.manager ? people[extra.manager] : null;
      const client = extra.client ? ctx.t(extra.client) : null;
      const dealId = dealOf(code);
      const set = { status, manager_id: manager, client_name: client, deal_id: dealId, status_changed_at: extra.days ? ctx.day(-extra.days) : ctx.day(0, '09:00'), status_by: manager || ctx.userId };
      if (['contract', 'sold'].includes(status)) {
        contractNo += 1;
        Object.assign(set, {
          contract_number: `ДКП-${String(contractNo).padStart(3, '0')}-D`,
          contract_date: isoDate(ctx.day(-(extra.days || 10))),
          contract_amount: price,
          paid_amount: status === 'sold' ? price : Math.round(price * (extra.paid || 0.3)),
        });
      }
      if (status === 'deposit') set.paid_amount = Math.round(price * (extra.paid || 0.05));
      if (status === 'not_for_sale') Object.assign(set, { manager_id: null, client_name: null, status_by: ctx.userId });
      const keys = Object.keys(set);
      await ctx.query(`UPDATE mp_units SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, version = version + 1, updated_by = $${keys.length + 2}, updated_at = NOW() WHERE node_id = $1`, [nodeId, ...keys.map((key) => set[key]), ctx.userId]);
      if (status === 'reserve' || status === 'booking') {
        const total = status === 'reserve' ? settings.reserveHours || 48 : (settings.bookingDays || 10) * 24;
        const endsAt = new Date(Date.now() + extra.hours * 3600 * 1000);
        const startsAt = new Date(Math.min(Date.now() - 3600 * 1000, endsAt.getTime() - total * 3600 * 1000));
        const booking = await ctx.query(
          `INSERT INTO mp_bookings (unit_id, project_id, kind, manager_id, deal_id, client_name, paid, amount, price, currency, starts_at, ends_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
          [nodeId, projectId, status, manager, dealId, client, status === 'booking', status === 'booking' ? money(1000) : null, price, currency, startsAt, endsAt, manager || ctx.userId]
        );
        await ctx.track('mp_bookings', booking.rows[0].id);
        await ctx.query(`UPDATE mp_units SET booking_id = $2 WHERE node_id = $1`, [nodeId, booking.rows[0].id]);
      }
      await ctx.query(`INSERT INTO mp_events (project_id, node_id, kind, data, author_id, created_at) VALUES ($1, $2, 'status', $3, $4, $5)`, [
        projectId,
        nodeId,
        JSON.stringify({ from: 'free', to: status, transition: status === 'not_for_sale' ? 'close' : 'forward', reason: status === 'not_for_sale' ? ctx.t({ ru: 'Демо: шоу-рум', en: 'Demo: show house' }) : null, manager: manager ? { id: manager } : null, deal: dealId ? { id: dealId } : null, client: client ? { name: client } : null, contract: set.contract_number ? { number: set.contract_number, date: set.contract_date } : undefined }),
        manager || ctx.userId,
        set.status_changed_at,
      ]);
    }

    // ── Team: sales people and the foreman (zones of responsibility) ───────
    for (const [subject, role, nodeId] of [[people.sales1, 'sales', null], [people.sales3, 'sales', null], [people.north, 'sales_head', null], [foreman, 'foreman', null]]) {
      await ctx.query(`INSERT INTO mp_assignments (project_id, node_id, subject_type, subject_id, role, created_by) VALUES ($1, $2, 'user', $3, $4, $5) ON CONFLICT DO NOTHING`, [projectId, nodeId, subject, role, ctx.userId]);
    }

    // ── Construction: photo reports move the stages ────────────────────────
    const { rows: stageRows } = await ctx.query(`SELECT id, set_key, sort FROM mp_stages WHERE archived_at IS NULL ORDER BY set_key, sort, id`);
    const stageAt = (set, index) => stageRows.filter((row) => row.set_key === set)[index]?.id || null;
    const lineA1 = cottageSpecs.filter((spec) => spec.line.code === 'A-1').map((spec) => spec.id);
    const lineA2 = cottageSpecs.filter((spec) => spec.line.code === 'A-2').map((spec) => spec.id);
    const allCottages = cottageSpecs.map((spec) => spec.id);
    const REPORTS = [
      { nodes: allCottages, stage: stageAt('lowrise', 0), percent: 100, day: -150, text: { ru: 'Проект и разрешения на все коттеджи получены.', en: 'Design and permits for all cottages are in.' } },
      { nodes: allCottages, stage: stageAt('lowrise', 1), percent: 100, day: -110, text: { ru: 'Участки размечены и подготовлены.', en: 'Plots are marked out and prepared.' } },
      ...[0, 1, 2, 3].map((index) => ({ nodes: [nodes.D1], stage: stageAt('apartment', index), percent: 100, day: -140 + index * 25, text: { ru: 'Дом 1: этап завершён.', en: 'Building 1: stage complete.' } })),
      { nodes: lineA1, stage: stageAt('lowrise', 2), percent: 100, day: -70, text: { ru: 'Котлованы линии A-1 готовы.', en: 'Line A-1 excavation is done.' } },
      { nodes: lineA1, stage: stageAt('lowrise', 3), percent: 100, day: -45, photos: [0.08], text: { ru: 'Фундаменты линии A-1 залиты, бетон набрал прочность.', en: 'Line A-1 foundations are poured and cured.' } },
      { nodes: lineA1.slice(0, 4), stage: stageAt('lowrise', 4), percent: 100, day: -20, photos: [0.55, 0.7], text: { ru: 'Коробки A-1-01…04 выведены под перекрытие.', en: 'Walls of A-1-01…04 are up to the slab.' } },
      { nodes: lineA1.slice(0, 2), stage: stageAt('lowrise', 5), percent: 60, day: -4, photos: [0.9], text: { ru: 'Кровля A-1-01 и A-1-02: стропила и мембрана.', en: 'Roofs of A-1-01 and A-1-02: rafters and membrane.' } },
      { nodes: lineA2, stage: stageAt('lowrise', 2), percent: 100, day: -14, text: { ru: 'Земляные работы на линии A-2 завершены.', en: 'Earthworks on line A-2 are finished.' } },
      { nodes: [nodes.D1], stage: stageAt('apartment', 4), percent: 45, day: -6, photos: [0.45], wall: '#9CA3AF', text: { ru: 'Дом 1: монолитный каркас — 3 этажа из 6.', en: 'Building 1: the concrete frame — 3 floors of 6.' } },
    ];
    for (const [index, report] of REPORTS.entries()) {
      if (!report.stage || !report.nodes.length) continue;
      const mediaIds = [];
      for (const [p, progress] of (report.photos || []).entries()) {
        const bytes = sitePhoto({ progress, seed: index * 3 + p, wall: report.wall || '#C08457' });
        mediaIds.push(await insertMedia(ctx, projectId, { kind: 'photo', name: `demo-photo-${index + 1}-${p + 1}.png`, mime: 'image/png', bytes, ext: 'png', width: 480, height: 320, takenAt: ctx.day(report.day, '13:00') }));
      }
      const created = await createReport(mp, { projectId, nodeIds: report.nodes, stageId: report.stage, percent: report.percent, factDate: isoDate(ctx.day(report.day)), body: ctx.t(report.text), mediaIds });
      await ctx.track('mp_reports', created.id);
    }
  },
  async purge(ctx) {
    const projects = await ctx.records('mp_projects');
    const { rows } = await ctx.query(`SELECT storage_key, thumb_key FROM mp_media WHERE project_id = ANY($1::int[])`, [projects]);
    await removeMediaFiles(rows);
    await dropNotifications(ctx.query, [...projects.map((id) => `/app/masterplan/p/${id}/plan`), ...projects.map((id) => `/app/masterplan/p/${id}/construction`)]);
    // Contracts and requests keep plain ids of objects: forget them.
    await ctx.query(`UPDATE ctr_contracts SET mp_project_id = NULL, mp_node_id = NULL WHERE mp_project_id = ANY($1::int[])`, [projects]).catch(() => {});
    await ctx.query(`UPDATE proc_requests SET project_id = NULL, project_label = NULL, object_id = NULL, object_label = NULL WHERE project_id = ANY($1::int[])`, [projects]).catch(() => {});
    await ctx.query(`DELETE FROM mp_projects WHERE id = ANY($1::int[])`, [projects]);
  },
});

