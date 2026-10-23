/* Dashboard widgets of the File server (registered in register.js): shares and shortcuts, activity. */

import { Link } from 'react-router-dom';
import { useLocale } from '../../context/LocaleContext';
import { EntryIcon } from './components/EntryList';
import { fileUrl, folderUrl } from './api';
import { useWidgetData } from '../../platform/widgets/api';
import { Bars, TimeChart } from '../../platform/widgets/charts';
import { Kpi, WidgetState, When, longDay, shortDay } from '../../platform/widgets/common';
import './drive.css';

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
