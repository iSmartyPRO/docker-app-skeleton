import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { App, Button, Grid, Input, Skeleton, Table, TreeSelect } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { DownloadOutlined, SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { HelpButton } from '../../../help/Hint';
import { ScanButton } from '../../../components/ui/BarcodeScanner';
import { fmtDate } from '../../../lib/datetime';
import { whApi, csvUrl } from '../api';
import { useWh } from '../WhContext';
import { STOCK_CHIPS, categoryTree, formatQty, readStore, scanFeedback, whError, writeStore } from '../lib';
import { Chips, Empty, Hero, Money, Qty, WarehouseSelect } from '../components/bits';
import ItemCard from '../card/ItemCard';

/** Splits rows into titled groups (warehouse, category or holder), in order of appearance. */
function groupRows(rows, group, categories, t) {
  const groups = new Map();
  for (const row of rows) {
    let key;
    let title;
    if (group === 'category') {
      key = row.item.category?.id || 0;
      title = categories.find((c) => c.id === key)?.name || t('wh.stock.noCategory');
    } else if (group === 'holder') {
      key = `${row.holder.type}:${row.holder.id}`;
      title = row.holder.label;
    } else if (group === 'bin') {
      key = row.bin?.id || 0;
      title = row.bin?.path || t('wh.stock.noBin');
    } else {
      key = row.warehouse.id;
      title = row.warehouse.name;
    }
    if (!groups.has(key)) groups.set(key, { key, title, rows: [], holderType: row.holder?.type });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
}

export default function StockPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const { meta, warehouses, version } = useWh();
  const [search, setSearch] = useSearchParams();
  const stored = useMemo(() => readStore(`wh:stock:${user?.id}`, {}), [user?.id]);
  const chip = search.get('chip') || undefined;
  const warehouse = search.get('warehouse') ? Number(search.get('warehouse')) : stored.warehouse || null;
  const group = search.get('group') || stored.group || 'warehouse';
  const category = search.get('category') ? Number(search.get('category')) : null;
  const itemId = search.get('item') ? Number(search.get('item')) : null;
  const [q, setQ] = useState(search.get('q') || '');
  const [data, setData] = useState(null);
  const [ordering, setOrdering] = useState(false);
  const binsOn = Boolean(warehouses.find((w) => w.id === warehouse)?.binsEnabled);

  const setParam = useCallback(
    (patch) => {
      const next = new URLSearchParams(search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      setSearch(next, { replace: true });
      if ('warehouse' in patch || 'group' in patch) writeStore(`wh:stock:${user?.id}`, { warehouse: 'warehouse' in patch ? patch.warehouse || null : warehouse, group: patch.group || group });
    },
    [search, setSearch, user?.id, warehouse, group]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((search.get('q') || '') !== q) setParam({ q: q || undefined });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const effectiveGroup = group === 'bin' && !binsOn ? 'warehouse' : group;
  const params = useMemo(() => ({ chip, warehouse: warehouse || undefined, group: effectiveGroup === 'category' ? 'category' : effectiveGroup, category: category || undefined, q: search.get('q') || undefined, pageSize: 500 }), [chip, warehouse, effectiveGroup, category, search]);
  const key = JSON.stringify(params);
  useEffect(() => {
    let alive = true;
    setData(null);
    whApi
      .stock(params)
      .then((res) => alive && setData(res.data))
      .catch((err) => {
        if (alive) setData({ items: [], total: 0 });
        message.error(whError(err, t));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const openItem = (id) => setParam({ item: id });
  const onScan = async (code) => {
    try {
      const res = await whApi.resolve(code, warehouse || undefined);
      scanFeedback(true);
      if (res.data.item) openItem(res.data.item.id);
      else if (res.data.kind === 'bin') setParam({ warehouse: res.data.bin.warehouseId, group: 'bin', q: res.data.bin.path });
      else if (res.data.kind === 'document') navigate(`/app/warehouse/documents/${res.data.document.id}`);
      else if (res.data.kind === 'warehouse') setParam({ warehouse: res.data.warehouse.id });
    } catch (err) {
      scanFeedback(false);
      message.warning(whError(err, t));
    }
  };

  const orderBelowMin = async () => {
    setOrdering(true);
    try {
      const res = await whApi.orderForWarehouse({ warehouseId: warehouse, belowMin: true });
      message.success(t('wh.stock.ordered', { number: res.data.request.number }));
      navigate(`/app/procurement/requests/${res.data.request.id}/edit`);
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setOrdering(false);
    }
  };

  const cost = meta.rights.cost;
  const holderMode = effectiveGroup === 'holder';
  const columns = [
    {
      key: 'item',
      title: t('wh.fields.item'),
      // Keeps the name readable when the page is narrow: the table scrolls instead.
      width: 240,
      render: (_, row) => (
        <span className="wh-item-cell">
          <strong>{row.item.name}</strong>
          <em>{[row.item.sku, row.item.tracking !== 'quantity' ? t(`wh.tracking.${row.item.tracking}`) : null].filter(Boolean).join(' · ')}</em>
        </span>
      ),
    },
    !holderMode && effectiveGroup !== 'bin' && effectiveGroup !== 'warehouse' && { key: 'warehouse', title: t('wh.fields.warehouse'), width: 170, ellipsis: true, render: (_, row) => row.warehouse?.name },
    { key: 'qty', title: t('wh.fields.onHand'), align: 'right', width: 130, render: (_, row) => <Qty value={row.qty} unit={row.item.baseUnit} strong tone={row.flags?.out ? 'red' : row.flags?.belowMin ? 'amber' : null} /> },
    !holderMode && effectiveGroup !== 'bin' && { key: 'reserved', title: t('wh.fields.reserved'), align: 'right', width: 110, render: (_, row) => (row.reserved ? <Qty value={row.reserved} /> : <span className="wh-muted">—</span>) },
    !holderMode && effectiveGroup !== 'bin' && { key: 'available', title: t('wh.fields.available'), align: 'right', width: 120, render: (_, row) => <Qty value={row.available} tone={row.available <= 0 ? 'red' : null} /> },
    !holderMode && effectiveGroup !== 'bin' && { key: 'min', title: t('wh.fields.minQty'), align: 'right', width: 100, render: (_, row) => (row.minQty ? formatQty(row.minQty, locale) : <span className="wh-muted">—</span>) },
    cost && { key: 'amount', title: t('wh.fields.amount'), align: 'right', width: 130, render: (_, row) => <Money amount={row.amount} /> },
    { key: 'last', title: t('wh.fields.lastMove'), width: 130, render: (_, row) => (row.lastMoveAt ? fmtDate(row.lastMoveAt) : '—') },
    !holderMode && effectiveGroup !== 'bin' && {
      key: 'flags',
      title: '',
      width: 120,
      render: (_, row) => (
        <span className="wh-flags">
          {row.flags?.belowMin && <span className="wh-flag is-amber">{t('wh.flags.belowMin')}</span>}
          {row.flags?.expiring && <span className={`wh-flag ${row.flags.expired ? 'is-red' : 'is-amber'}`}>{t(row.flags.expired ? 'wh.flags.expired' : 'wh.flags.expiring')}</span>}
          {row.flags?.stale && <span className="wh-flag">{t('wh.flags.stale')}</span>}
          {row.inTransit > 0 && <span className="wh-flag is-violet">{t('wh.flags.inTransit', { n: formatQty(row.inTransit, locale) })}</span>}
        </span>
      ),
    },
  ].filter(Boolean);

  const groups = data ? groupRows(data.items, effectiveGroup, meta.categories, t) : [];
  const showOrder = chip === 'below_min' && warehouse && meta.modules?.procurement && (data?.total || 0) > 0;

  return (
    <div className="wh-page">
      <Hero icon="archive" title={t('wh.nav.stock')} lead={t('wh.stock.lead')}>
        <HelpButton id="warehouse" />
        <ScanButton onScan={onScan} type="default" tooltip={t('wh.scan.find')} title={t('wh.scan.find')} />
        <Button icon={<DownloadOutlined />} href={csvUrl('stock', { chip, warehouse: warehouse || undefined, q: search.get('q') || undefined, category: category || undefined, lang: locale })} aria-label={t('wh.export')} title={t('wh.export')}>
          {screens.md ? <span>{t('wh.export')}</span> : null}
        </Button>
      </Hero>

      <Chips chips={STOCK_CHIPS} counters={data?.counters} value={chip} onChange={(next) => setParam({ chip: next })} prefix="wh.stockChips" tour="wh.chips" />

      <div className="mod-toolbar wh-toolbar" data-tour="wh.toolbar">
        <Input allowClear prefix={<SearchOutlined />} value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('wh.stock.search')} className="wh-search" />
        <WarehouseSelect value={warehouse} onChange={(id) => setParam({ warehouse: id || undefined })} allowClear placeholder={t('wh.stock.allWarehouses')} style={{ minWidth: 190 }} />
        {meta.categories.length > 0 && <TreeSelect allowClear value={category ?? undefined} onChange={(id) => setParam({ category: id })} treeData={categoryTree(meta.categories)} placeholder={t('wh.fields.category')} style={{ minWidth: 170 }} treeDefaultExpandAll />}
        <span className="mod-toolbar__grow" />
        <Segmented
          value={effectiveGroup}
          onChange={(next) => setParam({ group: next })}
          options={[
            { value: 'warehouse', label: t('wh.stock.byWarehouse') },
            { value: 'category', label: t('wh.stock.byCategory') },
            { value: 'holder', label: t('wh.stock.byHolder') },
            ...(binsOn ? [{ value: 'bin', label: t('wh.stock.byBin') }] : []),
          ]}
        />
      </div>

      {showOrder && (
        <div className="wh-banner is-amber">
          <span>{t('wh.stock.belowMinBanner', { n: data.total })}</span>
          <Button type="primary" icon={<ShoppingCartOutlined />} loading={ordering} onClick={orderBelowMin}>
            {t('wh.stock.orderBelowMin')}
          </Button>
        </div>
      )}
      {data?.totals && (
        <div className="wh-totals">
          <span>{t('wh.stock.totalValue')}</span>
          <Money amount={data.totals.amount} currency={data.totals.currency} strong />
        </div>
      )}

      {!data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !data.items.length ? (
        <Empty
          icon="📦"
          title={chip || search.get('q') ? t('wh.empty.filtered') : t('wh.empty.stock')}
          text={chip || search.get('q') ? t('wh.empty.filteredText') : t('wh.empty.stockText')}
          action={!chip && meta.rights.canOperateAny ? <Button type="primary" onClick={() => navigate('/app/warehouse/documents/new/receipt')}>{t('wh.types.receipt')}</Button> : null}
        />
      ) : (
        groups.map((g) => (
          <section key={g.key} className="wh-group">
            <header className="wh-group__head">
              <strong>{g.title}</strong>
              {g.holderType && <em>{t(`wh.holders.${g.holderType}`)}</em>}
              <span className="wh-muted">{t('wh.stock.positions', { n: g.rows.length })}</span>
            </header>
            {screens.md ? (
              <div className="panel wh-table">
                <Table rowKey="key" size="middle" columns={columns} dataSource={g.rows} scroll={{ x: 'max-content' }} pagination={g.rows.length > 50 ? { pageSize: 50, showSizeChanger: false } : false} onRow={(row) => ({ onClick: () => openItem(row.item.id) })} rowClassName={(row) => `${row.flags?.belowMin ? 'is-amber' : ''}${row.flags?.out ? ' is-red' : ''}${row.item.id === itemId ? ' is-open' : ''}`} />
              </div>
            ) : (
              <div className="wh-cards">
                {g.rows.map((row) => (
                  <button key={row.key} type="button" className={`wh-tile${row.flags?.belowMin ? ' is-amber' : ''}${row.flags?.out ? ' is-red' : ''}`} onClick={() => openItem(row.item.id)}>
                    <span className="wh-tile__top">
                      <strong>{row.item.name}</strong>
                      <Qty value={row.qty} unit={row.item.baseUnit} strong tone={row.flags?.out ? 'red' : row.flags?.belowMin ? 'amber' : null} />
                    </span>
                    <span className="wh-tile__row">
                      {row.item.sku && <span className="wh-muted">{row.item.sku}</span>}
                      {row.reserved > 0 && <span>{t('wh.hint.reserved')} {formatQty(row.reserved, locale)}</span>}
                      {row.available !== undefined && !holderMode && <span>{t('wh.hint.available')} {formatQty(row.available, locale)}</span>}
                      {row.amount !== null && row.amount !== undefined && <Money amount={row.amount} />}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))
      )}

      {itemId && <ItemCard id={itemId} onClose={() => setParam({ item: undefined })} />}
    </div>
  );
}

