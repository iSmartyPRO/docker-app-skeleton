import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Dropdown, Grid, Input, Pagination, Select, Skeleton, Table } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { HelpButton } from '../../../help/Hint';
import { fmtDateTime } from '../../../lib/datetime';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { DOC_CHIPS } from '../lib';
import { Chips, Empty, Hero, Money, StatusPill, TypeTag, WarehouseSelect } from '../components/bits';
import { useCreateItems } from '../components/createMenu';
import DocCard from '../card/DocCard';

/** «A → B» of a document: warehouses, holders, supplier. */
export function Route({ doc }) {
  const { t } = useLocale();
  const from = doc.warehouse?.name || doc.from?.label || doc.supplier?.name || (doc.type === 'receipt' || doc.type === 'opening' ? t('wh.route.supplier') : '');
  const to = doc.type === 'writeoff' ? t('wh.route.expense') : doc.toWarehouse?.name || doc.to?.label || (doc.type === 'supplier_return' ? doc.supplier?.name || t('wh.route.supplier') : '');
  if (['correction', 'inventory', 'discrepancy', 'storno'].includes(doc.type)) return <span className="wh-route">{doc.warehouse?.name || doc.toWarehouse?.name || ''}</span>;
  return (
    <span className="wh-route">
      <span>{from || '—'}</span>
      <span className="wh-route__arrow" aria-hidden="true">→</span>
      <span>{to || '—'}</span>
    </span>
  );
}

/** Documents (spec §8.2): types and statuses, chips «Мои черновики», «Ждут приёмки», «Ждут согласования», «Сегодня». */
export default function DocumentsPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { id } = useParams();
  const screens = Grid.useBreakpoint();
  const { meta, version, touch } = useWh();
  const [search, setSearch] = useSearchParams();
  const chip = search.get('chip') || undefined;
  const type = search.get('type') || undefined;
  const status = search.get('status') || undefined;
  const warehouse = search.get('warehouse') ? Number(search.get('warehouse')) : null;
  const [q, setQ] = useState(search.get('q') || '');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [counters, setCounters] = useState(null);
  const createItems = useCreateItems();
  const set = useCallback(
    (patch) => {
      const next = new URLSearchParams(search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      setSearch(next, { replace: true });
    },
    [search, setSearch]
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((search.get('q') || '') !== q) set({ q: q || undefined });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const params = useMemo(() => ({ chip, type, status, warehouse: warehouse || undefined, q: search.get('q') || undefined }), [chip, type, status, warehouse, search]);
  const key = JSON.stringify(params);
  useEffect(() => setPage(1), [key]);
  useEffect(() => {
    let alive = true;
    const { chip: _chip, ...rest } = params;
    whApi.counters(rest).then((res) => alive && setCounters(res.data.counters)).catch(() => {});
    whApi
      .documents({ ...params, page, pageSize: 50 })
      .then((res) => alive && setData(res.data))
      .catch(() => alive && setData({ items: [], total: 0 }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, version]);
  useEffect(() => {
    window.addEventListener('approvals:changed', touch);
    return () => window.removeEventListener('approvals:changed', touch);
  }, [touch]);
  const openId = id && /^\d+$/.test(id) ? Number(id) : null;
  const open = (docId) => navigate(`/app/warehouse/documents/${docId}${window.location.search}`);
  const ids = (data?.items || []).map((doc) => doc.id);
  const columns = [
    { key: 'number', title: t('wh.fields.number'), width: 120, render: (_, doc) => <span className="wh-no">{doc.number}</span> },
    { key: 'type', title: t('wh.fields.type'), width: 170, render: (_, doc) => <TypeTag type={doc.type} /> },
    { key: 'route', title: t('wh.fields.route'), ellipsis: true, render: (_, doc) => <Route doc={doc} /> },
    { key: 'status', title: t('wh.fields.status'), width: 150, render: (_, doc) => <StatusPill status={doc.status} /> },
    { key: 'lines', title: t('wh.fields.lines'), width: 90, align: 'right', render: (_, doc) => doc.lines },
    meta.rights.cost && { key: 'sum', title: t('wh.fields.amount'), width: 130, align: 'right', render: (_, doc) => <Money amount={doc.sum} /> },
    { key: 'date', title: t('wh.fields.date'), width: 150, render: (_, doc) => fmtDateTime(doc.date) },
    { key: 'author', title: t('wh.fields.author'), width: 150, ellipsis: true, render: (_, doc) => doc.author?.name || '—' },
  ].filter(Boolean);
  return (
    <div className="wh-page">
      <Hero icon="clipboard" title={t('wh.nav.documents')} lead={t('wh.docs.lead')}>
        <HelpButton id="warehouse" section="documents" />
        {createItems.length > 0 && (
          <Dropdown menu={{ items: createItems }} trigger={['click']}>
            <Button type="primary" icon={<PlusOutlined />}>{t('wh.create')}</Button>
          </Dropdown>
        )}
      </Hero>
      <Chips chips={DOC_CHIPS} counters={counters} value={chip} onChange={(next) => set({ chip: next })} prefix="wh.docChips" />
      <div className="mod-toolbar wh-toolbar">
        <Input allowClear prefix={<SearchOutlined />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('wh.docs.search')} className="wh-search" />
        <Select allowClear mode="multiple" maxTagCount="responsive" value={type ? type.split(',') : []} onChange={(list) => set({ type: list.join(',') || undefined })} placeholder={t('wh.fields.type')} options={meta.enums.allTypes.map((value) => ({ value, label: t(`wh.types.${value}`) }))} style={{ minWidth: 180 }} />
        <Select allowClear mode="multiple" maxTagCount="responsive" value={status ? status.split(',') : []} onChange={(list) => set({ status: list.join(',') || undefined })} placeholder={t('wh.fields.status')} options={meta.enums.statuses.map((value) => ({ value, label: t(`wh.status.${value}`) }))} style={{ minWidth: 160 }} />
        <WarehouseSelect allowClear value={warehouse} onChange={(wid) => set({ warehouse: wid || undefined })} placeholder={t('wh.stock.allWarehouses')} style={{ minWidth: 180 }} />
      </div>
      {!data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !data.items.length ? (
        <Empty icon="📄" title={chip || search.get('q') ? t('wh.empty.filtered') : t('wh.empty.docs')} text={chip ? null : t('wh.empty.docsText')} />
      ) : screens.md ? (
        <section className="panel wh-table">
          <Table rowKey="id" size="middle" columns={columns} dataSource={data.items} onRow={(doc) => ({ onClick: () => open(doc.id) })} rowClassName={(doc) => `${doc.id === openId ? 'is-open' : ''}${doc.status === 'shipped' ? ' is-violet' : ''}`} pagination={{ current: page, pageSize: 50, total: data.total, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} />
        </section>
      ) : (
        <div className="wh-cards">
          {data.items.map((doc) => (
            <button key={doc.id} type="button" className={`wh-tile${doc.id === openId ? ' is-active' : ''}`} onClick={() => open(doc.id)}>
              <span className="wh-tile__top">
                <span className="wh-no">{doc.number}</span>
                <StatusPill status={doc.status} size="small" />
              </span>
              <TypeTag type={doc.type} />
              <Route doc={doc} />
              <span className="wh-tile__row">
                <span className="wh-muted">{fmtDateTime(doc.date)}</span>
                <span className="wh-muted">{t('wh.docs.linesN', { n: doc.lines })}</span>
                <Money amount={doc.sum} />
              </span>
            </button>
          ))}
          {data.total > 50 && <Pagination simple current={page} pageSize={50} total={data.total} onChange={setPage} />}
        </div>
      )}
      {openId && <DocCard id={openId} ids={ids} onOpen={open} onClose={() => navigate(`/app/warehouse/documents${window.location.search}`)} onChanged={touch} />}
    </div>
  );
}
