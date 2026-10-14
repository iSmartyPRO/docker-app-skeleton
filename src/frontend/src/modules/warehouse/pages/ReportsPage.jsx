import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { App, Button, DatePicker, Skeleton, Table, Tabs, TreeSelect } from 'antd';
import { DatabaseOutlined, DownloadOutlined, FileExcelOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useLocale } from '../../../context/LocaleContext';
import { HelpButton } from '../../../help/Hint';
import { fmtDate, fmtDateTime, todayISO } from '../../../lib/datetime';
import { whApi, csvUrl } from '../api';
import { useWh } from '../WhContext';
import { categoryTree, formatQty, whError } from '../lib';
import { Empty, HolderPicker, Hero, ItemPicker, Money, Qty, TypeTag, WarehouseSelect } from '../components/bits';
import { exportXlsx } from '../xlsx';
import { WhereNow } from './ToolsPage';

const firstOfMonth = () => `${todayISO().slice(0, 8)}01`;

function Period({ value, onChange }) {
  return (
    <DatePicker.RangePicker
      value={[dayjs(value.from), dayjs(value.to)]}
      onChange={(range) => range && onChange({ from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') })}
      allowClear={false}
    />
  );
}

function ExportButtons({ kind, params, xlsx }) {
  const { t, locale } = useLocale();
  return (
    <>
      <Button icon={<DownloadOutlined />} href={csvUrl(kind, { ...params, lang: locale })}>{t('wh.reports.csv')}</Button>
      {xlsx && <Button icon={<FileExcelOutlined />} onClick={xlsx}>{t('wh.reports.xlsx')}</Button>}
    </>
  );
}

/** Оборотная ведомость: opening, in, out, closing, quantity and sum. */
function Turnover() {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { meta } = useWh();
  const [period, setPeriod] = useState({ from: firstOfMonth(), to: todayISO() });
  const [warehouse, setWarehouse] = useState(null);
  const [category, setCategory] = useState(null);
  const [data, setData] = useState(null);
  const params = useMemo(() => ({ ...period, warehouse: warehouse || undefined, category: category || undefined }), [period, warehouse, category]);
  useEffect(() => {
    setData(null);
    whApi.report('turnover', params).then((res) => setData(res.data)).catch((err) => { message.error(whError(err, t)); setData({ rows: [] }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);
  const sums = Boolean(data?.totals);
  const columns = [
    { key: 'item', title: t('wh.fields.item'), fixed: 'left', render: (_, r) => <span className="wh-item-cell"><strong>{r.item.name}</strong><em>{[r.item.sku, r.warehouse.name].filter(Boolean).join(' · ')}</em></span> },
    { key: 'open', title: t('wh.reports.opening'), align: 'right', render: (_, r) => <span className="wh-num2"><Qty value={r.openingQty} unit={r.item.baseUnit} />{sums && <Money amount={r.openingSum} />}</span> },
    { key: 'in', title: t('wh.reports.in'), align: 'right', render: (_, r) => <span className="wh-num2"><Qty value={r.inQty} tone={r.inQty ? 'green' : null} />{sums && <Money amount={r.sumIn} />}</span> },
    { key: 'out', title: t('wh.reports.out'), align: 'right', render: (_, r) => <span className="wh-num2"><Qty value={r.outQty} tone={r.outQty ? 'red' : null} />{sums && <Money amount={r.sumOut} />}</span> },
    { key: 'close', title: t('wh.reports.closing'), align: 'right', render: (_, r) => <span className="wh-num2"><Qty value={r.closingQty} unit={r.item.baseUnit} strong />{sums && <Money amount={r.closingSum} strong />}</span> },
  ];
  const xlsx = () =>
    exportXlsx({
      sheet: t('wh.reports.turnover'),
      filename: `turnover-${period.from}-${period.to}.xlsx`,
      columns: [
        { header: t('wh.fields.warehouse'), key: 'warehouse', width: 22 },
        { header: t('wh.fields.item'), key: 'item', width: 34 },
        { header: t('wh.fields.sku'), key: 'sku', width: 14 },
        { header: t('wh.fields.baseUnit'), key: 'unit', width: 8 },
        { header: t('wh.reports.opening'), key: 'openingQty', numFmt: '#,##0.####' },
        ...(sums ? [{ header: `${t('wh.reports.opening')}, ${data.currency}`, key: 'openingSum', numFmt: '#,##0.00' }] : []),
        { header: t('wh.reports.in'), key: 'inQty', numFmt: '#,##0.####' },
        ...(sums ? [{ header: `${t('wh.reports.in')}, ${data.currency}`, key: 'sumIn', numFmt: '#,##0.00' }] : []),
        { header: t('wh.reports.out'), key: 'outQty', numFmt: '#,##0.####' },
        ...(sums ? [{ header: `${t('wh.reports.out')}, ${data.currency}`, key: 'sumOut', numFmt: '#,##0.00' }] : []),
        { header: t('wh.reports.closing'), key: 'closingQty', numFmt: '#,##0.####' },
        ...(sums ? [{ header: `${t('wh.reports.closing')}, ${data.currency}`, key: 'closingSum', numFmt: '#,##0.00' }] : []),
      ],
      rows: data.rows.map((r) => ({ ...r, warehouse: r.warehouse.name, item: r.item.name, sku: r.item.sku, unit: r.item.baseUnit })),
    });
  return (
    <div className="wh-stack">
      <div className="mod-toolbar wh-toolbar">
        <Period value={period} onChange={setPeriod} />
        <WarehouseSelect allowClear value={warehouse} onChange={setWarehouse} placeholder={t('wh.stock.allWarehouses')} style={{ minWidth: 180 }} />
        {meta.categories.length > 0 && <TreeSelect allowClear value={category ?? undefined} onChange={setCategory} treeData={categoryTree(meta.categories)} placeholder={t('wh.fields.category')} style={{ minWidth: 160 }} />}
        <span className="mod-toolbar__grow" />
        <ExportButtons kind="turnover" params={params} xlsx={data?.rows?.length ? xlsx : null} />
      </div>
      {!data ? <Skeleton active /> : !data.rows.length ? <Empty icon="📊" title={t('wh.reports.empty')} /> : (
        <section className="panel wh-table">
          <Table rowKey={(r) => `${r.item.id}:${r.warehouse.id}`} size="small" columns={columns} dataSource={data.rows} pagination={data.rows.length > 100 ? { pageSize: 100 } : false} scroll={{ x: 'max-content' }}
            summary={() => sums ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><strong>{t('wh.reports.total')}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><Money amount={data.totals.openingSum} strong /></Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right"><Money amount={data.totals.sumIn} strong /></Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right"><Money amount={data.totals.sumOut} strong /></Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right"><Money amount={data.totals.closingSum} strong /></Table.Summary.Cell>
              </Table.Summary.Row>
            ) : null}
          />
        </section>
      )}
      {data?.rows?.length > 0 && <p className="wh-muted">{t('wh.reports.positions', { n: formatQty(data.rows.length, locale) })}</p>}
    </div>
  );
}

/** Движение по позиции: documents with a running balance. */
function Movement({ initialItem }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [period, setPeriod] = useState({ from: firstOfMonth(), to: todayISO() });
  const [warehouse, setWarehouse] = useState(null);
  const [item, setItem] = useState(initialItem ? { id: initialItem } : null);
  const [data, setData] = useState(null);
  const params = useMemo(() => ({ ...period, warehouse: warehouse || undefined, item: item?.id }), [period, warehouse, item]);
  useEffect(() => {
    if (!item) return;
    setData(null);
    whApi.report('movement', params).then((res) => setData(res.data)).catch(() => setData({ rows: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);
  return (
    <div className="wh-stack">
      <div className="mod-toolbar wh-toolbar">
        <div style={{ minWidth: 260, flex: 1, maxWidth: 420 }}><ItemPicker onPick={setItem} value={item?.id ?? null} /></div>
        <Period value={period} onChange={setPeriod} />
        <WarehouseSelect allowClear value={warehouse} onChange={setWarehouse} placeholder={t('wh.stock.allWarehouses')} style={{ minWidth: 180 }} />
        <span className="mod-toolbar__grow" />
        {item && <ExportButtons kind="movement" params={params} />}
      </div>
      {!item ? <Empty icon="🔎" title={t('wh.reports.pickItem')} /> : !data ? <Skeleton active /> : (
        <section className="panel wh-table">
          <div className="wh-report-head">
            <strong>{data.item?.name}</strong>
            <span>{t('wh.reports.opening')}: <Qty value={data.openingQty} unit={data.item?.baseUnit} strong /> <Money amount={data.openingSum} /></span>
            <span>{t('wh.reports.closing')}: <Qty value={data.closingQty} unit={data.item?.baseUnit} strong /> <Money amount={data.closingSum} /></span>
          </div>
          <Table rowKey={(r) => `${r.document.id}:${r.warehouse.id}:${r.date}`} size="small" dataSource={data.rows} pagination={data.rows.length > 100 ? { pageSize: 100 } : false} onRow={(r) => ({ onClick: () => navigate(`/app/warehouse/documents/${r.document.id}`) })} scroll={{ x: 'max-content' }}
            columns={[
              { key: 'date', title: t('wh.fields.date'), width: 150, render: (_, r) => fmtDateTime(r.date) },
              { key: 'doc', title: t('wh.fields.document'), render: (_, r) => <span className="wh-doc-cell"><TypeTag type={r.document.type} compact /><span className="wh-no">{r.document.number}</span></span> },
              { key: 'wh', title: t('wh.fields.warehouse'), render: (_, r) => r.warehouse.name },
              { key: 'who', title: t('wh.reports.counterpart'), ellipsis: true, render: (_, r) => r.counterpart || '—' },
              { key: 'qty', title: t('wh.fields.qty'), align: 'right', render: (_, r) => <Qty value={r.qty} strong tone={r.qty < 0 ? 'red' : 'green'} /> },
              { key: 'amount', title: t('wh.fields.amount'), align: 'right', render: (_, r) => <Money amount={r.amount} /> },
              { key: 'balance', title: t('wh.reports.balance'), align: 'right', render: (_, r) => <Qty value={r.balance} /> },
            ]}
          />
        </section>
      )}
    </div>
  );
}

/** Материалы по объекту / проекту / сотруднику. */
function ByObject() {
  const { t } = useLocale();
  const [holder, setHolder] = useState(null);
  const [period, setPeriod] = useState({ from: '2020-01-01', to: todayISO() });
  const [data, setData] = useState(null);
  const params = useMemo(() => ({ holderType: holder?.type, holderId: holder?.id, ...period }), [holder, period]);
  useEffect(() => {
    if (!holder?.id) return;
    setData(null);
    whApi.report('by-object', params).then((res) => setData(res.data)).catch(() => setData({ rows: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);
  return (
    <div className="wh-stack">
      <div className="mod-toolbar wh-toolbar">
        <div style={{ minWidth: 320 }}><HolderPicker value={holder} onChange={setHolder} types={['object', 'project', 'employee']} /></div>
        <Period value={period} onChange={setPeriod} />
        <span className="mod-toolbar__grow" />
        {holder?.id && <ExportButtons kind="by-object" params={params} />}
      </div>
      {!holder?.id ? <Empty icon="🏗️" title={t('wh.reports.pickHolder')} /> : !data ? <Skeleton active /> : !data.rows.length ? <Empty icon="📭" title={t('wh.reports.empty')} /> : (
        <section className="panel wh-table">
          <div className="wh-report-head">
            <strong>{data.holder?.label}</strong>
            {data.totals && <span>{t('wh.reports.issued')}: <Money amount={data.totals.issuedSum} strong /> · {t('wh.reports.writtenOff')}: <Money amount={data.totals.writtenOffSum} /> · {t('wh.reports.onHand')}: <Money amount={data.totals.amount} /></span>}
          </div>
          <Table rowKey={(r) => r.item.id} size="small" dataSource={data.rows} pagination={false} scroll={{ x: 'max-content' }}
            columns={[
              { key: 'item', title: t('wh.fields.item'), render: (_, r) => <span className="wh-item-cell"><strong>{r.item.name}</strong><em>{r.item.sku}</em></span> },
              { key: 'issued', title: t('wh.reports.issued'), align: 'right', render: (_, r) => <span className="wh-num2"><Qty value={r.issuedQty} unit={r.item.baseUnit} /><Money amount={r.issuedSum} /></span> },
              { key: 'returned', title: t('wh.reports.returned'), align: 'right', render: (_, r) => <Qty value={r.returnedQty} /> },
              { key: 'written', title: t('wh.reports.writtenOff'), align: 'right', render: (_, r) => <span className="wh-num2"><Qty value={r.writtenOffQty} /><Money amount={r.writtenOffSum} /></span> },
              { key: 'now', title: t('wh.reports.onHand'), align: 'right', render: (_, r) => <span className="wh-num2"><Qty value={r.onHandQty} unit={r.item.baseUnit} strong /><Money amount={r.amount} /></span> },
            ]}
          />
        </section>
      )}
    </div>
  );
}

/** Инструмент по держателям. */
function ToolsByHolder() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  useEffect(() => {
    whApi.report('tools', {}).then((res) => setData(res.data)).catch(() => setData({ groups: [] }));
  }, []);
  if (!data) return <Skeleton active />;
  return (
    <div className="wh-stack">
      <div className="mod-toolbar wh-toolbar">
        <span className="mod-toolbar__grow" />
        <ExportButtons kind="tools" params={{}} />
      </div>
      {!data.groups.length ? <Empty icon="🔧" title={t('wh.tools.none')} /> : (
        <div className="wh-where-grid">
          {data.groups.map((group) => (
            <section key={group.holder ? `${group.holder.type}:${group.holder.id}` : 'none'} className={`wh-where-card is-${group.holder?.type || 'none'}`}>
              <header><WhereNow where={group.holder} /><em>{group.tools.length}</em></header>
              <ul>
                {group.tools.map((tool) => (
                  <li key={tool.id}><button type="button" onClick={() => navigate(`/app/warehouse/tools/${tool.id}`)}><span className="wh-no">{tool.inventoryNo}</span><span>{tool.item.name}</span>{tool.nextServiceOn && <span className="wh-muted">{fmtDate(tool.nextServiceOn)}</span>}</button></li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Reports (spec §8.7): stock, turnover, movement by item, materials by object, tools by holder. */
export default function ReportsPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') || 'turnover';
  return (
    <div className="wh-page">
      <Hero icon="chart" title={t('wh.nav.reports')} lead={t('wh.reports.lead')}>
        <HelpButton id="warehouse" section="reports" />
        <Button icon={<DatabaseOutlined />} onClick={() => navigate('/app/warehouse/stock')} aria-label={t('wh.reports.stock')} title={t('wh.reports.stock')}><span>{t('wh.reports.stock')}</span></Button>
      </Hero>
      <Tabs
        activeKey={tab}
        onChange={(key) => setSearch({ tab: key }, { replace: true })}
        items={[
          { key: 'turnover', label: t('wh.reports.turnover'), children: tab === 'turnover' ? <Turnover /> : null },
          { key: 'movement', label: t('wh.reports.movement'), children: tab === 'movement' ? <Movement initialItem={search.get('item') ? Number(search.get('item')) : null} /> : null },
          { key: 'object', label: t('wh.reports.byObject'), children: tab === 'object' ? <ByObject /> : null },
          { key: 'tools', label: t('wh.reports.tools'), children: tab === 'tools' ? <ToolsByHolder /> : null },
        ]}
      />
    </div>
  );
}
