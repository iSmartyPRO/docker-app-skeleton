import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Drawer, Input } from 'antd';
import Chrome from '../components/Chrome';
import { MenuIcon } from '../components/icons/menuIcons';
import { useLocale } from '../context/LocaleContext';
import { useThemeMode } from '../context/ThemeContext';
import { loadAllHelp, loadHelp, loadHelpIndex, tr } from './registry';
import Rich from './Rich';
import './help.css';

/*
 * /help, /help/:id — the help center: every module's guide in one place,
 * with search across titles, sections and answers.
 */

const plain = (value) => String(value || '').replace(/\*\*|`|\[|\]\([^)]*\)/g, '');

/** Resolves a promise into state; `null` while loading or when `make` returns null. */
function useLoaded(make, deps) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    let alive = true;
    const promise = make();
    if (!promise) setValue(null);
    else promise.then((result) => alive && setValue(result)).catch(() => alive && setValue(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

function searchIndex(all, locale) {
  const out = [];
  for (const content of all) {
    const title = tr(content.title, locale);
    out.push({ id: content.id, section: null, title, text: `${tr(content.tagline, locale)} ${tr(content.summary, locale)}`, kind: 'module' });
    for (const item of content.highlights || []) out.push({ id: content.id, section: null, title: `${title} · ${tr(item.title, locale)}`, text: tr(item.text, locale), kind: 'highlight' });
    for (const item of content.sections || [])
      out.push({ id: content.id, section: item.id, title: `${title} · ${tr(item.title, locale)}`, text: `${tr(item.body, locale)} ${(item.steps || []).map((step) => tr(step, locale)).join(' ')}`, kind: 'section' });
    (content.faq || []).forEach((item, index) => out.push({ id: content.id, section: `faq-${index}`, title: tr(item.q, locale), text: tr(item.a, locale), kind: 'faq', module: title }));
    for (const [key, field] of Object.entries(content.fields || {})) out.push({ id: content.id, section: field.more || null, title: `${title} · ${tr(field.title, locale)}`, text: tr(field.text, locale), kind: 'field', key });
  }
  return out;
}

function Article({ content, locale, t, appearance }) {
  return (
    <article className="hp-article">
      <header className="hp-hero">
        <span className="hp-hero__icon is-large">
          <MenuIcon name={content.icon} appearance={appearance} />
        </span>
        <div>
          <span className="hp-kicker">{t('help.guide')}</span>
          <h1>{tr(content.title, locale)}</h1>
          <p>{tr(content.tagline, locale)}</p>
        </div>
      </header>
      <Rich text={tr(content.summary, locale)} className="hp-summary is-lead" />

      <section className="hp-block">
        <h2>{t('help.capabilities')}</h2>
        <div className="hp-highlights">
          {(content.highlights || []).map((item, index) => (
            <div key={index} className="hp-highlight">
              <span className="hp-highlight__icon">{item.icon}</span>
              <div>
                <strong>{tr(item.title, locale)}</strong>
                <Rich text={tr(item.text, locale)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {content.tips?.length > 0 && (
        <section className="hp-tips is-wide">
          <h4>💡 {t('help.tips')}</h4>
          <ul>
            {content.tips.map((tip, index) => (
              <li key={index}>
                <Rich text={tr(tip, locale)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {(content.sections || []).length > 0 && (
        <nav className="hp-toc">
          <h4>{t('help.contents')}</h4>
          <ol>
            {content.sections.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{tr(item.title, locale)}</a>
              </li>
            ))}
            {content.faq?.length > 0 && (
              <li>
                <a href="#faq">{t('help.faq')}</a>
              </li>
            )}
          </ol>
        </nav>
      )}

      {(content.sections || []).map((item) => (
        <section key={item.id} id={item.id} className="hp-section">
          <h2>
            {tr(item.title, locale)}
            <a href={`#${item.id}`} className="hp-anchor" aria-label="#">
              #
            </a>
          </h2>
          <Rich text={tr(item.body, locale)} />
          {item.steps?.length > 0 && (
            <ol className="hp-steps">
              {item.steps.map((step, index) => (
                <li key={index}>
                  <Rich text={tr(step, locale)} />
                </li>
              ))}
            </ol>
          )}
          {item.note && (
            <div className="hp-note">
              <Rich text={tr(item.note, locale)} />
            </div>
          )}
          {item.example && (
            <div className="hp-example">
              <span className="hp-example__tag">{t('help.example')}</span>
              <strong>{tr(item.example.title, locale)}</strong>
              <Rich text={tr(item.example.body, locale)} />
            </div>
          )}
        </section>
      ))}

      {content.faq?.length > 0 && (
        <section id="faq" className="hp-section">
          <h2>{t('help.faq')}</h2>
          <div className="hp-faq">
            {content.faq.map((item, index) => (
              <details key={index} id={`faq-${index}`}>
                <summary>{tr(item.q, locale)}</summary>
                <Rich text={tr(item.a, locale)} />
              </details>
            ))}
          </div>
        </section>
      )}

      {Object.keys(content.fields || {}).length > 0 && (
        <section className="hp-section">
          <h2>{t('help.fields')}</h2>
          <dl className="hp-fields">
            {Object.entries(content.fields).map(([key, field]) => (
              <div key={key}>
                <dt>{tr(field.title, locale)}</dt>
                <dd>
                  <Rich text={tr(field.text, locale)} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </article>
  );
}

export default function HelpCenter() {
  const { t, locale } = useLocale();
  const { appearance } = useThemeMode();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [nav, setNav] = useState(false);
  const main = useRef(null);
  const needle = q.trim().toLowerCase();
  // The table of contents (one small chunk), the article being read, and every
  // article only once the person searches — a language switch fetches no more.
  const all = useLoaded(() => loadHelpIndex(locale), [locale]);
  const known = Boolean(id && all?.some((item) => item.id === id));
  const article = useLoaded(() => (known ? loadHelp(id, locale) : null), [known, id, locale]);
  const searching = needle.length >= 2;
  const [searchWanted, setSearchWanted] = useState(false);
  useEffect(() => {
    if (searching) setSearchWanted(true);
  }, [searching]);
  // A language switch drops the old search data; it is fetched again on the next search.
  useEffect(() => {
    if (!searching) setSearchWanted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);
  const everything = useLoaded(() => (searchWanted ? loadAllHelp(locale) : null), [searchWanted, locale]);
  const content = known && article?.id === id ? article : null;
  const ready = Boolean(all) && (!known || Boolean(content));

  useEffect(() => {
    document.title = `${t('help.center')}`;
  }, [t]);

  // Hash anchors after the article renders; otherwise start at the top.
  useEffect(() => {
    if (!ready) return;
    const hash = location.hash.slice(1);
    if (hash) {
      setTimeout(() => {
        const target = document.getElementById(hash);
        if (target?.tagName === 'DETAILS') target.open = true;
        target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }, 80);
    } else window.scrollTo({ top: 0 });
  }, [ready, id, location.hash]);

  const index = useMemo(() => (everything ? searchIndex(everything, locale) : []), [everything, locale]);
  const results = useMemo(() => {
    if (needle.length < 2) return [];
    const words = needle.split(/\s+/);
    return index
      .map((item) => {
        const hay = `${item.title} ${plain(item.text)}`.toLowerCase();
        if (!words.every((word) => hay.includes(word))) return null;
        const score = (item.title.toLowerCase().includes(needle) ? 10 : 0) + (item.kind === 'module' ? 3 : item.kind === 'section' ? 2 : 1);
        return { ...item, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
  }, [index, needle]);

  const open = (item) => {
    setQ('');
    setNav(false);
    navigate(`/help/${item.id}${item.section ? `#${item.section}` : ''}`);
  };

  const sidebar = (
    <nav className="hp-nav">
      <Link to="/help" className={`hp-nav__item is-home${!id ? ' is-active' : ''}`} onClick={() => setNav(false)}>
        <span className="hp-nav__home">✦</span>
        {t('help.center')}
      </Link>
      {(all || []).map((item) => (
        <Link key={item.id} to={`/help/${item.id}`} className={`hp-nav__item${id === item.id ? ' is-active' : ''}`} onClick={() => setNav(false)}>
          <MenuIcon name={item.icon} appearance={appearance} />
          {tr(item.title, locale)}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="shell">
      <Chrome dense />
      <div className="hp-layout">
        <aside className="hp-side">{sidebar}</aside>
        <Drawer open={nav} onClose={() => setNav(false)} placement="left" width={290} title={t('help.center')} styles={{ body: { padding: 8 } }}>
          {sidebar}
        </Drawer>
        <main className="hp-main" ref={main}>
          <div className="hp-searchbar">
            <button type="button" className="hp-burger" onClick={() => setNav(true)} aria-label={t('common.menu')}>
              ☰
            </button>
            <Input size="large" allowClear value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('help.search')} prefix={<span className="hp-muted">⌕</span>} />
            {needle.length >= 2 && (
              <div className="hp-results">
                {results.length ? (
                  results.map((item, i) => (
                    <button key={i} type="button" onClick={() => open(item)}>
                      <span className={`hp-results__kind is-${item.kind}`}>{t(`help.kind.${item.kind}`)}</span>
                      <strong>{item.title}</strong>
                      <span>{plain(item.text).slice(0, 140)}</span>
                    </button>
                  ))
                ) : (
                  <p className="hp-muted">{everything ? t('help.nothing') : t('common.loading')}</p>
                )}
              </div>
            )}
          </div>

          {!ready ? (
            <div className="hp-skeleton is-tall" />
          ) : content ? (
            <>
              <Article content={content} locale={locale} t={t} appearance={appearance} />
              {content.related?.length > 0 && (
                <section className="hp-section">
                  <h2>{t('help.related')}</h2>
                  <div className="hp-cards is-small">
                    {content.related
                      .map((other) => all.find((item) => item.id === other))
                      .filter(Boolean)
                      .map((item) => (
                        <Link key={item.id} to={`/help/${item.id}`} className="hp-card">
                          <span className="hp-card__icon">
                            <MenuIcon name={item.icon} appearance={appearance} />
                          </span>
                          <strong>{tr(item.title, locale)}</strong>
                          <span>{tr(item.tagline, locale)}</span>
                        </Link>
                      ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
              <header className="hp-home">
                <span className="hp-kicker">{t('help.center')}</span>
                <h1>{t('help.homeTitle')}</h1>
                <p>{t('help.homeLead')}</p>
                <div className="hp-home__keys">
                  <span>
                    <kbd>?</kbd> {t('help.shortcut')}
                  </span>
                  <span>
                    <span className="hp-hint__dot is-static">i</span> {t('help.fieldHints')}
                  </span>
                </div>
              </header>
              <div className="hp-cards">
                {all.map((item) => (
                  <Link key={item.id} to={`/help/${item.id}`} className="hp-card">
                    <span className="hp-card__icon">
                      <MenuIcon name={item.icon} appearance={appearance} />
                    </span>
                    <strong>{tr(item.title, locale)}</strong>
                    <span>{tr(item.tagline, locale)}</span>
                    <em>
                      {t('help.counts', { sections: item.sections, faq: item.faq })}
                    </em>
                  </Link>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
