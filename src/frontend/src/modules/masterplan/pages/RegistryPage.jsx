import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App, Button, Checkbox, Dropdown, Popover, Table } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { HelpButton } from '../../../help/Hint';
import { mpApi } from '../api';
import { useMp, useProject } from '../MpContext';
import { EMPTY_FILTER, can, filterParams, formatArea, formatMoney, formatPercent, readStore, userKey, writeStore } from '../lib';
import { FilterButton, SearchBox } from '../components/Filters';
import { Readiness, StatusTag, TypeIcon } from '../components/bits';
import UnitCard from '../components/UnitCard';
import { BulkPriceDialog, BulkStatusDialog } from '../components/BulkDialogs';
import ImportDialog from '../components/ImportDialog';
import MigrateDialog from '../components/MigrateDialog';
import { exportXlsx } from '../media/xlsx';

const COLUMNS = ['type', 'status', 'price', 'ppm', 'area', 'plot', 'bedrooms', 'floor', 'finishing', 'readiness', 'manager', 'client'];
const DEFAULT_COLUMNS = ['type', 'status', 'price', 'ppm', 'area', 'plot', 'bedrooms', 'readiness', 'manager'];
const SORT_OF = { code: 'code', price: 'price', ppm: 'ppm', area: 'area', plot: 'plot', status: 'status', floor: 'floor', bedrooms: 'bedrooms', readiness: 'readiness' };

/** Реестр (spec §9.3): every unit with chosen columns, sorting, filters, bulk price change, Excel export and import. */
export default function RegistryPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { message } = App.useApp();
  const { settings } = useMp();
  const [search, setSearch] = useSearchParams();
  const { project, caps, refreshUnits, presentation, tree } = useProject();
  const [filter, setFilter] = useState(() => ({ ...EMPTY_FILTER, ...readStore(userKey(user, 'regFilter'), {}) }));
  const [columns, setColumns] = useState(() => readStore(userKey(user, 'regColumns'), DEFAULT_COLUMNS));
  const [page, setPage] = useState({ page: 1, pageSize: 50, sort: 'code', order: 'asc' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulkPrice, setBulkPrice] = useState(null);
  const [bulkStatus, setBulkStatus] = useState(null);
  const [migrate, setMigrate] = useState(null);
  const [importing, setImporting] = useState(false);
  const selectedId = Number(search.get('node')) || null;
  const params = useMemo(() => ({ project: project.id, ...filterParams(filter), ...page, presentation: presentation ? 1 : undefined }), [project.id, filter, page, presentation]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mpApi.units(params);
      setData(res.data);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [params, message]);
  useEffect(() => {
    load();
  }, [load]);
  // Live: the project map is refreshed by the stream; follow its versions.
  const versions = useMemo(() => (data?.items || []).map((item) => tree.byId.get(item.id)?.unit?.version).join(','), [data, tree]);
  const seen = useRef('');
  useEffect(() => {
    // Ids of the page are the same and some version moved: someone changed a unit on this page.
    const ids = (data?.items || []).map((item) => item.id).join(',');
    if (seen.current && seen.current.startsWith(`${ids}|`) && seen.current !== `${ids}|${versions}`) load();
    seen.current = `${ids}|${versions}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions]);

  const changeFilter = (next) => {
    setFilter(next);
    writeStore(userKey(user, 'regFilter'), { ...next, q: '' });
    setPage((prev) => ({ ...prev, page: 1 }));
  };
  const setNode = (id) => {
    const next = new URLSearchParams(window.location.search);
    if (id) next.set('node', String(id));
    else next.delete('node');
    setSearch(next);
  };
  const visible = (key) => columns.includes(key) && (!['price', 'ppm'].includes(key) || can(caps, 'price.view')) && (!['status'].includes(key) || can(caps, 'status.view')) && (!['manager'].includes(key) || (can(caps, 'booking.view') && !presentation)) && (key !== 'client' || (!presentation && (can(caps, 'clients.all') || can(caps, 'clients.own')))) && (key !== 'readiness' || can(caps, 'build.view'));
  const sorter = (key) => (SORT_OF[key] ? { sorter: true, sortOrder: page.sort === SORT_OF[key] ? (page.order === 'desc' ? 'descend' : 'ascend') : null } : {});
  const tableColumns = [
    {
      key: 'code',
      title: t('mp.reg.code'),
      fixed: 'left',
      width: 150,
      ...sorter('code'),
      render: (_, node) => (
        <button type="button" className="mp-reg__code" onClick={() => setNode(node.id)}>
          <b>{node.code || node.name}</b>
          {node.code && node.name && <span>{node.name}</span>}
        </button>
      ),
    },
    visible('type') && { key: 'type', title: t('mp.reg.type'), width: 170, render: (_, node) => <span className="mp-reg__type"><TypeIcon node={node} size={15} /> {node.type?.name}</span> },
    visible('status') && { key: 'status', title: t('mp.reg.status'), width: 150, ...sorter('status'), render: (_, node) => <StatusTag status={node.unit?.status} /> },
    visible('price') && { key: 'price', title: t('mp.reg.price'), align: 'right', width: 130, ...sorter('price'), render: (_, node) => <span className="mp-money">{formatMoney(node.unit?.price, node.unit?.currency, locale)}</span> },
    visible('ppm') && { key: 'ppm', title: t('mp.reg.ppm'), align: 'right', width: 120, ...sorter('ppm'), render: (_, node) => <span className="mp-money">{node.unit?.pricePerM2 ? formatMoney(Math.round(node.unit.pricePerM2), node.unit.currency, locale) : '—'}</span> },
    visible('area') && { key: 'area', title: t('mp.reg.area'), align: 'right', width: 100, ...sorter('area'), render: (_, node) => formatArea(node.unit?.areaTotal, locale) },
    visible('plot') && { key: 'plot', title: t('mp.reg.plot'), align: 'right', width: 100, ...sorter('plot'), render: (_, node) => formatArea(node.unit?.areaPlot, locale) },
    visible('bedrooms') && { key: 'bedrooms', title: t('mp.reg.bedrooms'), align: 'center', width: 80, ...sorter('bedrooms'), render: (_, node) => node.unit?.bedrooms ?? '—' },
    visible('floor') && { key: 'floor', title: t('mp.reg.floor'), align: 'center', width: 70, ...sorter('floor'), render: (_, node) => node.unit?.floor ?? '—' },
    visible('finishing') && { key: 'finishing', title: t('mp.reg.finishing'), width: 120, render: (_, node) => (node.unit?.finishing ? t(`mp.finishing.${node.unit.finishing}`) : '—') },
    visible('readiness') && { key: 'readiness', title: t('mp.reg.readiness'), width: 140, ...sorter('readiness'), render: (_, node) => <Readiness value={tree.byId.get(node.id)?.readiness ?? node.readiness} compact /> },
    visible('manager') && { key: 'manager', title: t('mp.reg.manager'), width: 150, render: (_, node) => node.unit?.manager?.name || '—' },
    visible('client') && { key: 'client', title: t('mp.reg.client'), width: 170, render: (_, node) => node.unit?.client?.name || '—' },
  ].filter(Boolean);

  const exportAll = async () => {
    try {
      const res = await mpApi.units({ ...params, page: 1, pageSize: 5000 });
      const items = res.data.items.map((node) => ({ ...node, readiness: tree.byId.get(node.id)?.readiness ?? node.readiness }));
      await exportXlsx(items, { t, locale, project, caps });
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  const csvParams = Object.fromEntries(Object.entries({ project: project.id, ...filterParams(filter), sort: page.sort, order: page.order, presentation: presentation ? 1 : undefined }).filter(([, value]) => value !== undefined));

  const chooser = (
    <div className="mp-cols">
      {COLUMNS.map((key) => (
        <Checkbox
          key={key}
          checked={columns.includes(key)}
          onChange={(event) => {
            const next = event.target.checked ? [...columns, key] : columns.filter((item) => item !== key);
            setColumns(next);
            writeStore(userKey(user, 'regColumns'), next);
          }}
        >
          {t(`mp.reg.${key}`)}
        </Checkbox>
      ))}
    </div>
  );

  return (
    <div className={`mp-page${selectedId ? ' has-card' : ''}`}>
      <header className="mp-head">
        <div>
          <h1>{t('mp.nav.registry')}</h1>
          <p>{project.name}{data ? ` · ${t('mp.reg.total', { n: data.total })}` : ''}</p>
        </div>
        <div className="mp-head__actions">
          <HelpButton id="masterplan" section="registry" />
          {project.canConfigure && !presentation && <Button onClick={() => setImporting(true)}>{t('mp.reg.import')}</Button>}
          <Dropdown
            menu={{
              items: [
                { key: 'xlsx', label: t('mp.reg.exportXlsx'), onClick: exportAll },
                { key: 'csv', label: <a href={mpApi.exportUrl(csvParams)}>{t('mp.reg.exportCsv')}</a> },
              ],
            }}
          >
            <Button icon={<DownOutlined />} iconPosition="end">{t('mp.reg.export')}</Button>
          </Dropdown>
        </div>
      </header>
      <div className="mod-toolbar">
        <SearchBox value={filter.q} onChange={(q) => changeFilter({ ...filter, q })} />
        <FilterButton value={filter} onChange={changeFilter} caps={caps} />
        <span className="mod-toolbar__grow" />
        <Popover content={chooser} trigger="click" placement="bottomRight">
          <Button>{t('mp.reg.columns')}</Button>
        </Popover>
      </div>
      <Table
        className="mp-reg"
        rowKey="id"
        size="middle"
        loading={loading}
        columns={tableColumns}
        dataSource={data?.items || []}
        scroll={{ x: 'max-content' }}
        rowSelection={!presentation && (can(caps, 'price.edit') || can(caps, 'status.not_for_sale')) ? { selectedRowKeys: selected, onChange: setSelected, preserveSelectedRowKeys: true } : undefined}
        onRow={(node) => ({ onDoubleClick: () => setNode(node.id) })}
        pagination={{ current: page.page, pageSize: page.pageSize, total: data?.total || 0, showSizeChanger: true, pageSizeOptions: [20, 50, 100, 200], showTotal: (total) => t('mp.reg.total', { n: total }) }}
        onChange={(pagination, _filters, sort) => {
          setPage({
            page: pagination.current,
            pageSize: pagination.pageSize,
            sort: sort?.order ? SORT_OF[sort.columnKey] || 'code' : 'code',
            order: sort?.order === 'descend' ? 'desc' : 'asc',
          });
        }}
      />
      {selected.length > 0 && (
        <div className="mp-bulkbar" role="toolbar">
          <b>{t('mp.bulk.selected', { n: selected.length })}</b>
          {can(caps, 'price.edit') && <Button type="primary" onClick={() => setBulkPrice(selected)}>{t('mp.bulk.price')}</Button>}
          {can(caps, 'status.not_for_sale') && <Button onClick={() => setBulkStatus({ ids: selected, to: 'not_for_sale' })}>{t('mp.bulk.close')}</Button>}
          {can(caps, 'status.open') && <Button onClick={() => setBulkStatus({ ids: selected, to: 'free' })}>{t('mp.bulk.open')}</Button>}
          {project.canConfigure && <Button onClick={() => setMigrate({ ids: selected })}>{t('mp.migrate.action')}…</Button>}
          <Button type="text" onClick={() => setSelected([])}>{t('mp.bulk.clear')}</Button>
        </div>
      )}
      {selectedId && <UnitCard key={selectedId} nodeId={selectedId} version={tree.byId.get(selectedId)?.unit?.version} presentation={presentation} onClose={() => setNode(null)} onChanged={(node) => (node ? refreshUnits([node.id]) : load())} />}
      <BulkPriceDialog
        ids={bulkPrice}
        onClose={(changed) => {
          setBulkPrice(null);
          if (changed) {
            refreshUnits(selected);
            setSelected([]);
            load();
          }
        }}
      />
      <BulkStatusDialog
        open={bulkStatus}
        onClose={(changed) => {
          setBulkStatus(null);
          if (changed) {
            setSelected([]);
            load();
          }
        }}
      />
      <MigrateDialog
        open={migrate}
        onClose={(changed) => {
          setMigrate(null);
          if (changed) {
            refreshUnits(selected);
            setSelected([]);
            load();
          }
        }}
      />
      <ImportDialog open={importing} project={project} onClose={(changed) => { setImporting(false); if (changed) load(); }} settings={settings} />
    </div>
  );
}
