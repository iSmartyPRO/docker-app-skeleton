import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Button, Dropdown, Input, Result, Skeleton, Tabs, Tag } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatRelative } from '../../../lib/format';
import { cmpApi } from '../api';
import { useCompanies } from '../CompaniesContext';
import PersonForm from '../components/PersonForm';
import { JobDialog, LeaveDialog } from '../components/JobDialogs';
import Rating from '../components/Rating';
import Timeline from '../components/Timeline';
import { Avatar, ContactLinks, Facts, Flag, Stars, formatDate } from '../components/ui';
import { todayISO } from '../../../lib/datetime';

function years(from, to) {
  if (!from) return null;
  // Calendar days ('YYYY-MM-DD'); "now" is today in the person's zone.
  const [fy, fm] = String(from).slice(0, 10).split('-').map(Number);
  const [ty, tm] = String(to || todayISO()).slice(0, 10).split('-').map(Number);
  const months = Math.max(0, (ty - fy) * 12 + tm - fm);
  return { years: Math.floor(months / 12), months: months % 12 };
}

function Career({ person, onChange }) {
  const { t, locale } = useLocale();
  const { meta } = useCompanies();
  const [dialog, setDialog] = useState(null);
  return (
    <div className="cmp-career">
      {person.canEdit && (
        <div className="cmp-staff__actions">
          <Button type="primary" onClick={() => setDialog({ type: 'add' })}>+ {t('companies.addJob')}</Button>
        </div>
      )}
      {!person.positions.length && <div className="cmp-muted">{t('companies.noJobs')}</div>}
      <ol className="cmp-jobs">
        {person.positions.map((position) => {
          const span = years(position.startedOn, position.endedOn);
          return (
            <li key={position.id} className={`cmp-job${position.current ? ' is-current' : ''}`}>
              <span className="cmp-job__dot" aria-hidden="true" />
              <div className="cmp-job__body">
                <div className="cmp-job__head">
                  <Avatar name={position.companyName} size={34} square />
                  <div>
                    <Link to={`/app/companies/c/${position.companyId}`}><strong>{position.companyName}</strong></Link>
                    <Flag meta={meta} country={position.companyCountry} />
                    <span className="cmp-job__title">{[position.title, position.department].filter(Boolean).join(' · ') || t('companies.noTitle')}</span>
                  </div>
                  {position.current ? <Tag color="green" bordered={false}>{t('companies.worksNow')}</Tag> : <Tag bordered={false}>{t('companies.formerJob')}</Tag>}
                  {position.isDecisionMaker && <Tag color="gold" bordered={false}>★ {t('companies.p.decisionMaker')}</Tag>}
                </div>
                <div className="cmp-job__dates">
                  {formatDate(position.startedOn, locale) || '…'} — {position.current ? t('companies.present') : formatDate(position.endedOn, locale)}
                  {span && (span.years || span.months) ? ` · ${span.years ? t('companies.yearsN', { n: span.years }) : ''} ${span.months ? t('companies.monthsN', { n: span.months }) : ''}` : ''}
                </div>
                {position.endReason && <div className="cmp-job__reason">{position.endReason}</div>}
                {person.canEdit && (
                  <div className="cmp-job__actions">
                    {position.current && <Button size="small" onClick={() => setDialog({ type: 'leave', position })}>{t('companies.leftCompany')}</Button>}
                    <Button size="small" type="text" onClick={() => setDialog({ type: 'edit', position })}>{t('common.edit')}</Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <JobDialog open={dialog?.type === 'add' || dialog?.type === 'edit'} personId={person.id} position={dialog?.type === 'edit' ? dialog.position : null} onClose={(next) => { setDialog(null); if (next) onChange(next); }} />
      <LeaveDialog open={dialog?.type === 'leave'} position={dialog?.position} onClose={(next) => { setDialog(null); if (next) onChange(next); }} />
    </div>
  );
}

/** /app/companies/p/:id */
export default function PersonCard() {
  const { id } = useParams();
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { meta } = useCompanies();
  const [person, setPerson] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('overview');
  const [tick, setTick] = useState(0);
  const load = useCallback(() => cmpApi.person(id).then((res) => setPerson(res.data.person)).catch(setError), [id]);
  useEffect(() => {
    setPerson(null);
    load();
  }, [load]);
  const changed = (next) => {
    setPerson(next);
    setTick((n) => n + 1);
  };

  if (error) return <Result status="404" title={t('companies.notFound')} extra={<Link to="/app/companies/people">{t('companies.toPeople')}</Link>} />;
  if (!person || !meta) return <Skeleton active avatar paragraph={{ rows: 10 }} />;

  const current = person.positions.filter((position) => position.current);
  const customRows = (meta.settings.customFields || []).filter((field) => field.entity === 'person').map((field) => ({ label: field.label, value: person.custom[field.key] }));

  const archive = () => {
    let reason = '';
    modal.confirm({
      title: t('companies.archivePersonTitle', { name: person.fullName }),
      content: (
        <div>
          <p className="cmp-muted">{t('companies.archivePersonLead')}</p>
          <Input.TextArea autoSize={{ minRows: 2 }} placeholder={t('companies.archiveReason')} onChange={(event) => { reason = event.target.value; }} />
        </div>
      ),
      okText: t('companies.archive'),
      cancelText: t('common.cancel'),
      onOk: () => cmpApi.archivePerson(person.id, reason).then((res) => changed(res.data.person)).catch((err) => message.error(errorMessage(err))),
    });
  };

  return (
    <div className="cmp-card">
      <nav className="kb-crumbs">
        <Link to="/app/companies/people">{t('companies.people')}</Link>
        <span className="kb-crumbs__sep">/</span>
        <strong>{person.fullName}</strong>
      </nav>
      {person.archived && (
        <Alert type="warning" showIcon className="cmp-card__archived" message={t('companies.archivedPersonBanner', { date: formatDate(person.archivedAt, locale) })} description={person.archiveReason}
          action={person.canEdit && <Button size="small" onClick={() => cmpApi.restorePerson(person.id).then((res) => changed(res.data.person))}>{t('companies.restore')}</Button>} />
      )}
      <header className="cmp-hero">
        <Avatar name={person.fullName} size={72} />
        <div className="cmp-hero__main">
          <h1>{person.fullName}</h1>
          <p className="cmp-hero__full">
            {current.length
              ? current.map((position) => (
                  <span key={position.id} className="cmp-hero__job">
                    {position.title || t('companies.noTitle')} · <Link to={`/app/companies/c/${position.companyId}`}>{position.companyName}</Link>
                  </span>
                ))
              : t('companies.notEmployed')}
          </p>
          <div className="cmp-hero__meta">
            {person.city && <span>📍 {person.city}</span>}
            {person.rating && (
              <button type="button" className="cmp-hero__rating" onClick={() => setTab('rating')}>
                <Stars value={person.rating.avg} size={15} showValue /> <span>({person.rating.count})</span>
              </button>
            )}
          </div>
        </div>
        <div className="cmp-hero__actions">
          {person.canEdit && <Button type="primary" onClick={() => setEditing(true)}>✎ {t('common.edit')}</Button>}
          {person.canEdit && (
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  person.archived
                    ? { key: 'restore', label: t('companies.restore'), onClick: () => cmpApi.restorePerson(person.id).then((res) => changed(res.data.person)) }
                    : { key: 'archive', label: t('companies.archive'), onClick: archive },
                  meta.isAdmin && {
                    key: 'delete',
                    danger: true,
                    label: t('companies.deleteForever'),
                    onClick: () => modal.confirm({ title: t('companies.deleteForeverTitle'), content: t('companies.deleteForeverText'), okButtonProps: { danger: true }, okText: t('common.delete'), cancelText: t('common.cancel'), onOk: () => cmpApi.deletePerson(person.id).then(() => navigate('/app/companies/people')) }),
                  },
                ].filter(Boolean),
              }}
            >
              <Button>⋯</Button>
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
                      title={t('companies.section.personal')}
                      rows={[
                        { label: t('companies.p.birthday'), value: formatDate(person.birthday, locale) },
                        { label: t('companies.p.gender'), value: person.gender ? t(person.gender === 'm' ? 'companies.p.male' : 'companies.p.female') : null },
                        { label: t('companies.f.country'), value: person.country ? <Flag meta={meta} country={person.country} withName /> : null },
                        { label: t('companies.p.city'), value: person.city },
                        { label: t('companies.p.languages'), value: person.languages.join(', ') },
                        { label: t('companies.f.tags'), value: person.tags.length ? person.tags.map((tag) => <Tag key={tag} bordered={false}>{tag}</Tag>) : null, wide: true },
                        ...customRows,
                      ]}
                    />
                    {person.notes && (
                      <section className="cmp-facts">
                        <h3>{t('companies.section.notes')}</h3>
                        <p className="cmp-notes">{person.notes}</p>
                      </section>
                    )}
                  </div>
                ),
              },
              { key: 'career', label: `${t('companies.tab.career')} · ${person.positions.length}`, children: <Career person={person} onChange={changed} /> },
              { key: 'history', label: t('companies.tab.history'), children: <Timeline key={tick} type="person" id={person.id} onChange={load} /> },
              { key: 'rating', label: t('companies.tab.rating'), children: <Rating type="person" id={person.id} onChange={load} /> },
            ]}
          />
        </main>
        <aside className="cmp-card__side">
          <section className="cmp-side-card">
            <h3>{t('companies.section.contacts')}</h3>
            <ContactLinks item={person} />
            {current.filter((p) => p.workPhone || p.workEmail).map((p) => (
              <div key={p.id} className="cmp-side-work">
                <em>{p.companyName}</em>
                <ContactLinks item={{ phones: p.workPhone ? [{ value: p.workPhone }] : [], emails: p.workEmail ? [{ value: p.workEmail }] : [] }} compact />
              </div>
            ))}
          </section>
          <section className="cmp-side-card cmp-side-card--meta">
            <div><span>{t('companies.f.owner')}</span><strong>{person.owner?.name || t('companies.nobody')}</strong></div>
            <div><span>{t('companies.addedBy')}</span><strong>{person.createdBy?.name || '—'}</strong><em>{formatDate(person.createdAt, locale)}</em></div>
            <div><span>{t('companies.changedBy')}</span><strong>{person.updatedBy?.name || '—'}</strong><em>{formatRelative(person.updatedAt, locale)}</em></div>
          </section>
        </aside>
      </div>
      <PersonForm open={editing} person={person} onClose={(saved) => { setEditing(false); if (saved) changed(saved); }} />
    </div>
  );
}
