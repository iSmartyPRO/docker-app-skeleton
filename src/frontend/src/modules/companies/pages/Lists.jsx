import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Input, Segmented, Select, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { formatRelative } from '../../../lib/format';
import { cmpApi, relationLabel } from '../api';
import { useCompanies } from '../CompaniesContext';
import CompanyForm from '../components/CompanyForm';
import PersonForm from '../components/PersonForm';
import { Avatar, ContactLinks, Flag, Relations, Stars, StatusBadge } from '../components/ui';

function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(params.entries());
  const set = (patch) => {
    const next = { ...filters, ...patch };
    Object.keys(next).forEach((key) => (next[key] === '' || next[key] === undefined || next[key] === null) && delete next[key]);
    setParams(next, { replace: true });
  };
  return [filters, set];
}

/** /app/companies — the companies list. */
export function CompanyList({ scope }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { meta } = useCompanies();
  const [filters, setFilters] = useFilters();
  const [data, setData] = useState(null);
  const [q, setQ] = useState(filters.q || '');
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const query = { ...filters, ...(scope === 'mine' ? { owner: 'me' } : {}), ...(scope === 'archive' ? { archived: '1' } : {}) };
  const key = JSON.stringify(query);

  const load = useCallback(() => {
    setData(null);
    cmpApi.companies({ ...JSON.parse(key), limit: 50, offset: (page - 1) * 50 }).then((res) => setData(res.data)).catch(() => setData({ items: [], total: 0 }));
  }, [key, page]);
  useEffect(load, [load]);
  useEffect(() => {
    const timer = setTimeout(() => q !== (filters.q || '') && (setPage(1), setFilters({ q })), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const countries = (meta?.settings?.countries || []).filter((code) => meta?.countries?.[code]);
  const titles = { mine: t('companies.myCompanies'), archive: t('companies.archive'), undefined: t('companies.companies') };
  const countryOptions = [{ value: '', label: t('companies.allCountries') }, ...countries.slice(0, 5).map((code) => ({ value: code, label: `${meta.countries[code].flag} ${code === 'OTHER' ? t('companies.other') : code}` }))];

  return (
    <div className="cmp-list">
      <header className="cmp-list__head">
        <div className="cmp-list__title">
          <h1>{titles[scope]}</h1>
          <p>{data ? t('companies.totalN', { n: data.total }) : '…'}</p>
        </div>
        {scope !== 'archive' && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)} className="cmp-list__create" data-tour="cmp.create" aria-label={t('companies.addCompany')}><span>{t('companies.addCompany')}</span></Button>}
      </header>
      <div className="cmp-filters-wrap">
        <div className="cmp-filters" data-tour="cmp.filters">
          <Input.Search allowClear value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('companies.searchCompanies')} className="cmp-filters__search" />
          <Segmented
            className="cmp-filters__countries"
            value={filters.country || ''}
            onChange={(value) => { setPage(1); setFilters({ country: value }); }}
            options={countryOptions}
          />
          {/* The same choice as a list when the row is narrow (CSS shows one of the two). */}
          <Select
            className="cmp-filters__countries-select"
            value={filters.country || ''}
            onChange={(value) => { setPage(1); setFilters({ country: value }); }}
            options={countryOptions}
            popupMatchSelectWidth={false}
            aria-label={t('companies.allCountries')}
          />
          <Select
            className="cmp-filters__select"
            allowClear
            placeholder={t('companies.f.relations')}
            value={filters.relation || undefined}
            onChange={(value) => { setPage(1); setFilters({ relation: value }); }}
            options={(meta?.settings?.relations || []).map((relation) => ({ value: relation.key, label: relationLabel(t, relation) }))}
            popupMatchSelectWidth={false}
          />
          <Select
            className="cmp-filters__select"
            value={filters.sort || 'name'}
            onChange={(value) => setFilters({ sort: value })}
            options={['name', 'updated', 'created', 'rating'].map((value) => ({ value, label: t(`companies.sort.${value}`) }))}
            popupMatchSelectWidth={false}
          />
        </div>
      </div>
      <Table
        className="cmp-table"
        rowKey="id"
        loading={!data}
        dataSource={data?.items || []}
        onRow={(row) => ({ onClick: () => navigate(`/app/companies/c/${row.id}`), className: 'cmp-table__row' })}
        pagination={data && data.total > 50 ? { current: page, pageSize: 50, total: data.total, onChange: setPage, showSizeChanger: false } : false}
        locale={{ emptyText: <div className="cmp-empty"><strong>{t('companies.emptyCompanies')}</strong><span>{t('companies.emptyCompaniesText')}</span></div> }}
        columns={[
          {
            title: t('companies.f.name'),
            key: 'name',
            render: (_, row) => (
              <div className="cmp-cell-name">
                <Avatar name={row.name} size={38} square />
                <div>
                  <strong>{row.name}</strong>
                  <span>
                    <Flag meta={meta} country={row.country} /> {Object.values(row.ids)[0] || ''} <StatusBadge status={row.status === 'active' ? null : row.status} />
                  </span>
                </div>
              </div>
            ),
          },
          { title: t('companies.f.relations'), key: 'relations', responsive: ['md'], render: (_, row) => <Relations keys={row.relations} meta={meta} /> },
          { title: t('companies.contactsShort'), key: 'contacts', width: 110, align: 'center', responsive: ['lg'], render: (_, row) => (row.contactsCount ? <span className="cmp-count">👤 {row.contactsCount}</span> : <span className="cmp-muted">—</span>) },
          { title: t('companies.tab.rating'), key: 'rating', width: 140, responsive: ['md'], render: (_, row) => (row.rating ? <Stars value={row.rating.avg} size={13} showValue /> : <span className="cmp-muted">—</span>) },
          { title: t('companies.f.owner'), key: 'owner', responsive: ['lg'], render: (_, row) => (row.owner ? <span className="cmp-owner"><Avatar name={row.owner.name} size={22} /> {row.owner.name}</span> : <span className="cmp-muted">—</span>) },
          { title: t('companies.updated'), key: 'updated', width: 140, responsive: ['xl'], render: (_, row) => <span className="cmp-muted">{formatRelative(row.updatedAt, locale)}</span> },
        ]}
      />
      <CompanyForm open={creating} onClose={(company) => { setCreating(false); if (company) navigate(`/app/companies/c/${company.id}`); }} />
    </div>
  );
}

/** /app/companies/people — contact people. */
export function PeopleList({ scope }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [filters, setFilters] = useFilters();
  const [data, setData] = useState(null);
  const [q, setQ] = useState(filters.q || '');
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const query = { ...filters, ...(scope === 'archive' ? { archived: '1' } : {}) };
  const key = JSON.stringify(query);
  const load = useCallback(() => {
    setData(null);
    cmpApi.people({ ...JSON.parse(key), limit: 50, offset: (page - 1) * 50 }).then((res) => setData(res.data)).catch(() => setData({ items: [], total: 0 }));
  }, [key, page]);
  useEffect(load, [load]);
  useEffect(() => {
    const timer = setTimeout(() => q !== (filters.q || '') && (setPage(1), setFilters({ q })), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="cmp-list">
      <header className="cmp-list__head">
        <div className="cmp-list__title">
          <h1>{scope === 'archive' ? t('companies.peopleArchive') : t('companies.people')}</h1>
          <p>{data ? t('companies.totalN', { n: data.total }) : '…'}</p>
        </div>
        {scope !== 'archive' && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)} className="cmp-list__create" aria-label={t('companies.addPerson')}><span>{t('companies.addPerson')}</span></Button>}
      </header>
      <div className="cmp-filters-wrap">
      <div className="cmp-filters">
        <Input.Search allowClear value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('companies.searchPeople')} className="cmp-filters__search" />
        <Segmented
          className="cmp-filters__scope"
          value={filters.owner === 'me' ? 'mine' : filters.free === '1' ? 'free' : ''}
          onChange={(value) => { setPage(1); setFilters({ owner: value === 'mine' ? 'me' : '', free: value === 'free' ? '1' : '' }); }}
          options={[
            { value: '', label: t('companies.everyone') },
            { value: 'mine', label: t('companies.mine') },
            { value: 'free', label: t('companies.withoutCompany') },
          ]}
        />
      </div>
      </div>
      <Table
        className="cmp-table"
        rowKey="id"
        loading={!data}
        dataSource={data?.items || []}
        onRow={(row) => ({ onClick: () => navigate(`/app/companies/p/${row.id}`), className: 'cmp-table__row' })}
        pagination={data && data.total > 50 ? { current: page, pageSize: 50, total: data.total, onChange: setPage, showSizeChanger: false } : false}
        locale={{ emptyText: <div className="cmp-empty"><strong>{t('companies.emptyPeople')}</strong></div> }}
        columns={[
          {
            title: t('companies.p.fullName'),
            key: 'name',
            render: (_, row) => (
              <div className="cmp-cell-name">
                <Avatar name={row.fullName} size={36} />
                <div>
                  <strong>{row.fullName}</strong>
                  <span>{row.current ? `${row.current.title || t('companies.noTitle')} · ${row.current.companyName}` : t('companies.notEmployed')}</span>
                </div>
              </div>
            ),
          },
          { title: t('companies.section.contacts'), key: 'contacts', responsive: ['md'], render: (_, row) => <ContactLinks item={{ phones: row.phones.slice(0, 1), emails: row.emails.slice(0, 1) }} compact /> },
          { title: t('companies.tab.rating'), key: 'rating', width: 140, responsive: ['md'], render: (_, row) => (row.rating ? <Stars value={row.rating.avg} size={13} showValue /> : <span className="cmp-muted">—</span>) },
          { title: t('companies.updated'), key: 'updated', width: 140, responsive: ['xl'], render: (_, row) => <span className="cmp-muted">{formatRelative(row.updatedAt, locale)}</span> },
        ]}
      />
      <PersonForm open={creating} onClose={(person) => { setCreating(false); if (person) navigate(`/app/companies/p/${person.id}`); }} />
    </div>
  );
}
