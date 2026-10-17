/*
 * Demo colleagues shared by the seeds of Files, Chat and the like
 * (docs/extending.md «Demo data»). The keys are the ones the Org structure
 * and Employees demos use (`org.<head>`, `emp.<account>`), so when those are
 * seeded the same people appear everywhere — the director who heads the
 * company in Org structure writes in the chat and uploads the estimate.
 * ctx.demoUser reuses a tracked demo user and makes one otherwise.
 */

export const DEMO_COLLEAGUES = {
  director: { key: 'org.director', name: { ru: 'Анна Демова', en: 'Anna Demo', ky: 'Анна Демова' } },
  finance: { key: 'org.finance', name: { ru: 'Олег Счётов', en: 'Oleg Ledger', ky: 'Олег Счётов' } },
  hr: { key: 'org.hr', name: { ru: 'Мария Кадрова', en: 'Maria People', ky: 'Мария Кадрова' } },
  north: { key: 'org.north', name: { ru: 'Игорь Северов', en: 'Igor North', ky: 'Игорь Северов' } },
  foreman: { key: 'org.foreman', name: { ru: 'Пётр Прорабов', en: 'Peter Foreman', ky: 'Пётр Прорабов' } },
  it: { key: 'emp.it', name: { ru: 'Денис Сетевой', en: 'Denis Network', ky: 'Денис Сетевой' } },
  buyer: { key: 'emp.buyer', name: { ru: 'Татьяна Закупова', en: 'Tatiana Supply', ky: 'Татьяна Закупова' } },
  sales1: { key: 'emp.sales1', name: { ru: 'Алексей Продажин', en: 'Alexey Seller', ky: 'Алексей Продажин' } },
};

/** { role: { id, username, name } } of the asked colleagues (all of them by default). */
export async function demoColleagues(ctx, roles = Object.keys(DEMO_COLLEAGUES)) {
  const out = {};
  for (const role of roles) {
    const person = DEMO_COLLEAGUES[role];
    const id = await ctx.demoUser(person.key, { displayName: ctx.t(person.name) });
    const { rows } = await ctx.query(`SELECT username, COALESCE(display_name, username) AS name FROM users WHERE id = $1`, [id]);
    out[role] = { id, username: rows[0].username, name: rows[0].name };
  }
  return out;
}
