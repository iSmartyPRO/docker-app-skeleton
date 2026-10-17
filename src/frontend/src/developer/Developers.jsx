import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, Drawer, Input, Switch } from 'antd';
import Segmented from '../components/ui/Segmented';
import { DownloadOutlined, MenuOutlined } from '@ant-design/icons';
import BrandMark from '../components/BrandMark';
import LanguageSwitch from '../components/LanguageSwitch';
import ThemeSwitch from '../components/ThemeSwitch';
import { useLocale } from '../context/LocaleContext';
import { developerApi, rawCall } from './client';
import { CodeBlock, CodeTabs, CopyField, MethodBadge, PathText, areaTitle, requestSamples, statusClass, useCopy } from './components';
import { GUIDE, Guide, rich } from './guide';
import { pick } from '../i18n/languages';

/*
 * /developers — the developer portal: a guide and the full API reference with
 * code samples and a live console. Public when the administrator allows it.
 */

const slug = (endpoint) => `ep-${endpoint.method.toLowerCase()}-${endpoint.path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
const text = (value, locale) => pick(value, locale);
const SAMPLE_VALUES = { ref: 'WEB-12', id: '1', userId: '7', type: 'task', key: 'WEB', token: 'TOKEN', slug: 'docs', nodeId: '1', serverId: '1', otherId: '2' };
const samplePath = (path) => path.replace(/:(\w+)(\(([^)]*)\))?/g, (_, name, _x, choices) => (choices ? choices.split('|')[0] : SAMPLE_VALUES[name] || '1')).replace(/(.)\/$/, '$1');
const pathParams = (path) => [...path.matchAll(/:(\w+)/g)].map(([, name]) => name);

function ParamTable({ title, rows, locale, t }) {
  if (!rows?.length) return null;
  return (
    <div className="dv-params">
      <h5>{title}</h5>
      {rows.map((row) => (
        <div key={row.name} className="dv-param">
          <div className="dv-param__name">
            <code>{row.name}</code>
            {row.required && <em>{t('dev.required')}</em>}
          </div>
          <span className="dv-param__type">{row.type}</span>
          <span className="dv-param__desc">{rich(text(row.desc, locale))}</span>
        </div>
      ))}
    </div>
  );
}

function EndpointCard({ endpoint, base, locale, t, onTry }) {
  const copy = useCopy();
  const doc = endpoint.doc || {};
  const url = `${base}${samplePath(endpoint.path)}`;
  const multipart = /multipart/.test(text(doc.description, 'en'));
  const params = pathParams(endpoint.path).map((name) => ({ name, type: 'string', required: true, desc: { ru: SAMPLE_VALUES[name] ? `например, ${SAMPLE_VALUES[name]}` : '', en: SAMPLE_VALUES[name] ? `e.g. ${SAMPLE_VALUES[name]}` : '' } }));
  return (
    <article id={slug(endpoint)} className="dv-endpoint">
      <header className="dv-endpoint__head">
        <MethodBadge method={endpoint.method} />
        <PathText path={endpoint.path} />
        <span className="dv-grow" />
        {endpoint.area ? (
          <span className={`dv-scope is-${endpoint.level}`} title={t('dev.scope')}>
            {endpoint.area}:{endpoint.level}
          </span>
        ) : (
          <span className="dv-scope is-free">{t('dev.noScope')}</span>
        )}
        <button type="button" className="dv-icon-btn" title={t('dev.copyLink')} onClick={() => copy(`${window.location.origin}/developers#${slug(endpoint)}`)}>
          #
        </button>
      </header>
      <h3>{text(doc.summary, locale)}</h3>
      {doc.description && <p>{rich(text(doc.description, locale))}</p>}
      <div className="dv-endpoint__grid">
        <div>
          <ParamTable title={t('dev.pathParams')} rows={params} locale={locale} t={t} />
          <ParamTable title={t('dev.query')} rows={doc.query} locale={locale} t={t} />
          <ParamTable title={t('dev.body')} rows={doc.body} locale={locale} t={t} />
          <Button type="primary" ghost onClick={() => onTry(endpoint)} className="dv-try">
            ▶ {t('dev.tryIt')}
          </Button>
        </div>
        <div className="dv-endpoint__code">
          <h5>{t('dev.request')}</h5>
          <CodeTabs samples={requestSamples({ method: endpoint.method, url, body: doc.example, multipart })} />
          {doc.response && (
            <>
              <h5>{t('dev.response')}</h5>
              <CodeBlock code={JSON.stringify(doc.response, null, 2)} maxHeight={340} />
            </>
          )}
        </div>
      </div>
    </article>
  );
}

const TOKEN_KEY = 'ax_try_token';

function TryPanel({ endpoint, onClose, t }) {
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  });
  const [useSession, setUseSession] = useState(!token);
  const [values, setValues] = useState({});
  const [query, setQuery] = useState({});
  const [body, setBody] = useState('');
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!endpoint) return;
    setValues(Object.fromEntries(pathParams(endpoint.path).map((name) => [name, SAMPLE_VALUES[name] || ''])));
    setQuery(Object.fromEntries((endpoint.doc?.query || []).flatMap((row) => row.name.split('/').map((name) => [name.trim(), '']))));
    setBody(endpoint.doc?.example ? JSON.stringify(endpoint.doc.example, null, 2) : ['POST', 'PUT', 'PATCH'].includes(endpoint.method) ? '{\n  \n}' : '');
    setResult(null);
  }, [endpoint]);

  if (!endpoint) return null;
  const path = endpoint.path.replace(/:(\w+)(\([^)]*\))?/g, (_, name) => encodeURIComponent(values[name] || `:${name}`)).replace(/(.)\/$/, '$1');
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '')).toString();
  const full = `${path}${qs ? `?${qs}` : ''}`;
  const write = !['GET', 'HEAD'].includes(endpoint.method);

  const send = async () => {
    let parsed;
    if (write && body.trim()) {
      try {
        parsed = JSON.parse(body);
      } catch {
        setResult({ error: t('dev.console2.invalidJson') });
        return;
      }
    }
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
    setSending(true);
    try {
      setResult(await rawCall({ method: endpoint.method, path: full, token: useSession ? null : token.trim(), body: parsed }));
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Drawer open={Boolean(endpoint)} onClose={onClose} width={620} className="dv-try-drawer" title={t('dev.console2.title')} destroyOnHidden>
      <div className="dv-tryp">
        <div className="dv-tryp__line">
          <MethodBadge method={endpoint.method} />
          <code>/api/v1{full}</code>
        </div>
        <div className="dv-tryp__auth">
          <div className="dv-tryp__label">
            <span>{t('dev.console2.token')}</span>
            <label>
              <Switch size="small" checked={useSession} onChange={setUseSession} /> {t('dev.console2.useSession')}
            </label>
          </div>
          {!useSession && <Input.Password value={token} onChange={(event) => setToken(event.target.value)} placeholder="pat_…" className="ax-mono" autoComplete="off" />}
          <em className="ax-hint">{t('dev.console2.tokenHint')}</em>
        </div>
        {Object.keys(values).length > 0 && (
          <div className="dv-tryp__group">
            <h5>{t('dev.pathParams')}</h5>
            {Object.keys(values).map((name) => (
              <label key={name} className="dv-tryp__kv">
                <code>{name}</code>
                <Input value={values[name]} onChange={(event) => setValues({ ...values, [name]: event.target.value })} />
              </label>
            ))}
          </div>
        )}
        {Object.keys(query).length > 0 && (
          <div className="dv-tryp__group">
            <h5>{t('dev.query')}</h5>
            {Object.keys(query).map((name) => (
              <label key={name} className="dv-tryp__kv">
                <code>{name}</code>
                <Input value={query[name]} onChange={(event) => setQuery({ ...query, [name]: event.target.value })} />
              </label>
            ))}
          </div>
        )}
        {write && (
          <div className="dv-tryp__group">
            <h5>{t('dev.console2.bodyJson')}</h5>
            <Input.TextArea value={body} onChange={(event) => setBody(event.target.value)} autoSize={{ minRows: 4, maxRows: 16 }} className="ax-mono" spellCheck={false} />
            <p className="dv-warn">⚠ {t('dev.console2.writeWarning')}</p>
          </div>
        )}
        <Button type="primary" size="large" block loading={sending} onClick={send}>
          {sending ? t('dev.console2.sending') : `▶ ${t('dev.console2.send')}`}
        </Button>
        {result && (
          <div className="dv-tryp__result">
            {result.error ? (
              <p className="dv-warn">{result.error}</p>
            ) : (
              <>
                <div className="dv-tryp__status">
                  <span className={`ax-status ${statusClass(result.status)}`}>{result.status}</span>
                  <span>{result.ms} ms</span>
                  {Object.entries(result.headers)
                    .filter(([name]) => name.startsWith('x-'))
                    .map(([name, value]) => (
                      <code key={name}>
                        {name}: {value}
                      </code>
                    ))}
                </div>
                <CodeBlock code={result.json ? JSON.stringify(result.json, null, 2) : result.text || '—'} lang={result.json ? 'json' : 'text'} maxHeight={480} />
              </>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

export default function Developers() {
  const { t, locale } = useLocale();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState('intro');
  const [trying, setTrying] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [mode, setMode] = useState('all');
  const searchRef = useRef(null);

  useEffect(() => {
    developerApi
      .reference()
      .then((res) => setData(res.data))
      .catch((err) => setError(err?.response?.status === 401 ? 'auth' : err?.message || 'error'));
  }, []);

  useEffect(() => {
    document.title = `${t('dev.title')} · API`;
  }, [t]);

  // ⌘K / Ctrl+K focuses the search.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Scroll to #anchor after load.
  useEffect(() => {
    if (!data || !location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    if (target) setTimeout(() => target.scrollIntoView({ block: 'start' }), 60);
  }, [data, location.hash]);

  // Scroll spy.
  useEffect(() => {
    if (!data) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' }
    );
    document.querySelectorAll('.dv-article, .dv-section, .dv-endpoint').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [data, mode, q]);

  const needle = q.trim().toLowerCase();
  const matches = useCallback(
    (endpoint) => !needle || `${endpoint.method} ${endpoint.path} ${text(endpoint.doc?.summary, locale)} ${text(endpoint.doc?.summary, 'en')} ${endpoint.area || ''}`.toLowerCase().includes(needle),
    [needle, locale]
  );
  const bySection = useMemo(() => {
    if (!data) return [];
    return data.sections
      .map((section) => {
        const list = data.endpoints.filter((endpoint) => endpoint.section === section.key && matches(endpoint) && (mode === 'all' || endpoint.doc));
        return { ...section, documented: list.filter((endpoint) => endpoint.doc), other: list.filter((endpoint) => !endpoint.doc), total: list.length };
      })
      .filter((section) => section.total);
  }, [data, matches, mode]);

  const jump = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#${id}`);
    setNavOpen(false);
  };

  if (error === 'auth') {
    return (
      <div className="dv dv-locked">
        <div className="dv-locked__card">
          <BrandMark />
          <h1>{t('dev.signIn')}</h1>
          <p>{t('dev.signInText')}</p>
          <Link to="/login?next=/developers">
            <Button type="primary" size="large">
              {t('dev.signInButton')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const viewer = data?.viewer;
  const nav = (
    <nav className="dv-nav__inner">
      <div className="dv-nav__group">{t('dev.guide')}</div>
      {GUIDE.map((key) => (
        <button key={key} type="button" className={active === key ? 'is-active' : ''} onClick={() => jump(key)}>
          {t(`dev.sections.${key}`)}
        </button>
      ))}
      <div className="dv-nav__group">{t('dev.reference')}</div>
      {bySection.map((section) => {
        const open = active === `sec-${section.key}` || [...section.documented, ...section.other].some((endpoint) => slug(endpoint) === active) || Boolean(needle);
        return (
          <div key={section.key} className="dv-nav__section">
            <button type="button" className={active === `sec-${section.key}` ? 'is-active' : ''} onClick={() => jump(`sec-${section.key}`)}>
              {text(section.title, locale)}
              <em>{section.total}</em>
            </button>
            {open && (
              <div className="dv-nav__eps">
                {section.documented.map((endpoint) => (
                  <button key={slug(endpoint)} type="button" className={active === slug(endpoint) ? 'is-active' : ''} onClick={() => jump(slug(endpoint))}>
                    <MethodBadge method={endpoint.method} small />
                    <span>{text(endpoint.doc.summary, locale)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="dv">
      <header className="dv-top">
        <button type="button" className="dv-burger" onClick={() => setNavOpen(true)} aria-label={t('common.menu')}>
          <MenuOutlined />
        </button>
        <Link to="/" className="dv-top__brand">
          <BrandMark />
        </Link>
        <span className="dv-top__title">
          {t('dev.title')}
          <em>v1</em>
        </span>
        <div className="dv-top__search">
          <Input ref={searchRef} allowClear value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('dev.searchPlaceholder')} prefix={<span className="ax-muted">⌕</span>} suffix={<kbd>⌘K</kbd>} />
        </div>
        <span className="dv-grow" />
        <a className="dv-top__link" href={`/api/developer/openapi.json?lang=${locale}&download=1`}>
          {t('dev.openapi')} <DownloadOutlined />
        </a>
        {viewer?.isAdmin && (
          <Link className="dv-top__link" to="/admin/api">
            {t('dev.console')}
          </Link>
        )}
        {viewer?.canTokens && (
          <Link to="/account/api">
            <Button type="primary">{t('dev.myTokens')}</Button>
          </Link>
        )}
        <LanguageSwitch />
        <ThemeSwitch />
      </header>

      <div className="dv-layout">
        <aside className="dv-nav">{nav}</aside>
        <Drawer open={navOpen} onClose={() => setNavOpen(false)} placement="left" width={300} className="dv-nav-drawer" title={t('dev.title')}>
          {nav}
        </Drawer>

        <main className="dv-main">
          {!data ? (
            <div className="ax-skeleton is-tall" />
          ) : (
            <>
              {!needle && <Guide data={data} t={t} locale={locale} viewer={viewer} />}
              <div className="dv-refhead">
                <h2>{t('dev.reference')}</h2>
                <Segmented
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'all', label: t('dev.endpoints', { n: data.endpoints.length }) },
                    { value: 'documented', label: `★ ${data.endpoints.filter((endpoint) => endpoint.doc).length}` },
                  ]}
                />
              </div>
              <CopyField value={data.base} label={t('api.baseUrl')} />
              {bySection.map((section) => (
                <section key={section.key} id={`sec-${section.key}`} className="dv-section">
                  <header className="dv-section__head">
                    <h2>{text(section.title, locale)}</h2>
                    {section.area && <span className="dv-scope">{areaTitle(t, section.area)} · {section.area}</span>}
                    <p>{rich(text(section.intro, locale))}</p>
                  </header>
                  {section.documented.map((endpoint) => (
                    <EndpointCard key={slug(endpoint)} endpoint={endpoint} base={data.base} locale={locale} t={t} onTry={setTrying} />
                  ))}
                  {section.other.length > 0 && (
                    <div className="dv-other">
                      <h5>{t('dev.otherEndpoints')}</h5>
                      {section.other.map((endpoint) => (
                        <div key={slug(endpoint)} id={slug(endpoint)} className="dv-other__row">
                          <MethodBadge method={endpoint.method} small />
                          <PathText path={endpoint.path} />
                          <span className="dv-grow" />
                          {endpoint.area && <span className={`dv-scope is-${endpoint.level}`}>{endpoint.area}:{endpoint.level}</span>}
                          <button type="button" className="dv-icon-btn" onClick={() => setTrying(endpoint)} title={t('dev.tryIt')}>
                            ▶
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
              <footer className="dv-foot">
                {data.app?.name} · API v1 · OpenAPI 3.1 · {new Date().getFullYear()}
              </footer>
            </>
          )}
        </main>
      </div>
      <TryPanel endpoint={trying} onClose={() => setTrying(null)} t={t} />
    </div>
  );
}
