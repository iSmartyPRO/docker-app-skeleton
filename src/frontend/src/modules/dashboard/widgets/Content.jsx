import { Avatar } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { useWidgetData } from '../../../platform/widgets/api';
import { TimeChart } from '../../../platform/widgets/charts';
import { Kpi, WidgetState, initials, longDay, shortDay } from '../../../platform/widgets/common';

// ── Console: people ────────────────────────────────

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
