import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDateTime } from '../../../lib/datetime';
import { formatMoney, formatPercent, iconOf, readinessColor } from '../lib';
import { mpApi } from '../api';
import './deal-block.css';

const COLORS = { not_for_sale: '#94A3B8', free: '#22C55E', reserve: '#EAB308', booking: '#F97316', deposit: '#8B5CF6', contract: '#3B82F6', sold: '#EF4444', handed: '#7F1D1D' };

/**
 * The "Masterplan" block of a CRM deal (spec §11.2 CRM_DEAL_DETAIL_TAB,
 * adapted): the units linked to the deal with status, price, readiness and the
 * timer, and «Подобрать объект» — the site plan in picking mode for this deal.
 * Rendered by crm/panel/extensions.jsx only while the module is on.
 */
export default function DealUnitsBlock({ deal }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    mpApi
      .dealUnits(deal.id)
      .then((res) => alive && setData(res.data))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [deal.id, deal.version]);
  if (!data || (!data.units.length && !data.canPick && !data.hidden)) return null;
  return (
    <section className="dp-card mp-dealblock">
      <header className="dp-card__head">
        <h3>{t('apps.masterplan.name')}</h3>
        {data.canPick && (
          <Link className="mp-dealblock__pick" to={`/app/masterplan?deal=${deal.id}`}>
            {t('mp.deal.pick')} →
          </Link>
        )}
      </header>
      <div className="dp-card__body">
        {!data.units.length && <div className="dp-card__empty">{data.hidden ? t('mp.deal.hidden', { n: data.hidden }) : t('mp.deal.noUnits')}</div>}
        {data.units.map((unit) => (
          <Link key={unit.id} to={unit.link} className="mp-dealblock__unit">
            <span className="mp-dealblock__icon" aria-hidden="true">{iconOf({ kind: 'unit', type: { icon: unit.icon } })}</span>
            <span className="mp-dealblock__main">
              <b>{unit.code || unit.name}</b>
              <span>{[unit.project.name, unit.type].filter(Boolean).join(' · ')}</span>
            </span>
            {unit.status && (
              <span className="mp-dealblock__status" style={{ '--c': COLORS[unit.status] }}>
                {t(`mp.status.${unit.status}`)}
              </span>
            )}
            {unit.price && <span className="mp-dealblock__price">{formatMoney(unit.price.amount, unit.price.currency, locale)}</span>}
            {unit.readiness !== null && unit.readiness !== undefined && (
              <span className="mp-dealblock__ready" title={t('mp.card.readiness')}>
                <i style={{ width: `${Math.max(3, unit.readiness) * 0.48}px`, background: readinessColor(unit.readiness) }} />
                {formatPercent(unit.readiness, locale)}
              </span>
            )}
            {unit.endsAt && <span className="mp-dealblock__until">{t('mp.ev.until', { when: fmtDateTime(unit.endsAt) })}</span>}
          </Link>
        ))}
        {data.hidden > 0 && data.units.length > 0 && <div className="dp-card__empty">{t('mp.deal.hidden', { n: data.hidden })}</div>}
      </div>
    </section>
  );
}
