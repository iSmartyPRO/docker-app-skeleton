import { useEffect, useState } from 'react';
import { Popover } from 'antd';
import { useLocale } from '../context/LocaleContext';
import { useHelp } from './HelpContext';
import { loadHelp, tr } from './registry';
import Rich from './Rich';
import './help.css';

/**
 * A quiet ⓘ next to a field label: hover or tap shows what the field does,
 * "More" opens the guide at the right section.
 *
 *   <Hint id="tasks.resultRequired" />           text from help/content/tasks.js → fields
 *   <Hint title="…" text="…" />                   inline text
 */
export function Hint({ id, title, text, more, placement = 'top' }) {
  const { locale, t } = useLocale();
  const { openHelp } = useHelp();
  const [module, key] = id ? id.split(/\.(.+)/) : [null, null];
  const [field, setField] = useState(null);

  const load = () => {
    if (!id || field) return;
    loadHelp(module, locale).then((content) => setField(content?.fields?.[key] || { missing: true }));
  };
  useEffect(() => setField(null), [id, locale]);

  const heading = title ?? tr(field?.title, locale);
  const body = text ?? tr(field?.text, locale);
  const section = more ?? field?.more;
  const content = (
    <div className="hp-hint">
      {heading && <strong>{heading}</strong>}
      {body ? <Rich text={body} /> : <span className="hp-hint__loading">…</span>}
      {module && (
        <button
          type="button"
          className="hp-hint__more"
          onClick={(event) => {
            event.stopPropagation();
            openHelp(module, section);
          }}
        >
          {t('help.more')} →
        </button>
      )}
    </div>
  );
  return (
    <Popover content={content} trigger={['hover', 'click']} placement={placement} mouseEnterDelay={0.15} onOpenChange={(open) => open && load()} overlayClassName="hp-hint-pop">
      <button type="button" className="hp-hint__dot" aria-label={heading || t('help.title')} onClick={(event) => event.preventDefault()}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 7.2v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="5" r="0.95" fill="currentColor" />
        </svg>
      </button>
    </Popover>
  );
}

/** Label text followed by its hint. */
export function HintLabel({ id, children, ...rest }) {
  return (
    <span className="hp-label">
      {children}
      <Hint id={id} {...rest} />
    </span>
  );
}

/** The round "?" that opens the module guide; put it in module headers. */
export function HelpButton({ id, section, className = '' }) {
  const { t } = useLocale();
  const { openHelp } = useHelp();
  return (
    <button type="button" className={`hp-btn ${className}`} onClick={() => openHelp(id, section)} aria-label={t('help.title')} title={`${t('help.title')} (?)`}>
      ?
    </button>
  );
}

export default Hint;
