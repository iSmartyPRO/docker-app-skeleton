import { useLocale } from '../../../context/LocaleContext';
import { fmtDate } from '../../../lib/datetime';
import { formatMoney, formatPercent } from '../lib';
import { gridFor, paymentOptions } from '../pricing';
import '../mp-pricing.css';

/**
 * Payment variants of a unit (price grid by payment form): for every plan in
 * force — the total, the price per m², the first payment and the monthly
 * payments — and the planned price per m² at completion. Renders nothing when
 * the project has no grid, the person does not see prices (field hiding on
 * the server drops `unit.price` and `project.pricing`) or nothing applies.
 * `node` is optional (its type picks a type's own grid when `unit.typeId` is absent).
 */
export default function PaymentOptions({ unit, project, presentation = false, node = null, compact = false }) {
  const { t, locale } = useLocale();
  if (!unit || !project?.pricing || unit.price === undefined) return null;
  const grid = gridFor(project.pricing, unit.typeId ?? node?.type?.id);
  const options = paymentOptions(unit, grid);
  if (!options) return null;
  const money = (value) => formatMoney(value, options.currency, locale);
  return (
    <section className={`mp-payopts${compact ? ' is-compact' : ''}${presentation ? ' is-presentation' : ''}`} aria-label={t('mp.pay.title')}>
      <h3 className="mp-payopts__title">
        {t('mp.pay.title')}
        {options.effectiveFrom && <span>{t('mp.pay.since', { date: fmtDate(options.effectiveFrom) })}</span>}
      </h3>
      {options.plans.length > 0 && (
        <ul className="mp-payopts__list">
          {options.plans.map((plan) => (
            <li key={plan.key} className="mp-payopt">
              <div className="mp-payopt__head">
                <b>{plan.name}</b>
                {plan.ppm ? <span>{t('mp.measure.perSqm', { price: money(Math.round(plan.ppm)) })}</span> : null}
              </div>
              <div className="mp-payopt__total">{money(plan.total)}</div>
              {plan.months > 0 ? (
                <dl className="mp-payopt__sched">
                  <div>
                    <dt>{t('mp.pay.first', { pct: formatPercent(plan.firstPct, locale) })}</dt>
                    <dd>{money(plan.first)}</dd>
                  </div>
                  <div>
                    <dt>{t('mp.pay.monthly', { n: plan.months })}</dt>
                    <dd>{money(plan.monthly)}</dd>
                  </div>
                  {plan.last !== plan.monthly && (
                    <div className="is-note">
                      <dt>{t('mp.pay.last')}</dt>
                      <dd>{money(plan.last)}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="mp-payopt__once">{t('mp.pay.once')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {options.planned && (
        <div className="mp-payopts__planned">
          <span>{t('mp.pay.planned')}</span>
          <b>{t('mp.measure.perSqm', { price: money(options.planned.ppm) })}</b>
          <em>
            {money(options.planned.total)}
            {options.planned.growthPct ? ` · ${options.planned.growthPct > 0 ? '+' : ''}${formatPercent(options.planned.growthPct, locale)}` : ''}
          </em>
        </div>
      )}
    </section>
  );
}
