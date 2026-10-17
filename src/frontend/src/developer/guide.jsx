import { Link } from 'react-router-dom';
import { CodeBlock, CodeTabs, MethodBadge, VERIFY_SAMPLES, areaDesc, areaTitle, eventLabel, requestSamples } from './components';

/*
 * The guide part of the developer portal. Texts: locales/<lang>/devGuide.js
 * (one key per paragraph, grouped by section).
 */

export const GUIDE = ['intro', 'quickstart', 'auth', 'scopes', 'limits', 'errors', 'ratelimits', 'conventions', 'webhooks', 'signatures', 'tools'];

export function rich(text) {
  return String(text || '')
    .split(/(`[^`]+`)/g)
    .map((part, index) => (part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part));
}

function Steps({ items }) {
  return (
    <ol className="dv-steps">
      {items.map((item, index) => (
        <li key={index}>
          <span className="dv-steps__n">{index + 1}</span>
          <div>{item}</div>
        </li>
      ))}
    </ol>
  );
}

function Callout({ tone = 'info', children }) {
  return <div className={`dv-callout is-${tone}`}>{children}</div>;
}

export function Guide({ data, t, locale, viewer }) {
  const base = data.base;
  const areas = data.areas;
  const tokensLink = viewer?.signedIn ? (viewer.isAdmin ? '/admin/api?tab=tokens' : '/account/api') : '/login?next=/account/api';

  const sample = {
    id: '6b0f8a8e-5f3c-4c9e-9a51-2f8d0c7c1e11',
    type: 'task.completed',
    createdAt: '2026-10-11T09:31:00.000Z',
    data: {
      task: { id: 128, ref: 'WEB-12', title: 'Prepare the release notes', status: { name: 'Done', kind: 'done' }, assignee: { id: 7, name: 'Aida Bekova' }, url: `${data.origin}/app/tasks/WEB-12` },
      actor: { id: 7, name: 'Aida Bekova', username: 'aida' },
    },
  };

  return (
    <>
      <section id="intro" className="dv-article">
        <span className="dv-kicker">{t('dev.guide')}</span>
        <h1>
          {data.app?.name} API <span className="dv-version">v1</span>
        </h1>
        <p className="dv-lead">
          {t('devGuide.intro.t1')}
        </p>
        <div className="dv-base">
          <span>{t('api.baseUrl')}</span>
          <code>{base}</code>
        </div>
        <div className="dv-features">
          <div>
            <b>🔑 {t('devGuide.intro.t2')}</b>
            <span>{t('devGuide.intro.t3')}</span>
          </div>
          <div>
            <b>⚡ {t('devGuide.intro.t4')}</b>
            <span>{t('devGuide.intro.t5')}</span>
          </div>
          <div>
            <b>📜 {t('devGuide.intro.t6')}</b>
            <span>{t('devGuide.intro.t7')}</span>
          </div>
          <div>
            <b>🧩 OpenAPI 3.1</b>
            <span>{t('devGuide.intro.t8')}</span>
          </div>
        </div>
        {!data.config.enabled && <Callout tone="warn">{t('devGuide.intro.t9')}</Callout>}
      </section>

      <section id="quickstart" className="dv-article">
        <h2>{t('dev.sections.quickstart')}</h2>
        <Steps
          items={[
            <>
              <strong>{t('devGuide.quickstart.t1')}</strong>
              <p>
                {t('devGuide.quickstart.t2')}
                <Link to={tokensLink}>{t('devGuide.quickstart.t3')}</Link>
                {t('devGuide.quickstart.t4')}
              </p>
            </>,
            <>
              <strong>{t('devGuide.quickstart.t5')}</strong>
              <CodeTabs samples={requestSamples({ method: 'GET', url: `${base}/auth/me` })} />
            </>,
            <>
              <strong>{t('devGuide.quickstart.t6')}</strong>
              <CodeTabs samples={requestSamples({ method: 'POST', url: `${base}/app/tasks/tasks`, body: { title: t('devGuide.quickstart.t7'), dueAt: '2026-10-18T13:00:00Z', important: true } })} />
            </>,
          ]}
        />
      </section>

      <section id="auth" className="dv-article">
        <h2>{t('dev.sections.auth')}</h2>
        <p>
          {rich(
            t('devGuide.auth.t1')
          )}
        </p>
        <CodeBlock code={`GET /api/v1/auth/me HTTP/1.1\nHost: ${data.origin.replace(/^https?:\/\//, '')}\nAuthorization: Bearer pat_k3Jd9xQe_••••••••••••••••••••••••••••••••\nAccept: application/json`} lang="text" />
        <ul className="dv-list">
          <li>{t('devGuide.auth.t2')}</li>
          <li>{t('devGuide.auth.t3')}</li>
          <li>{rich(t('devGuide.auth.t4'))}</li>
          <li>{t('devGuide.auth.t5')}</li>
        </ul>
        <Callout tone="tip">{t('devGuide.auth.t6')}</Callout>
      </section>

      <section id="scopes" className="dv-article">
        <h2>{t('dev.sections.scopes')}</h2>
        <p>
          {t('devGuide.scopes.t1')}
        </p>
        <div className="dv-formula">
          <span>{t('devGuide.scopes.t2')}</span>
          <b>∩</b>
          <span>{t('devGuide.scopes.t3')}</span>
          <b>∩</b>
          <span>{t('devGuide.scopes.t4')}</span>
          <b>=</b>
          <strong>{t('devGuide.scopes.t5')}</strong>
        </div>
        <div className="dv-table">
          <div className="dv-table__head">
            <span>{t('devGuide.scopes.t6')}</span>
            <span>{t('devGuide.scopes.t7')}</span>
            <span>{t('devGuide.scopes.t8')}</span>
          </div>
          {areas.map((area) => (
            <div key={area.key} className="dv-table__row">
              <span>
                <b>{areaTitle(t, area.key)}</b> <code>{area.key}</code>
              </span>
              <span>{areaDesc(t, area.key)}</span>
              <code>{area.module ? `/app/${area.module}/**` : area.key === 'account' ? '/auth/me, /account/**' : area.key === 'notifications' ? '/notifications/**' : area.key === 'admin.users' ? '/admin/users|groups|roles/**' : area.key === 'admin.security' ? '/admin/security/**' : '/admin/**'}</code>
            </div>
          ))}
        </div>
      </section>

      <section id="limits" className="dv-article">
        <h2>{t('dev.sections.limits')}</h2>
        <h3>{t('devGuide.limits.t1')}</h3>
        <p>
          {t('devGuide.limits.t2')}
        </p>
        <h3>{t('devGuide.limits.t3')}</h3>
        <p>{rich(t('devGuide.limits.t4'))}</p>
        <div className="dv-rules">
          <div>
            <span className="dv-pill is-deny">deny</span> <MethodBadge method="DELETE" small /> <code>/app/**</code>
            <em>{t('devGuide.limits.t5')}</em>
          </div>
          <div>
            <span className="dv-pill is-allow">allow</span> <MethodBadge method="POST" small /> <code>/app/chat/rooms/*/messages</code>
            <em>{t('devGuide.limits.t6')}</em>
          </div>
          <div>
            <span className="dv-pill is-deny">deny</span> <code>/admin/users/*/avatar</code>
            <em>{t('devGuide.limits.t7')}</em>
          </div>
        </div>
        <h3>{t('devGuide.limits.t8')}</h3>
        <ol className="dv-flow">
          <li>{t('devGuide.limits.t9')}</li>
          <li>{t('devGuide.limits.t10')}</li>
          <li>{t('devGuide.limits.t11')}</li>
          <li>{t('devGuide.limits.t12')}</li>
          <li>{t('devGuide.limits.t13')}</li>
        </ol>
      </section>

      <section id="errors" className="dv-article">
        <h2>{t('dev.sections.errors')}</h2>
        <p>{rich(t('devGuide.errors.t1'))}</p>
        <CodeBlock code={JSON.stringify({ success: false, code: 'SCOPE_DENIED', error: 'The token lacks the calendar:write scope', scope: 'calendar:write' }, null, 2)} />
        <div className="dv-table is-errors">
          {data.errors.map((error) => (
            <div key={error.code} className="dv-table__row">
              <span className={`ax-status is-${String(error.status)[0]}xx`}>{error.status}</span>
              <code>{error.code}</code>
              <span>{rich(error.text[locale] || error.text.en)}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="ratelimits" className="dv-article">
        <h2>{t('dev.sections.ratelimits')}</h2>
        <p>
          {t('devGuide.ratelimits.t1', { limit: data.config.defaultRateLimit })}
        </p>
        <CodeBlock code={`X-RateLimit-Limit: ${data.config.defaultRateLimit}\nX-RateLimit-Remaining: 117\nX-RateLimit-Reset: 42\nX-Request-Id: 1ea52833-e6e3-462e-b40c-867f56bd45f8`} lang="text" />
        <p>{rich(t('devGuide.ratelimits.t2'))}</p>
      </section>

      <section id="conventions" className="dv-article">
        <h2>{t('dev.sections.conventions')}</h2>
        <ul className="dv-list">
          <li>{rich(t('devGuide.conventions.t1'))}</li>
          <li>{rich(t('devGuide.conventions.t2'))}</li>
          <li>{rich(t('devGuide.conventions.t3'))}</li>
          <li>{rich(t('devGuide.conventions.t4'))}</li>
          <li>{rich(t('devGuide.conventions.t5'))}</li>
          <li>{rich(t('devGuide.conventions.t6'))}</li>
          <li>{rich(t('devGuide.conventions.t7'))}</li>
        </ul>
      </section>

      <section id="webhooks" className="dv-article">
        <h2>{t('dev.sections.webhooks')}</h2>
        <p>
          {t('devGuide.webhooks.t1')}
        </p>
        <div className="dv-events">
          {data.events.map((event) => (
            <div key={event.type}>
              <code>{event.type}</code>
              <span>{eventLabel(t, event.type)}</span>
            </div>
          ))}
        </div>
        <h3>{t('devGuide.webhooks.t2')}</h3>
        <CodeBlock code={JSON.stringify(sample, null, 2)} />
        <h3>{t('devGuide.webhooks.t3')}</h3>
        <ul className="dv-list">
          <li>{t('devGuide.webhooks.t4')}</li>
          <li>{t('devGuide.webhooks.t5')}</li>
          <li>{t('devGuide.webhooks.t6')}</li>
          <li>{rich(t('devGuide.webhooks.t7'))}</li>
        </ul>
      </section>

      <section id="signatures" className="dv-article">
        <h2>{t('dev.sections.signatures')}</h2>
        <p>{rich(t('devGuide.signatures.t1'))}</p>
        <CodeBlock code={`POST /hooks/portal HTTP/1.1\nContent-Type: application/json\nUser-Agent: Portal-Webhooks/1.0\nX-Portal-Event: task.completed\nX-Portal-Delivery: 4182\nX-Portal-Signature: t=1760175060,v1=5f1c0e…`} lang="text" />
        <CodeTabs samples={VERIFY_SAMPLES()} />
      </section>

      <section id="tools" className="dv-article">
        <h2>{t('dev.sections.tools')}</h2>
        <p>{t('devGuide.tools.t1')}</p>
        <div className="dv-downloads">
          <a href={`/api/developer/openapi.json?lang=${locale}&download=1`} className="dv-download">
            <b>openapi.json</b>
            <span>{t('dev.openapiHint')}</span>
          </a>
          <a href={`/api/developer/openapi.json?lang=${locale}`} target="_blank" rel="noreferrer" className="dv-download is-ghost">
            <b>{t('devGuide.tools.t2')}</b>
            <span>/api/developer/openapi.json</span>
          </a>
        </div>
        <Steps
          items={[
            t('devGuide.tools.t3'),
            rich(t('devGuide.tools.t4')),
            t('devGuide.tools.t5'),
          ]}
        />
      </section>
    </>
  );
}
