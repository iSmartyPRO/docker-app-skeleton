import { useMemo, useState } from 'react';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate } from '../../../lib/datetime';
import { formatMoney, formatShortMoney } from '../lib';
import '../mp-pricing.css';

// Categorical slots in fixed order (validated palette): list price, grid plans, planned price.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const W = 720;
const H = 240;
const PAD = { l: 56, r: 16, t: 12, b: 26 };
const day = (iso) => Date.parse(`${iso}T00:00:00Z`);

/**
 * Price per m² over time (dashboard): the average list price of the units
 * (area-weighted, from the price history), the grid versions (plans priced
 * per m², as steps from their dates) and the planned price at completion
 * (dashed). `data` = dashboard.prices.
 */
export default function PriceChart({ data }) {
  const { t, locale } = useLocale();
  const [hover, setHover] = useState(null);
  const model = useMemo(() => {
    if (!data) return null;
    const today = data.points.length ? data.points[data.points.length - 1].date : new Date().toISOString().slice(0, 10);
    const series = [];
    if (data.points.length) series.push({ key: 'list', name: t('mp.dash.priceList'), color: SERIES[0], points: data.points.map((p) => ({ x: day(p.date), y: p.ppm, date: p.date })) });
    const keys = [];
    for (const version of data.grids) for (const plan of version.plans) if (!keys.some((k) => k.key === plan.key)) keys.push({ key: plan.key, name: plan.name });
    keys.slice(0, 4).forEach((plan, index) => {
      const points = [];
      data.grids.forEach((version, i) => {
        const found = version.plans.find((p) => p.key === plan.key);
        if (!found) return;
        const end = data.grids[i + 1]?.effectiveFrom || today;
        points.push({ x: day(version.effectiveFrom), y: found.ppm, date: version.effectiveFrom });
        if (end > version.effectiveFrom) points.push({ x: day(end), y: found.ppm, date: end, step: true });
      });
      if (points.length) series.push({ key: `grid-${plan.key}`, name: plan.name, color: SERIES[1 + index], points });
    });
    if (data.planned) {
      const end = data.planned.date && data.planned.date > today ? data.planned.date : null;
      const x2 = end ? day(end) : day(today) + 30 * 86400000;
      series.push({ key: 'planned', name: t('mp.dash.pricePlanned'), color: SERIES[5], dashed: true, points: [{ x: day(today), y: data.planned.ppm, date: today }, { x: x2, y: data.planned.ppm, date: end || today }] });
    }
    const all = series.flatMap((s) => s.points);
    if (!all.length) return null;
    let x0 = Math.min(...all.map((p) => p.x));
    let x1 = Math.max(...all.map((p) => p.x));
    if (x1 - x0 < 30 * 86400000) {
      x0 -= 15 * 86400000;
      x1 += 15 * 86400000;
    }
    // Round steps (1 / 2 / 2.5 / 5 × 10ⁿ) so the axis reads 0, 1 000, 2 000, 3 000…
    const top = Math.max(...all.map((p) => p.y)) * 1.08 || 1;
    const raw = top / 4;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const stepY = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((k) => k >= raw);
    const yMax = Math.ceil(top / stepY) * stepY;
    const sx = (x) => PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
    const sy = (y) => H - PAD.b - (y / yMax) * (H - PAD.t - PAD.b);
    const ticks = Array.from({ length: Math.round(yMax / stepY) + 1 }, (_, i) => i * stepY);
    const months = [];
    const start = new Date(x0);
    for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)); d.getTime() <= x1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(d.getTime());
    const step = Math.max(1, Math.ceil(months.length / 8));
    return { series, sx, sy, ticks, months: months.filter((_, i) => i % step === 0) };
  }, [data, t]);

  if (!model) return <p className="mp-muted">{t('mp.dash.priceNone')}</p>;
  const money = (value) => formatMoney(Math.round(value), data.currency, locale);
  const path = (s) => s.points.map((p, i) => `${i ? 'L' : 'M'}${model.sx(p.x).toFixed(1)},${model.sy(p.y).toFixed(1)}`).join(' ');
  return (
    <>
      <svg className="mp-pchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('mp.dash.priceChart')} onMouseLeave={() => setHover(null)}>
        {model.ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={model.sy(v)} y2={model.sy(v)} />
            <text x={PAD.l - 6} y={model.sy(v) + 4} textAnchor="end">{v >= 100000 ? formatShortMoney(v, data.currency, locale) : formatMoney(v, data.currency, locale)}</text>
          </g>
        ))}
        {model.months.map((m) => {
          const d = new Date(m);
          return <text key={m} x={model.sx(m)} y={H - 8} textAnchor="middle">{`${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCFullYear()).slice(2)}`}</text>;
        })}
        {model.series.map((s) => (
          <g key={s.key}>
            <path d={path(s)} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '6 4' : undefined} strokeLinejoin="round" />
            {s.points.filter((p) => !p.step).map((p) => (
              <g key={`${s.key}-${p.x}`} onMouseEnter={() => setHover({ s, p })} onFocus={() => setHover({ s, p })} tabIndex={0}>
                <circle cx={model.sx(p.x)} cy={model.sy(p.y)} r="10" fill="transparent" />
                <circle cx={model.sx(p.x)} cy={model.sy(p.y)} r="4" fill={s.color} stroke="var(--da-surface)" strokeWidth="2" />
              </g>
            ))}
          </g>
        ))}
        {hover && (
          <g pointerEvents="none">
            <line className="grid" x1={model.sx(hover.p.x)} x2={model.sx(hover.p.x)} y1={PAD.t} y2={H - PAD.b} />
            <text x={Math.min(model.sx(hover.p.x) + 8, W - 190)} y={PAD.t + 12} style={{ fill: 'var(--da-text)', fontWeight: 600 }}>
              {`${hover.s.name}: ${t('mp.measure.perSqm', { price: money(hover.p.y) })} · ${fmtDate(hover.p.date)}`}
            </text>
          </g>
        )}
      </svg>
      <div className="mp-pchart-legend">
        {model.series.map((s) => (
          <span key={s.key}>
            <i className={s.dashed ? 'is-dashed' : ''} style={{ '--c': s.color }} />
            {s.name}
            <b>{money(s.points[s.points.length - 1].y)}</b>
          </span>
        ))}
      </div>
      <details className="mp-small">
        <summary>{t('mp.dash.priceTable')}</summary>
        <table className="mp-dtable">
          <tbody>
            {model.series.flatMap((s) => s.points.filter((p) => !p.step).map((p) => (
              <tr key={`${s.key}-${p.x}`}><td>{s.name}</td><td>{fmtDate(p.date)}</td><td className="is-num">{t('mp.measure.perSqm', { price: money(p.y) })}</td></tr>
            )))}
          </tbody>
        </table>
      </details>
    </>
  );
}
