import { Link } from 'react-router-dom';
import { CodeBlock, CodeTabs, MethodBadge, VERIFY_SAMPLES, areaDesc, areaTitle, eventLabel, requestSamples } from './components';

/*
 * The guide part of the developer portal. Texts are written per language
 * right here (L(ru, en)) because they are long and full of markup.
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
  const L = (ru, en) => (locale === 'ru' ? ru : en);
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
          {L(
            'REST API портала: всё, что доступно в интерфейсе, доступно и программно — задачи, чаты, календарь, контрагенты, файлы, пользователи. Каждый вызов выполняется от имени человека и никогда не выходит за пределы его прав.',
            'The REST API of the portal: what you can do in the interface, you can do in code — tasks, chats, calendar, counterparties, files, users. Every call runs on behalf of a person and never goes beyond their rights.'
          )}
        </p>
        <div className="dv-base">
          <span>{t('api.baseUrl')}</span>
          <code>{base}</code>
        </div>
        <div className="dv-features">
          <div>
            <b>🔑 {L('Токены с точным доступом', 'Tokens with precise access')}</b>
            <span>{L('Шаблоны, области, ресурсы, правила, IP, срок, лимит.', 'Templates, areas, resources, rules, IP, expiry, rate limit.')}</span>
          </div>
          <div>
            <b>⚡ {L('Вебхуки', 'Webhooks')}</b>
            <span>{L('События в реальном времени с подписью и повторами.', 'Real-time events, signed and retried.')}</span>
          </div>
          <div>
            <b>📜 {L('Полный журнал', 'Full audit log')}</b>
            <span>{L('Каждый запрос токена записывается.', 'Every token request is recorded.')}</span>
          </div>
          <div>
            <b>🧩 OpenAPI 3.1</b>
            <span>{L('Импорт в Postman, Insomnia, генераторы кода.', 'Import into Postman, Insomnia, code generators.')}</span>
          </div>
        </div>
        {!data.config.enabled && <Callout tone="warn">{L('API сейчас выключен администратором: запросы с токенами получают 503.', 'The API is currently turned off by the administrator: token requests get 503.')}</Callout>}
      </section>

      <section id="quickstart" className="dv-article">
        <h2>{t('dev.sections.quickstart')}</h2>
        <Steps
          items={[
            <>
              <strong>{L('Создайте токен', 'Create a token')}</strong>
              <p>
                {L('В кабинете: ', 'In your account: ')}
                <Link to={tokensLink}>{L('Профиль → API-токены', 'Account → API tokens')}</Link>
                {L('. Выберите шаблон доступа, например «Интеграция с задачами», и скопируйте токен — он показывается один раз.', '. Pick an access template, e.g. “Task integration”, and copy the token — it is shown once.')}
              </p>
            </>,
            <>
              <strong>{L('Проверьте его', 'Check it')}</strong>
              <CodeTabs samples={requestSamples({ method: 'GET', url: `${base}/auth/me` })} />
            </>,
            <>
              <strong>{L('Создайте первую задачу', 'Create your first task')}</strong>
              <CodeTabs samples={requestSamples({ method: 'POST', url: `${base}/app/tasks/tasks`, body: { title: L('Подготовить отчёт', 'Prepare the report'), dueAt: '2026-10-18T13:00:00Z', important: true } })} />
            </>,
          ]}
        />
      </section>

      <section id="auth" className="dv-article">
        <h2>{t('dev.sections.auth')}</h2>
        <p>
          {rich(
            L(
              'Передавайте токен в заголовке `Authorization: Bearer <токен>` (или `X-API-Key: <токен>`). Токен выглядит как `pat_k3Jd9xQe_…` — первые 12 символов (префикс) видны в консоли и журнале, остальное знает только владелец.',
              'Send the token in `Authorization: Bearer <token>` (or `X-API-Key: <token>`). A token looks like `pat_k3Jd9xQe_…` — the first 12 characters (the prefix) appear in the console and the log, the rest is known only to its owner.'
            )
          )}
        </p>
        <CodeBlock code={`GET /api/v1/auth/me HTTP/1.1\nHost: ${data.origin.replace(/^https?:\/\//, '')}\nAuthorization: Bearer pat_k3Jd9xQe_••••••••••••••••••••••••••••••••\nAccept: application/json`} lang="text" />
        <ul className="dv-list">
          <li>{L('Запрос выполняется от имени владельца токена — так, будто он сам нажал кнопку. Уведомления, история и права те же.', 'The request runs as the token owner — as if they pressed the button. Notifications, history and rights are the same.')}</li>
          <li>{L('Портал хранит только отпечаток (SHA-256) токена. Потерянный токен нельзя показать — только выпустить новый секрет.', 'The portal keeps only a fingerprint (SHA-256). A lost token cannot be shown — only a new secret issued.')}</li>
          <li>{rich(L('Вход, пароли, сессии, push-подписки и управление токенами недоступны токенам никогда (`403 ROUTE_NOT_AVAILABLE`).', 'Sign-in, passwords, sessions, push subscriptions and token management are never available to tokens (`403 ROUTE_NOT_AVAILABLE`).'))}</li>
          <li>{L('Cookie сессии на запросах с токеном игнорируются.', 'Session cookies are ignored on token requests.')}</li>
        </ul>
        <Callout tone="tip">{L('Для интеграций заведите отдельную техническую учётную запись (например, «1С-интеграция») и выпустите токен от её имени — так права интеграции не зависят от сотрудника.', 'For integrations, create a dedicated technical account (e.g. “1C integration”) and issue the token on its behalf — then the integration does not depend on an employee.')}</Callout>
      </section>

      <section id="scopes" className="dv-article">
        <h2>{t('dev.sections.scopes')}</h2>
        <p>
          {L(
            'Портал разделён на области. Для каждой токен получает уровень: «Нет доступа», «Чтение» (GET) или «Чтение и запись» (все методы). Шаблон доступа — готовый набор уровней; токен берёт шаблон и может точечно его изменить.',
            'The portal is split into areas. For each, a token gets a level: “No access”, “Read” (GET) or “Read & write” (every method). An access template is a ready set of levels; a token starts from a template and can change it point by point.'
          )}
        </p>
        <div className="dv-formula">
          <span>{L('Права владельца', 'Owner rights')}</span>
          <b>∩</b>
          <span>{L('Области токена', 'Token areas')}</span>
          <b>∩</b>
          <span>{L('Ресурсы и правила', 'Resources & rules')}</span>
          <b>=</b>
          <strong>{L('Что может токен', 'What the token can do')}</strong>
        </div>
        <div className="dv-table">
          <div className="dv-table__head">
            <span>{L('Область', 'Area')}</span>
            <span>{L('Что входит', 'What it covers')}</span>
            <span>{L('Пути', 'Paths')}</span>
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
        <h3>{L('Только выбранные ресурсы', 'Only selected resources')}</h3>
        <p>
          {L(
            'Токен можно сузить до отдельных проектов задач, календарей или пространств файлов. Ограничение учитывается всеми эндпоинтами модуля: списки, поиск, карточки, создание — токен просто не видит остального.',
            'A token can be narrowed to some task projects, calendars or file spaces. Every endpoint of the module honours it: lists, search, cards, creation — the token simply does not see the rest.'
          )}
        </p>
        <h3>{L('Точечные правила', 'Precise rules')}</h3>
        <p>{rich(L('Правило — это действие (разрешить/запретить), методы и путь от `/api/v1`. `*` — один сегмент пути, `**` — остаток пути.', 'A rule is an effect (allow/deny), methods and a path from `/api/v1`. `*` matches one path segment, `**` the rest of the path.'))}</p>
        <div className="dv-rules">
          <div>
            <span className="dv-pill is-deny">deny</span> <MethodBadge method="DELETE" small /> <code>/app/**</code>
            <em>{L('ничего не удалять', 'never delete anything')}</em>
          </div>
          <div>
            <span className="dv-pill is-allow">allow</span> <MethodBadge method="POST" small /> <code>/app/chat/rooms/*/messages</code>
            <em>{L('писать в чаты при доступе «только чтение»', 'post messages with read-only chat access')}</em>
          </div>
          <div>
            <span className="dv-pill is-deny">deny</span> <code>/admin/users/*/avatar</code>
            <em>{L('любой метод', 'any method')}</em>
          </div>
        </div>
        <h3>{L('Порядок проверки', 'Order of evaluation')}</h3>
        <ol className="dv-flow">
          <li>{L('Путь недоступен токенам вообще? → 403 ROUTE_NOT_AVAILABLE', 'Path never available to tokens? → 403 ROUTE_NOT_AVAILABLE')}</li>
          <li>{L('Совпало правило «запретить»? → 403 SCOPE_DENIED', 'A deny rule matches? → 403 SCOPE_DENIED')}</li>
          <li>{L('Совпало правило «разрешить»? → пропустить', 'An allow rule matches? → pass')}</li>
          <li>{L('Уровень области достаточен? → пропустить, иначе 403 SCOPE_DENIED', 'Area level sufficient? → pass, else 403 SCOPE_DENIED')}</li>
          <li>{L('Дальше — обычные права владельца и ограничения ресурсов.', 'Then the owner’s own rights and resource limits apply.')}</li>
        </ol>
      </section>

      <section id="errors" className="dv-article">
        <h2>{t('dev.sections.errors')}</h2>
        <p>{rich(L('Ошибки приходят с HTTP-статусом и машинным кодом `code`:', 'Errors come with an HTTP status and a machine `code`:'))}</p>
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
          {L(
            `У каждого токена свой лимит запросов в минуту (по умолчанию ${data.config.defaultRateLimit}). Текущее состояние — в заголовках каждого ответа:`,
            `Each token has its own per-minute limit (${data.config.defaultRateLimit} by default). Every response carries the current state:`
          )}
        </p>
        <CodeBlock code={`X-RateLimit-Limit: ${data.config.defaultRateLimit}\nX-RateLimit-Remaining: 117\nX-RateLimit-Reset: 42\nX-Request-Id: 1ea52833-e6e3-462e-b40c-867f56bd45f8`} lang="text" />
        <p>{rich(L('При превышении — `429 RATE_LIMITED` с заголовком `Retry-After` (секунды). Повторите позже, лучше с экспоненциальной задержкой.', 'Over the limit you get `429 RATE_LIMITED` with `Retry-After` (seconds). Retry later, ideally with exponential backoff.'))}</p>
      </section>

      <section id="conventions" className="dv-article">
        <h2>{t('dev.sections.conventions')}</h2>
        <ul className="dv-list">
          <li>{rich(L('`/api/v1` — стабильный адрес для интеграций. Тело запросов и ответов — JSON (UTF-8).', '`/api/v1` is the stable address for integrations. Request and response bodies are JSON (UTF-8).'))}</li>
          <li>{rich(L('Успешный ответ содержит `"success": true` и данные; ошибка — `"success": false`, `code`, `error`.', 'A success has `"success": true` and data; an error has `"success": false`, `code`, `error`.'))}</li>
          <li>{rich(L('Даты — ISO 8601 в UTC: `2026-10-18T13:00:00Z`. Только дата — `2026-10-18`.', 'Dates are ISO 8601 in UTC: `2026-10-18T13:00:00Z`. Date only: `2026-10-18`.'))}</li>
          <li>{rich(L('Страницы: ленты используют `before` (id последней записи) и `limit`; каталоги — `limit` и `offset`.', 'Paging: feeds use `before` (the last id) and `limit`; catalogues use `limit` and `offset`.'))}</li>
          <li>{rich(L('Файлы загружаются как `multipart/form-data` в поле `files`.', 'Files are uploaded as `multipart/form-data` in the `files` field.'))}</li>
          <li>{rich(L('`X-Request-Id` в ответе — укажите его, обращаясь к администратору: по нему запрос находится в журнале.', 'Quote `X-Request-Id` from the response when contacting an administrator: it finds the request in the log.'))}</li>
          <li>{rich(L('Изменение (`PUT`) частичное: передайте только поля, которые меняются.', 'Updates (`PUT`) are partial: send only the fields that change.'))}</li>
        </ul>
      </section>

      <section id="webhooks" className="dv-article">
        <h2>{t('dev.sections.webhooks')}</h2>
        <p>
          {L(
            'Вебхуки настраивает администратор в консоли API. Портал отправляет POST с JSON на ваш адрес сразу после события. Вебхук «видит как» выбранный человек: события приходят только о том, что ему доступно.',
            'Webhooks are set up by an administrator in the API console. The portal POSTs JSON to your URL right after the event. A webhook “sees as” a chosen person: events arrive only about what they can access.'
          )}
        </p>
        <div className="dv-events">
          {data.events.map((event) => (
            <div key={event.type}>
              <code>{event.type}</code>
              <span>{eventLabel(t, event.type)}</span>
            </div>
          ))}
        </div>
        <h3>{L('Тело запроса', 'Payload')}</h3>
        <CodeBlock code={JSON.stringify(sample, null, 2)} />
        <h3>{L('Доставка', 'Delivery')}</h3>
        <ul className="dv-list">
          <li>{L('Успех — любой ответ 2xx в течение 10 секунд.', 'Success is any 2xx answer within 10 seconds.')}</li>
          <li>{L('Повторы: через 1 мин, 5 мин, 30 мин, 2 ч и 6 ч. Затем доставка помечается как неудачная.', 'Retries after 1 min, 5 min, 30 min, 2 h and 6 h. Then the delivery is marked failed.')}</li>
          <li>{L('После 20 неудачных доставок подряд вебхук отключается — администратор увидит это в консоли.', 'After 20 failed deliveries in a row the webhook is switched off — administrators see it in the console.')}</li>
          <li>{rich(L('Одно событие может прийти дважды (повтор после таймаута). Используйте `id` события, чтобы не обработать его повторно.', 'An event may arrive twice (a retry after a timeout). Use the event `id` to process it once.'))}</li>
        </ul>
      </section>

      <section id="signatures" className="dv-article">
        <h2>{t('dev.sections.signatures')}</h2>
        <p>{rich(L('Каждый вызов подписан: `X-Portal-Signature: t=<unix-время>,v1=<hex>`, где `v1 = HMAC-SHA256(секрет, "<t>.<тело>")`. Проверяйте подпись по сырому телу запроса и отклоняйте старые (более 5 минут) запросы.', 'Every call is signed: `X-Portal-Signature: t=<unix time>,v1=<hex>`, where `v1 = HMAC-SHA256(secret, "<t>.<body>")`. Verify against the raw body and reject requests older than 5 minutes.'))}</p>
        <CodeBlock code={`POST /hooks/portal HTTP/1.1\nContent-Type: application/json\nUser-Agent: Portal-Webhooks/1.0\nX-Portal-Event: task.completed\nX-Portal-Delivery: 4182\nX-Portal-Signature: t=1760175060,v1=5f1c0e…`} lang="text" />
        <CodeTabs samples={VERIFY_SAMPLES()} />
      </section>

      <section id="tools" className="dv-article">
        <h2>{t('dev.sections.tools')}</h2>
        <p>{L('Описание API в формате OpenAPI 3.1 собирается автоматически из самого портала и всегда актуально.', 'The OpenAPI 3.1 description is built from the portal itself and is always current.')}</p>
        <div className="dv-downloads">
          <a href={`/api/developer/openapi.json?lang=${locale}&download=1`} className="dv-download">
            <b>openapi.json</b>
            <span>{t('dev.openapiHint')}</span>
          </a>
          <a href={`/api/developer/openapi.json?lang=${locale}`} target="_blank" rel="noreferrer" className="dv-download is-ghost">
            <b>{L('Открыть в браузере', 'Open in the browser')}</b>
            <span>/api/developer/openapi.json</span>
          </a>
        </div>
        <Steps
          items={[
            L('Postman: Import → File → openapi.json. Коллекция создаётся по разделам.', 'Postman: Import → File → openapi.json. A collection is created by section.'),
            rich(L('В коллекции: Authorization → Bearer Token → `{{token}}`, переменная `baseUrl` уже указывает на портал.', 'In the collection: Authorization → Bearer Token → `{{token}}`; the `baseUrl` variable already points to the portal.')),
            L('Для генерации клиента: openapi-generator, orval, openapi-typescript — используйте тот же файл.', 'To generate a client: openapi-generator, orval, openapi-typescript — use the same file.'),
          ]}
        />
      </section>
    </>
  );
}
