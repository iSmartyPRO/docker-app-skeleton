import { useState } from 'react';
import { App, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { colorFor, initials, relationLabel } from '../api';
import { intlOptions } from '../../../lib/datetime';
import { localeTag } from '../../../i18n/languages';

export function Flag({ meta, country, withName }) {
  const { locale } = useLocale();
  const profile = meta?.countries?.[country];
  if (!profile) return null;
  return (
    <span className="cmp-flag" title={profile.name[locale] || profile.name.en}>
      <span aria-hidden="true">{profile.flag}</span>
      {withName && <span>{profile.name[locale] || profile.name.en}</span>}
    </span>
  );
}

export function Avatar({ name, size = 40, square, url }) {
  if (url) return <img className={`cmp-avatar${square ? ' is-square' : ''}`} src={url} alt="" style={{ width: size, height: size }} />;
  const color = colorFor(name);
  return (
    <span className={`cmp-avatar${square ? ' is-square' : ''}`} style={{ width: size, height: size, '--c': color, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Read-only stars, or an input when `onChange` is given. */
export function Stars({ value = 0, onChange, size = 16, showValue }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;
  return (
    <span className={`cmp-stars${onChange ? ' is-input' : ''}`} style={{ '--s': `${size}px` }} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, shown - n + 1));
        const star = (
          <span key={n} className="cmp-star" style={{ '--fill': `${fill * 100}%` }} aria-hidden="true">
            ★
          </span>
        );
        return onChange ? (
          <button key={n} type="button" className="cmp-star-btn" onMouseEnter={() => setHover(n)} onClick={() => onChange(n)} aria-label={`${n}`}>
            {star}
          </button>
        ) : (
          star
        );
      })}
      {showValue && value ? <strong className="cmp-stars__value">{Number(value).toFixed(1)}</strong> : null}
    </span>
  );
}

export function StatusBadge({ status }) {
  const { t } = useLocale();
  if (!status || status === 'unknown') return null;
  return <span className={`cmp-status is-${status}`}>{t(`companies.status.${status}`)}</span>;
}

export function Relations({ keys = [], meta }) {
  const { t } = useLocale();
  const list = meta?.settings?.relations || [];
  return (
    <span className="cmp-relations">
      {keys.map((key) => {
        const relation = list.find((item) => item.key === key) || { key };
        return (
          <span key={key} className="cmp-relation" style={{ '--c': relation.color || '#64748B' }}>
            {relationLabel(t, relation)}
          </span>
        );
      })}
    </span>
  );
}

const MESSENGER_URL = {
  telegram: (v) => `https://t.me/${v.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '')}`,
  whatsapp: (v) => `https://wa.me/${v.replace(/\D/g, '')}`,
  viber: (v) => `viber://chat?number=${v.replace(/[^\d+]/g, '')}`,
  linkedin: (v) => (/^https?:/.test(v) ? v : `https://www.linkedin.com/in/${v}`),
  instagram: (v) => `https://instagram.com/${v.replace(/^@/, '')}`,
};

export function Copyable({ value, children }) {
  const { message } = App.useApp();
  const { t } = useLocale();
  if (!value) return children || null;
  return (
    <Tooltip title={t('companies.copy')}>
      <button
        type="button"
        className="cmp-copy"
        onClick={() => navigator.clipboard?.writeText(String(value)).then(() => message.success(t('common.copied')))}
      >
        {children || value}
      </button>
    </Tooltip>
  );
}

/** Phones, emails, website and messengers as working links. */
export function ContactLinks({ item, compact }) {
  const { t } = useLocale();
  const rows = [];
  for (const phone of item.phones || []) {
    rows.push({ key: `p${phone.value}`, icon: '☎', node: <a href={`tel:${phone.value.replace(/[^\d+]/g, '')}`}>{phone.value}</a>, label: phone.label });
  }
  for (const email of item.emails || []) {
    rows.push({ key: `e${email.value}`, icon: '✉', node: <a href={`mailto:${email.value}`}>{email.value}</a>, label: email.label });
  }
  if (item.website) {
    rows.push({ key: 'w', icon: '🌐', node: <a href={item.website} target="_blank" rel="noopener noreferrer">{item.website.replace(/^https?:\/\//, '')}</a> });
  }
  for (const [name, value] of Object.entries(item.messengers || {})) {
    const url = MESSENGER_URL[name]?.(value);
    rows.push({
      key: `m${name}`,
      icon: '💬',
      node: url ? <a href={url} target="_blank" rel="noopener noreferrer">{value}</a> : <span>{value}</span>,
      label: t(`companies.messenger.${name}`),
    });
  }
  if (!rows.length) return compact ? null : <span className="cmp-muted">—</span>;
  return (
    <ul className={`cmp-contacts${compact ? ' is-compact' : ''}`}>
      {rows.map((row) => (
        <li key={row.key}>
          <span className="cmp-contacts__icon" aria-hidden="true">{row.icon}</span>
          {row.node}
          {row.label && row.label !== 'registry' && <em>{row.label}</em>}
        </li>
      ))}
    </ul>
  );
}

/** A titled block of label/value pairs; empty values are skipped. */
export function Facts({ title, rows, extra }) {
  const filled = rows.filter((row) => row && row.value !== null && row.value !== undefined && row.value !== '' && !(Array.isArray(row.value) && !row.value.length));
  if (!filled.length && !extra) return null;
  return (
    <section className="cmp-facts">
      {title && <h3>{title}</h3>}
      <dl>
        {filled.map((row) => (
          <div key={row.label} className={row.wide ? 'is-wide' : ''}>
            <dt>{row.label}</dt>
            <dd>{row.copy ? <Copyable value={row.value} /> : row.value}</dd>
          </div>
        ))}
      </dl>
      {extra}
    </section>
  );
}

export function formatDate(value, locale) {
  if (!value) return null;
  // A calendar day ('YYYY-MM-DD') stays that day; an instant is shown in the person's zone.
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(day ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  return date.toLocaleDateString(localeTag(locale), day ? options : intlOptions(options));
}
