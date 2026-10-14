import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Button, Dropdown, Input, Modal, Result, Skeleton, Tabs, Tag, Tooltip, Upload } from 'antd';
import { EditOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatRelative } from '../../../lib/format';
import { cmpApi } from '../api';
import { useCompanies } from '../CompaniesContext';
import CompanyForm from '../components/CompanyForm';
import PersonForm from '../components/PersonForm';
import { LeaveDialog } from '../components/JobDialogs';
import { PersonPicker } from '../components/pickers';
import Rating from '../components/Rating';
import Timeline from '../components/Timeline';
import VerifyDialog from '../components/VerifyDialog';
import { Avatar, ContactLinks, Copyable, Facts, Flag, Relations, Stars, StatusBadge, formatDate } from '../components/ui';

function Staff({ company, onChange }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [adding, setAdding] = useState(null);
  const [leaving, setLeaving] = useState(null);
  const [existing, setExisting] = useState(null);
  const current = company.positions.filter((position) => position.current);
  const former = company.positions.filter((position) => !position.current);
  return (
    <div className="cmp-staff">
      <div className="cmp-staff__actions">
        <Button type="primary" onClick={() => setAdding('new')} icon={<PlusOutlined />}>{t('companies.addEmployee')}</Button>
        <Button onClick={() => setAdding('existing')}>{t('companies.addExisting')}</Button>
      </div>
      {!current.length && <div className="cmp-muted cmp-staff__empty">{t('companies.noEmployees')}</div>}
      <div className="cmp-people">
        {current.map((position) => (
          <div key={position.id} className="cmp-person">
            <Avatar name={position.personName} size={44} />
            <div className="cmp-person__main">
              <Link to={`/app/companies/p/${position.personId}`}><strong>{position.personName}</strong></Link>
              <span>{[position.title, position.department].filter(Boolean).join(' · ') || t('companies.noTitle')}</span>
              {position.isDecisionMaker && <Tag color="gold" bordered={false}>★ {t('companies.p.decisionMaker')}</Tag>}
              <ContactLinks item={{ phones: [...(position.workPhone ? [{ value: position.workPhone }] : []), ...(position.personPhones || [])].slice(0, 2), emails: [...(position.workEmail ? [{ value: position.workEmail }] : []), ...(position.personEmails || [])].slice(0, 1) }} compact />
            </div>
            <div className="cmp-person__side">
              {position.startedOn && <span className="cmp-muted">{t('companies.since', { date: formatDate(position.startedOn, locale) })}</span>}
              {company.canEdit && <Button size="small" onClick={() => setLeaving(position)}>{t('companies.leftCompany')}</Button>}
            </div>
          </div>
        ))}
      </div>
      {former.length > 0 && (
        <details className="cmp-former">
          <summary>{t('companies.formerN', { n: former.length })}</summary>
          {former.map((position) => (
            <div key={position.id} className="cmp-former__row">
              <Avatar name={position.personName} size={28} />
              <Link to={`/app/companies/p/${position.personId}`}>{position.personName}</Link>
              <span>{position.title}</span>
              <span className="cmp-muted">
                {formatDate(position.startedOn, locale) || '…'} — {formatDate(position.endedOn, locale)}
              </span>
              {position.endReason && <em>{position.endReason}</em>}
            </div>
          ))}
        </details>
      )}
      <PersonForm open={adding === 'new'} companyId={company.id} onClose={(person) => { setAdding(null); if (person) onChange(); }} />
      <Modal
        open={adding === 'existing'}
        title={t('companies.addExisting')}
        onCancel={() => setAdding(null)}
        okButtonProps={{ disabled: !existing }}
        onOk={async () => {
          try {
            await cmpApi.addPosition(existing, { companyId: company.id });
            setAdding(null);
            setExisting(null);
            onChange();
          } catch (err) {
            message.error(errorMessage(err));
          }
        }}
        destroyOnHidden
      >
        <p className="cmp-muted">{t('companies.addExistingLead')}</p>
        <PersonPicker value={existing} onChange={setExisting} />
      </Modal>
      <LeaveDialog open={Boolean(leaving)} position={leaving} onClose={(person) => { setLeaving(null); if (person) onChange(); }} />
    </div>
  );
}

function Documents({ company, onChange }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  return (
    <div className="cmp-docs">
      {company.canEdit && (
        <Upload
          showUploadList={false}
          customRequest={async ({ file }) => {
            try {
              await cmpApi.uploadFile(company.id, file);
              onChange();
            } catch (err) {
              message.error(errorMessage(err));
            }
          }}
        >
          <Button icon={<UploadOutlined />}>{t('companies.uploadDoc')}</Button>
        </Upload>
      )}
      {!company.files.length && <div className="cmp-muted">{t('companies.noDocs')}</div>}
      {company.files.map((file) => (
        <div key={file.id} className="cmp-doc">
          <span className="cmp-doc__icon" aria-hidden="true">{file.kind === 'extract' ? '🏛' : '📄'}</span>
          <a href={cmpApi.fileUrl(file.id)} target="_blank" rel="noopener noreferrer">{file.name}</a>
          <span className="cmp-muted">{Math.round(file.size / 1024)} KB · {file.author || '—'} · {formatRelative(file.createdAt, locale)}</span>
          <a href={cmpApi.fileUrl(file.id, true)}>⤓</a>
          {company.canEdit && (
            <Button size="small" type="text" danger onClick={() => cmpApi.deleteFile(file.id).then(onChange).catch((err) => message.error(errorMessage(err)))}>✕</Button>
          )}
        </div>
      ))}
    </div>
  );
}

/** /app/companies/c/:id */
export default function CompanyCard() {
  const { id } = useParams();
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { meta } = useCompanies();
  const [company, setCompany] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [tab, setTab] = useState('overview');
  const [tick, setTick] = useState(0);

  const load = useCallback(() => cmpApi.company(id).then((res) => setCompany(res.data.company)).catch(setError), [id]);
  useEffect(() => {
    setCompany(null);
    load();
  }, [load]);
  const refresh = () => {
    load();
    setTick((n) => n + 1);
  };

  if (error) return <Result status="404" title={t('companies.notFound')} extra={<Link to="/app/companies">{t('companies.toList')}</Link>} />;
  if (!company || !meta) return <Skeleton active avatar paragraph={{ rows: 10 }} />;

  const profile = meta.countries[company.country];
  const idRows = (profile?.ids || []).map((field) => ({ label: field.label[locale] || field.label.en, value: company.ids[field.key], copy: true }));
  const customRows = (meta.settings.customFields || []).filter((field) => field.entity === 'company').map((field) => ({ label: field.label, value: company.custom[field.key] }));
  const primary = profile?.ids?.find((field) => field.primary);

  const archive = () => {
    let reason = '';
    modal.confirm({
      title: t('companies.archiveTitle', { name: company.name }),
      content: (
        <div>
          <p className="cmp-muted">{t('companies.archiveLead')}</p>
          <Input.TextArea autoSize={{ minRows: 2 }} placeholder={t('companies.archiveReason')} onChange={(event) => { reason = event.target.value; }} />
        </div>
      ),
      okText: t('companies.archive'),
      cancelText: t('common.cancel'),
      onOk: () => cmpApi.archiveCompany(company.id, reason).then((res) => { setCompany(res.data.company); setTick((n) => n + 1); }).catch((err) => message.error(errorMessage(err))),
    });
  };

  const menu = [
    company.archived
      ? { key: 'restore', label: t('companies.restore'), onClick: () => cmpApi.restoreCompany(company.id).then((res) => { setCompany(res.data.company); setTick((n) => n + 1); }) }
      : { key: 'archive', label: t('companies.archive'), onClick: archive },
    meta.isAdmin && {
      key: 'delete',
      danger: true,
      label: t('companies.deleteForever'),
      onClick: () =>
        modal.confirm({
          title: t('companies.deleteForeverTitle'),
          content: t('companies.deleteForeverText'),
          okButtonProps: { danger: true },
          okText: t('common.delete'),
          cancelText: t('common.cancel'),
          onOk: () => cmpApi.deleteCompany(company.id).then(() => navigate('/app/companies')),
        }),
    },
  ].filter(Boolean);

  return (
    <div className="cmp-card">
      <nav className="kb-crumbs">
        <Link to="/app/companies">{t('companies.companies')}</Link>
        <span className="kb-crumbs__sep">/</span>
        <strong>{company.name}</strong>
      </nav>
      {company.archived && (
        <Alert
          type="warning"
          showIcon
          className="cmp-card__archived"
          message={t('companies.archivedBanner', { date: formatDate(company.archivedAt, locale) })}
          description={company.archiveReason}
          action={company.canEdit && <Button size="small" onClick={() => cmpApi.restoreCompany(company.id).then((res) => setCompany(res.data.company))}>{t('companies.restore')}</Button>}
        />
      )}
      <header className="cmp-hero">
        <Avatar name={company.name} size={72} square />
        <div className="cmp-hero__main">
          <div className="cmp-hero__chips">
            <Flag meta={meta} country={company.country} withName />
            {company.legal_form && <span className="cmp-chip">{company.legal_form}</span>}
            <StatusBadge status={company.status} />
            <Relations keys={company.relations} meta={meta} />
          </div>
          <h1>{company.name}</h1>
          {company.full_name && company.full_name !== company.name && <p className="cmp-hero__full">{company.full_name}</p>}
          <div className="cmp-hero__meta">
            {primary && company.ids[primary.key] && (
              <span>
                {primary.label[locale]} <Copyable value={company.ids[primary.key]} />
              </span>
            )}
            {company.rating && (
              <button type="button" className="cmp-hero__rating" onClick={() => setTab('rating')}>
                <Stars value={company.rating.avg} size={15} showValue /> <span>({company.rating.count})</span>
              </button>
            )}
            {company.registry && (
              <Tooltip title={t('companies.checkedTip')}>
                <span className="cmp-verified">✓ {t('companies.checkedWith', { source: company.registry.sourceName, date: formatDate(company.registry.checkedAt, locale) })}</span>
              </Tooltip>
            )}
          </div>
        </div>
        <div className="cmp-hero__actions">
          {profile?.registry && company.canEdit && primary && company.ids[primary.key] && (
            <Button onClick={() => setDialog('verify')}>🏛 {t('companies.verify')}</Button>
          )}
          {company.canEdit && <Button type="primary" onClick={() => setDialog('edit')} icon={<EditOutlined />}>{t('common.edit')}</Button>}
          {company.canEdit && (
            <Dropdown trigger={['click']} menu={{ items: menu }}>
              <Button aria-label={t('companies.more')}>⋯</Button>
            </Dropdown>
          )}
        </div>
      </header>

      <div className="cmp-card__layout">
        <main className="cmp-card__main">
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              {
                key: 'overview',
                label: t('companies.tab.overview'),
                children: (
                  <div className="cmp-overview">
                    <Facts
                      title={t('companies.section.registration')}
                      rows={[
                        ...idRows,
                        { label: t('companies.f.local_name'), value: company.local_name, wide: true },
                        { label: t('companies.f.kind'), value: t(`companies.kind.${company.kind}`) },
                        { label: t('companies.f.registered_on'), value: formatDate(company.registered_on, locale) },
                        { label: t('companies.f.closed_on'), value: formatDate(company.closed_on, locale) },
                        { label: t('companies.f.founders_count'), value: company.founders_count },
                        { label: t('companies.f.registering_authority'), value: company.registering_authority, wide: true },
                        { label: t(company.country === 'RU' ? 'companies.f.okved' : 'companies.f.activity_code'), value: company.activity_code },
                        { label: t('companies.f.activity'), value: company.activity, wide: true },
                      ]}
                    />
                    <Facts
                      title={t('companies.section.management')}
                      rows={[{ label: company.director_title || t('companies.f.director_name'), value: company.director_name }]}
                    />
                    <Facts
                      title={t('companies.section.addresses')}
                      rows={[
                        { label: t('companies.f.legal_address'), value: company.legal_address, wide: true, copy: true },
                        { label: t('companies.f.actual_address'), value: company.actual_address, wide: true, copy: true },
                      ]}
                    />
                    {company.bank_accounts.length > 0 && (
                      <section className="cmp-facts">
                        <h3>{t('companies.section.bank')}</h3>
                        <div className="cmp-bank-cards">
                          {company.bank_accounts.map((bank, index) => (
                            <div key={index} className="cmp-bank-card">
                              <strong>{bank.bank}</strong>
                              {bank.account && <span>{t('companies.bank.account')}: <Copyable value={bank.account} /></span>}
                              {bank.bic && <span>{t('companies.bank.bic')}: <Copyable value={bank.bic} /></span>}
                              {bank.corr && <span>{t('companies.bank.corr')}: <Copyable value={bank.corr} /></span>}
                              {bank.swift && <span>SWIFT: <Copyable value={bank.swift} /></span>}
                              {bank.currency && <em>{bank.currency}</em>}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                    <Facts
                      title={t('companies.section.business')}
                      rows={[
                        { label: t('companies.f.industry'), value: company.industry },
                        { label: t('companies.f.employees'), value: company.employees },
                        { label: t('companies.f.tags'), value: company.tags.length ? company.tags.map((tag) => <Tag key={tag} bordered={false}>{tag}</Tag>) : null, wide: true },
                        ...customRows,
                      ]}
                    />
                    {company.notes && (
                      <section className="cmp-facts">
                        <h3>{t('companies.section.notes')}</h3>
                        <p className="cmp-notes">{company.notes}</p>
                      </section>
                    )}
                  </div>
                ),
              },
              { key: 'staff', label: `${t('companies.tab.staff')} · ${company.positions.filter((p) => p.current).length}`, children: <Staff company={company} onChange={refresh} /> },
              { key: 'history', label: t('companies.tab.history'), children: <Timeline key={tick} type="company" id={company.id} country={company.country} onChange={load} /> },
              { key: 'rating', label: t('companies.tab.rating'), children: <Rating type="company" id={company.id} onChange={load} /> },
              { key: 'docs', label: `${t('companies.tab.docs')} · ${company.files.length}`, children: <Documents company={company} onChange={refresh} /> },
            ]}
          />
        </main>
        <aside className="cmp-card__side">
          <section className="cmp-side-card">
            <h3>{t('companies.section.contacts')}</h3>
            <ContactLinks item={company} />
          </section>
          {company.positions.some((p) => p.current && p.isDecisionMaker) && (
            <section className="cmp-side-card">
              <h3>{t('companies.decisionMakers')}</h3>
              {company.positions.filter((p) => p.current && p.isDecisionMaker).map((p) => (
                <Link key={p.id} to={`/app/companies/p/${p.personId}`} className="cmp-side-person">
                  <Avatar name={p.personName} size={30} />
                  <span><strong>{p.personName}</strong><em>{p.title}</em></span>
                </Link>
              ))}
            </section>
          )}
          <section className="cmp-side-card cmp-side-card--meta">
            <div><span>{t('companies.f.owner')}</span><strong>{company.owner?.name || t('companies.nobody')}</strong></div>
            <div><span>{t('companies.addedBy')}</span><strong>{company.createdBy?.name || '—'}</strong><em>{formatDate(company.createdAt, locale)}</em></div>
            <div><span>{t('companies.changedBy')}</span><strong>{company.updatedBy?.name || '—'}</strong><em>{formatRelative(company.updatedAt, locale)}</em></div>
            {company.registry?.url && <a href={company.registry.url} target="_blank" rel="noopener noreferrer">{t('companies.openRegistry')} ↗</a>}
          </section>
        </aside>
      </div>

      <CompanyForm open={dialog === 'edit'} company={company} onClose={(saved) => { setDialog(null); if (saved) { setCompany(saved); setTick((n) => n + 1); } }} />
      {dialog === 'verify' && <VerifyDialog open company={company} onClose={(saved) => { setDialog(null); if (saved) { setCompany(saved); setTick((n) => n + 1); } }} />}
    </div>
  );
}

