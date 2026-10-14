import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Result, Segmented, Select, Spin } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { HelpButton } from '../../../help/Hint';
import { useMp, useProject } from '../MpContext';
import { EMPTY_FILTER, can, filterActive, formatArea, formatShortMoney, matches, shortLabel, statusColor } from '../lib';
import { FilterButton, Legend, SearchBox } from '../components/Filters';
import { Empty } from '../components/bits';
import UnitCard from '../components/UnitCard';
import { BulkPriceDialog, BulkStatusDialog } from '../components/BulkDialogs';
import { chessGrid, housesOf } from '../plan/chess';

export { chessGrid, housesOf };

/** Шахматка (spec §9.2): floors × apartments, colours by status, price / price per m² / area, group actions. */
export default function ChessPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { settings } = useMp();
  const [search, setSearch] = useSearchParams();
  const { project, tree, caps, data, error, reload, refreshUnits, presentation } = useProject();
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [show, setShow] = useState('price');
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(new Set());
  const [bulkPrice, setBulkPrice] = useState(null);
  const [bulkStatus, setBulkStatus] = useState(null);
  const houses = useMemo(() => (data ? housesOf(tree) : []), [data, tree]);
  const houseId = Number(search.get('house')) || houses[0]?.node.id || null;
  const house = houses.find((item) => item.node.id === houseId) || houses[0];
  const grid = useMemo(() => (house ? chessGrid(house, tree) : null), [house, tree]);
  const selectedId = Number(search.get('node')) || null;
  const filtering = filterActive(filter);
  const setParam = (key, value) => {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, String(value));
    else next.delete(key);
    setSearch(next, { replace: key !== 'node' });
  };

  if (error) return <Result status="warning" title={errorMessage(error)} extra={<Button onClick={reload}>{t('common.retry')}</Button>} />;
  if (!data) return <div className="page-fallback"><Spin /></div>;

  const value = (unit) => {
    const u = unit.unit;
    if (show === 'area') return formatArea(u.areaTotal, locale);
    if (show === 'ppm') return u.pricePerM2 !== undefined && u.pricePerM2 !== null ? t('mp.measure.perSqmShort', { price: formatShortMoney(u.pricePerM2, u.currency, locale) }) : '';
    return u.price !== undefined && u.price !== null ? formatShortMoney(u.price, u.currency, locale) : '';
  };
  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const done = (changed) => {
    setBulkPrice(null);
    setBulkStatus(null);
    if (changed) {
      refreshUnits([...picked]);
      setPicked(new Set());
    }
  };

  return (
    <div className={`mp-page mp-chesspage${selectedId ? ' has-card' : ''}`}>
      <header className="mp-head">
        <div>
          <h1>{t('mp.nav.chess')}</h1>
          <p>{project.name}</p>
        </div>
        <div className="mp-head__actions">
          <HelpButton id="masterplan" section="chess" />
        </div>
      </header>
      {!houses.length ? (
        <Empty icon="🏢" title={t('mp.chess.empty')} text={t('mp.chess.emptyText')} />
      ) : (
        <>
          <div className="mp-chess-toolbar-wrap">
            <div className="mod-toolbar mp-chess-toolbar">
              <div className="mp-chess-toolbar__group">
                <Select className="mp-chess-toolbar__house" value={house?.node.id} onChange={(id) => setParam('house', id)} options={houses.map((item) => ({ value: item.node.id, label: `${shortLabel(item.node)}${item.node.name && item.node.code ? ` · ${item.node.name}` : ''} (${item.units.length})` }))} popupMatchSelectWidth={false} aria-label={t('mp.chess.house')} />
                {can(caps, 'price.view') && (
                  <Segmented className="mp-chess-toolbar__show" value={show} onChange={setShow} options={[{ value: 'price', label: t('mp.chess.price') }, { value: 'ppm', label: t('mp.chess.ppm') }, { value: 'area', label: t('mp.chess.area') }]} />
                )}
              </div>
              <div className="mp-chess-toolbar__group is-grow">
                <SearchBox value={filter.q} onChange={(q) => setFilter({ ...filter, q })} />
                <FilterButton value={filter} onChange={setFilter} caps={caps} />
                {!presentation && (can(caps, 'price.edit') || can(caps, 'status.not_for_sale')) && (
                  <Button className="mp-chess-toolbar__pick" type={picking ? 'primary' : 'default'} onClick={() => { setPicking(!picking); setPicked(new Set()); }}>
                    {picking ? t('mp.chess.pickDone') : t('mp.chess.pick')}
                  </Button>
                )}
              </div>
            </div>
          </div>
          <Legend units={house.units} filter={filter} onChange={setFilter} caps={caps} />
          <div className="mp-chess" role="grid" aria-label={t('mp.nav.chess')}>
            <div className="mp-chess__scroll">
              <table>
                <thead>
                  <tr>
                    <th className="mp-chess__floor">{t('mp.chess.floor')}</th>
                    {grid.cols.map((col, index) => (
                      <th key={col.section?.id || index} colSpan={col.width} className="mp-chess__section">
                        {col.section ? col.section.name || shortLabel(col.section) : house.node.name || shortLabel(house.node)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.floors.map((floor) => (
                    <tr key={floor}>
                      <th className="mp-chess__floor">{floor}</th>
                      {grid.cols.map((col, ci) =>
                        (col.cells.get(floor) || new Array(col.width).fill(null)).map((unit, ri) =>
                          unit ? (
                            <td key={`${ci}-${ri}`}>
                              <button
                                type="button"
                                className={`mp-cell${filtering && !matches(unit, filter, user?.id) ? ' is-dim' : ''}${picked.has(unit.id) ? ' is-picked' : ''}${selectedId === unit.id ? ' is-selected' : ''}`}
                                style={{ '--c': unit.unit.status ? statusColor(unit.unit.status, settings) : '#94A3B8' }}
                                onClick={() => (picking ? toggle(unit.id) : setParam('node', unit.id))}
                                aria-pressed={picking ? picked.has(unit.id) : undefined}
                                title={`${unit.code} · ${unit.unit.status ? t(`mp.status.${unit.unit.status}`) : ''}`}
                              >
                                <b>{unit.unit.number || unit.code}</b>
                                <span>{unit.unit.rooms ? t('mp.chess.rooms', { n: unit.unit.rooms }) : ''}{unit.unit.rooms && unit.unit.areaTotal ? ' · ' : ''}{unit.unit.areaTotal ? formatArea(unit.unit.areaTotal, locale) : ''}</span>
                                <em>{value(unit)}</em>
                              </button>
                            </td>
                          ) : (
                            <td key={`${ci}-${ri}`} className="is-void" />
                          )
                        )
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {picking && picked.size > 0 && (
            <div className="mp-bulkbar" role="toolbar">
              <b>{t('mp.bulk.selected', { n: picked.size })}</b>
              {can(caps, 'price.edit') && <Button type="primary" onClick={() => setBulkPrice([...picked])}>{t('mp.bulk.price')}</Button>}
              {can(caps, 'status.not_for_sale') && <Button onClick={() => setBulkStatus({ ids: [...picked], to: 'not_for_sale' })}>{t('mp.bulk.close')}</Button>}
              {can(caps, 'status.open') && <Button onClick={() => setBulkStatus({ ids: [...picked], to: 'free' })}>{t('mp.bulk.open')}</Button>}
              <Button type="text" onClick={() => setPicked(new Set())}>{t('mp.bulk.clear')}</Button>
            </div>
          )}
        </>
      )}
      {selectedId && tree.byId.has(selectedId) && (
        <UnitCard key={selectedId} nodeId={selectedId} version={tree.byId.get(selectedId)?.unit?.version} presentation={presentation} onClose={() => setParam('node', null)} onChanged={(node) => (node ? refreshUnits([node.id]) : reload())} />
      )}
      <BulkPriceDialog ids={bulkPrice} onClose={done} />
      <BulkStatusDialog open={bulkStatus} onClose={done} />
    </div>
  );
}
