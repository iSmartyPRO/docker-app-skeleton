import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Segmented, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { useMp } from '../MpContext';
import { STATUSES, descendants, formatArea, formatMoney, formatNumber, statusColor } from '../lib';
import { chessGrid } from '../plan/chess';

/*
 * The parts of the unified card that only a building with several units has
 * (docs/masterplan.md "Unified card"): free of total with the status bar and
 * the price range, the composition by rooms, the mini-chessboard with the
 * unit picker. The aggregate comes from the server (already field-hidden);
 * the mini-chessboard uses the live map of the project.
 */

const areaRange = (area, locale) => (!area ? '—' : area.min === area.max ? formatArea(area.min, locale) : `${formatNumber(area.min, locale, 1)}–${formatArea(area.max, locale)}`);

export function roomsLabel(t, rooms, typeName) {
  if (rooms === null || rooms === undefined) return typeName || '—';
  return rooms === 0 ? t('mp.bld.studio') : t('mp.bld.rooms', { n: rooms });
}

/** "Свободно 18 из 23" with the bar by status, "от $X до $Y", "$a–$b / м²". */
export function BuildingHead({ building, presentation }) {
  const { t, locale } = useLocale();
  const { settings } = useMp();
  const money = (value) => formatMoney(value, building.currency, locale);
  return (
    <div className="mp-bhead">
      {building.free !== null ? (
        <div className="mp-bhead__free">
          <b>{t('mp.bld.freeOf', { free: formatNumber(building.free, locale), total: formatNumber(building.total, locale) })}</b>
          {building.byStatus && (
            <div className="mp-statusbar" role="img" aria-label={t('mp.card.byStatus')}>
              {STATUSES.filter((status) => building.byStatus[status]).map((status) => (
                <span key={status} style={{ flex: building.byStatus[status], background: statusColor(status, settings) }} title={`${t(`mp.status.${status}`)}: ${building.byStatus[status]}`} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <b>{t('mp.plan.units', { n: building.total })}</b>
      )}
      {building.price && (
        <div className="mp-card__price">
          <span className="mp-money">{building.price.min === building.price.max ? money(building.price.min) : t('mp.bld.range', { from: money(building.price.min), to: money(building.price.max) })}</span>
          {building.ppm && <span>{building.ppm.min === building.ppm.max ? money(building.ppm.min) : `${money(building.ppm.min)}–${money(building.ppm.max)}`} / м²</span>}
        </div>
      )}
      {building.prices && building.free > 0 && !building.price && !presentation && <span className="mp-muted mp-small">{t('mp.bld.noPrices')}</span>}
    </div>
  );
}

/**
 * Composition by rooms (type · area · free / total · price from) with a
 * one-click reserve of the first free unit of a row, and the mini-chessboard
 * (floors × units) with the picker by rooms and floor.
 */
export default function BuildingBlock({ node, building, tree, projectId, presentation, canReserve, onOpenUnit, onReserve }) {
  const { t, locale } = useLocale();
  const { settings } = useMp();
  const [rooms, setRooms] = useState('all');
  const [floor, setFloor] = useState('all');

  const house = useMemo(() => {
    if (!tree || !tree.byId.has(node.id)) return null;
    const units = descendants(tree, node.id).filter((item) => item.unit && item.unit.floor !== null && item.unit.floor !== undefined);
    return units.length ? { node: tree.byId.get(node.id), units } : null;
  }, [tree, node.id]);
  const grid = useMemo(() => (house ? chessGrid(house, tree) : null), [house, tree]);
  const roomOptions = building.composition.filter((row) => row.rooms !== null);
  const picking = rooms !== 'all' || floor !== 'all';
  const fits = (unit) => (rooms === 'all' || unit.unit.rooms === rooms) && (floor === 'all' || unit.unit.floor === floor);
  const matching = house ? house.units.filter((unit) => fits(unit) && unit.unit.status === 'free') : [];

  /** The first unit of a row that is still free in the live map. */
  const firstFree = (row) => (row.freeIds || []).map((id) => tree?.byId.get(id)).find((item) => item?.unit?.status === 'free') || null;

  return (
    <div className="mp-bblock">
      {building.composition.length > 0 && (
        <section className="mp-comp" aria-label={t('mp.bld.composition')}>
          <h4>{t('mp.bld.composition')}</h4>
          <div className="mp-comp__table" role="table">
            <div className="mp-comp__row is-head" role="row">
              <span role="columnheader">{t('mp.bld.type')}</span>
              <span role="columnheader">{t('mp.f.area')}</span>
              <span role="columnheader">{building.free !== null ? t('mp.bld.freeTotal') : t('mp.bld.total')}</span>
              <span role="columnheader">{t('mp.bld.priceFrom')}</span>
              {canReserve && !presentation && <span role="columnheader" aria-label={t('mp.action.btn.reserve')} />}
            </div>
            {building.composition.map((row) => {
              const unit = canReserve && !presentation && row.free ? firstFree(row) : null;
              const active = row.rooms !== null && rooms === row.rooms;
              return (
                <div key={row.key} className={`mp-comp__row${active ? ' is-active' : ''}`} role="row">
                  <span role="cell">
                    {row.rooms !== null ? (
                      <button type="button" className="mp-comp__pick" onClick={() => setRooms(active ? 'all' : row.rooms)} aria-pressed={active} title={t('mp.bld.pickRooms')}>
                        {roomsLabel(t, row.rooms, row.typeName)}
                      </button>
                    ) : (
                      roomsLabel(t, row.rooms, row.typeName)
                    )}
                  </span>
                  <span role="cell">{areaRange(row.area, locale)}</span>
                  <span role="cell" className={row.free === 0 ? 'mp-muted' : ''}>{row.free !== null ? `${formatNumber(row.free, locale)} / ${formatNumber(row.total, locale)}` : formatNumber(row.total, locale)}</span>
                  <span role="cell">{row.priceFrom !== null ? formatMoney(row.priceFrom, building.currency, locale) : '—'}</span>
                  {canReserve && !presentation && (
                    <span role="cell">
                      {unit && (
                        <Tooltip title={t('mp.bld.reserveHint', { code: unit.code || unit.name, floor: unit.unit.floor ?? '—' })}>
                          <Button size="small" type="primary" ghost onClick={() => onReserve(unit)}>{t('mp.bld.reserve')}</Button>
                        </Tooltip>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {grid && (
        <section className="mp-mini" aria-label={t('mp.bld.units')}>
          <div className="mp-mini__head">
            <h4>{t('mp.bld.units')}</h4>
            <Link className="mp-mini__open" to={`/app/masterplan/p/${projectId}/chess?house=${node.id}${presentation ? '&presentation=1' : ''}`}>{t('mp.bld.openChess')} →</Link>
          </div>
          <div className="mp-mini__pick">
            {roomOptions.length > 1 && (
              <Segmented size="small" value={rooms} onChange={setRooms} options={[{ value: 'all', label: t('mp.bld.all') }, ...roomOptions.map((row) => ({ value: row.rooms, label: roomsLabel(t, row.rooms) }))]} aria-label={t('mp.bld.pickRooms')} />
            )}
            {building.floors.length > 1 && (
              <Segmented size="small" value={floor} onChange={setFloor} options={[{ value: 'all', label: t('mp.bld.allFloors') }, ...building.floors.map((value) => ({ value, label: t('mp.bld.floorN', { n: value }) }))]} aria-label={t('mp.chess.floor')} />
            )}
          </div>
          {picking && building.free !== null && <p className="mp-mini__found">{matching.length ? t('mp.bld.found', { n: matching.length }) : t('mp.bld.foundNone')}</p>}
          <div className="mp-mini__grid">
            {grid.floors.map((level) => (
              <div key={level} className="mp-mini__row">
                <span className="mp-mini__floor">{level}</span>
                {grid.cols.map((col, ci) => (
                  <div key={ci} className={`mp-mini__sec${col.width > 10 ? ' is-dense' : ''}`} style={{ gridTemplateColumns: `repeat(${col.width}, minmax(0, 1fr))` }}>
                    {(col.cells.get(level) || new Array(col.width).fill(null)).map((unit, index) => {
                      if (!unit) return <span key={index} className="mp-mini__cell is-empty" />;
                      const u = unit.unit;
                      const dim = picking && !(fits(unit) && u.status === 'free');
                      const title = [unit.code || unit.name, u.rooms !== null && u.rooms !== undefined ? roomsLabel(t, u.rooms) : null, u.areaTotal ? formatArea(u.areaTotal, locale) : null, u.status ? t(`mp.status.${u.status}`) : null, u.price !== null && u.price !== undefined ? formatMoney(u.price, u.currency, locale) : null].filter(Boolean).join(' · ');
                      return (
                        <button
                          key={unit.id}
                          type="button"
                          className={`mp-mini__cell${dim ? ' is-dim' : ''}${u.status === 'free' ? ' is-free' : ''}`}
                          style={{ '--c': u.status ? statusColor(u.status, settings) : '#94A3B8' }}
                          onClick={() => onOpenUnit(unit.id)}
                          title={title}
                          aria-label={title}
                        >
                          <b>{String(u.number ?? unit.code ?? '').slice(-2)}</b>
                          {u.rooms !== null && u.rooms !== undefined && <i>{u.rooms}</i>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
