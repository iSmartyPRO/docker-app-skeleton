/*
 * Price grid by payment form on the client — the same arithmetic as the
 * server (src/backend/modules/masterplan/pricing.js, unit-tested there): the
 * plan's total, the first payment in percent, equal monthly payments in whole
 * currency units, the last one taking the rounding difference.
 */

const round = (n) => Math.round(n);
const round2 = (n) => Math.round(n * 100) / 100;

export function paymentSchedule(total, firstPct, months) {
  const sum = round(Number(total) || 0);
  const pct = Math.min(100, Math.max(0, Number(firstPct) || 0));
  const n = pct >= 100 ? 0 : Math.max(1, Math.round(Number(months) || 1));
  const first = n ? round((sum * pct) / 100) : sum;
  const rest = sum - first;
  const monthly = n ? round(rest / n) : 0;
  const last = n ? rest - monthly * (n - 1) : 0;
  return { total: sum, first, rest, months: n, monthly, last };
}

export function planTotal(plan, { price, area, currency, gridCurrency }) {
  if (plan.mode === 'base') return price ? round(price) : null;
  if (plan.mode === 'markup') return price ? round(price * (1 + (Number(plan.markupPct) || 0) / 100)) : null;
  if (!area || !plan.ppm) return null;
  if (gridCurrency && currency && gridCurrency !== currency) return null;
  return round(plan.ppm * area);
}

/** The grid in force for a unit: the version of its type, else the project's (project.pricing.grids hold today's versions). */
export function gridFor(pricing, typeId) {
  const grids = pricing?.grids || [];
  return (typeId ? grids.find((g) => g.typeId === Number(typeId)) : null) || grids.find((g) => !g.typeId) || null;
}

/** → { effectiveFrom, currency, plans: [{ key, name, total, ppm, firstPct, first, months, monthly, last }], planned } | null */
export function paymentOptions(unit, grid) {
  if (!unit || !grid) return null;
  const price = Number(unit.price) || 0;
  const area = Number(unit.areaTotal) || Number(unit.areaPlot) || 0;
  const currency = unit.currency || grid.currency || null;
  const plans = [];
  for (const plan of grid.plans || []) {
    const total = planTotal(plan, { price, area, currency, gridCurrency: grid.currency });
    if (!total) continue;
    plans.push({ key: plan.key, name: plan.name, mode: plan.mode, ppm: area ? round2(total / area) : null, firstPct: Number(plan.firstPct), ...paymentSchedule(total, plan.firstPct, plan.months) });
  }
  let planned = null;
  const sameCurrency = !grid.currency || !currency || grid.currency === currency;
  if (grid.plannedPpm && area && sameCurrency) {
    const now = price ? price / area : plans[0]?.ppm || null;
    planned = { ppm: Number(grid.plannedPpm), total: round(grid.plannedPpm * area), growthPct: now ? round2(((grid.plannedPpm - now) / now) * 100) : null };
  }
  if (!plans.length && !planned) return null;
  return { effectiveFrom: grid.effectiveFrom, currency, plans, planned };
}
