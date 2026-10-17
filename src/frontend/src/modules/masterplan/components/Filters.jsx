import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Input, InputNumber, Popover, Select, Space, Switch } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { useLocale } from '../../../context/LocaleContext';
import { useMp } from '../MpContext';
import { EMPTY_FILTER, STATUSES, can, countByStatus, filterActive, formatNumber, readinessColor, statusColor } from '../lib';

/** Status chips with counters; a click filters by that status (spec §9.1 legend). */
export function Legend({ units, filter, onChange, layer = 'sales', caps }) {
  const { t, locale } = useLocale();
  const { settings, types } = useMp();
  const counts = useMemo(() => countByStatus(units), [units]);
  if (layer === 'build') {
    return (
      <div className="mp-legend is-build" aria-label={t('mp.layer.build')} data-tour="mp.legend">
        <span className="mp-legend__scale" style={{ background: `linear-gradient(90deg, ${readinessColor(0)}, ${readinessColor(50)}, ${readinessColor(100)})` }} />
        <span className="mp-legend__ends"><span>0%</span><span>50%</span><span>100%</span></span>
      </div>
    );
  }
  if (layer === 'types') {
    const used = new Map();
    for (const node of units) if (node.type) used.set(node.type.category, (used.get(node.type.category) || 0) + 1);
    return (
      <div className="mp-legend" data-tour="mp.legend">
        {[...used].map(([category, n]) => (
          <span key={category} className="mp-legend__chip is-static" style={{ '--c': types.find((type) => type.category === category)?.color }}>
            <span className="mp-dot" />
            {t(`mp.category.${category}`)} <b>{formatNumber(n, locale)}</b>
          </span>
        ))}
      </div>
    );
  }
  if (!can(caps, 'status.view')) return null;
  const toggle = (status) => {
    const has = filter.statuses.includes(status);
    onChange({ ...filter, statuses: has ? filter.statuses.filter((item) => item !== status) : [...filter.statuses, status] });
  };
  return (
    <div className="mp-legend" role="group" aria-label={t('mp.legend')} data-tour="mp.legend">
      {STATUSES.filter((status) => counts[status] || filter.statuses.includes(status)).map((status) => (
        <button
          key={status}
          type="button"
          className={`mp-legend__chip${filter.statuses.includes(status) ? ' is-on' : ''}${filter.statuses.length && !filter.statuses.includes(status) ? ' is-off' : ''}`}
          style={{ '--c': statusColor(status, settings) }}
          onClick={() => toggle(status)}
          aria-pressed={filter.statuses.includes(status)}
        >
          <span className="mp-dot" />
          {t(`mp.status.${status}`)} <b>{formatNumber(counts[status] || 0, locale)}</b>
        </button>
      ))}
    </div>
  );
}

function Range({ label, min, max, onChange, step = 1 }) {
  const { t } = useLocale();
  return (
    <label className="mp-ffield">
      <span>{label}</span>
      <Space.Compact block>
        <InputNumber value={min} onChange={(value) => onChange(value, max)} placeholder={t('mp.filter.from')} min={0} step={step} style={{ width: '50%' }} />
        <InputNumber value={max} onChange={(value) => onChange(min, value)} placeholder={t('mp.filter.to')} min={0} step={step} style={{ width: '50%' }} />
      </Space.Compact>
    </label>
  );
}

/** The shared filter (§9.1): type, status, price, areas, bedrooms, finishing, stage, «только мои брони». */
export function FilterButton({ value, onChange, caps, stagesFor }) {
  const { t } = useLocale();
  const { types, meta, stages } = useMp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value, open]);
  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const active = filterActive({ ...value, q: '' });
  const count = ['statuses', 'types', 'finishing'].reduce((n, key) => n + (value[key]?.length ? 1 : 0), 0) + ['priceMin', 'priceMax', 'areaMin', 'areaMax', 'plotMin', 'plotMax', 'bedrooms', 'stage'].reduce((n, key) => n + (value[key] ? 1 : 0), 0) + (value.mine ? 1 : 0);
  const stageOptions = Object.entries(stages).flatMap(([set, list]) => (stagesFor && !stagesFor.includes(set) ? [] : list.map((stage) => ({ value: stage.id, label: `${stage.name}`, set }))));
  const content = (
    <div className="mp-filter">
      <div className="mp-filter__grid">
        {can(caps, 'status.view') && (
          <label className="mp-ffield is-wide">
            <span>{t('mp.filter.status')}</span>
            <Select mode="multiple" allowClear value={draft.statuses} onChange={(statuses) => set({ statuses })} options={STATUSES.map((status) => ({ value: status, label: t(`mp.status.${status}`) }))} placeholder={t('mp.filter.any')} maxTagCount="responsive" />
          </label>
        )}
        <label className="mp-ffield is-wide">
          <span>{t('mp.filter.type')}</span>
          <Select mode="multiple" allowClear value={draft.types} onChange={(list) => set({ types: list })} options={types.filter((type) => type.sellable).map((type) => ({ value: type.id, label: type.name }))} placeholder={t('mp.filter.any')} maxTagCount="responsive" optionFilterProp="label" />
        </label>
        {can(caps, 'price.view') && <Range label={t('mp.filter.price')} min={draft.priceMin} max={draft.priceMax} step={1000} onChange={(priceMin, priceMax) => set({ priceMin, priceMax })} />}
        <Range label={t('mp.filter.area')} min={draft.areaMin} max={draft.areaMax} onChange={(areaMin, areaMax) => set({ areaMin, areaMax })} />
        <Range label={t('mp.filter.plot')} min={draft.plotMin} max={draft.plotMax} step={50} onChange={(plotMin, plotMax) => set({ plotMin, plotMax })} />
        <label className="mp-ffield">
          <span>{t('mp.filter.bedrooms')}</span>
          <Segmented block value={draft.bedrooms || 0} onChange={(bedrooms) => set({ bedrooms: bedrooms || null })} options={[{ value: 0, label: t('mp.filter.anyShort') }, 1, 2, 3, 4, 5].map((item) => (typeof item === 'object' ? item : { value: item, label: `${item}+` }))} />
        </label>
        <label className="mp-ffield">
          <span>{t('mp.filter.finishing')}</span>
          <Select mode="multiple" allowClear value={draft.finishing} onChange={(finishing) => set({ finishing })} options={(meta?.finishings || []).map((key) => ({ value: key, label: t(`mp.finishing.${key}`) }))} placeholder={t('mp.filter.any')} maxTagCount="responsive" />
        </label>
        {can(caps, 'build.view') && (
          <label className="mp-ffield">
            <span>{t('mp.filter.stage')}</span>
            <Select allowClear showSearch optionFilterProp="label" value={draft.stage} onChange={(stage) => set({ stage: stage || null })} options={stageOptions} placeholder={t('mp.filter.any')} />
          </label>
        )}
        {can(caps, 'booking.view') && (
          <label className="mp-ffield is-switch">
            <Switch size="small" checked={draft.mine} onChange={(mine) => set({ mine })} />
            <span>{t('mp.filter.mine')}</span>
          </label>
        )}
      </div>
      <div className="mp-filter__foot">
        <Button onClick={() => { onChange({ ...EMPTY_FILTER, q: value.q }); setOpen(false); }}>{t('mp.filter.reset')}</Button>
        <Button type="primary" onClick={() => { onChange(draft); setOpen(false); }}>{t('mp.filter.apply')}</Button>
      </div>
    </div>
  );
  return (
    <Popover open={open} onOpenChange={setOpen} trigger="click" content={content} placement="bottomLeft" overlayClassName="mp-filter-pop" destroyTooltipOnHide>
      <Button className={`mp-filter-btn${active ? ' is-active' : ''}`} icon={<FunnelIcon />}>
        <span className="mp-hide-sm">{t('mp.filter.title')}</span>
        {count > 0 && <Badge count={count} size="small" color="var(--da-primary)" />}
      </Button>
    </Popover>
  );
}

export function SearchBox({ value, onChange }) {
  const { t } = useLocale();
  const [text, setText] = useState(value || '');
  useEffect(() => setText(value || ''), [value]);
  useEffect(() => {
    const timer = setTimeout(() => text !== (value || '') && onChange(text), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return <Input.Search allowClear className="mp-search" value={text} onChange={(event) => setText(event.target.value)} placeholder={t('mp.filter.search')} aria-label={t('mp.filter.search')} />;
}

function FunnelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 3.5h11L9.3 8.6v4l-2.6 1.2V8.6L2.5 3.5Z" />
    </svg>
  );
}
