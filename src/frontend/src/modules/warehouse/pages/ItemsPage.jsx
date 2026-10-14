import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Grid, Input, Pagination, Segmented, Skeleton, Table, TreeSelect } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { HelpButton } from '../../../help/Hint';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { categoryTree, formatQty } from '../lib';
import { Empty, Hero, Money } from '../components/bits';
import ItemCard from '../card/ItemCard';
import ItemForm from '../components/ItemForm';
import CategoriesDialog from '../components/CategoriesDialog';

/** Nomenclature (spec §4): items with units, tracking, barcodes; the card opens over the list. */
export default function ItemsPage() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { id } = useParams();
  const screens = Grid.useBreakpoint();
  const { meta, version, touch, reload } = useWh();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  const [tracking, setTracking] = useState('all');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [creating, setCreating] = useState(false);
  const [categories, setCategories] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(q), 300);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => setPage(1), [query, category, tracking, archived]);
  useEffect(() => {
    let alive = true;
    whApi
      .items({ q: query || undefined, category: category || undefined, tracking: tracking === 'all' ? undefined : tracking, archived: archived ? '1' : undefined, page, pageSize: 50 })
      .then((res) => alive && setData(res.data))
      .catch(() => alive && setData({ items: [], total: 0 }));
    return () => {
      alive = false;
    };
  }, [query, category, tracking, archived, page, version]);
  const openId = id && /^\d+$/.test(id) ? Number(id) : null;
  const columns = [
    { key: 'name', title: t('wh.fields.name'), render: (_, item) => <span className="wh-item-cell">{item.photoUrl && <img src={item.photoUrl} alt="" className="wh-thumb" />}<span><strong>{item.name}</strong><em>{[item.sku, item.brand].filter(Boolean).join(' · ')}</em></span></span> },
    { key: 'category', title: t('wh.fields.category'), width: 170, ellipsis: true, render: (_, item) => item.category?.name || <span className="wh-muted">—</span> },
    { key: 'tracking', title: t('wh.fields.tracking'), width: 140, render: (_, item) => <span className="wh-flag">{t(`wh.tracking.${item.tracking}`)}</span> },
    { key: 'units', title: t('wh.fields.units'), width: 170, render: (_, item) => [item.baseUnit, ...item.units.map((u) => `${u.code}=${u.factor}`)].join(' · ') },
    { key: 'stock', title: t('wh.fields.onHand'), align: 'right', width: 120, render: (_, item) => `${formatQty(item.stock, locale)} ${item.baseUnit}` },
    meta.rights.cost && { key: 'price', title: t('wh.fields.lastPrice'), align: 'right', width: 120, render: (_, item) => <Money amount={item.lastPrice} /> },
  ].filter(Boolean);
  return (
    <div className="wh-page">
      <Hero icon="tag" title={t('wh.nav.items')} lead={t('wh.items.lead')}>
        <HelpButton id="warehouse" section="items" />
        {meta.rights.canAdminAny && <Button onClick={() => setCategories(true)}>{t('wh.items.categories')}</Button>}
        {meta.rights.canAdminAny && <Button onClick={() => navigate('/app/warehouse/import')}>{t('wh.nav.import')}</Button>}
        {meta.rights.canEditItems && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>{t('wh.items.create')}</Button>}
      </Hero>
      <div className="mod-toolbar wh-toolbar">
        <Input allowClear prefix={<SearchOutlined />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('wh.items.search')} className="wh-search" />
        {meta.categories.length > 0 && <TreeSelect allowClear value={category ?? undefined} onChange={setCategory} treeData={categoryTree(meta.categories)} placeholder={t('wh.fields.category')} style={{ minWidth: 170 }} treeDefaultExpandAll />}
        <Segmented value={tracking} onChange={setTracking} options={[{ value: 'all', label: t('wh.items.allTracking') }, ...meta.enums.tracking.map((value) => ({ value, label: t(`wh.tracking.${value}`) }))]} />
        <span className="mod-toolbar__grow" />
        <Button type={archived ? 'primary' : 'default'} ghost={archived} onClick={() => setArchived(!archived)}>{t('wh.items.archived')}</Button>
      </div>
      {!data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !data.items.length ? (
        <Empty icon="🏷️" title={query ? t('wh.empty.filtered') : t('wh.empty.items')} text={query ? null : t('wh.empty.itemsText')} action={meta.rights.canEditItems && !query ? <Button type="primary" onClick={() => setCreating(true)}>{t('wh.items.create')}</Button> : null} />
      ) : screens.md ? (
        <section className="panel wh-table">
          <Table rowKey="id" size="middle" columns={columns} dataSource={data.items} onRow={(item) => ({ onClick: () => navigate(`/app/warehouse/items/${item.id}`) })} rowClassName={(item) => (item.id === openId ? 'is-open' : '')} pagination={{ current: page, pageSize: 50, total: data.total, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }} />
        </section>
      ) : (
        <div className="wh-cards">
          {data.items.map((item) => (
            <button key={item.id} type="button" className="wh-tile" onClick={() => navigate(`/app/warehouse/items/${item.id}`)}>
              <span className="wh-tile__top"><strong>{item.name}</strong><span>{formatQty(item.stock, locale)} {item.baseUnit}</span></span>
              <span className="wh-tile__row"><span className="wh-muted">{[item.sku, t(`wh.tracking.${item.tracking}`)].filter(Boolean).join(' · ')}</span></span>
            </button>
          ))}
          {data.total > 50 && <Pagination simple current={page} pageSize={50} total={data.total} onChange={setPage} />}
        </div>
      )}
      {openId && <ItemCard id={openId} onClose={() => navigate('/app/warehouse/items')} />}
      {creating && <ItemForm onClose={() => setCreating(false)} onSaved={(item) => { setCreating(false); touch(); navigate(`/app/warehouse/items/${item.id}`); }} />}
      {categories && <CategoriesDialog onClose={() => { setCategories(false); reload(); }} />}
    </div>
  );
}
