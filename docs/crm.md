# CRM

Deals moving through pipeline stages, shown as a Kanban, a List, an Activities board and a Calendar over the same filter. A deal opens as a side panel: fields on the left, the timeline (activities, comments, history) on the right. Clients are the companies and people of the **Companies** module — CRM never keeps its own copy.

Module id `crm`, app `/app/crm`, API `/api/app/crm`, permissions `crm.admin` (settings, pipelines, every deal) and `crm.all` (sees and edits every deal).

## Data model (PostgreSQL)

| Table | Columns |
|-------|---------|
| `crm_pipelines` | `id, name, color, sort, is_default, archived_at, created_at, updated_at` |
| `crm_stages` | `id, pipeline_id → crm_pipelines CASCADE, name, color, sort, kind ('open'\|'won'\|'lost'), created_at` — every pipeline has exactly one `won` and one `lost` stage (last two) |
| `crm_deals` | `id, pipeline_id, stage_id, title, amount NUMERIC(18,2) default 0, currency CHAR(3), company_id → cmp_companies SET NULL, person_id → cmp_people SET NULL, owner_id → users SET NULL, source, comment, close_date DATE, lost_reason, custom JSONB default '{}', rank DOUBLE PRECISION, version INT default 1, stage_changed_at, closed_at, created_by, updated_by, created_at, updated_at, deleted_at` |
| `crm_deal_watchers` | `deal_id, user_id` (PK both) |
| `crm_activities` | `id, deal_id → crm_deals CASCADE, kind ('call'\|'meeting'\|'task'\|'email'\|'other'), title, note, due_at TIMESTAMPTZ, owner_id, remind_minutes INT NULL, reminded_at, done_at, done_by, created_by, created_at, updated_at` |
| `crm_events` | `id, deal_id CASCADE, kind, body, data JSONB, author_id, created_at` — kinds: `created, stage, field, owner, comment, activity_added, activity_done, activity_reopened, pipeline, won, lost, restored` |
| `crm_presets` | `id, user_id CASCADE, name, filter JSONB, sort, created_at` (personal saved filters) |

Indexes: deals `(pipeline_id, stage_id, rank) WHERE deleted_at IS NULL`, `(owner_id)`, `(company_id)`, `(person_id)`, `(close_date)`; activities `(deal_id) WHERE done_at IS NULL`, `(owner_id, due_at) WHERE done_at IS NULL`.

A default pipeline "Продажи" with stages Новая → Квалификация → Предложение → Переговоры → Успешно (won) → Провалена (lost) is created on first start.

## Module settings (`modules.crm.settings`, catalog.js)

```js
{
  currency: 'KGS',                 // default currency of new deals
  currencies: ['KGS','USD','EUR','RUB','KZT','CNY'],
  visibility: 'all' | 'own',       // 'own': people see deals they own, watch or created; crm.all / crm.admin see all
  sources: ['Сайт','Звонок','Рекомендация','WhatsApp','Instagram','Выставка','Другое'],
  lostReasons: ['Дорого','Выбрали конкурента','Нет бюджета','Не актуально','Не дозвонились'],
  sections: [{ key: 'about', title: 'О сделке' }, { key: 'extra', title: 'Дополнительно' }],
  fields: [ { key, label, type: 'text'|'textarea'|'number'|'money'|'date'|'select'|'multiselect'|'bool'|'url'|'user', options: [], section: 'about', listColumn: false, required: false } ],
  activityReminders: true,
}
```
Built-in fields (always present, section `about` unless moved): title, amount+currency, client (company/person), owner, source, close_date, comment, watchers. Custom field values live in `crm_deals.custom[key]`. Keys of custom fields are latin (`f_<base36>` when the label is not latin). At most 80 fields, 12 sections.

## Access

- View a deal: `crm.admin` / `crm.all` / settings.visibility `'all'`, otherwise owner, watcher or creator.
- Edit: anyone who can view. Delete (to trash) / restore: owner, creator, `crm.all`, `crm.admin`. Pipelines, stages, settings: `crm.admin`.
- Every list, board total, counter and export applies the same visibility (SQL condition built once: `visibleSql(ctx)`).

## API (`/api/app/crm`) — JSON, errors `{ success:false, code, error }`

Shapes:
```
Deal = { id, pipelineId, stageId, title, amount, currency, company: {id,name}|null, person: {id,name,phone,email}|null,
         owner: User|null, source, comment, closeDate, lostReason, custom: {}, watchers: [User], version,
         stageChangedAt, closedAt, createdAt, updatedAt, createdBy: User|null,
         activity: { next: { id, kind, title, dueAt, overdue }|null, open: n, overdue: n },  // counters for cards
         canEdit, canDelete }
User = { id, username, name, avatarUrl }
Stage = { id, pipelineId, name, color, sort, kind }
Pipeline = { id, name, color, sort, isDefault, stages: [Stage], counts?: { open: n } }
Activity = { id, dealId, kind, title, note, dueAt, owner: User, remindMinutes, doneAt, doneBy: User|null, createdAt, overdue }
Event = { id, kind, body, data, author: User|null, createdAt }
```

Filter (query string on list/board/export/calendar/activity-board, JSON in presets):
`q` (title, client name, comment), `pipeline` (id, required on board), `stages` (comma ids), `group` (`open`|`won`|`lost`|`all`, default `open`), `owners` (comma ids or `me`), `client` (`c:<id>` / `p:<id>`), `amountMin`, `amountMax`, `createdFrom`, `createdTo`, `closeFrom`, `closeTo`, `createdBy` (ids/`me`), `activity` (`overdue`|`today`|`planned`|`none`), `source`, `cf_<key>` (custom field equals / contains for multiselect).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/meta` | `{ settings (sections, fields, currencies, sources, lostReasons, visibility, currency), pipelines: [Pipeline], me: { canAdmin, canAll }, companiesEnabled, chatEnabled }` |
| GET | `/users` | staff for pickers `{ users: [User] }` |
| GET | `/clients?q=` | `{ companies: [{id,name,inn?}], people: [{id,name,company?}] }` (from Companies tables, max 10 each; empty while the Companies module is off or for an API token without the `companies` scope) |
| POST | `/clients` | quick create `{ type:'company'|'person', name, phone?, email? }` → client (uses Companies service) |
| GET | `/counters?pipeline=&…filter` | `{ overdue, today, planned, none, incoming }` — deals by activity state (incoming = assigned to me and not opened yet: owner_id=me AND created_by≠me AND no events by me) |
| GET | `/board?…filter&limit=30` | `{ pipeline, stages: [{ ...Stage, count, sum: {CUR: amount}, deals: [Deal], hasMore }] }` — won/lost stages included with counts but deals only when `group` asks for them |
| GET | `/board/stage/:stageId?offset=&limit=30&…filter` | `{ deals, hasMore }` (lazy column paging) |
| GET | `/deals?…filter&sort=updated|created|amount|title|close|stage&order=asc|desc&page=1&pageSize=20&count=1` | `{ items: [Deal], page, pageSize, total? }` (total only when `count=1`) |
| GET | `/deals/:id` | `{ deal: Deal, pipeline: Pipeline, activities: [Activity open first], events: [Event] (latest 50) }` |
| POST | `/deals` | create `{ pipelineId, stageId?, title, amount, currency, companyId, personId, ownerId, source, comment, closeDate, custom, watcherIds }` → `{ deal }` |
| PUT | `/deals/:id` | patch any field + `version` (optional; 409 `VERSION_CONFLICT` with `{ deal }` when stale) → `{ deal }` |
| POST | `/deals/:id/move` | `{ stageId, beforeId?, afterId?, lostReason? }` → `{ deal }` (kanban drag; lost stage requires lostReason when settings.lostReasons non-empty → 400 `LOST_REASON_REQUIRED`) |
| POST | `/deals/:id/pipeline` | `{ pipelineId, stageId }` → move to another pipeline |
| DELETE | `/deals/:id` | to trash; `POST /deals/:id/restore`; `GET /trash` |
| POST | `/deals/:id/copy` | → `{ deal }` |
| POST | `/deals/bulk` | `{ ids: [] | all: true + filter, action: 'stage'|'owner'|'pipeline'|'watchers'|'delete', value }` → `{ affected }` (max 1000) |
| GET | `/deals/:id/events?before=` | `{ events, hasMore }` |
| POST | `/deals/:id/comments` | `{ body }` → `{ event }` |
| GET | `/deals/:id/activities` | `{ activities }` |
| POST | `/deals/:id/activities` | `{ kind, title, note, dueAt, ownerId, remindMinutes }` → `{ activity }` |
| PUT | `/activities/:id` | patch (incl. `dueAt` for drag in the Activities board) / `{ done: true|false }` |
| DELETE | `/activities/:id` | |
| GET | `/activity-board?…filter` | `{ columns: [{ key: 'overdue'|'today'|'week'|'nextWeek'|'later'|'none', deals: [Deal], count }] }` (by the deal's nearest open activity) |
| GET | `/calendar?from=&to=&field=closeDate|cf_<key>&…filter` | `{ items: [{ dealId, title, date, amount, currency, stage: {name,color} }] }` |
| GET | `/export.csv?…filter&columns=` | CSV (UTF-8 BOM, `;` separator) |
| GET/POST/PUT/DELETE | `/presets[/:id]` | personal saved filters `{ name, filter }` |
| GET | `/pipelines` | `{ pipelines: [Pipeline] }` (`?archived=1` includes archived ones) |
| POST/PUT/DELETE | `/pipelines[/:id]` | `crm.admin`; POST/PUT → `{ pipeline }`; PUT accepts `{ name, color, archived, isDefault, stages: [{ id?, name, color, kind }] }` in order (open stages first, then won, lost); removing a stage with deals needs `moveTo` stageId (or a map `{ removedId: keptId }`), else 409 `STAGE_HAS_DEALS`; DELETE with deals needs `?moveTo=<pipelineId>`, else 409 `PIPELINE_HAS_DEALS` |
| PUT | `/pipelines/order` | `{ ids }` → `{ pipelines }` |

Everything that changes a deal writes a `crm_events` row (stage changes with from/to names, owner changes, field changes with label/old/new), bumps `version`, sets `updated_by/at`; stage moves set `stage_changed_at`, won/lost set `closed_at` (cleared when moved back to open).

## Backend implementation notes

The backend lives in `src/backend/modules/crm` (`schema.js`, `access.js`, `filters.js`, `deals.js`, `activities.js`, `pipelines.js`, `views.js` — calendar, export, presets —, `clients.js`, `integrations.js`, `chat.js`, `reminders.js`, `messages.js`, `util.js`, `routes.js`). Everything above holds; these are additions and precisions (all backward compatible):

**Shapes**
- `Deal` also has `rank` (kanban order), `deletedAt` (set for deals in the trash); `/trash` items also have `deletedBy: User`. `Pipeline` also has `archived`.
- `GET /board` stage entries also have `loaded` (false for stages whose deals were not asked for by `group`; their `deals` is `[]`, `count`/`sum` are still there). Without `pipeline` the default pipeline is used.
- `GET /deals/:id` also returns `eventsHasMore`. A deal in the trash can be read (panel shows it with `deletedAt`), but every change answers 404 until it is restored.
- `GET /trash` takes the filter and `page/pageSize`, returns `{ items, page, pageSize, total }`.
- `GET /activity-board` columns also have `hasMore`; `?column=<key>&offset=&limit=` (default 30, max 100) pages one column.
- `GET /calendar`: `from` and `to` are required (≤ 400 days, up to 3000 items); items also have `stage.id`, `stage.kind`, `pipelineId`, `ownerId`.
- `POST /deals/bulk` → `{ affected, skipped?: [{ id, code }] }`; deals the person cannot see or change are skipped. The value is checked once up front (`LOST_REASON_REQUIRED`, unknown owner / stage / pipeline → 400). More than 1000 ids, or more than 1000 deals matching `all: true` → 400 `BULK_LIMIT`. `value` per action: `stage` — `stageId | { stageId, lostReason }`; `owner` — userId; `pipeline` — `pipelineId | { pipelineId, stageId }`; `watchers` — `[ids]` (added) or `{ add, remove }`.
- `POST /clients` → `{ client: { type, id, name, phone?, email?, company? } }`; a person may get `companyId` (current job); 400 `COMPANIES_DISABLED` when the Companies module is off. A person's name "Иванов Иван" is stored as last + first name.
- `POST /deals/:id/comments` → `{ event }` (Event shape, kind `comment`).
- `GET /export.csv`: `columns` = comma-separated keys `id, title, pipeline, stage, amount, currency, company, person, phone, email, owner, source, closeDate, createdAt, updatedAt, closedAt, createdBy, comment, lostReason, watchers, nextActivity, cf_<key>` (default: a sensible subset); also takes `sort`/`order`; written in batches of 500, max 20 000 rows; amounts and numeric custom fields with a decimal comma and kept numeric (a negative number is not treated as a formula), times in UTC (`YYYY-MM-DD HH:MM`).
- `POST /deals/:id/copy`: title + " (копия)", same pipeline; a closed deal's copy starts in the first open stage; watchers and custom values are copied.

**Filter precisions**
- `owners` also accepts `none` (no owner); `source` takes several values separated by `|`; `pipeline=all` means every pipeline.
- `cf_<key>` by type: `select` — equals (several with `|`); `multiselect` — contains; `text`/`textarea`/`url` — contains (case-insensitive); `number`/`money` — equals; `bool` — `1`/`0`; `user` — id or `me`; `date` — a day or a range `2026-10-01..2026-10-31` (either end may be empty). Unknown keys are ignored.
- `tz` (IANA zone, e.g. `Asia/Bishkek`) sets "today" and the weeks (Monday first) for `activity`, `/counters` and `/activity-board`; default: the server's zone (`CRM_TZ` env overrides).
- `activity` / counters by the deal's open activities: `overdue` — one is past due; `today` — none overdue and the nearest is due today; `planned` — open activities, the nearest after today or without a date; `none` — no open activities. Activity-board columns split `planned` into `week` (rest of this week), `nextWeek`, `later` (incl. no date).
- `/counters` ignores the `activity` key of the filter. `group` defaults to `open` everywhere except the board (which shows all stages) and the trash.

**Moves and history**
- `POST /deals/:id/move`: `beforeId` is the card that ends up directly **above** the moved one, `afterId` the one directly **below** (either is enough); neither → top of the column. New deals go to the top of their stage. Ranks are midpoints; a column whose gaps run out is re-spread.
- A move into the won / lost stage writes one event of kind `won` / `lost` (instead of `stage`) with `data: { from, to, lostReason? }` (`from`/`to` = `{ id, name, color, kind }`). Moving back to an open stage clears `closedAt` and `lostReason`.
- `PUT /deals/:id` may carry `stageId` (+ `lostReason`) too; `custom` is merged key by key (`null` / `''` removes a key); `watcherIds` replaces the watchers.
- Event kinds also: `deleted`, `activity_updated` (`data.changes`), `activity_deleted`. Field events: `data: { field, label, from, to }` — `field` is `title`, `amount` (`from`/`to` = `{ amount, currency }`), `company`, `person` (`{ id, name }`), `source`, `comment`, `closeDate`, `lostReason`, `cf_<key>` (+ `type`), `watchers` (`{ added: [User], removed: [User] }`); owner changes are kind `owner` with users in `from`/`to`. `pipeline` events: `{ from: { id, name, stage }, to: { id, name, stage } }`.
- Activities and comments write events and touch `updated_at` but do not bump `version` (they never conflict with an open deal panel).
- Custom fields marked `required` are a UI rule; the API does not refuse a deal without them. Values are validated by type (unknown select options, bad dates, non-users → 400 `INVALID_FIELD` with `info.field`).

**Access and integrations**
- Under visibility `own`, the responsible person of an activity becomes a watcher of the deal (otherwise they could not open it).
- `GET/PUT /settings` (extra): `crm.admin` reads / changes the module settings without the console's `settings.modules` permission (same sanitizer as `/admin/settings`). Settings also have `builtinSections: { source: 'extra', … }` — where a built-in field is shown when moved out of `about`.
- `GET /activities?to=&limit=` (extra): my open activities across deals ("Мои дела"), each with `deal: { id, title, stage }`.
- `crm.stage` goes to the deal's watchers; `crm.activity_due` is `urgent` (like `tasks.reminder`); reminder times are shown in the recipient's zone (`notify_prefs.tz`).
- The deal chat gets a system line (`data.event = 'deal.stage'`, `from`, `to`, `lostReason?`) on stage changes only when the conversation exists already (rooms are not created for every move).
- Webhook payloads: `{ deal: Deal + url, actor, … }`; `deal.stage_changed` adds `from`/`to`, `deal.updated` adds `changes`, `deal.lost` adds `lostReason`. Companies timeline rows: `cmp_events` kind `deal`, `body` = title, `data: { dealId, action: created|won|lost, title, amount, currency, stage, link }`.
- API tokens: `RESOURCE_KINDS` has `{ key: 'crm.pipelines', module: 'crm', table: 'crm_pipelines', acl: false }` — CRM has no access-list table, so the limit is checked by the module itself (pipelines outside it are 404 / invisible, and the token never gets the admin bypass).
- Extra column `crm_deals.deleted_by`.

## Integrations

- **Notifications** (`notificationCatalog.js` group `crm`): `crm.assigned` (you became the owner), `crm.activity` (an activity was assigned to you), `crm.activity_due` (reminder `remind_minutes` before `due_at`, scheduler job `crm:reminders` every minute, one-shot `reminded_at`), `crm.stage` (a deal you watch changed stage; push only by default).
- **Chat**: entity `deal` (`registerChatEntity('deal', adapter)`) — "Обсудить с коллегами" in the deal panel; participants = owner + watchers + creator. Closed while the CRM is off and to API tokens without the `crm` scope (writing needs `crm:write`).
- **Companies timeline**: creating, winning and losing a deal logs a `cmp_events` row (kind `deal`) on its company/person.
- **Webhooks** (`api/events.js`): `deal.created`, `deal.updated`, `deal.stage_changed`, `deal.won`, `deal.lost`, `deal.deleted` (area `crm`, visible only to those who can view the deal).
- **API tokens**: area `crm` comes from the catalog automatically; resource kind `crm.pipelines` (limits by pipeline).

## Frontend (`frontend/src/modules/crm`)

Shell like other modules (`mod-shell`, sidebar, `mod-hero`, `mod-toolbar`); routes:
`/app/crm` → redirect to the last view; `/app/crm/deals/kanban|list|activities|calendar` (+ `?pipeline=`), `/app/crm/deals/:id` (panel over the last view), `/app/crm/trash`, `/app/crm/pipelines` (admin editor). Sidebar: Сделки (with counters), Мои дела, Клиенты → Companies (/app/companies, /app/companies/people), Воронки (admin), Корзина, Настройки (admin).

- **Toolbar**: pipeline switcher (Select with counts + "Настроить воронки"), filter bar (preset chip + search; click opens a popover: presets left — В работе (default), Мои сделки, Закрытые, saved ones, «+ Сохранить фильтр»; fields right — Ответственный, Сумма от/до, Стадии, Группа стадий, Дата закрытия, Создана, Источник, Клиент, custom select fields; Найти / Сбросить), view switcher (Канбан · Список · Дела · Календарь), counters chips (Просрочены N red, На сегодня N, Запланированы N, Без дел N), «Создать» (deal / quick).
- **Kanban**: @dnd-kit like the tasks board; stage header = coloured arrow plate with name + count, sum below; first column «+ Быстрая сделка» inline (title, amount, client); cards: title, amount, client, owner avatar, next activity (red when overdue), activity counter badge, «+ Дело»; while dragging, Won / Lost drop zones appear at the bottom (Lost asks for a reason); columns page lazily (`/board/stage/:id`).
- **List**: antd Table; column chooser (incl. custom fields), sort by header, segmented stage progress bar (click a segment = move), next activity, row selection + bottom bulk bar (Изменить стадию, Ответственного, Перенести в воронку, Наблюдатели, Удалить; «Для всех по фильтру»), pagination 10/20/50/100, «Показать количество».
- **Activities**: columns Просрочены · На сегодня · На этой неделе · На следующей неделе · Позже · Без дел; drag moves the nearest activity's due date (to «Без дел» not allowed).
- **Calendar**: FullCalendar month/week; date field selector (close date or a custom date field); drag changes that field.
- **Deal panel** (overlay like the task panel): header — inline title, pipeline name + switch, owner, amount; stage arrow bar (click = move; «Завершить» → Успешно / Провалена + reason); left: sections as cards with inline-editable fields (empty = «не заполнено»); right: timeline — composer tabs (Дело · Комментарий), pinned «Что нужно сделать» (open activities with checkbox, due date, edit, delete), history grouped by day; «Обсудить с коллегами» opens the deal chat (`Conversation entity={{type:'deal', id}}`).
- **Settings** (`/admin/settings/crm`): module on/off, default currency and currencies, visibility, sources, lost reasons, reminders, sections & custom fields editor; pipelines editor (also at `/app/crm/pipelines` for crm.admin).

## Demo data and tour

- `modules/crm/demo.js` (after Counterparties and Employees when they are seeded): two pipelines — «Демо: продажи недвижимости» (lead → viewing → booking → deposit and contract → won / lost) and «Демо: оптовые поставки» — with 20 deals in every stage, owned by demo sales people (the same demo colleagues as in Employees) and the administrator, linked to the Counterparties demo companies and contacts; 19 calls, meetings, tasks and e-mails, some overdue, some due today, some done; comments and stage history. Rows are written directly (no webhooks or notifications). The administrator watches the property deals. Purge deletes the deals (activities, events, watchers cascade), their chats and notifications, then the stages and pipelines. The Masterplan demo links its units to the property deals.
- Tour `crm` (`modules/crm/tour.js`, texts `tour.crm.*` in `locales/<lang>/tour.js`): pipelines, the board, a deal card, the overdue / today counters, search and filters, views, «Мои дела». Anchors: `crm.pipelines`, `crm.board`, `crm.card`, `crm.counters`, `crm.filters`, `crm.views`, `crm.activities`. Registered in `modules/crm/register.js`; auto-starts on the first visit to `/app/crm`.
