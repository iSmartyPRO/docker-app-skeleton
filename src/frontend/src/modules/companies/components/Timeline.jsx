import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, DatePicker, Input, Popconfirm, Segmented, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatRelative } from '../../../lib/format';
import { cmpApi, fieldLabel } from '../api';
import { useCompanies } from '../CompaniesContext';
import { Avatar, Stars } from './ui';

const ICONS = {
  note: '📝', call: '📞', meeting: '🤝', email: '✉️', deal: '💼', issue: '⚠️',
  created: '✨', changed: '✎', registry: '🏛', archived: '🗄', restored: '♻', joined: '➜', left: '⇠', position: '🪪', position_removed: '✕', rating: '★', file: '📎', file_removed: '📎',
};
const NOTE_KINDS = ['note', 'call', 'meeting', 'email', 'deal', 'issue'];

function show(value, t) {
  if (value === null || value === undefined || value === '') return <em className="cmp-empty-val">{t('companies.empty')}</em>;
  if (Array.isArray(value)) {
    if (!value.length) return <em className="cmp-empty-val">{t('companies.empty')}</em>;
    return value.map((item) => (typeof item === 'object' ? item.value || item.bank || item.account || JSON.stringify(item) : item)).join(', ');
  }
  if (typeof value === 'boolean') return value ? t('companies.yes') : t('companies.no');
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ');
  return String(value);
}

export function Changes({ changes, country }) {
  const { t, locale } = useLocale();
  const { meta } = useCompanies();
  if (!changes?.length) return null;
  return (
    <table className="cmp-changes">
      <tbody>
        {changes.map((change) => (
          <tr key={change.field}>
            <th>{fieldLabel(t, change.field, meta, country, locale)}</th>
            <td className="is-from">{show(change.from, t)}</td>
            <td className="cmp-changes__arrow">→</td>
            <td className="is-to">{show(change.to, t)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function describe(event, t, type) {
  const d = event.data || {};
  switch (event.kind) {
    case 'created':
      return d.source ? t('companies.ev.createdFrom', { source: d.source }) : t(`companies.ev.created_${type}`);
    case 'changed':
      return t('companies.ev.changed', { n: d.changes?.length || 0 });
    case 'registry':
      return d.changes?.length ? t('companies.ev.registry', { source: d.source || '', n: d.changes.length }) : t('companies.ev.registrySame', { source: d.source || '' });
    case 'archived':
      return t(`companies.ev.archived_${type}`);
    case 'restored':
      return t('companies.ev.restored');
    case 'joined':
      return type === 'company' ? t('companies.ev.joinedCompany') : t('companies.ev.joinedPerson');
    case 'left':
      return type === 'company' ? t('companies.ev.leftCompany') : t('companies.ev.leftPerson');
    case 'position':
      return t('companies.ev.position', { company: d.companyName || '' });
    case 'position_removed':
      return t('companies.ev.positionRemoved', { company: d.companyName || '' });
    case 'rating':
      return t('companies.ev.rating');
    case 'file':
      return event.body === 'extract' ? t('companies.ev.extract', { source: d.source || '' }) : t('companies.ev.file');
    case 'file_removed':
      return t('companies.ev.fileRemoved');
    default:
      return t(`companies.note.${event.kind}`);
  }
}

function Composer({ type, id, onAdded }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [kind, setKind] = useState('note');
  const [body, setBody] = useState('');
  const [at, setAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const { data } = await cmpApi.addNote(type, id, { kind, body, at: at ? at.toISOString() : null });
      setBody('');
      setAt(null);
      onAdded(data);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cmp-composer">
      <Segmented size="small" value={kind} onChange={setKind} options={NOTE_KINDS.map((value) => ({ value, label: `${ICONS[value]} ${t(`companies.note.${value}`)}` }))} />
      <Input.TextArea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        autoSize={{ minRows: 2, maxRows: 10 }}
        placeholder={t(`companies.notePlaceholder.${kind}`)}
        onPressEnter={(event) => (event.ctrlKey || event.metaKey) && submit()}
      />
      <div className="cmp-composer__foot">
        <DatePicker showTime={{ format: 'HH:mm' }} format="DD.MM.YYYY HH:mm" value={at} onChange={setAt} placeholder={t('companies.now')} size="small" />
        <span className="cmp-composer__hint">Ctrl+Enter</span>
        <Button type="primary" loading={busy} disabled={!body.trim()} onClick={submit}>{t('companies.addToHistory')}</Button>
      </div>
    </div>
  );
}

/** Who did what and when: notes, calls, meetings, every change with old and new values. */
export default function Timeline({ type, id, country, onChange }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const load = useCallback(
    () => cmpApi.timeline(type, id, filter === 'notes' ? { kinds: NOTE_KINDS.join(',') } : filter === 'changes' ? { kinds: 'created,changed,registry,archived,restored,file,file_removed' } : {}).then((res) => setData(res.data)),
    [type, id, filter]
  );
  useEffect(() => {
    setData(null);
    load().catch(() => setData({ items: [] }));
  }, [load]);

  const more = async () => {
    const last = data.items[data.items.length - 1];
    const { data: next } = await cmpApi.timeline(type, id, { before: last.at });
    setData({ items: [...data.items, ...next.items], more: next.more });
  };

  return (
    <div className="cmp-timeline">
      <Composer type={type} id={id} onAdded={(next) => { setData(next); onChange?.(); }} />
      <Segmented
        className="cmp-timeline__filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('companies.tl.all') },
          { value: 'notes', label: t('companies.tl.notes') },
          { value: 'changes', label: t('companies.tl.changes') },
        ]}
      />
      {!data ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : !data.items.length ? (
        <div className="cmp-muted cmp-timeline__empty">{t('companies.tl.empty')}</div>
      ) : (
        <ol className="cmp-events">
          {data.items.map((event) => {
            const d = event.data || {};
            const note = NOTE_KINDS.includes(event.kind);
            return (
              <li key={event.id} className={`cmp-event is-${event.kind}${note ? ' is-note' : ''}`}>
                <span className="cmp-event__icon" aria-hidden="true">{ICONS[event.kind] || '•'}</span>
                <div className="cmp-event__body">
                  <div className="cmp-event__head">
                    <strong>{describe(event, t, type)}</strong>
                    {(event.kind === 'joined' || event.kind === 'left') && (
                      <span className="cmp-event__link">
                        {type === 'company' ? (
                          <Link to={`/app/companies/p/${d.personId}`}>{d.personName || t('companies.contact')}</Link>
                        ) : (
                          <Link to={`/app/companies/c/${d.companyId}`}>{d.companyName}</Link>
                        )}
                        {d.title && <em> · {d.title}</em>}
                        {d.reason && <em> · {d.reason}</em>}
                      </span>
                    )}
                    {event.kind === 'rating' && <Stars value={d.score} size={14} />}
                  </div>
                  {event.body && event.kind !== 'file' && <p className="cmp-event__text">{event.body}</p>}
                  {event.kind === 'file' && event.body !== 'extract' && <p className="cmp-event__text">📎 {event.body}</p>}
                  {(event.kind === 'changed' || event.kind === 'registry' || event.kind === 'position') && <Changes changes={d.changes} country={country} />}
                  <div className="cmp-event__meta">
                    {event.author ? (
                      <span className="cmp-event__author"><Avatar name={event.author.name} url={event.author.avatar} size={18} /> {event.author.name}</span>
                    ) : (
                      <span>{t('companies.system')}</span>
                    )}
                    <span title={new Date(event.at).toLocaleString(locale)}>· {formatRelative(event.at, locale)}</span>
                    {note && (
                      <Popconfirm title={t('companies.deleteNote')} onConfirm={() => cmpApi.deleteEvent(event.id).then(load).catch((err) => message.error(errorMessage(err)))}>
                        <button type="button" className="cmp-event__del">{t('common.delete')}</button>
                      </Popconfirm>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {data?.more && <Button block onClick={more}>{t('companies.tl.more')}</Button>}
    </div>
  );
}
