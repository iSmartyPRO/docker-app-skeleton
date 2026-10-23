import { query } from '../../config/database.js';
import { zonedParts } from '../../services/datetime.js';
import { int } from '../../platform/widgets.js';
import { companiesContext, companiesSettings, listCompanies } from './service.js';

/* Dashboard widget of Counterparties: totals, countries, relations, new per month, the latest companies. */

async function companies(req, settings, tz) {
  const ctx = companiesContext(req);
  const config = await companiesSettings();
  const [totals, countries, relations, months, recentList] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW() AT TIME ZONE $1) AT TIME ZONE $1)::int AS this_month,
              (SELECT COUNT(*)::int FROM cmp_people WHERE archived_at IS NULL) AS people,
              (SELECT ROUND(AVG(score)::numeric, 1) FROM cmp_ratings WHERE entity_type = 'company') AS rating
       FROM cmp_companies WHERE archived_at IS NULL`,
      [tz]
    ),
    query(`SELECT country, COUNT(*)::int AS count FROM cmp_companies WHERE archived_at IS NULL GROUP BY country ORDER BY count DESC LIMIT 6`),
    query(
      `SELECT rel, COUNT(*)::int AS count FROM cmp_companies, unnest(relations) AS rel
       WHERE archived_at IS NULL GROUP BY rel ORDER BY count DESC LIMIT 6`
    ),
    query(
      `SELECT to_char(date_trunc('month', created_at AT TIME ZONE $1), 'YYYY-MM') AS month, COUNT(*)::int AS count
       FROM cmp_companies WHERE created_at >= date_trunc('month', NOW() AT TIME ZONE $1) - INTERVAL '5 months'
       GROUP BY 1 ORDER BY 1`,
      [tz]
    ),
    listCompanies(ctx, { sort: 'created', limit: int(settings.limit, 3, 10, 5) }),
  ]);
  const labels = new Map((config.relations || []).map((item) => [item.key, item]));
  // This month and the five before it, in the person's zone.
  const local = zonedParts(new Date(), tz);
  const monthKeys = [];
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(local.year, local.month - 1 - i, 1));
    monthKeys.push(date.toISOString().slice(0, 7));
  }
  const byMonth = new Map(months.rows.map((row) => [row.month, row.count]));
  return {
    ...totals.rows[0],
    rating: totals.rows[0].rating == null ? null : Number(totals.rows[0].rating),
    countries: countries.rows,
    relations: relations.rows.map((row) => ({ key: row.rel, label: labels.get(row.rel)?.label || row.rel, color: labels.get(row.rel)?.color || null, count: row.count })),
    months: monthKeys.map((month) => ({ month, count: byMonth.get(month) || 0 })),
    recent: recentList.items.map((company) => ({ id: company.id, name: company.name, country: company.country, createdAt: company.created_at, rating: company.rating_avg ?? null })),
  };
}

export function registerCompaniesWidgets(ctx) {
  ctx.registerWidget({ type: 'companies', data: companies });
}
