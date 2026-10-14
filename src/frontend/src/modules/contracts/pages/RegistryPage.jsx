import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Grid, Input, Pagination, Skeleton, Table, Tooltip } from 'antd';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { HelpButton } from '../../../help/Hint';
import { UrgencyTag } from '../../approvals/components/bits';
import { useApprovalsMeta } from '../../approvals/lib';
import { useContracts } from '../ContractsContext';
import { contractsApi } from '../api';
import { VIEWS, isTyping } from '../lib';
import { Avatar, Empty, EndDate, Money, StatusPill, TypeTag } from '../components/bits';
import ContractCard from '../card/ContractCard';

const PAGE_SIZE = 50;
const RED = new Set(['overdue', 'waiting']);

/** Chips with counters over the list (spec §6.4 and the common «Срочные / Просрочено / В работе / Отработано»). */
function Chips({ view, counts, onPick, expiringDays }) {
  const { t } = useLocale();
  return (
    <div className="ctr-chips" role="tablist" aria-label={t('contracts.registry.filters')}>
      {VIEWS.map((key) => {
        const n = counts?.[key];
        return (
          <button key={key} type="button" role="tab" aria-selected={view === key} className={`ctr-chip${view === key ? ' is-active' : ''}${RED.has(key) && n ? ' is-alert' : ''}${key === 'expiring' && n ? ' is-warn' : ''}`} onClick={() => onPick(key)}>
            <span>{key === 'expiring' ? t('contracts.views.expiring', { n: expiringDays }) : t(`contracts.views.${key}`)}</span>
            <em>{n ?? '·'}</em>
          </button>
        );
      })}
    </div>
  );
}

/** One contract as a card (phones). */
function MobileRow({ item, active, onOpen }) {
  const { t } = useLocale();
  const meta = useApprovalsMeta();
  return (
    <button type="button" className={`ctr-mrow${active ? ' is-current' : ''}`} onClick={onOpen}>
      <div className="ctr-mrow__top">
        <span className="ctr-mrow__no">{item.number}</span>
        <StatusPill status={item.status} />
        {item.approval?.urgency && ['approval', 'question'].includes(item.status) && <UrgencyTag meta={meta} value={item.approval.urgency} compact />}
        {item.openHighRisks > 0 && <span className="ctr-riskdot" title={t('contracts.risks.highOpen', { n: item.openHighRisks })}>! {item.openHighRisks}</span>}
      </div>
      <strong className="ctr-mrow__title">{item.title}</strong>
      <span className="ctr-mrow__cp">{item.counterparty || t('contracts.registry.noCounterparty')}</span>
      <div className="ctr-mrow__bottom">
        <Money contract={item} />
        <span className="ctr-grow" />
        <EndDate contract={item} compact />
        <Avatar user={item.owner} size={20} />
      </div>
    </button>
  );
}

/**
 * The registry (/app/contracts): chips with counters, search, the table
 * (cards on phones) with server paging and sorting; the card opens on the
 * right over the list (/app/contracts/:id) and ↑ / ↓ walk the list.
 */
export default function RegistryPage({ onCreate }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const screens = Grid.useBreakpoint();
  const mobile = !screens.md;
  const approvalsMeta = useApprovalsMeta();
  const { settings, me, counts: globalCounts, version } = useContracts();
  const view = VIEWS.includes(params.get('view')) ? params.get('view') : 'all';
  const search = params.get('q') || '';
  const sort = params.get('sort') || '';
  const order = params.get('order') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [query, setQuery] = useState(search);
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(null);
  const seq = useRef(0);

  const setParam = useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === undefined || value === '' || (key === 'view' && value === 'all') || (key === 'page' && value === 1)) next.delete(key);
            else next.set(key, String(value));
          }
          next.delete('risk');
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  // Search as you type (debounced).
  useEffect(() => {
    if (query === search) return undefined;
    const timer = setTimeout(() => setParam({ q: query.trim(), page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [query, search, setParam]);

  const load = useCallback(() => {
    const mine = ++seq.current;
    setLoading(true);
    const filter = { search: search || undefined };
    Promise.all([contractsApi.list({ ...filter, view, sort: sort || undefined, order: order || undefined, page, pageSize: PAGE_SIZE }), contractsApi.counters(filter)])
      .then(([list, counters]) => {
        if (mine !== seq.current) return;
        setData(list.data);
        setCounts(counters.data.counts);
        setError(null);
      })
      .catch((err) => mine === seq.current && setError(err))
      .finally(() => mine === seq.current && setLoading(false));
  }, [search, view, sort, order, page]);

  useEffect(() => {
    load();
  }, [load, version]);

  // «/» focuses the search; N opens a new contract.
  useEffect(() => {
    const onKey = (event) => {
      if (id || isTyping(document.activeElement) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  const items = data?.items || [];
  const open = (contractId) => navigate({ pathname: `/app/contracts/${contractId}`, search: params.toString() });
  const close = () => navigate({ pathname: '/app/contracts', search: (() => { const next = new URLSearchParams(params); next.delete('risk'); return next.toString(); })() });
  const step = (dir) => {
    const index = items.findIndex((item) => String(item.id) === String(id));
    const next = items[index + dir];
    if (next) open(next.id);
  };

  const columns = useMemo(
    () => [
      {
        key: 'number',
        dataIndex: 'number',
        title: '№',
        width: 120,
        sorter: true,
        sortOrder: sort === 'number' ? (order === 'desc' ? 'descend' : 'ascend') : null,
        render: (value, item) => (
          <div className="ctr-cell-no">
            <span>{value}</span>
            {item.extNumber && <em title={t('contracts.fields.extNumber')}>{item.extNumber}</em>}
          </div>
        ),
      },
      {
        key: 'counterparty',
        title: t('contracts.registry.colContract'),
        sorter: true,
        sortOrder: sort === 'counterparty' ? (order === 'desc' ? 'descend' : 'ascend') : null,
        render: (_, item) => (
          <div className="ctr-cell-main">
            <strong>{item.counterparty || <span className="ctr-muted">{t('contracts.registry.noCounterparty')}</span>}</strong>
            <span>
              {item.title}
              {item.openHighRisks > 0 && (
                <Tooltip title={t('contracts.risks.highOpen', { n: item.openHighRisks })}>
                  <span className="ctr-riskdot">! {item.openHighRisks}</span>
                </Tooltip>
              )}
            </span>
          </div>
        ),
      },
      { key: 'type', title: t('contracts.fields.type'), width: 130, responsive: ['lg'], render: (_, item) => <TypeTag typeKey={item.typeKey} /> },
      {
        key: 'amount',
        title: t('contracts.fields.amount'),
        width: 150,
        align: 'right',
        sorter: true,
        sortOrder: sort === 'amount' ? (order === 'desc' ? 'descend' : 'ascend') : null,
        render: (_, item) => <Money contract={item} />,
      },
      {
        key: 'endsOn',
        title: t('contracts.registry.colEnds'),
        width: 150,
        sorter: true,
        sortOrder: sort === 'endsOn' ? (order === 'desc' ? 'descend' : 'ascend') : null,
        render: (_, item) => <EndDate contract={item} />,
      },
      {
        key: 'status',
        title: t('contracts.fields.status'),
        width: 170,
        render: (_, item) => (
          <div className="ctr-cell-status">
            <StatusPill status={item.status} />
            {item.approval?.urgency && ['approval', 'question'].includes(item.status) && <UrgencyTag meta={approvalsMeta} value={item.approval.urgency} compact />}
            {item.approval?.overdue && <span className="ctr-overdue" title={t('contracts.registry.approvalOverdue')}>⏰</span>}
            {!item.hasSigned && ['signed', 'active', 'expiring', 'approved'].includes(item.status) && (
              <Tooltip title={t('contracts.registry.noSigned')}>
                <span className="ctr-nosig">✍?</span>
              </Tooltip>
            )}
          </div>
        ),
      },
      {
        key: 'owner',
        title: t('contracts.fields.owner'),
        width: 72,
        align: 'center',
        render: (_, item) => (
          <Tooltip title={item.owner?.name}>
            <span>
              <Avatar user={item.owner} size={26} />
            </span>
          </Tooltip>
        ),
      },
    ],
    [t, sort, order, approvalsMeta]
  );

  const emptyText = search ? t('contracts.registry.emptySearch') : t(`contracts.registry.empty.${view}`);

  return (
    <div className="ctr-page">
      <header className="ctr-page__head">
        <div className="ctr-page__title">
          <h1>
            <span className="ctr-page__name">{t('apps.contracts.name')}</span> <HelpButton id="contracts" />
          </h1>
          <p>{t('contracts.registry.subtitle')}</p>
        </div>
        <div className="ctr-page__actions">
          <Tooltip title={t('contracts.registry.export')}>
            <Button href={contractsApi.exportUrl({ view, search, sort, order, lang: document.documentElement.lang })} icon={<DownloadOutlined />} aria-label={t('contracts.registry.export')}>
              CSV
            </Button>
          </Tooltip>
          {me.canCreate && (
            <Button type="primary" className="ctr-page__create" onClick={onCreate} icon={<PlusOutlined />} aria-label={t('contracts.create')}>
              <span>{t('contracts.create')}</span>
            </Button>
          )}
        </div>
      </header>
      <div className="ctr-toolbar">
        <Input.Search
          ref={searchRef}
          allowClear
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onSearch={(value) => setParam({ q: value.trim(), page: 1 })}
          placeholder={t('contracts.registry.search')}
          className="ctr-search"
          aria-label={t('contracts.registry.search')}
        />
      </div>

      <Chips view={view} counts={counts || globalCounts} onPick={(key) => setParam({ view: key, page: 1 })} expiringDays={settings.expiringDays || 30} />

      {error ? (
        <Empty icon="⚠️" title={t('contracts.loadError')} text={errorMessage(error)} action={<Button onClick={load}>{t('common.retry')}</Button>} />
      ) : !data ? (
        <div className="ctr-table-wrap">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      ) : !items.length ? (
        <Empty
          icon={view === 'waiting' ? '✅' : view === 'archive' ? '🗄' : '📄'}
          title={emptyText}
          text={!search && view === 'all' && me.canCreate ? t('contracts.registry.emptyHint') : null}
          action={!search && view === 'all' && me.canCreate ? <Button type="primary" onClick={onCreate} icon={<PlusOutlined />}>{t('contracts.create')}</Button> : null}
        />
      ) : mobile ? (
        <div className="ctr-mlist">
          {items.map((item) => (
            <MobileRow key={item.id} item={item} active={String(item.id) === String(id)} onOpen={() => open(item.id)} />
          ))}
        </div>
      ) : (
        <div className="ctr-table-wrap">
          <Table
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={items}
            loading={loading}
            pagination={false}
            onRow={(item) => ({ onClick: () => open(item.id), className: `ctr-row st-${item.status}${String(item.id) === String(id) ? ' is-current' : ''}` })}
            onChange={(_, __, sorter) => {
              const key = sorter?.order ? sorter.columnKey : '';
              setParam({ sort: key, order: sorter?.order === 'descend' ? 'desc' : sorter?.order ? 'asc' : '', page: 1 });
            }}
            scroll={{ x: 900 }}
          />
        </div>
      )}
      {data && data.total > PAGE_SIZE && (
        <div className="ctr-pager">
          <Pagination current={page} pageSize={PAGE_SIZE} total={data.total} showSizeChanger={false} onChange={(next) => setParam({ page: next })} size={mobile ? 'small' : 'default'} />
        </div>
      )}
      {data && <div className="ctr-total">{t('contracts.registry.total', { n: data.total })}</div>}

      {id && <ContractCard id={Number(id)} onClose={close} onStep={items.length > 1 ? step : null} />}
    </div>
  );
}
