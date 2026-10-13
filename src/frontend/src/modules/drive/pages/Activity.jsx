import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Avatar, Button, DatePicker, Empty, Input, Segmented, Select, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useLocale } from '../../../context/LocaleContext';
import { formatDateTime, formatRelative } from '../../../lib/format';
import { fromPicker, getRegional, nowInZone, pickerFormat, toPicker, useRegional } from '../../../lib/datetime';
import { driveApi, driveError, fileUrl, folderUrl, formatBytes } from '../api';
import { useDrive } from '../DriveContext';

// Mirrors ACTION_GROUPS in the backend (modules/drive/activity.js).
export const ACTION_GROUPS = {
  browse: ['list', 'search', 'view', 'link_open'],
  download: ['download', 'download_zip'],
  change: ['upload', 'mkdir', 'rename', 'move', 'copy', 'edit'],
  delete: ['delete'],
  links: ['link_create', 'link_update', 'link_delete', 'link_password_failed'],
  connect: ['connect', 'disconnect'],
  admin: ['server_save', 'server_delete', 'share_save', 'share_delete'],
};
const GROUP_OF = Object.fromEntries(Object.entries(ACTION_GROUPS).flatMap(([group, actions]) => actions.map((action) => [action, group])));
const GROUP_COLOR = { browse: 'default', download: 'geekblue', change: 'green', delete: 'red', links: 'purple', connect: 'gold', admin: 'magenta' };
const GLYPH = {
  list: '▤', search: '⌕', view: '◉', link_open: '🔗', download: '⤓', download_zip: '⤓', upload: '⤒', mkdir: '＋', rename: '✎', move: '⇢', copy: '⧉', edit: '✎',
  delete: '✕', link_create: '🔗', link_update: '🔗', link_delete: '🔗', link_password_failed: '🔒', connect: '⚿', disconnect: '⚿',
  server_save: '⚙', server_delete: '⚙', share_save: '⚙', share_delete: '⚙',
};
/** An error code in words: the drive's own texts, then the log's, else the code itself. */
function codeText(t, code) {
  for (const key of [`drive.errors.${code}`, `driveActivity.codes.${code}`]) {
    const text = t(key);
    if (text !== key) return text;
  }
  return code;
}

const PERIODS = ['today', '7', '30', '90', 'custom'];

/** Filters live in the address, so a view of the log can be bookmarked or sent. */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => {
    const read = (key) => params.get(key) || '';
    const list = (key) => read(key).split(',').filter(Boolean);
    return {
      period: PERIODS.includes(read('period')) ? read('period') : read('from') ? 'custom' : '7',
      from: read('from'),
      to: read('to'),
      q: read('q'),
      users: list('users').map(Number).filter(Boolean),
      actions: list('actions'),
      shares: list('shares').map(Number).filter(Boolean),
      result: read('result'),
      via: read('via'),
      path: read('path'),
      page: Number(read('page')) || 1,
      pageSize: Number(read('pageSize')) || 50,
    };
  }, [params]);
  const update = useCallback(
    (patch, { keepPage = false } = {}) => {
      const next = new URLSearchParams(params);
      Object.entries(patch).forEach(([key, value]) => {
        const text = Array.isArray(value) ? value.join(',') : value == null ? '' : String(value);
        if (text) next.set(key, text);
        else next.delete(key);
      });
      if (!keepPage) next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams]
  );
  return [filters, update, setParams];
}

/** Query sent to the API for the filters on screen. */
function apiQuery(filters) {
  let from;
  let to;
  if (filters.period === 'custom') {
    from = filters.from || undefined;
    to = filters.to || undefined;
  } else if (filters.period === 'today') {
    // "Today" starts at midnight in the person's zone.
    from = nowInZone().startOf('day').toISOString();
  } else {
    from = dayjs().subtract(Number(filters.period), 'day').toISOString();
  }
  return {
    from,
    to,
    q: filters.q || undefined,
    users: filters.users.join(',') || undefined,
    actions: filters.actions.join(',') || undefined,
    shares: filters.shares.join(',') || undefined,
    result: filters.result || undefined,
    via: filters.via || undefined,
    path: filters.path || undefined,
  };
}

function Who({ row, onPick }) {
  const { t } = useLocale();
  if (!row.user) {
    return (
      <span className="dva-who is-guest">
        <Avatar size={30}>?</Avatar>
        <span>
          <strong>{t('driveActivity.visitor')}</strong>
          <em>{row.ip || '—'}</em>
        </span>
      </span>
    );
  }
  const initials = (row.user.name || row.user.login || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <button type="button" className="dva-who" onClick={() => row.user.id && onPick(row.user.id)} title={t('driveActivity.filterUser')}>
      <Avatar size={30} src={row.user.avatarUrl || undefined}>{initials}</Avatar>
      <span>
        <strong>{row.user.name || row.user.login}</strong>
        <em>
          {row.user.login}
          {row.user.deleted && ` · ${t('driveActivity.deletedUser')}`}
        </em>
      </span>
    </button>
  );
}

function Where({ row, onPath }) {
  const { t } = useLocale();
  const name = row.path ? row.path.split('/').pop() : '';
  const parent = row.path.includes('/') ? row.path.slice(0, row.path.lastIndexOf('/')) : '';
  // Where the item is now: the new place after a move or rename.
  const moved = ['move', 'rename', 'copy'].includes(row.action);
  const livePath = moved ? row.toPath || '' : row.path;
  const liveShare = (moved && row.toShare?.id) || row.share?.id;
  const isFolder = row.isDir || ['list', 'search', 'mkdir', 'share_save', 'link_open'].includes(row.action) || !livePath;
  const openUrl = row.ok && liveShare && !['delete', 'share_delete', 'link_delete'].includes(row.action) ? (isFolder ? folderUrl(liveShare, livePath) : fileUrl(liveShare, livePath)) : null;
  const target = row.toPath != null && (
    <span className="dva-where__to">
      → {row.toShare && row.toShare.id !== row.share?.id && <b>{row.toShare.title} / </b>}
      {row.toPath}
    </span>
  );
  if (!row.share && !row.path) {
    const extra = row.details?.name || row.details?.host || row.details?.account;
    return <span className="dva-where is-empty">{extra || '—'}</span>;
  }
  return (
    <span className="dva-where">
      {row.share && (
        <span className="dva-share" style={{ '--c': row.share.color || '#64748B' }}>
          <i />
          {row.share.title}
        </span>
      )}
      {row.path ? (
        <button type="button" className="dva-where__path" onClick={() => onPath(row.path)} title={t('driveActivity.filterPath')}>
          {parent && <span>{parent}/</span>}
          <strong>{name}</strong>
        </button>
      ) : (
        <span className="dva-where__root">{t('driveActivity.root')}</span>
      )}
      {target}
      {openUrl && (
        <Tooltip title={t('driveActivity.open')}>
          <Link to={openUrl} className="dva-where__open" aria-label={t('driveActivity.open')}>↗</Link>
        </Tooltip>
      )}
    </span>
  );
}

function Details({ row }) {
  const { t, locale } = useLocale();
  const details = row.details || {};
  const items = [
    [t('driveActivity.when'), formatDateTime(row.at, locale, { dateStyle: 'full', timeStyle: 'medium' })],
    row.via === 'link' && [t('driveActivity.viaLink'), row.linkId ? `#${row.linkId}` : details.token ? `${details.token}…` : '—'],
    details.q && [t('driveActivity.query'), details.q],
    details.error && [t('driveActivity.error'), details.error],
    details.items && [t('driveActivity.items'), details.items.join(', ')],
    details.account && [t('driveActivity.account'), details.account],
    details.replaced && [t('driveActivity.replaced'), '✓'],
    row.ip && ['IP', row.ip],
    row.userAgent && [t('driveActivity.browser'), row.userAgent],
  ].filter(Boolean);
  const rest = Object.fromEntries(Object.entries(details).filter(([key, value]) => !['q', 'error', 'items', 'account', 'replaced', 'token'].includes(key) && value !== undefined && value !== null));
  return (
    <dl className="dva-details">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      {Object.keys(rest).length > 0 && (
        <div>
          <dt>{t('driveActivity.more')}</dt>
          <dd>
            <code>{JSON.stringify(rest)}</code>
          </dd>
        </div>
      )}
    </dl>
  );
}

/** /app/drive/activity — who did what on the file server (drive.audit). */
export default function Activity() {
  const { t, locale } = useLocale();
  const regional = useRegional();
  const { shares } = useDrive();
  const [filters, update] = useFilters();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [people, setPeople] = useState([]);
  const [names, setNames] = useState({});
  const [q, setQ] = useState(filters.q);
  const searchTimer = useRef(null);
  const query = useMemo(() => apiQuery(filters), [filters]);

  const load = useCallback(() => {
    setLoading(true);
    driveApi
      .activity({ ...query, page: filters.page, pageSize: filters.pageSize })
      .then((res) => {
        setData(res.data);
        setError(null);
        // Remember names seen, so chosen people keep their labels in the filter.
        setNames((prev) => {
          const next = { ...prev };
          res.data.items.forEach((row) => row.user?.id && (next[row.user.id] = row.user.name || row.user.login));
          res.data.top.users.forEach((user) => (next[user.id] = user.name));
          return next;
        });
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [query, filters.page, filters.pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const findPeople = useCallback((text) => {
    driveApi
      .activityPeople(text)
      .then((res) => {
        setPeople(res.data.people);
        setNames((prev) => ({ ...prev, ...Object.fromEntries(res.data.people.map((person) => [person.id, person.name])) }));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    findPeople('');
  }, [findPeople]);

  useEffect(() => setQ(filters.q), [filters.q]);
  const onSearch = (value) => {
    setQ(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => update({ q: value.trim() }), 400);
  };

  const pickUser = (id) => update({ users: filters.users.includes(id) ? filters.users : [...filters.users, id] });
  const pickPath = (path) => update({ path });

  const actionOptions = Object.entries(ACTION_GROUPS).map(([group, actions]) => ({
    label: t(`driveActivity.groups.${group}`),
    options: [
      { value: group, label: <span className="dva-opt-all">{t('driveActivity.allOfGroup', { group: t(`driveActivity.groups.${group}`).toLowerCase() })}</span> },
      ...actions.map((action) => ({ value: action, label: t(`driveActivity.actions.${action}`) })),
    ],
  }));
  const shareOptions = useMemo(() => {
    const known = new Map((shares || []).map((share) => [share.id, share.title]));
    (data?.items || []).forEach((row) => row.share?.id && !known.has(row.share.id) && known.set(row.share.id, row.share.title));
    return [...known].map(([value, label]) => ({ value, label }));
  }, [shares, data]);
  const userOptions = useMemo(() => {
    const map = new Map(people.map((person) => [person.id, person]));
    filters.users.forEach((id) => !map.has(id) && map.set(id, { id, name: names[id] || `#${id}` }));
    return [...map.values()].map((person) => ({ value: person.id, label: person.login ? `${person.name} · ${person.login}` : person.name }));
  }, [people, filters.users, names]);

  const active = filters.q || filters.users.length || filters.actions.length || filters.shares.length || filters.result || filters.via || filters.path;
  const summary = data?.summary || {};
  const kpis = [
    ['events', summary.events, () => update({ actions: [], result: '' }), !filters.actions.length && !filters.result],
    ['people', summary.people, null, false],
    ['downloads', summary.downloads, () => update({ actions: ['download'], result: '' }), filters.actions.join() === 'download'],
    ['changes', summary.changes, () => update({ actions: ['change'], result: '' }), filters.actions.join() === 'change'],
    ['deletes', summary.deletes, () => update({ actions: ['delete'], result: '' }), filters.actions.join() === 'delete'],
    ['failures', summary.failures, () => update({ result: 'failed', actions: [] }), filters.result === 'failed'],
  ];

  const columns = [
    {
      title: t('driveActivity.time'),
      dataIndex: 'at',
      width: 150,
      render: (value) => (
        <span className="dva-time">
          <strong>{formatDateTime(value, locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
          <em>{formatRelative(value, locale)}</em>
        </span>
      ),
    },
    { title: t('driveActivity.user'), key: 'user', width: 220, render: (_, row) => <Who row={row} onPick={pickUser} /> },
    {
      title: t('driveActivity.action'),
      dataIndex: 'action',
      width: 190,
      render: (action, row) => (
        <span className="dva-action">
          <Tag bordered={false} color={GROUP_COLOR[GROUP_OF[action]] || 'default'}>
            <span className="dva-action__glyph">{GLYPH[action]}</span> {t(`driveActivity.actions.${action}`)}
          </Tag>
          {row.via === 'link' && <Tag bordered={false} className="dva-via">{t('driveActivity.viaLinkShort')}</Tag>}
        </span>
      ),
    },
    { title: t('driveActivity.object'), key: 'object', render: (_, row) => <Where row={row} onPath={pickPath} /> },
    {
      title: t('driveActivity.size'),
      key: 'size',
      width: 110,
      align: 'right',
      render: (_, row) => (row.size != null ? formatBytes(row.size) : row.count > 1 ? t('driveActivity.itemsN', { n: row.count }) : '—'),
    },
    {
      title: t('driveActivity.result'),
      key: 'ok',
      width: 160,
      render: (_, row) =>
        row.ok ? (
          <span className="dva-ok">✓</span>
        ) : (
          <Tooltip title={row.details?.error || codeText(t, row.code)}>
            <Tag color="error" bordered={false} className="dva-fail">{codeText(t, row.code)}</Tag>
          </Tooltip>
        ),
    },
  ];

  return (
    <div className="dva">
      <header className="dva-head">
        <div>
          <h1>{t('driveActivity.title')}</h1>
          <p>{t('driveActivity.lead')}</p>
        </div>
        <div className="dva-head__actions">
          <Button onClick={load} loading={loading}>↻ {t('driveActivity.refresh')}</Button>
          <Tooltip title={t('driveActivity.exportHint')}>
            <Button type="primary" href={driveApi.activityExportUrl({ ...query, tz: getRegional().timeZone })}>⤓ {t('driveActivity.export')}</Button>
          </Tooltip>
        </div>
      </header>

      <section className="dva-filters">
        <div className="dva-filters__row">
          <Input.Search className="dva-search" allowClear placeholder={t('driveActivity.searchPlaceholder')} value={q} onChange={(event) => onSearch(event.target.value)} onSearch={(value) => update({ q: value.trim() })} />
          <Segmented
            value={filters.period}
            onChange={(period) => update(period === 'custom' ? { period, from: nowInZone().subtract(7, 'day').startOf('day').toISOString(), to: '' } : { period, from: '', to: '' })}
            options={PERIODS.map((value) => ({ value, label: t(`driveActivity.period.${value}`) }))}
          />
          {filters.period === 'custom' && (
            <DatePicker.RangePicker
              showTime={{ format: pickerFormat(regional).time, use12Hours: regional.timeFormat === '12' }}
              format={pickerFormat(regional).dateTime}
              allowEmpty={[false, true]}
              value={[toPicker(filters.from || null, regional), toPicker(filters.to || null, regional)]}
              onChange={(range) => update({ from: fromPicker(range?.[0], regional) || '', to: fromPicker(range?.[1], regional) || '' })}
            />
          )}
        </div>
        <div className="dva-filters__row">
          <Select
            mode="multiple"
            allowClear
            showSearch
            className="dva-filter dva-filter--users"
            placeholder={t('driveActivity.allUsers')}
            value={filters.users}
            options={userOptions}
            filterOption={false}
            onSearch={findPeople}
            onChange={(users) => update({ users })}
            notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('driveActivity.noPeople')} />}
            maxTagCount="responsive"
          />
          <Select
            mode="multiple"
            allowClear
            className="dva-filter dva-filter--actions"
            placeholder={t('driveActivity.allActions')}
            value={filters.actions}
            options={actionOptions}
            onChange={(actions) => update({ actions })}
            maxTagCount="responsive"
            optionFilterProp="label"
          />
          <Select
            mode="multiple"
            allowClear
            className="dva-filter"
            placeholder={t('driveActivity.allFolders')}
            value={filters.shares}
            options={shareOptions}
            onChange={(list) => update({ shares: list })}
            maxTagCount="responsive"
            optionFilterProp="label"
          />
          <Select
            className="dva-filter dva-filter--small"
            value={filters.result || 'all'}
            onChange={(value) => update({ result: value === 'all' ? '' : value })}
            options={['all', 'ok', 'failed'].map((value) => ({ value, label: t(`driveActivity.resultFilter.${value}`) }))}
          />
          <Select
            className="dva-filter dva-filter--small"
            value={filters.via || 'all'}
            onChange={(value) => update({ via: value === 'all' ? '' : value })}
            options={['all', 'portal', 'link'].map((value) => ({ value, label: t(`driveActivity.via.${value}`) }))}
          />
          {active ? (
            <Button type="link" onClick={() => update({ q: '', users: [], actions: [], shares: [], result: '', via: '', path: '' })}>
              {t('driveActivity.reset')}
            </Button>
          ) : null}
        </div>
        {filters.path && (
          <div className="dva-filters__chips">
            <Tag closable onClose={() => update({ path: '' })} className="dva-chip">
              {t('driveActivity.pathFilter')}: <b>{filters.path}</b>
            </Tag>
          </div>
        )}
      </section>

      <section className="dva-kpis">
        {kpis.map(([key, value, onClick, on]) => (
          <button key={key} type="button" className={`dva-kpi is-${key}${on && onClick ? ' is-on' : ''}`} onClick={onClick || undefined} disabled={!onClick}>
            <strong>{value ?? '—'}</strong>
            <span>{t(`driveActivity.kpi.${key}`)}</span>
          </button>
        ))}
      </section>

      <div className="dva-body">
        <div className="dva-table">
          {error ? (
            <div className="viewer-empty">{driveError(error, t)}</div>
          ) : (
            <Table
              rowKey="id"
              size="middle"
              loading={loading}
              columns={columns}
              dataSource={data?.items || []}
              scroll={{ x: 1060 }}
              tableLayout="fixed"
              expandable={{ expandedRowRender: (row) => <Details row={row} />, expandRowByClick: false }}
              locale={{ emptyText: <Empty description={t('driveActivity.empty')} /> }}
              rowClassName={(row) => (row.ok ? '' : 'is-failed')}
              pagination={{
                current: filters.page,
                pageSize: filters.pageSize,
                total: data?.total || 0,
                showSizeChanger: true,
                pageSizeOptions: [25, 50, 100, 200],
                showTotal: (total) => t('driveActivity.total', { n: total }),
                onChange: (page, pageSize) => update({ page: page > 1 ? page : '', pageSize: pageSize !== 50 ? pageSize : '' }, { keepPage: true }),
              }}
            />
          )}
        </div>
        <aside className="dva-side">
          <div className="dva-card">
            <h3>{t('driveActivity.topUsers')}</h3>
            {data?.top.users.length ? (
              data.top.users.map((user) => (
                <button key={user.id} type="button" className="dva-top" onClick={() => pickUser(user.id)}>
                  <span>{user.name}</span>
                  <b>{user.events}</b>
                </button>
              ))
            ) : (
              <span className="dva-card__empty">—</span>
            )}
          </div>
          <div className="dva-card">
            <h3>{t('driveActivity.topFiles')}</h3>
            {data?.top.files.length ? (
              data.top.files.map((file) => (
                <button key={`${file.shareId}:${file.path}`} type="button" className="dva-top" onClick={() => update({ path: file.path, shares: file.shareId ? [file.shareId] : [] })} title={`${file.shareTitle || ''} / ${file.path}`}>
                  <span>
                    {file.path.split('/').pop()}
                    <em>{file.shareTitle}</em>
                  </span>
                  <b>{file.events}</b>
                </button>
              ))
            ) : (
              <span className="dva-card__empty">—</span>
            )}
          </div>
          <p className="dva-note">{t('driveActivity.note')}</p>
        </aside>
      </div>
    </div>
  );
}
