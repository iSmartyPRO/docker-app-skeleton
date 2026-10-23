import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Grid, Pagination, Skeleton, Table, Tooltip } from 'antd';
import { DownloadOutlined, LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { todayISO } from '../../../lib/datetime';
import ModuleHeader from '../../shared/ModuleHeader';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { HelpButton } from '../../../help/Hint';
import { UrgencyTag, useApprovalsMeta } from '../../approvals/public';
import { useContracts } from '../ContractsContext';
import { contractsApi } from '../api';
import { PAY_VIEWS, VIEWS, isTyping } from '../lib';
import { PayBar } from '../card/Payments';
import { Avatar, Empty, EndDate, Money, StatusPill, TypeTag } from '../components/bits';
import ContractCard from '../card/ContractCard';

const PAGE_SIZE = 50;
const RED = new Set(['overdue', 'waiting', 'pay_overdue']);
const WARN = new Set(['expiring', 'deposit_wait']);

/**
 * A row of chips that scrolls sideways inside the page width: the edges fade
 * where more chips hide, and on devices with a pointer ‹ › buttons scroll it.
 * The picked chip is scrolled into view.
 */
export function ChipRail({ children, label, active }) {
  const { t } = useLocale();
  const ref = useRef(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 2;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);
  useLayoutEffect(() => {
    update();
    if (typeof ResizeObserver === 'undefined' || !ref.current) return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [update, children]);
  useEffect(() => {
    const el = ref.current?.querySelector('.is-active');
    if (el && ref.current) {
      const box = ref.current.getBoundingClientRect();
      const chip = el.getBoundingClientRect();
      if (chip.left < box.left || chip.right > box.right) ref.current.scrollBy({ left: chip.left - box.left - 24, behavior: 'smooth' });
    }
  }, [active]);
  const scroll = (dir) => ref.current?.scrollBy({ left: dir * Math.max(160, ref.current.clientWidth * 0.6), behavior: 'smooth' });
  return (
    <div className={`ctr-rail${edges.start ? ' has-start' : ''}${edges.end ? ' has-end' : ''}`} data-tour="ctr.chips">
      {edges.start && <button type="button" className="ctr-rail__btn is-start" onClick={() => scroll(-1)} aria-label={t('contracts.registry.chipsScroll')} tabIndex={-1}><LeftOutlined /></button>}
      <div ref={ref} className="ctr-chips" role="tablist" aria-label={label} onScroll={update}>
        {children}
      </div>
      {edges.end && <button type="button" className="ctr-rail__btn is-end" onClick={() => scroll(1)} aria-label={t('contracts.registry.chipsScroll')} tabIndex={-1}><RightOutlined /></button>}
    </div>
  );
}

/** Chips with counters over the list (spec §6.4 and the common «Срочные / Просрочено / В работе / Отработано»); the money chips only when they count something. */
function Chips({ view, counts, onPick, expiringDays }) {
  const { t } = useLocale();
  const keys = VIEWS.filter((key) => !PAY_VIEWS.includes(key) || counts?.[key] > 0 || view === key);
  return (
    <ChipRail label={t('contracts.registry.filters')} active={view}>
      {keys.map((key) => {
        const n = counts?.[key];
        return (
          <button key={key} type="button" role="tab" aria-selected={view === key} className={`ctr-chip${view === key ? ' is-active' : ''}${RED.has(key) && n ? ' is-alert' : ''}${WARN.has(key) && n ? ' is-warn' : ''}${PAY_VIEWS.includes(key) ? ' is-money' : ''}`} onClick={() => onPick(key)}>
            <span>{key === 'expiring' ? t('contracts.views.expiring', { n: expiringDays }) : t(`contracts.views.${key}`)}</span>
            <em>{n ?? '·'}</em>
          </button>
        );
      })}
    </ChipRail>
  );
}

/** «оплачено 45 %» under the amount of a contract that tracks its payments. */
function PayMini({ contract }) {
  const { t } = useLocale();
  const pay = contract.payments;
  if (!pay || !(pay.total > 0)) return null;
  const overdue = Boolean(pay.nextDue && pay.nextDue < todayISO());
  return (
    <span className={`ctr-paymini${overdue ? ' is-overdue' : ''}`}>
      <PayBar percent={pay.percent} overdue={overdue} size="xs" />
      <em>{t('contracts.registry.paidShort', { p: pay.percent })}</em>
    </span>
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
        <span className="ctr-cell-money">
          <Money contract={item} />
          <PayMini contract={item} />
        </span>
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
        document.querySelector('.ctr-page .mh-search input')?.focus();
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
        render: (_, item) => (
          <span className="ctr-cell-money">
            <Money contract={item} />
            <PayMini contract={item} />
          </span>
        ),
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
      <ModuleHeader
        className="ctr-mh"
        title={t('apps.contracts.name')}
        titleExtra={<HelpButton id="contracts" />}
        description={t('contracts.registry.subtitle')}
        actions={[
          { key: 'export', icon: <DownloadOutlined />, label: 'CSV', tooltip: t('contracts.registry.export'), href: contractsApi.exportUrl({ view, search, sort, order, lang: document.documentElement.lang }) },
          me.canCreate && { key: 'create', primary: true, icon: <PlusOutlined />, label: t('contracts.create'), onClick: onCreate, tour: 'ctr.create' },
        ]}
        search={{ value: query, onChange: setQuery, onSearch: (value) => setParam({ q: value.trim(), page: 1 }), placeholder: t('contracts.registry.search'), loading }}
      />

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
        <div className="ctr-mlist" data-tour="ctr.list">
          {items.map((item) => (
            <MobileRow key={item.id} item={item} active={String(item.id) === String(id)} onOpen={() => open(item.id)} />
          ))}
        </div>
      ) : (
        <div className="ctr-table-wrap" data-tour="ctr.list">
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
