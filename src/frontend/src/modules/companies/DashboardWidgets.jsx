/* Dashboard widget of Counterparties (registered in register.js). */

import { Link } from 'react-router-dom';
import { useLocale } from '../../context/LocaleContext';
import { formatDateTime } from '../../lib/format';
import { relationLabel } from './api';
import { useWidgetData } from '../../platform/widgets/api';
import { Bars, Sparkline } from '../../platform/widgets/charts';
import { Kpi, WidgetState, flagOf } from '../../platform/widgets/common';

// ── Companies ───────────────────────────────────────────────────────────────

export function Companies({ widget, size }) {
  const { t, locale } = useLocale();
  const state = useWidgetData('companies', widget.settings);
  const data = state.data;
  const wide = size.w >= 6;
  const view = widget.settings.view || 'auto';
  const showCountries = view === 'countries' || (view === 'auto' && (wide || size.h >= 6));
  const showRecent = view === 'recent' || (view === 'auto' && (wide ? size.h >= 5 : size.h >= 8));
  const showRelations = view === 'relations' || (view === 'auto' && wide && size.h >= 7);
  return (
    <WidgetState state={state} rows={5}>
      {data && (
        <div className="dw-companies">
          <div className="dw-kpis">
            <Kpi value={data.total} label={t('dashboard.companies.total')} to="/app/companies" />
            <Kpi value={data.this_month ? `+${data.this_month}` : 0} label={t('dashboard.companies.month')} tone={data.this_month ? 'ok' : null} />
            {size.w >= 4 && <Kpi value={data.people} label={t('dashboard.companies.people')} to="/app/companies/people" />}
            {wide && <Kpi value={data.rating != null ? `★ ${data.rating}` : '—'} label={t('dashboard.companies.rating')} tone="warn" />}
          </div>
          <div className="dw-companies__trend">
            <span>{t('dashboard.companies.added')}</span>
            <Sparkline values={data.months.map((item) => item.count)} color="#4F46E5" />
          </div>
          <div className={`dw-companies__body${wide ? ' is-wide' : ''}`}>
            {showCountries && data.countries.length > 0 && (
              <div>
                <h5 className="dw-subhead">{t('dashboard.companies.countries')}</h5>
                <Bars data={data.countries.map((item) => ({ key: item.country, label: `${flagOf(item.country)} ${item.country}`, value: item.count, color: '#4F46E5' }))} />
              </div>
            )}
            {showRelations && data.relations.length > 0 && (
              <div>
                <h5 className="dw-subhead">{t('dashboard.companies.relations')}</h5>
                <Bars data={data.relations.map((item) => ({ key: item.key, label: item.label && item.label !== item.key ? item.label : relationLabel(t, { key: item.key }), value: item.count, color: item.color || '#0EA5E9' }))} />
              </div>
            )}
            {showRecent && data.recent.length > 0 && (
              <div>
                <h5 className="dw-subhead">{t('dashboard.companies.recent')}</h5>
                <ul className="dw-list">
                  {data.recent.map((company) => (
                    <li key={company.id}>
                      <Link to={`/app/companies/c/${company.id}`} className="dw-row">
                        <span className="dw-row__flag">{flagOf(company.country)}</span>
                        <span className="dw-row__text">
                          <strong>{company.name}</strong>
                          <em>{formatDateTime(company.createdAt, locale, { day: 'numeric', month: 'short' })}</em>
                        </span>
                        {company.rating != null && <span className="dw-row__meta">★ {company.rating}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </WidgetState>
  );
}
