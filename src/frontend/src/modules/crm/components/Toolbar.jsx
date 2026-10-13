import { Dropdown, Segmented, Select } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../../../context/LocaleContext';
import { useCrm } from '../CrmContext';
import { Glyph } from './bits';

/** Pipeline Select with open-deal counts and «Настроить воронки» for admins. */
export function PipelineSwitcher({ value, onChange }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { pipelines, canAdmin } = useCrm();
  return (
    <Select
      className="crm-pipeline-select"
      value={value}
      onChange={(next) => (next === '__setup' ? navigate('/app/crm/pipelines') : onChange(next))}
      popupMatchSelectWidth={260}
      aria-label={t('crm.pipeline')}
      options={[
        ...pipelines.map((pipeline) => ({
          value: pipeline.id,
          label: (
            <span className="crm-pipe-opt">
              <span className="mod-dot" style={{ '--c': pipeline.color }} />
              <span className="crm-pipe-opt__name">{pipeline.name}</span>
              {pipeline.counts?.open > 0 && <em>{pipeline.counts.open}</em>}
            </span>
          ),
        })),
        ...(canAdmin ? [{ value: '__setup', label: <span className="crm-pipe-opt is-setup">⚙ {t('crm.pipelines.setup')}</span> }] : []),
      ]}
    />
  );
}

const VIEW_ICONS = {
  kanban: 'columns',
  list: 'filter',
  activities: 'clock',
  calendar: 'flag',
};

export function ViewSwitch({ value, onChange }) {
  const { t } = useLocale();
  return (
    <Segmented
      className="crm-views"
      value={value}
      onChange={onChange}
      aria-label={t('crm.views.label')}
      options={['kanban', 'list', 'activities', 'calendar'].map((view) => ({
        value: view,
        label: (
          <span className="crm-views__opt">
            <span className="crm-views__icon" aria-hidden="true">{view === 'list' ? <ListIcon /> : view === 'calendar' ? <CalIcon /> : <Glyph name={VIEW_ICONS[view]} size={14} />}</span>
            <span className="crm-views__text">{t(`crm.views.${view}`)}</span>
          </span>
        ),
      }))}
    />
  );
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
    </svg>
  );
}

function CalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" rx="2.5" />
      <path d="M5 1.8v2.6M11 1.8v2.6M2 7h12" />
    </svg>
  );
}

const COUNTERS = [
  { key: 'overdue', tone: 'alert' },
  { key: 'today', tone: 'warn' },
  { key: 'planned', tone: 'info' },
  { key: 'none', tone: 'muted' },
];

/** Activity counters as toggle chips: a click narrows the deals to that state. */
export function CounterChips({ counters, value, onChange }) {
  const { t } = useLocale();
  return (
    <div className="crm-counters" role="group" aria-label={t('crm.counters.label')}>
      {COUNTERS.map(({ key, tone }) => {
        const n = counters?.[key];
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            className={`crm-counter is-${tone}${on ? ' is-on' : ''}${!n ? ' is-zero' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(on ? undefined : key)}
          >
            <span>{t(`crm.counters.${key}`)}</span>
            <b>{counters ? n ?? 0 : '·'}</b>
          </button>
        );
      })}
    </div>
  );
}

/** «Создать»: the dialog, or a quick deal with three fields. */
export function CreateButton({ onFull, onQuick, block }) {
  const { t } = useLocale();
  return (
    <Dropdown.Button
      type="primary"
      onClick={onFull}
      className={block ? 'crm-create is-block' : 'crm-create'}
      menu={{
        items: [
          { key: 'full', label: t('crm.create.full'), onClick: onFull },
          { key: 'quick', label: t('crm.create.quick'), onClick: onQuick },
        ],
      }}
    >
      ＋ {t('common.create')}
    </Dropdown.Button>
  );
}
