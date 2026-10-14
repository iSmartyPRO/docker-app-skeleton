import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Checkbox, Popover, Select, Table, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatRelative } from '../../../lib/format';
import { Person } from '../../shared/People';
import { crmApi } from '../api';
import { useCrm } from '../CrmContext';
import { errorCode, formatDay, formatNumber, lostStage, readStore, userKey, wonStage, writeStore } from '../lib';
import BulkBar from '../components/BulkBar';
import FinishDialog from '../components/FinishDialog';
import LostDialog from '../components/LostDialog';
import StageProgress from '../components/StageProgress';
import { Empty, Glyph, Money, NextActivity } from '../components/bits';
import { fieldText } from '../components/fields';

const SORT_KEYS = { title: 'title', amount: 'amount', closeDate: 'close', stage: 'stage', createdAt: 'created', updatedAt: 'updated' };
const BUILTIN = ['title', 'stage', 'amount', 'client', 'owner', 'next', 'closeDate', 'source', 'createdAt', 'updatedAt', 'createdBy'];
const DEFAULT_VISIBLE = ['title', 'stage', 'amount', 'client', 'owner', 'next', 'closeDate'];
const SIZES = [10, 20, 50, 100];

function ColumnChooser({ all, visible, onChange }) {
  const { t } = useLocale();
  const content = (
    <div className="crm-cols">
      <div className="crm-filter__label">{t('crm.list.columns')}</div>
      {all.map((column) => (
        <Checkbox
          key={column.key}
          checked={visible.includes(column.key)}
          disabled={column.key === 'title'}
          onChange={(event) => onChange(event.target.checked ? [...visible, column.key] : visible.filter((key) => key !== column.key))}
        >
          {column.label}
        </Checkbox>
      ))}
      <Button size="small" type="link" onClick={() => onChange(null)}>{t('crm.list.resetColumns')}</Button>
    </div>
  );
  return (
    <Popover content={content} trigger="click" placement="bottomRight">
      <Tooltip title={t('crm.list.columns')}>
        <Button icon={<Glyph name="columns" size={15} />} aria-label={t('crm.list.columns')} />
      </Tooltip>
    </Popover>
  );
}

/** List of deals: server sort and paging, column chooser, bulk actions. */
export default function ListView({ pipeline, params, version, onOpen, onChanged, onCreate }) {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { message } = App.useApp();
  const { settings, userById } = useCrm();
  const prefsKey = userKey(user, 'list');
  const [prefs, setPrefs] = useState(() => readStore(prefsKey, {}));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(null);
  const [selected, setSelected] = useState([]);
  const [finish, setFinish] = useState(null);
  const [lost, setLost] = useState(null);
  const key = JSON.stringify(params);
  const seq = useRef(0);
  const pageSize = prefs.pageSize || 20;
  const sort = prefs.sort || { field: 'updatedAt', order: 'descend' };

  const savePrefs = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    writeStore(prefsKey, next);
  };

  const query = useCallback(
    (extra = {}) => ({ ...JSON.parse(key), sort: SORT_KEYS[sort.field] || 'updated', order: sort.order === 'ascend' ? 'asc' : 'desc', page, pageSize, ...extra }),
    [key, sort.field, sort.order, page, pageSize]
  );

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await crmApi.deals(query(total !== null ? { count: 1 } : {}));
      if (mine !== seq.current) return;
      setData(res.data);
      if (res.data.total !== undefined && total !== null) setTotal(res.data.total);
    } catch (err) {
      if (mine === seq.current) {
        message.error(errorMessage(err));
        setData((prev) => prev || { items: [] });
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    load();
  }, [load, version]);

  // A new filter starts from the first page and forgets the selection and the count.
  useEffect(() => {
    setPage(1);
    setSelected([]);
    setTotal(null);
  }, [key]);

  const showCount = async () => {
    try {
      const res = await crmApi.deals(query({ count: 1, pageSize: 1, page: 1 }));
      setTotal(res.data.total ?? 0);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const move = async (deal, stageId, lostReason) => {
    const previous = data;
    setData((prev) => ({ ...prev, items: prev.items.map((item) => (item.id === deal.id ? { ...item, stageId } : item)) }));
    try {
      const res = await crmApi.moveDeal(deal.id, { stageId, ...(lostReason !== undefined ? { lostReason } : {}) });
      setData((prev) => ({ ...prev, items: prev.items.map((item) => (item.id === deal.id ? res.data.deal : item)) }));
      onChanged?.();
    } catch (err) {
      setData(previous);
      if (errorCode(err) === 'LOST_REASON_REQUIRED') setLost({ deal, stageId });
      else message.error(errorMessage(err));
    }
  };

  const onStage = (deal, target) => {
    if (target === 'finish') {
      setFinish({ deal });
      return;
    }
    if (target.kind === 'lost') setLost({ deal, stageId: target.id });
    else move(deal, target.id);
  };

  const customFields = useMemo(() => settings.fields || [], [settings.fields]);
  const allColumns = useMemo(
    () => [
      ...BUILTIN.map((name) => ({ key: name, label: t(`crm.list.col.${name}`) })),
      ...customFields.map((field) => ({ key: `cf_${field.key}`, label: field.label, field })),
    ],
    [customFields, t]
  );
  const visible = prefs.columns || [...DEFAULT_VISIBLE, ...customFields.filter((field) => field.listColumn).map((field) => `cf_${field.key}`)];
  const sortOrder = (field) => (sort.field === field ? sort.order : null);

  const render = {
    title: { title: t('crm.list.col.title'), dataIndex: 'title', sorter: true, sortOrder: sortOrder('title'), fixed: 'left', width: 230, render: (_, deal) => <span className="crm-row-title">{deal.title}</span> },
    stage: { title: t('crm.list.col.stage'), sorter: true, sortOrder: sortOrder('stage'), width: 220, render: (_, deal) => <StageProgress pipeline={pipeline} stageId={deal.stageId} disabled={deal.canEdit === false} onMove={(target) => onStage(deal, target)} /> },
    amount: { title: t('crm.list.col.amount'), sorter: true, sortOrder: sortOrder('amount'), align: 'right', width: 150, render: (_, deal) => (Number(deal.amount) ? <Money amount={deal.amount} currency={deal.currency} /> : <span className="crm-unset">—</span>) },
    client: {
      title: t('crm.list.col.client'),
      width: 220,
      render: (_, deal) =>
        deal.company || deal.person ? (
          <span className="crm-cell-client">
            <Glyph name={deal.company ? 'building' : 'person'} size={13} />
            <span>{(deal.company || deal.person).name}</span>
          </span>
        ) : (
          <span className="crm-unset">—</span>
        ),
    },
    owner: { title: t('crm.list.col.owner'), width: 190, render: (_, deal) => (deal.owner ? <Person user={deal.owner} size={22} /> : <span className="crm-unset">—</span>) },
    next: { title: t('crm.list.col.next'), width: 180, render: (_, deal) => (deal.activity?.next ? <NextActivity next={deal.activity.next} /> : <span className="crm-card__none">{t('crm.act.none')}</span>) },
    closeDate: { title: t('crm.list.col.closeDate'), sorter: true, sortOrder: sortOrder('closeDate'), width: 130, render: (_, deal) => (deal.closeDate ? formatDay(deal.closeDate, locale, true) : <span className="crm-unset">—</span>) },
    source: { title: t('crm.list.col.source'), width: 140, render: (_, deal) => deal.source || <span className="crm-unset">—</span> },
    createdAt: { title: t('crm.list.col.createdAt'), sorter: true, sortOrder: sortOrder('createdAt'), width: 140, render: (_, deal) => <span className="crm-muted">{formatDay(deal.createdAt, locale)}</span> },
    updatedAt: { title: t('crm.list.col.updatedAt'), sorter: true, sortOrder: sortOrder('updatedAt'), width: 150, render: (_, deal) => <span className="crm-muted">{formatRelative(deal.updatedAt, locale)}</span> },
    createdBy: { title: t('crm.list.col.createdBy'), width: 180, render: (_, deal) => (deal.createdBy ? <Person user={deal.createdBy} size={22} /> : <span className="crm-unset">—</span>) },
  };

  const columns = allColumns
    .filter((column) => visible.includes(column.key) || column.key === 'title')
    .map((column) => {
      if (render[column.key]) return { key: column.key, ...render[column.key] };
      const { field } = column;
      return {
        key: column.key,
        title: field.label,
        width: field.type === 'textarea' ? 240 : 160,
        ellipsis: true,
        render: (_, deal) => fieldText(field, deal.custom?.[field.key], { locale, t, currency: deal.currency, userById }) || <span className="crm-unset">—</span>,
      };
    });

  const items = data?.items || [];
  const hasNext = total !== null ? page * pageSize < total : items.length === pageSize;
  const filterParams = JSON.parse(key);

  return (
    <div className="crm-list">
      <div className="crm-list__bar">
        <span className="crm-muted">
          {total !== null ? t('crm.list.total', { n: formatNumber(total, locale) }) : (
            <button type="button" className="crm-linkbtn" onClick={showCount}>{t('crm.list.showCount')}</button>
          )}
        </span>
        <span className="mod-toolbar__grow" />
        <a className="crm-linkbtn" href={crmApi.exportUrl({ ...filterParams, columns: visible.join(',') })} download>
          ⤓ {t('crm.list.export')}
        </a>
        <ColumnChooser all={allColumns} visible={visible} onChange={(next) => savePrefs({ columns: next || undefined })} />
      </div>
      <Table
        className="crm-table"
        rowKey="id"
        size="middle"
        loading={loading && Boolean(data)}
        dataSource={items}
        columns={columns}
        pagination={false}
        scroll={{ x: 'max-content' }}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected, columnWidth: 44, fixed: true }}
        onRow={(deal) => ({ onClick: () => onOpen(deal), className: 'crm-table__row' })}
        onChange={(_p, _f, sorter) => {
          if (sorter && !Array.isArray(sorter)) {
            savePrefs({ sort: sorter.order ? { field: sorter.columnKey, order: sorter.order } : { field: 'updatedAt', order: 'descend' } });
            setPage(1);
          }
        }}
        showSorterTooltip={false}
        locale={{
          emptyText: data ? (
            <Empty icon="filter" title={t('crm.list.empty')} text={t('crm.list.emptyText')} action={<Button type="primary" onClick={onCreate} icon={<PlusOutlined />}>{t('crm.create.full')}</Button>} />
          ) : (
            <div className="crm-table-skel">{[0, 1, 2, 3, 4, 5].map((n) => <div key={n} />)}</div>
          ),
        }}
      />
      <div className="crm-pager">
        <Select size="small" value={pageSize} onChange={(next) => { savePrefs({ pageSize: next }); setPage(1); }} options={SIZES.map((n) => ({ value: n, label: t('crm.list.perPage', { n }) }))} aria-label={t('crm.list.pageSize')} />
        <span className="mod-toolbar__grow" />
        <Button size="small" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t('crm.list.prev')}>‹</Button>
        <span className="crm-pager__page">{total !== null ? t('crm.list.pageOf', { page, pages: Math.max(1, Math.ceil(total / pageSize)) }) : t('crm.list.page', { page })}</span>
        <Button size="small" disabled={!hasNext} onClick={() => setPage(page + 1)} aria-label={t('crm.list.next')}>›</Button>
      </div>
      <BulkBar ids={selected} total={total} pipeline={pipeline} filterParams={filterParams} onClear={() => setSelected([])} onDone={() => { setSelected([]); load(); onChanged?.(); }} />
      <FinishDialog
        open={finish}
        onCancel={() => setFinish(null)}
        onChoose={(kind) => {
          const { deal } = finish;
          setFinish(null);
          const stage = kind === 'won' ? wonStage(pipeline) : lostStage(pipeline);
          if (!stage) return;
          if (kind === 'lost') setLost({ deal, stageId: stage.id });
          else move(deal, stage.id);
        }}
      />
      <LostDialog
        open={lost}
        onCancel={() => setLost(null)}
        onOk={async (reason) => {
          const { deal, stageId } = lost;
          setLost(null);
          await move(deal, stageId, reason);
        }}
      />
    </div>
  );
}
