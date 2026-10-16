import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Button, Checkbox, Dropdown, Grid, Input, Pagination, Popover, Segmented, Select, Skeleton, Table } from 'antd';
import { DownOutlined, DownloadOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { HelpButton } from '../../../help/Hint';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { errorMessage } from '../../../lib/errors';
import { UserAvatar } from '../../shared/People';
import { useApprovalsMeta, urgencyLevels, urgencyName } from '../../approvals/lib';
import { procApi, csvUrl } from '../api';
import { useProc } from '../ProcContext';
import { BOARD_STATUSES, CHIPS, STATUS_COLORS, readStore, writeStore } from '../lib';
import { CategoryTag, DayBadge, Empty, Money, PersonSelect, StatusPill, Urgency } from '../components/bits';
import RequestCard from '../card/RequestCard';

const COLUMNS = ['number', 'title', 'amount', 'supplier', 'urgency', 'status', 'payBy', 'deliverBy', 'responsible', 'category', 'author', 'legalEntity'];
const DEFAULT_COLUMNS = ['number', 'title', 'amount', 'supplier', 'urgency', 'status', 'payBy', 'deliverBy', 'responsible'];
const FILTER_KEYS = ['status', 'category', 'currency', 'urgency', 'responsible', 'legalEntity'];

/** Filters live in the address (shareable, back button) and are remembered per person. */
function useFilter(storeKey) {
  const [search, setSearch] = useSearchParams();
  const stored = useRef(readStore(storeKey, null));
  // First visit without parameters: the remembered filter.
  useEffect(() => {
    if ([...search.keys()].length === 0 && stored.current && Object.keys(stored.current).length) {
      setSearch(new URLSearchParams(stored.current), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const filter = useMemo(() => {
    const out = {};
    for (const key of ['chip', 'q', 'sort', 'order', 'view', ...FILTER_KEYS]) if (search.get(key)) out[key] = search.get(key);
    return out;
  }, [search]);
  const setFilter = useCallback(
    (patch, replace = true) => {
      const next = { ...filter, ...patch };
      for (const key of Object.keys(next)) if (next[key] === undefined || next[key] === null || next[key] === '') delete next[key];
      writeStore(storeKey, next);
      setSearch(new URLSearchParams(next), { replace });
    },
    [filter, setSearch, storeKey]
  );
  return [filter, setFilter];
}

function Chips({ counters, value, onChange }) {
  const { t } = useLocale();
  return (
    <div className="prc-chips" role="tablist" data-tour="proc.chips">
      <button type="button" className={`prc-chip${!value ? ' is-active' : ''}`} onClick={() => onChange(undefined)}>
        {t('procurement.chips.all')}
        {counters && <em>{counters.all}</em>}
      </button>
      {CHIPS.map((chip) => (
        <button key={chip} type="button" className={`prc-chip chip-${chip}${value === chip ? ' is-active' : ''}`} onClick={() => onChange(value === chip ? undefined : chip)}>
          {t(`procurement.chips.${chip}`)}
          {counters && <em className={chip === 'overdue' && counters.overdue ? 'is-alert' : ''}>{counters[chip]}</em>}
        </button>
      ))}
    </div>
  );
}

function FilterPopover({ filter, onChange }) {
  const { t } = useLocale();
  const { meta } = useProc();
  const approvalsMeta = useApprovalsMeta();
  const many = (key) => (filter[key] ? filter[key].split(',') : []);
  const set = (key, list) => onChange({ [key]: list?.length ? list.join(',') : undefined });
  const active = FILTER_KEYS.filter((key) => filter[key]).length;
  const content = (
    <div className="prc-filter">
      <label>{t('procurement.fields.status')}</label>
      <Select mode="multiple" allowClear value={many('status')} onChange={(list) => set('status', list)} options={BOARD_STATUSES.map((status) => ({ value: status, label: t(`procurement.status.${status}`) }))} placeholder={t('procurement.filter.any')} />
      <label>{t('procurement.fields.category')}</label>
      <Select mode="multiple" allowClear value={many('category')} onChange={(list) => set('category', list)} options={(meta.settings.categories || []).map((item) => ({ value: item.key, label: item.name }))} placeholder={t('procurement.filter.any')} />
      <label>{t('procurement.fields.urgency')}</label>
      <Select mode="multiple" allowClear value={many('urgency')} onChange={(list) => set('urgency', list)} options={urgencyLevels(approvalsMeta).map((level) => ({ value: level.key, label: urgencyName(level, t) }))} placeholder={t('procurement.filter.any')} />
      <label>{t('procurement.fields.currency')}</label>
      <Select mode="multiple" allowClear value={many('currency')} onChange={(list) => set('currency', list)} options={meta.settings.currencies.map((code) => ({ value: code, label: code }))} placeholder={t('procurement.filter.any')} />
      <label>{t('procurement.fields.responsible')}</label>
      <PersonSelect value={filter.responsible ? Number(filter.responsible) : null} onChange={(id) => onChange({ responsible: id || undefined })} placeholder={t('procurement.filter.anyone')} />
      {meta.legalEntities.length > 1 && (
        <>
          <label>{t('procurement.fields.legalEntity')}</label>
          <Select allowClear value={filter.legalEntity ? Number(filter.legalEntity) : undefined} onChange={(id) => onChange({ legalEntity: id || undefined })} options={meta.legalEntities.map((entity) => ({ value: entity.id, label: entity.label }))} placeholder={t('procurement.filter.any')} />
        </>
      )}
      {active > 0 && (
        <Button type="link" onClick={() => onChange(Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined])))}>
          {t('procurement.filter.reset')}
        </Button>
      )}
    </div>
  );
  return (
    <Popover content={content} trigger="click" placement="bottomLeft" title={t('procurement.filter.title')}>
      <Button className={active ? 'prc-filter-btn is-active' : 'prc-filter-btn'}>
        {t('procurement.filter.title')}
        {active > 0 && <em>{active}</em>}
      </Button>
    </Popover>
  );
}

function ViewsMenu({ filter, onApply }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const [views, setViews] = useState([]);
  const load = useCallback(() => procApi.views().then((res) => setViews(res.data.views)).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  const save = () => {
    let name = '';
    modal.confirm({
      title: t('procurement.views.saveTitle'),
      icon: null,
      content: <Input autoFocus maxLength={60} placeholder={t('procurement.views.namePlaceholder')} onChange={(event) => (name = event.target.value)} />,
      okText: t('common.save'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        if (!name.trim()) throw new Error('name');
        try {
          await procApi.saveView(name.trim(), filter);
          message.success(t('procurement.views.saved'));
          load();
        } catch (err) {
          message.error(errorMessage(err));
          throw err;
        }
      },
    });
  };
  const items = [
    ...views.map((view) => ({
      key: `v${view.id}`,
      label: (
        <span className="prc-view-item">
          <span>{view.name}</span>
          <button
            type="button"
            aria-label={t('common.delete')}
            onClick={(event) => {
              event.stopPropagation();
              procApi.removeView(view.id).then(load);
            }}
          >
            ✕
          </button>
        </span>
      ),
      onClick: () => onApply(view.filter),
    })),
    ...(views.length ? [{ type: 'divider' }] : []),
    { key: 'save', icon: <PlusOutlined />, label: t('procurement.views.save'), onClick: save },
  ];
  return (
    <Dropdown menu={{ items }} trigger={['click']}>
      <Button className="prc-views-btn" icon={<DownOutlined />} iconPosition="end">{t('procurement.views.title')}</Button>
    </Dropdown>
  );
}

function ColumnsMenu({ value, onChange }) {
  const { t } = useLocale();
  const content = (
    <div className="prc-columns">
      {COLUMNS.map((key) => (
        <Checkbox key={key} checked={value.includes(key)} disabled={key === 'number' || key === 'title'} onChange={(event) => onChange(event.target.checked ? COLUMNS.filter((item) => value.includes(item) || item === key) : value.filter((item) => item !== key))}>
          {t(`procurement.fields.${key}`)}
        </Checkbox>
      ))}
    </div>
  );
  return (
    <Popover content={content} trigger="click" placement="bottomRight">
      <Button aria-label={t('procurement.columns')} icon={<MenuIcon name="sliders" variant="mono" />} />
    </Popover>
  );
}

/** One request as a card (kanban and phones). */
export function RequestTile({ item, onOpen, active }) {
  const { t } = useLocale();
  return (
    <button type="button" className={`prc-tile${item.overdue ? ' is-overdue' : ''}${active ? ' is-active' : ''}`} onClick={() => onOpen(item)}>
      <span className="prc-tile__top">
        <span className="prc-tile__no">{item.number}</span>
        <Urgency value={item.urgency} compact />
        <span className="prc-grow" />
        <StatusPill status={item.status} size="small" />
      </span>
      <strong className="prc-tile__title">{item.title || t('procurement.untitled')}</strong>
      <span className="prc-tile__row">
        <Money amount={item.amount} currency={item.currency} paid={item.paid} />
        {item.supplier?.name && <span className="prc-tile__muted">{item.supplier.name}</span>}
      </span>
      <span className="prc-tile__row">
        {item.payBy && <DayBadge value={item.payBy} done={['paid', 'delivered', 'closed'].includes(item.status)} label={t('procurement.short.payBy')} />}
        {item.approval?.overdue && <span className="prc-day is-overdue"><span className="prc-day__dot" />{t('procurement.approvalOverdue')}</span>}
        <span className="prc-grow" />
        {item.responsible && <UserAvatar user={item.responsible} size={22} />}
      </span>
    </button>
  );
}

function Kanban({ params, onOpen, version, activeId }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    procApi
      .board(params)
      .then((res) => alive && setData(res.data))
      .catch(() => alive && setData({ columns: [] }));
    return () => {
      alive = false;
    };
  }, [params, version]);
  if (!data) return <Skeleton active paragraph={{ rows: 6 }} />;
  const columns = data.columns.filter((column) => column.total > 0 || !['rejected', 'cancelled', 'closed'].includes(column.status));
  return (
    <div className="prc-board">
      {columns.map((column) => (
        <section key={column.status} className="prc-board__col" style={{ '--c': STATUS_COLORS[column.status] }}>
          <header>
            <span className="prc-board__dot" />
            <span>{t(`procurement.status.${column.status}`)}</span>
            <em>{column.total}</em>
          </header>
          <div className="prc-board__list">
            {column.items.map((item) => (
              <RequestTile key={item.id} item={item} onOpen={onOpen} active={item.id === activeId} />
            ))}
            {!column.items.length && <span className="prc-board__empty">—</span>}
            {column.total > column.items.length && <span className="prc-board__more">{t('procurement.board.more', { n: (column.total - column.items.length).toLocaleString(locale) })}</span>}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function RequestsPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const screens = Grid.useBreakpoint();
  const { meta, version, touch } = useProc();
  const [filter, setFilter] = useFilter(`prc:filter:${user?.id}`);
  const [columns, setColumns] = useState(() => readStore(`prc:columns:${user?.id}`, DEFAULT_COLUMNS));
  const [query, setQuery] = useState(filter.q || '');
  const [data, setData] = useState(null);
  const [counters, setCounters] = useState(null);
  const [page, setPage] = useState(1);
  const view = filter.view === 'kanban' ? 'kanban' : 'table';
  const openId = id && /^\d+$/.test(id) ? Number(id) : null;

  // Typing searches after a pause.
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((filter.q || '') !== query) setFilter({ q: query || undefined });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const params = useMemo(() => {
    const out = { ...filter };
    delete out.view;
    return out;
  }, [filter]);
  const paramsKey = JSON.stringify(params);
  useEffect(() => setPage(1), [paramsKey]);

  useEffect(() => {
    let alive = true;
    const { chip, ...rest } = params;
    procApi.counters(rest).then((res) => alive && setCounters(res.data.counters)).catch(() => {});
    if (view === 'table') {
      procApi
        .list({ ...params, page, pageSize: 50 })
        .then((res) => alive && setData(res.data))
        .catch(() => alive && setData({ items: [], total: 0 }));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, page, view, version]);

  useEffect(() => {
    const refresh = () => touch();
    window.addEventListener('approvals:changed', refresh);
    return () => window.removeEventListener('approvals:changed', refresh);
  }, [touch]);

  const open = useCallback((item) => navigate(`/app/procurement/requests/${item.id}${window.location.search}`), [navigate]);
  const close = useCallback(() => navigate(`/app/procurement/requests${window.location.search}`), [navigate]);
  const ids = (data?.items || []).map((item) => item.id);

  const setCols = (next) => {
    setColumns(next);
    writeStore(`prc:columns:${user?.id}`, next);
  };

  const tableColumns = [
    { key: 'number', title: t('procurement.fields.number'), dataIndex: 'number', width: 104, sorter: true, render: (value, item) => <span className={`prc-no${item.overdue ? ' is-overdue' : ''}`}>{value}</span> },
    { key: 'title', title: t('procurement.fields.title'), dataIndex: 'title', ellipsis: true, width: 300, render: (value, item) => <span className="prc-title-cell"><strong>{value || t('procurement.untitled')}</strong>{item.category && <CategoryTag value={item.category} />}</span> },
    { key: 'amount', title: t('procurement.fields.amount'), dataIndex: 'amount', align: 'right', width: 150, sorter: true, render: (value, item) => <Money amount={value} currency={item.currency} paid={item.paid} /> },
    { key: 'supplier', title: t('procurement.fields.supplier'), dataIndex: 'supplier', ellipsis: true, width: 170, render: (value) => value?.name || <span className="prc-muted">—</span> },
    { key: 'urgency', title: t('procurement.fields.urgency'), dataIndex: 'urgency', width: 120, render: (value) => <Urgency value={value} /> },
    { key: 'status', title: t('procurement.fields.status'), dataIndex: 'status', width: 170, sorter: true, render: (value, item) => <span className="prc-status-cell"><StatusPill status={value} />{item.approval?.overdue && <span className="prc-day is-overdue" title={t('procurement.approvalOverdue')}><span className="prc-day__dot" /></span>}</span> },
    { key: 'payBy', title: t('procurement.fields.payBy'), dataIndex: 'payBy', width: 130, sorter: true, render: (value, item) => <DayBadge value={value} done={['paid', 'delivered', 'closed'].includes(item.status)} muted={['rejected', 'cancelled', 'draft'].includes(item.status)} /> },
    { key: 'deliverBy', title: t('procurement.fields.deliverBy'), dataIndex: 'deliverBy', width: 130, sorter: true, render: (value, item) => <DayBadge value={value} done={item.deliveryState === 'full' || item.status === 'closed'} muted={['rejected', 'cancelled', 'draft'].includes(item.status)} /> },
    { key: 'responsible', title: t('procurement.fields.responsible'), dataIndex: 'responsible', width: 160, ellipsis: true, render: (value) => value ? <span className="prc-person"><UserAvatar user={value} size={22} tip={false} /><span>{value.name}</span></span> : '—' },
    { key: 'category', title: t('procurement.fields.category'), dataIndex: 'category', width: 140, render: (value) => <CategoryTag value={value} /> },
    { key: 'author', title: t('procurement.fields.author'), dataIndex: 'author', width: 150, ellipsis: true, render: (value) => value?.name || '—' },
    { key: 'legalEntity', title: t('procurement.fields.legalEntity'), dataIndex: 'legalEntity', width: 150, ellipsis: true, render: (value) => value?.label || '—' },
  ].filter((column) => columns.includes(column.key));

  const sortOrder = (key) => (filter.sort === key ? (filter.order === 'asc' ? 'ascend' : 'descend') : null);
  const exportHref = csvUrl('export.csv', { ...params, columns: columns.join(','), lang: undefined });
  const empty = (
    <Empty
      title={filter.chip || filter.q ? t('procurement.empty.filtered') : t('procurement.empty.title')}
      text={filter.chip || filter.q ? t('procurement.empty.filteredText') : t('procurement.empty.text')}
      action={meta.rights.canCreate && !filter.chip && !filter.q ? <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/app/procurement/new')}>{t('procurement.create')}</Button> : null}
    />
  );

  return (
    <div className="prc-page">
      <header className="mod-hero prc-hero">
        <span className="mod-hero__badge" aria-hidden="true">
          <MenuIcon name="cart" />
        </span>
        <div className="mod-hero__text">
          <h1>{t('procurement.nav.requests')}</h1>
          <p>{t('procurement.hero.lead')}</p>
        </div>
        <div className="mod-hero__actions">
          <HelpButton id="procurement" />
          {meta.rights.canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/app/procurement/new')} data-tour="proc.create">
              {t('procurement.create')}
            </Button>
          )}
        </div>
      </header>

      <Chips counters={counters} value={filter.chip} onChange={(chip) => setFilter({ chip })} />

      <div className="prc-toolbar-wrap">
      <div className="mod-toolbar prc-toolbar">
        <Input allowClear prefix={<SearchOutlined />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('procurement.searchPlaceholder')} className="prc-search" />
        <FilterPopover filter={filter} onChange={setFilter} />
        <ViewsMenu filter={filter} onApply={(saved) => setFilter({ ...Object.fromEntries(['chip', 'q', 'sort', 'order', ...FILTER_KEYS].map((key) => [key, undefined])), ...saved }, false)} />
        <span className="mod-toolbar__grow" />
        <Segmented
          className="prc-view-switch"
          value={view}
          onChange={(next) => setFilter({ view: next === 'table' ? undefined : next })}
          options={[
            { value: 'table', label: t('procurement.view.table') },
            { value: 'kanban', label: t('procurement.view.kanban') },
          ]}
        />
        {view === 'table' && screens.md && <ColumnsMenu value={columns} onChange={setCols} />}
        <Button className="prc-export" icon={<DownloadOutlined />} href={exportHref} aria-label={t('procurement.export')} title={t('procurement.export')}>
          {screens.md ? <span>{t('procurement.exportShort')}</span> : null}
        </Button>
      </div>
      </div>

      {view === 'kanban' ? (
        <Kanban params={params} onOpen={open} version={version} activeId={openId} />
      ) : !data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !data.items.length ? (
        empty
      ) : screens.md ? (
        <section className="panel prc-table" data-tour="proc.list">
          <Table
            rowKey="id"
            size="middle"
            columns={tableColumns.map((column) => (column.sorter ? { ...column, sortOrder: sortOrder(column.key) } : column))}
            dataSource={data.items}
            rowClassName={(item) => `${item.overdue ? 'is-overdue' : ''}${item.id === openId ? ' is-open' : ''}`}
            onRow={(item) => ({ onClick: () => open(item) })}
            scroll={{ x: 'max-content' }}
            onChange={(pagination, _filters, sorter) => {
              if (pagination.current !== page) setPage(pagination.current);
              const key = sorter?.order ? sorter.columnKey : undefined;
              if (key !== filter.sort || (sorter?.order === 'ascend' ? 'asc' : sorter?.order ? 'desc' : undefined) !== filter.order) {
                setFilter({ sort: key, order: sorter?.order === 'ascend' ? 'asc' : sorter?.order ? 'desc' : undefined });
              }
            }}
            pagination={{ current: page, pageSize: 50, total: data.total, showSizeChanger: false, hideOnSinglePage: true }}
          />
        </section>
      ) : (
        <div className="prc-cards" data-tour="proc.list">
          {data.items.map((item) => (
            <RequestTile key={item.id} item={item} onOpen={open} active={item.id === openId} />
          ))}
          {data.total > 50 && <Pagination simple current={page} pageSize={50} total={data.total} onChange={setPage} className="prc-pager" />}
        </div>
      )}

      {openId && <RequestCard id={openId} ids={ids} onOpen={(next) => open({ id: next })} onClose={close} onChanged={touch} />}
    </div>
  );
}
