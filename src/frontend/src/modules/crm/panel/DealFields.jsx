import { Link } from 'react-router-dom';
import { Input, Select, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { Person, UserAvatar } from '../../shared/People';
import { useCrm } from '../CrmContext';
import { formatDay, isPastDay } from '../lib';
import { DateField } from '../../../components/ui/DateTimeField';
import ClientPicker from '../components/ClientPicker';
import UserSelect from '../components/UserSelect';
import { FieldInput, FieldValue } from '../components/fields';
import { Glyph } from '../components/bits';
import InlineRow from './InlineRow';

const Unset = () => {
  const { t } = useLocale();
  return <span className="crm-unset">{t('crm.fields.unset')}</span>;
};

function Card({ title, children, extra }) {
  return (
    <section className="dp-card">
      <header className="dp-card__head">
        <h3>{title}</h3>
        {extra}
      </header>
      <div className="dp-card__body">{children}</div>
    </section>
  );
}

/** Company and contact with quick phone / e-mail links and a link to the Companies card. */
function ClientCard({ deal, editable, onPatch }) {
  const { t } = useLocale();
  const { companiesEnabled } = useCrm();
  const { company, person } = deal;
  const contactLinks = person && (person.phone || person.email) && (
    <span className="dp-client__links">
      {person.phone && (
        <a href={`tel:${String(person.phone).replace(/[^\d+]/g, '')}`} onClick={(event) => event.stopPropagation()} className="dp-quick" aria-label={t('crm.client.call', { phone: person.phone })}>
          <Glyph name="phone" size={13} />
          {person.phone}
        </a>
      )}
      {person.email && (
        <a href={`mailto:${person.email}`} onClick={(event) => event.stopPropagation()} className="dp-quick" aria-label={t('crm.client.write', { email: person.email })}>
          <Glyph name="mail" size={13} />
          {person.email}
        </a>
      )}
    </span>
  );
  const open = (to) =>
    companiesEnabled && (
      <Tooltip title={t('crm.client.openCard')}>
        <Link to={to} className="dp-client__open" onClick={(event) => event.stopPropagation()} aria-label={t('crm.client.openCard')}>
          <Glyph name="external" size={13} />
        </Link>
      </Tooltip>
    );
  return (
    <Card title={t('crm.fields.client')}>
      <InlineRow
        label={t('crm.client.company')}
        value={company ? `c:${company.id}` : null}
        disabled={!editable}
        instant
        display={
          company ? (
            <span className="dp-client">
              <span className="dp-client__avatar is-company"><Glyph name="building" size={15} /></span>
              <strong>{company.name}</strong>
              {open(`/app/companies/c/${company.id}`)}
            </span>
          ) : (
            <Unset />
          )
        }
        renderEditor={({ value, commit }) => <ClientPicker types={['company']} autoFocus open value={value} initial={company ? { type: 'company', ...company } : undefined} onChange={(next) => commit(next)} />}
        onSave={(next) => onPatch({ companyId: next ? Number(String(next).split(':')[1]) : null })}
      />
      <InlineRow
        label={t('crm.client.contact')}
        value={person ? `p:${person.id}` : null}
        disabled={!editable}
        instant
        display={
          person ? (
            <span className="dp-client is-person">
              <span className="dp-client__line">
                <span className="dp-client__avatar"><Glyph name="person" size={15} /></span>
                <strong>{person.name}</strong>
                {open(`/app/companies/p/${person.id}`)}
              </span>
              {contactLinks}
            </span>
          ) : (
            <Unset />
          )
        }
        renderEditor={({ value, commit }) => <ClientPicker types={['person']} autoFocus open value={value} initial={person ? { type: 'person', ...person } : undefined} onChange={(next) => commit(next)} />}
        onSave={(next) => onPatch({ personId: next ? Number(String(next).split(':')[1]) : null })}
      />
    </Card>
  );
}

function customRow(field, deal, editable, onPatch) {
  const value = deal.custom?.[field.key];
  return (
    <InlineRow
      key={field.key}
      label={field.label}
      value={value}
      disabled={!editable}
      instant={['select', 'multiselect', 'bool', 'user', 'date'].includes(field.type) && field.type !== 'multiselect'}
      stacked={field.type === 'textarea'}
      display={<FieldValue field={field} value={value} currency={deal.currency} />}
      renderEditor={({ value: draft, setValue, commit }) => (
        <FieldInput
          field={field}
          value={draft}
          currency={deal.currency}
          autoFocus
          open={['select', 'user', 'date'].includes(field.type) ? true : undefined}
          onChange={(next) => (['select', 'bool', 'user', 'date'].includes(field.type) ? commit(next) : setValue(next))}
          onCommit={() => commit()}
        />
      )}
      onSave={(next) => onPatch({ custom: { ...(deal.custom || {}), [field.key]: next } })}
    />
  );
}

/**
 * The left column of the deal card: «О сделке» with the built-in fields,
 * the client, then every section of custom fields. Empty values read
 * «не заполнено»; a click edits in place.
 */
export default function DealFields({ deal, editable, onPatch }) {
  const { t, locale } = useLocale();
  const { settings, canAdmin } = useCrm();
  const sections = settings.sections?.length ? settings.sections : [{ key: 'about', title: t('crm.fields.about') }];
  const fields = settings.fields || [];
  const bySection = (key) => fields.filter((field) => (field.section || 'about') === key);

  const builtins = {
    owner: (
      <InlineRow
        key="b-owner"
        label={t('crm.fields.owner')}
        value={deal.owner?.id ?? null}
        disabled={!editable}
        instant
        display={deal.owner ? <Person user={deal.owner} size={22} /> : <Unset />}
        renderEditor={({ value, commit }) => <UserSelect autoFocus open value={value} onChange={(next) => commit(next ?? null)} style={{ width: '100%' }} />}
        onSave={(ownerId) => onPatch({ ownerId })}
      />
    ),
    watchers: (
      <InlineRow
        key="b-watchers"
        label={t('crm.fields.watchers')}
        value={(deal.watchers || []).map((user) => user.id)}
        disabled={!editable}
        display={
          deal.watchers?.length ? (
            <span className="dp-avatars">
              {deal.watchers.map((user) => (
                <UserAvatar key={user.id} user={user} size={24} />
              ))}
            </span>
          ) : (
            <Unset />
          )
        }
        renderEditor={({ value, setValue }) => <UserSelect multiple autoFocus value={value} onChange={setValue} style={{ width: '100%' }} />}
        onSave={(watcherIds) => onPatch({ watcherIds })}
      />
    ),
    close_date: (
      <InlineRow
        key="b-close_date"
        label={t('crm.fields.closeDate')}
        value={deal.closeDate || null}
        disabled={!editable}
        instant
        display={deal.closeDate ? <span className={isPastDay(deal.closeDate) && !deal.closedAt ? 'crm-late' : ''}>{formatDay(deal.closeDate, locale, true)}</span> : <Unset />}
        renderEditor={({ value, commit }) => <DateField autoFocus open value={value || null} onChange={(day) => commit(day)} style={{ width: '100%' }} />}
        onSave={(closeDate) => onPatch({ closeDate })}
      />
    ),
    source: (
      <InlineRow
        key="b-source"
        label={t('crm.fields.source')}
        value={deal.source || null}
        disabled={!editable}
        instant
        display={deal.source || <Unset />}
        renderEditor={({ value, commit }) => (
          <Select autoFocus open allowClear value={value ?? undefined} onChange={(next) => commit(next ?? null)} options={[...new Set([...(settings.sources || []), ...(deal.source ? [deal.source] : [])])].map((item) => ({ value: item, label: item }))} style={{ width: '100%' }} />
        )}
        onSave={(source) => onPatch({ source })}
      />
    ),
    comment: (
      <InlineRow
        key="b-comment"
        label={t('crm.fields.comment')}
        value={deal.comment || ''}
        disabled={!editable}
        stacked
        display={deal.comment ? <span className="crm-multiline">{deal.comment}</span> : <Unset />}
        renderEditor={({ value, setValue }) => <Input.TextArea autoFocus value={value} onChange={(event) => setValue(event.target.value)} autoSize={{ minRows: 3, maxRows: 10 }} maxLength={5000} />}
        onSave={(comment) => onPatch({ comment })}
      />
    ),
  };
  const placed = settings.builtinSections || {};
  const builtinIn = (key) => Object.keys(builtins).filter((name) => (placed[name] || 'about') === key || (key === 'about' && !sections.some((section) => section.key === placed[name]))).map((name) => builtins[name]);

  const about = (
    <Card key="about" title={sections.find((section) => section.key === 'about')?.title || t('crm.fields.about')}>
      {builtinIn('about')}
      {bySection('about').map((field) => customRow(field, deal, editable, onPatch))}
    </Card>
  );

  return (
    <div className="dp-cards">
      {about}
      <ClientCard deal={deal} editable={editable} onPatch={onPatch} />
      {sections
        .filter((section) => section.key !== 'about')
        .map((section) => {
          const list = bySection(section.key);
          const own = builtinIn(section.key);
          if (!list.length && !own.length && !canAdmin) return null;
          return (
            <Card key={section.key} title={section.title}>
              {own}
              {list.length || own.length ? (
                list.map((field) => customRow(field, deal, editable, onPatch))
              ) : (
                <div className="dp-card__empty">
                  {t('crm.fields.noFields')} <Link to="/admin/settings/crm">{t('crm.fields.addFields')} →</Link>
                </div>
              )}
            </Card>
          );
        })}
    </div>
  );
}
