import { useEffect, useRef, useState } from 'react';
import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled, LoadingOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { SLUG_MAX, normalizeSlug, slugFromName, validateSlug } from '../../lib/linkSlug';

/*
 * The custom address of a public link: a read-only prefix ("portal…/l/") and
 * an editable slug. Cyrillic is transliterated as you type; availability is
 * checked 300 ms after the last keystroke (`check(slug)` → { available,
 * reason, suggestions }); taken addresses offer clickable alternatives.
 * Empty means a random address. The server checks again when saving.
 *
 *   value / onChange — the slug ('' = random)
 *   current          — the link's saved slug (edit mode): shown as "current"
 *   onState          — ({ ok, pending }) whenever the verdict changes
 */
export default function SlugField({ host, path, value, onChange, check, current = '', name, onState, guessHint = false, id = 'link-slug' }) {
  const { t } = useLocale();
  const [verdict, setVerdict] = useState({ state: 'random' });
  const seq = useRef(0);

  useEffect(() => {
    const slug = value || '';
    let timer = null;
    const ticket = ++seq.current;
    if (!slug) setVerdict({ state: 'random' });
    else if (slug === current) setVerdict({ state: 'current' });
    else {
      const reason = validateSlug(slug);
      if (reason) setVerdict({ state: 'invalid', reason });
      else {
        setVerdict({ state: 'checking' });
        timer = setTimeout(() => {
          Promise.resolve(check(slug))
            .then((result) => {
              if (ticket !== seq.current) return;
              if (result?.available) setVerdict({ state: 'free' });
              else if (result?.reason === 'TAKEN' || result?.reason === 'RECENT') setVerdict({ state: 'taken', reason: result.reason, suggestions: result.suggestions || [] });
              else setVerdict({ state: 'invalid', reason: result?.reason || 'CHARS', suggestions: result?.suggestions || [] });
            })
            .catch(() => ticket === seq.current && setVerdict({ state: 'unknown' }));
        }, 300);
      }
    }
    return () => timer && clearTimeout(timer);
  }, [value, current, check]);

  const ok = ['random', 'current', 'free', 'unknown'].includes(verdict.state);
  const pending = verdict.state === 'checking';
  useEffect(() => {
    onState?.({ ok, pending });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, pending]);

  const tone = { free: 'ok', current: 'ok', taken: 'bad', invalid: 'warn', unknown: 'warn' }[verdict.state] || '';
  const icon = {
    checking: <LoadingOutlined />,
    free: <CheckCircleFilled />,
    current: <CheckCircleFilled />,
    taken: <CloseCircleFilled />,
    invalid: <ExclamationCircleFilled />,
    unknown: <ExclamationCircleFilled />,
  }[verdict.state];
  const fromName = name ? slugFromName(name) : '';

  let message = null;
  if (verdict.state === 'random') message = <span className="sl-slug__note">{t('linkShare.slugRandom')}</span>;
  else if (verdict.state === 'checking') message = <span className="sl-slug__note">{t('linkShare.slugChecking')}</span>;
  else if (verdict.state === 'free') message = <span className="sl-slug__msg is-ok">{t('linkShare.slugFree')}</span>;
  else if (verdict.state === 'current') message = <span className="sl-slug__msg is-ok">{t('linkShare.slugCurrent')}</span>;
  else if (verdict.state === 'taken') message = <span className="sl-slug__msg is-bad">{verdict.reason === 'RECENT' ? t('linkShare.slugRecent') : t('linkShare.slugTaken')}</span>;
  else if (verdict.state === 'invalid') message = <span className="sl-slug__msg is-warn">{t(`linkShare.slugReason.${verdict.reason}`)}</span>;
  else if (verdict.state === 'unknown') message = <span className="sl-slug__msg is-warn">{t('linkShare.slugCheckFailed')}</span>;
  const suggestions = verdict.suggestions || [];

  return (
    <div className="sl-slug">
      <label className={`sl-slug__box${tone ? ` is-${tone}` : ''}`} htmlFor={id}>
        <span className="sl-slug__prefix" title={`${host}${path}`}>
          <span className="sl-slug__host">{host}</span>
          <span className="sl-slug__path">{path}</span>
        </span>
        <input
          id={id}
          className="sl-slug__input"
          value={value}
          placeholder={t('linkShare.slugPh')}
          maxLength={SLUG_MAX + 8}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="url"
          aria-invalid={tone === 'bad' || tone === 'warn'}
          aria-describedby={`${id}-msg`}
          data-testid="slug-input"
          onChange={(event) => onChange(normalizeSlug(event.target.value, { final: false }))}
          onBlur={() => value && onChange(normalizeSlug(value))}
        />
        {icon && <span className={`sl-slug__icon${tone ? ` is-${tone}` : ''}`} aria-hidden="true">{icon}</span>}
      </label>
      <div className="sl-slug__foot" id={`${id}-msg`} aria-live="polite" data-testid="slug-state" data-state={verdict.state}>
        {message}
        {suggestions.length > 0 && (
          <span className="sl-slug__suggest">
            <span>{t('linkShare.slugTry')}</span>
            {suggestions.map((item) => (
              <button key={item} type="button" className="sl-chip is-suggest" onClick={() => onChange(item)}>
                {item}
              </button>
            ))}
          </span>
        )}
        {!value && fromName && fromName.length >= 3 && (
          <button type="button" className="sl-linkbtn" onClick={() => onChange(fromName)}>
            {t('linkShare.slugFromName')}: <b>{fromName}</b>
          </button>
        )}
      </div>
      {guessHint && value && ok && <div className="sl-slug__hint">🔐 {t('linkShare.slugGuessable')}</div>}
    </div>
  );
}
