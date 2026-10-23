import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { App, Avatar, Button, Empty, Pagination, Select, Table, Tag, Tooltip } from 'antd';
import { DownloadOutlined, MailOutlined, PhoneOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { fmtDate } from '../../../lib/datetime';
import ModuleHeader, { ViewToggle } from '../../shared/ModuleHeader';
import { UnitSelect, useOrg } from '../../org/public';
import { empApi } from '../api';
import { useEmp } from '../EmpContext';
import EmployeeForm from '../EmployeeForm';
import { CLEARANCE_COLORS, STATUS_COLORS, downloadFile, empError, initials } from '../lib';

const VIEW_KEY = 'emp_registry_view';

/** «Реестр» (spec §4.2): table and cards, filters, search, export. */
export default function RegistryPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { meta, positions, counters, version } = useEmp();
  const { meta: orgMeta } = useOrg();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) || 'list';
    } catch {
      return 'list';
    }
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const hr = Boolean(meta?.rights?.hr);
  const filters = useMemo(
    () => ({
      q: params.get('q') || '',
      unitId: params.get('unit') ? Number(params.get('unit')) : null,
      siteId: params.get('site') ? Number(params.get('site')) : null,
      positionId: params.get('position') ? Number(params.get('position')) : null,
      status: params.get('status') || '',
      chip: params.get('chip') || '',
      page: Number(params.get('page')) || 1,
    }),
    [params]
  );
  const setFilter = (patch) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  const query = useMemo(
    () => ({
      q: filters.q || undefined,
      unitId: filters.unitId || undefined,
      siteId: filters.siteId || undefined,
      positionId: filters.positionId || undefined,
      status: filters.status || undefined,
      noAccess: filters.chip === 'noAccess' ? 1 : undefined,
      expiring: filters.chip === 'expiring' ? 1 : undefined,
      page: filters.page,
      limit: 50,
    }),
    [filters]
  );
  const [search, setSearch] = useState(filters.q);
  useEffect(() => setSearch(filters.q), [filters.q]);

  const load = useCallback(() => {
    setLoading(true);
    empApi
      .list(query)
      .then((res) => setData(res.data))
      .catch((err) => message.error(empError(err, t)))
      .finally(() => setLoading(false));
  }, [query, message, t]);
  useEffect(() => {
    load();
  }, [load, version]);

  const siteTypes = useMemo(() => (orgMeta?.types || []).filter((type) => type.site).map((type) => type.key), [orgMeta]);
  const statusOptions = (hr ? ['', ...(meta?.statuses || [])] : ['', 'active', 'vacation']).map((status) => ({ value: status, label: status ? t(`emp.status.${status}`) : t('emp.filters.allWorking') }));
  if (hr) statusOptions.push({ value: 'all', label: t('emp.filters.everyone') });

  const changeView = (next) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* storage blocked */
    }
  };

  const exportCsv = async () => {
    try {
      const { page, limit, ...rest } = query;
      await downloadFile('/app/employees/employees/export.csv', rest, 'employees.csv');
    } catch (err) {
      message.error(empError(err, t));
    }
  };

  const open = (row) => navigate(`/app/employees/${row.id}`);
  const columns = [
    {
      key: 'name',
      title: t('emp.columns.name'),
      render: (_, row) => (
        <span className="emp-person">
          <Avatar size={36} src={row.photoUrl || undefined}>
            {initials(row.name)}
          </Avatar>
          <span className="emp-person__text">
            <strong>{row.name}</strong>
            <em>{row.position?.name || t('emp.card.noPosition')}</em>
          </span>
        </span>
      ),
    },
    {
      key: 'unit',
      title: t('emp.columns.unit'),
      responsive: ['md'],
      render: (_, row) => (
        <span className="emp-cell2">
          <span>{row.unit?.name || '—'}</span>
          {row.site && row.site.id !== row.unit?.id && (
            <em>
              <MenuIcon name="siteplan" variant="mono" /> {row.site.name}
            </em>
          )}
        </span>
      ),
    },
    {
      key: 'contacts',
      title: t('emp.columns.contacts'),
      responsive: ['lg'],
      render: (_, row) => (
        <span className="emp-cell2">
          {row.work.email && (
            <a href={`mailto:${row.work.email}`} onClick={(event) => event.stopPropagation()}>
              <MailOutlined /> {row.work.email}
            </a>
          )}
          {(row.work.mobile || row.work.phone) && (
            <a href={`tel:${row.work.mobile || row.work.phone}`} onClick={(event) => event.stopPropagation()}>
              <PhoneOutlined /> {row.work.mobile || row.work.phone}
            </a>
          )}
          {!row.work.email && !row.work.mobile && !row.work.phone && '—'}
        </span>
      ),
    },
    {
      key: 'status',
      title: t('emp.columns.status'),
      width: 130,
      render: (_, row) => (
        <Tag bordered={false} color={STATUS_COLORS[row.status]}>
          {t(`emp.status.${row.status}`)}
        </Tag>
      ),
    },
    hr && {
      key: 'account',
      title: t('emp.columns.account'),
      width: 150,
      responsive: ['md'],
      render: (_, row) =>
        row.user ? (
          <Tooltip title={row.user.isBlocked ? t('emp.account.isBlocked') : row.user.username}>
            <Tag bordered={false} color={row.user.isBlocked ? 'red' : 'blue'}>
              {row.user.isBlocked ? t('emp.account.blockedShort') : row.user.username}
            </Tag>
          </Tooltip>
        ) : (
          <span className="emp-muted">{t('emp.account.none')}</span>
        ),
    },
    hr && {
      key: 'clearance',
      title: t('emp.columns.clearance'),
      width: 150,
      responsive: ['lg'],
      render: (_, row) =>
        row.clearance ? (
          <Tag bordered={false} color={CLEARANCE_COLORS[row.clearance.state]}>
            {row.clearance.state === 'expired' ? t('emp.skills.expiredOn', { date: fmtDate(row.clearance.expiresOn) }) : t('emp.skills.until', { date: fmtDate(row.clearance.expiresOn) })}
          </Tag>
        ) : (
          <span className="emp-muted">—</span>
        ),
    },
  ].filter(Boolean);

  const chips = hr
    ? [
        { key: 'noAccess', label: t('emp.filters.noAccess'), count: counters?.no_access },
        { key: 'expiring', label: t('emp.filters.expiring'), count: counters?.expiring, alert: true },
      ]
    : [];

  return (
    <div className="emp-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.employees.name'), to: '/app/employees' }, { key: 'registry', label: t('emp.nav.registry') }]}
        icon={<MenuIcon name="people" />}
        title={t('emp.nav.registry')}
        description={t('emp.registry.lead')}
        actions={[
          hr && { key: 'new', primary: true, icon: <PlusOutlined />, label: t('emp.registry.add'), onClick: () => setCreating(true), tour: 'emp.add' },
          hr && { key: 'import', icon: <UploadOutlined />, label: t('emp.nav.import'), onClick: () => navigate('/app/employees/import') },
          { key: 'export', icon: <DownloadOutlined />, label: t('emp.registry.export'), onClick: exportCsv, tour: 'emp.export' },
        ]}
        search={{ value: search, onChange: setSearch, onSearch: (value) => setFilter({ q: value }), loading, placeholder: t('emp.registry.search') }}
        status={data ? t('emp.registry.total', { n: data.total }) : null}
        tools={<ViewToggle value={view === 'cards' ? 'grid' : 'list'} onChange={(value) => changeView(value === 'grid' ? 'cards' : 'list')} />}
      />
      <div className="emp-filters" data-tour="emp.filters">
        <UnitSelect value={filters.unitId} onChange={(value) => setFilter({ unit: value })} placeholder={t('emp.filters.unit')} style={{ width: 220 }} />
        <UnitSelect value={filters.siteId} onChange={(value) => setFilter({ site: value })} types={siteTypes.length ? siteTypes : undefined} placeholder={t('emp.filters.site')} style={{ width: 200 }} />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          value={filters.positionId ?? undefined}
          onChange={(value) => setFilter({ position: value })}
          options={positions.map((position) => ({ value: position.id, label: position.name }))}
          placeholder={t('emp.filters.position')}
          style={{ width: 200 }}
          aria-label={t('emp.filters.position')}
        />
        <Select value={filters.status} onChange={(value) => setFilter({ status: value })} options={statusOptions} style={{ minWidth: 170, maxWidth: '100%' }} popupMatchSelectWidth={false} aria-label={t('emp.filters.status')} />
        {chips.map((chip) => (
          <button key={chip.key} type="button" className={`emp-chip${filters.chip === chip.key ? ' is-on' : ''}${chip.alert && chip.count ? ' is-alert' : ''}`} onClick={() => setFilter({ chip: filters.chip === chip.key ? '' : chip.key })} aria-pressed={filters.chip === chip.key}>
            {chip.label}
            {chip.count > 0 && <span className="emp-chip__n">{chip.count}</span>}
          </button>
        ))}
        {(filters.unitId || filters.siteId || filters.positionId || filters.status || filters.chip || filters.q) && (
          <Button type="link" size="small" onClick={() => setParams({}, { replace: true })}>
            {t('emp.filters.reset')}
          </Button>
        )}
      </div>
      {view === 'cards' ? (
        <div className="emp-cards" data-tour="emp.list">
          {(data?.items || []).map((row) => (
            <button key={row.id} type="button" className={`emp-card${row.status === 'terminated' ? ' is-muted' : ''}`} onClick={() => open(row)}>
              <Avatar size={64} src={row.photoUrl || undefined}>
                {initials(row.name)}
              </Avatar>
              <strong>{row.name}</strong>
              <em>{row.position?.name || t('emp.card.noPosition')}</em>
              <span className="emp-card__unit">{row.unit?.name || '—'}</span>
              <span className="emp-card__tags">
                {row.status !== 'active' && (
                  <Tag bordered={false} color={STATUS_COLORS[row.status]}>
                    {t(`emp.status.${row.status}`)}
                  </Tag>
                )}
                {hr && !row.user && <Tag bordered={false}>{t('emp.account.noneShort')}</Tag>}
                {hr && row.clearance && row.clearance.state !== 'ok' && (
                  <Tag bordered={false} color={CLEARANCE_COLORS[row.clearance.state]}>
                    {t(`emp.skills.state.${row.clearance.state}`)}
                  </Tag>
                )}
              </span>
            </button>
          ))}
          {data && !data.items.length && <Empty className="emp-empty" description={t('emp.registry.empty')} />}
        </div>
      ) : (
        <section className="emp-panel" data-tour="emp.list">
          <Table
            rowKey="id"
            loading={loading && !data}
            dataSource={data?.items || []}
            columns={columns}
            pagination={false}
            onRow={(row) => ({ onClick: () => open(row), className: 'emp-row', tabIndex: 0, onKeyDown: (event) => event.key === 'Enter' && open(row) })}
            locale={{ emptyText: <Empty description={t('emp.registry.empty')} /> }}
            size="middle"
          />
        </section>
      )}
      {data && data.total > data.limit && (
        <div className="emp-pager">
          <Pagination current={data.page} pageSize={data.limit} total={data.total} onChange={(page) => setFilter({ page })} showSizeChanger={false} />
        </div>
      )}
      <EmployeeForm
        open={creating}
        defaults={filters.unitId ? { unitId: filters.unitId } : null}
        onClose={() => setCreating(false)}
        onSaved={(res) => {
          setCreating(false);
          navigate(`/app/employees/${res.employee.id}`);
        }}
      />
    </div>
  );
}
