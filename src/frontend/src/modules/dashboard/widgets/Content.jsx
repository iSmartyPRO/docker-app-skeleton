import { Link } from 'react-router-dom';
import { Avatar } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { useSettings } from '../../../context/SettingsContext';
import { formatBytes, formatDateTime } from '../../../lib/format';
import { FileIcon } from '../../kb/components/Icons';
import { EntryIcon } from '../../drive/components/EntryList';
import { fileUrl, folderUrl } from '../../drive/api';
import ResourceIcon from '../../resources/components/ResourceIcon';
import { itemText } from '../../resources/api';
import { MODULE_REGISTRY } from '../../registry';
import { relationLabel } from '../../companies/api';
import { useWidgetData } from '../api';
import { Bars, Meter, Sparkline, TimeChart } from '../charts';
import { Kpi, WidgetState, When, flagOf, initials, longDay, shortDay } from './common';

// ── Files ───────────────────────────────────────────────────────────────────

export function RecentFiles({ widget }) {
  const { t } = useLocale();
  const state = useWidgetData('recentFiles', widget.settings);
  const data = state.data;
  return (
    <div className="dw-files">
      {data && widget.settings.showUsage !== false && (
        <div className="dw-usage">
          <div className="dw-usage__text">
            <span>{t('dashboard.files.usage')}</span>
            <b>
              {formatBytes(data.usage.used)}
              {data.usage.quota ? ` / ${formatBytes(data.usage.quota)}` : ''}
            </b>
          </div>
          {data.usage.quota > 0 && <Meter value={data.usage.used} max={data.usage.quota} />}
        </div>
      )}
      <WidgetState state={state} empty={data && !data.items.length ? t('dashboard.files.empty') : null} emptyIcon="📁">
        <ul className="dw-list">
          {(data?.items || []).map((node) => (
            <li key={node.id}>
              <Link to={`/app/files/v/${node.id}`} className="dw-row">
                <FileIcon item={{ kind: 'file', file: { ext: node.ext } }} size={30} />
                <span className="dw-row__text">
                  <strong>{node.name}</strong>
                  <em>{formatBytes(node.size)}</em>
                </span>
                <span className="dw-row__meta">
                  <When value={node.updatedAt} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </WidgetState>
    </div>
  );
}

const STATE_COLOR = { ok: '#10B981', auth: '#F59E0B', offline: '#EF4444', denied: '#94A3B8', missing: '#94A3B8' };

export function Drive({ widget, size }) {
  const { t } = useLocale();
  const state = useWidgetData('drive', widget.settings);
  const data = state.data;
  return (
    <WidgetState state={state}>
      {data && (
        <div className="dw-drive">
          {widget.settings.showShares !== false && data.shares.length > 0 && (
            <div className="dw-drive__shares">
              {data.shares.slice(0, size.w >= 6 ? 8 : 4).map((share) => (
                <Link key={share.id} to={folderUrl(share.id)} className="dw-share" style={{ '--c': share.color }}>
                  <i style={{ background: STATE_COLOR[share.state] || '#94A3B8' }} />
                  {share.title}
                </Link>
              ))}
            </div>
          )}
          <h5 className="dw-subhead">{t(widget.settings.list === 'favorites' ? 'dashboard.drive.favorites' : 'dashboard.drive.recent')}</h5>
          {data.items.length ? (
            <ul className="dw-list">
              {data.items.map((item) => (
                <li key={`${item.shareId}:${item.path}`}>
                  <Link to={item.dir ? folderUrl(item.shareId, item.path) : fileUrl(item.shareId, item.path)} className="dw-row">
                    <EntryIcon entry={{ dir: item.dir, ext: item.ext, name: item.name }} size={30} />
                    <span className="dw-row__text">
                      <strong>{item.name}</strong>
                      <em>{item.shareTitle}</em>
                    </span>
                    <span className="dw-row__meta">
                      <When value={item.at} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <span className="dw-muted">{t('dashboard.drive.empty')}</span>
          )}
        </div>
      )}
    </WidgetState>
  );
}

// ── Knowledge base ──────────────────────────────────────────────────────────

export function KbRecent({ widget }) {
  const { t } = useLocale();
  const state = useWidgetData('kbRecent', widget.settings);
  const data = state.data;
  return (
    <WidgetState state={state} empty={data && !data.items.length ? t('dashboard.kb.empty') : null} emptyIcon="📚">
      <ul className="dw-list">
        {(data?.items || []).map((item) => (
          <li key={item.id}>
            <Link to={`/app/kb/d/${item.id}`} className="dw-row">
              <FileIcon item={item} size={30} />
              <span className="dw-row__text">
                <strong>{item.title}</strong>
                {item.author && <em>{item.author}</em>}
              </span>
              <span className="dw-row__meta">
                <When value={item.updatedAt} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetState>
  );
}

// ── Online resources ────────────────────────────────────────────────────────

export function Links({ widget, size }) {
  const { t, locale } = useLocale();
  const { settings } = useSettings();
  const state = useWidgetData('links', widget.settings);
  const items = state.data?.items || [];
  const list = widget.settings.style === 'list';
  return (
    <WidgetState state={state} empty={state.data && !items.length ? t('dashboard.links.empty') : null} emptyIcon="🧭">
      <div className={`dw-links${list ? ' is-list' : ''}`} style={{ '--tile': size.w >= 6 ? '92px' : '80px' }}>
        {items.map((item) => {
          const text = itemText(item, { locale, t, settings, registry: MODULE_REGISTRY });
          const href = item.kind === 'module' ? `/app/${item.module}` : item.url;
          const inner = (
            <>
              <ResourceIcon icon={item.icon} title={text.title} size={list ? 32 : 44} />
              <span className="dw-links__text">
                <strong>{text.title}</strong>
                {list && text.description && <em>{text.description}</em>}
              </span>
            </>
          );
          return item.kind === 'module' ? (
            <Link key={item.id} to={href} className="dw-links__item" title={text.description || text.title}>
              {inner}
            </Link>
          ) : (
            <a key={item.id} href={href} className="dw-links__item" title={text.description || text.title} target={item.target === 'blank' ? '_blank' : undefined} rel="noopener noreferrer">
              {inner}
            </a>
          );
        })}
      </div>
    </WidgetState>
  );
}

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

// ── Console: people and file server activity ────────────────────────────────

export function People({ widget, size }) {
  const { t, locale } = useLocale();
  const state = useWidgetData('people', widget.settings);
  const data = state.data;
  const sum = (list) => list.reduce((total, value) => total + value, 0);
  return (
    <WidgetState state={state} rows={5}>
      {data && (
        <div className="dw-people">
          <div className="dw-kpis">
            <Kpi value={data.total} label={t('dashboard.people.total')} to="/admin/users" />
            <Kpi value={data.active30d} label={t('dashboard.people.active')} tone="ok" />
            <Kpi value={data.joined} label={t('dashboard.people.joined', { n: data.days.length })} />
            {size.w >= 5 && <Kpi value={sum(data.failed)} label={t('dashboard.people.failed')} tone={sum(data.failed) ? 'danger' : null} to="/admin/activity" />}
          </div>
          <div className="dw-people__chart">
            <TimeChart
              labels={data.days}
              type="stack"
              height={Math.max(110, size.h * 56 - 150)}
              series={[
                { key: 'ok', label: t('dashboard.people.logins'), color: '#6366F1', values: data.logins },
                { key: 'failed', label: t('dashboard.people.failed'), color: '#F43F5E', values: data.failed },
              ]}
              formatLabel={(key) => shortDay(key, locale)}
              formatTip={(key) => longDay(key, locale)}
            />
          </div>
          {size.h >= 6 && data.recent.length > 0 && (
            <div className="dw-people__recent">
              <span>{t('dashboard.people.recent')}</span>
              <Avatar.Group max={{ count: 5 }} size={28}>
                {data.recent.map((person) => (
                  <Avatar key={person.id} src={person.avatarUrl || undefined} title={person.name}>
                    {initials(person.name)}
                  </Avatar>
                ))}
              </Avatar.Group>
            </div>
          )}
        </div>
      )}
    </WidgetState>
  );
}

const GROUP_COLORS = { browse: '#94A3B8', download: '#3B82F6', change: '#10B981', delete: '#EF4444' };

export function DriveActivity({ widget, size }) {
  const { t, locale } = useLocale();
  const state = useWidgetData('driveActivity', widget.settings);
  const data = state.data;
  return (
    <WidgetState state={state} rows={5}>
      {data && (
        <div className="dw-dact">
          <div className="dw-kpis">
            <Kpi value={data.events} label={t('dashboard.dact.events')} to="/app/drive/activity" />
            <Kpi value={data.people} label={t('dashboard.dact.people')} />
            <Kpi value={data.failures} label={t('dashboard.dact.failures')} tone={data.failures ? 'danger' : null} to="/app/drive/activity?result=failed" />
          </div>
          <div className={`dw-dact__body${size.w >= 7 ? ' is-wide' : ''}`}>
            <div className="dw-dact__chart">
              <TimeChart
                labels={data.days}
                type="stack"
                height={Math.max(110, size.h * 56 - 140)}
                series={Object.entries(data.series).map(([key, values]) => ({ key, label: t(`driveActivity.groups.${key}`), color: GROUP_COLORS[key], values }))}
                formatLabel={(key) => shortDay(key, locale)}
                formatTip={(key) => longDay(key, locale)}
              />
            </div>
            {size.w >= 7 && data.top.length > 0 && (
              <div>
                <h5 className="dw-subhead">{t('driveActivity.topUsers')}</h5>
                <Bars data={data.top.map((person) => ({ key: person.id, label: person.name, value: person.count, color: '#6366F1' }))} />
              </div>
            )}
          </div>
        </div>
      )}
    </WidgetState>
  );
}
