import { useEffect, useRef } from 'react';
import { Input, Select, Switch } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { nodeLabel, shortLabel } from '../lib';

/*
 * The list of objects for the point editor: objects without a placement on
 * this plan (or all, with «Показывать размещённые»), filtered by sector, type
 * and text. Keyboard: ↑ / ↓ in the search field or the list choose the object
 * to place, Enter takes the first one; the chosen object is then placed by a
 * click on the plan.
 */
export default function MarkerPicker({ items, armedId, onArm, filters, onFilters, sectors, types, placements, colorOf }) {
  const { t } = useLocale();
  const listRef = useRef(null);

  useEffect(() => {
    if (!armedId || !listRef.current) return;
    listRef.current.querySelector(`[data-node="${armedId}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [armedId]);

  const step = (delta) => {
    if (!items.length) return;
    const index = items.findIndex((node) => node.id === armedId);
    const next = index < 0 ? (delta > 0 ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, index + delta));
    onArm(items[next].id);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      step(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && !armedId && items[0]) {
      event.preventDefault();
      onArm(items[0].id);
    }
  };

  return (
    <div className="mp-mkx__picker">
      <Input.Search allowClear placeholder={t('mp.mk.search')} value={filters.q} onChange={(event) => onFilters({ ...filters, q: event.target.value })} onKeyDown={onKeyDown} aria-label={t('mp.mk.search')} />
      <div className="mp-mkx__filters">
        <Select allowClear placeholder={t('mp.mk.anySector')} value={filters.sector ?? undefined} onChange={(value) => onFilters({ ...filters, sector: value ?? null })} options={sectors.map((node) => ({ value: node.id, label: nodeLabel(node) }))} aria-label={t('mp.mk.sector')} popupMatchSelectWidth={false} />
        <Select allowClear placeholder={t('mp.mk.anyType')} value={filters.type ?? undefined} onChange={(value) => onFilters({ ...filters, type: value ?? null })} options={types.map((type) => ({ value: type.id, label: type.name }))} aria-label={t('mp.mk.type')} popupMatchSelectWidth={false} />
      </div>
      <label className="mp-mkx__toggle">
        <Switch size="small" checked={filters.showPlaced} onChange={(value) => onFilters({ ...filters, showPlaced: value })} />
        <span>{t('mp.mk.showPlaced')}</span>
      </label>
      <ul className="mp-mkx__list" ref={listRef} tabIndex={0} onKeyDown={onKeyDown} role="listbox" aria-label={t('mp.mk.listAria')} aria-activedescendant={armedId ? `mk-opt-${armedId}` : undefined}>
        {items.map((node) => {
          const placed = placements.get(node.id);
          return (
            <li key={node.id} id={`mk-opt-${node.id}`} role="option" aria-selected={node.id === armedId}>
              <button type="button" tabIndex={-1} data-node={node.id} className={`mp-mkx__item${node.id === armedId ? ' is-active' : ''}`} onClick={() => onArm(node.id === armedId ? null : node.id)}>
                <span className={`mp-mkx__dot${placed ? ' is-placed' : ''}`} style={{ background: colorOf(node) }}>{shortLabel(node)}</span>
                <span className="mp-mkx__name">{node.name && node.name !== node.code ? node.name : node.type?.name || ''}</span>
                {placed && <small>{placed.kind === 'marker' ? `● ${t('mp.mk.isPoint')}` : `◆ ${t('mp.mk.isContour')}`}</small>}
              </button>
            </li>
          );
        })}
        {!items.length && <li className="mp-mkx__empty">{filters.q || filters.sector || filters.type ? t('mp.mk.nothing') : t('mp.mk.noneLeft')}</li>}
      </ul>
    </div>
  );
}
