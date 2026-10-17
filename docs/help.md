# In-app help

Every page explains itself on three levels, from a glance to the full story:

| Level | Where | What |
|-------|-------|------|
| **Field hint** | ⓘ next to a field or block title | One or two sentences on hover or tap, and *More →* to the right topic |
| **Quick guide** | *?* in the header, *?* in module sidebars, or the **?** key on any page | A side panel: what the module is for, key capabilities, tips and the topics as an accordion. The page stays where it is |
| **Help center** | `/help`, `/help/<module>#<topic>` | Full guides with steps, examples, notes, Q&A and all field hints; search across every guide |

The help is written for end users (mostly in Russian; English mirrors it), loaded on demand and adds nothing to the first page load.

## Content

One file per module in `src/frontend/src/help/content/<lang>/<id>.js`, following [`help/SCHEMA.md`](../src/frontend/src/help/SCHEMA.md):

- `title`, `tagline`, `summary` — what the module is for;
- `highlights` — the short version (4–6 capabilities);
- `tips` — one-line practical tips;
- `sections` — the full guide: `body`, optional `steps`, `example` (a concrete case), `note`;
- `faq` — real questions;
- `fields` — hints used by `<Hint id="<module>.<key>" />`, each pointing to a section via `more`;
- `related` — other guides.

Each language is its own file with plain strings (English is the reference; `ky`, `tr`, `zh` files start empty and fall back to English part by part — see [i18n.md](i18n.md#help-articles-and-admin-docs)). Texts use a small, safe Markdown subset (`**bold**`, `` `code` ``, lists, `[label](/internal/path)`); no HTML is rendered.

The table of contents order is `HELP_ORDER` in `help/registry.jsx`; `helpForPath()` maps a page to its guide (`/app/<id>` → `<id>`, `/admin/api` → `api`, `/admin/*` → `admin`, `/account/notifications` → `notifications`, …).

## Components

```jsx
import { Hint, HintLabel, HelpButton } from '../../help/Hint';

<HintLabel id="tasks.resultRequired">{t('tasks.v2.results.require')}</HintLabel>  // label + ⓘ
<Hint id="calendar.taskScope" />                                                 // ⓘ alone
<Hint title="…" text="…" />                                                      // inline text
<HelpButton id="calendar" section="tasks" />                                     // round “?”
```

`useHelp().openHelp(id, section)` opens the quick guide from code.

## Guides

| id | Module |
|----|--------|
| `start` | Getting started: sign-in, header, apps, search, language and theme, installing the app, help |
| `account` | Profile, appearance, security, connections |
| `notifications` | Channels, events, quiet hours, subscriptions, delivery history |
| `dashboard`, `tasks`, `calendar`, `chat`, `files`, `drive`, `kb`, `companies`, `resources` | The modules |
| `admin` | Users, groups, roles, sign-in, security, integrations, modules |
| `api` | Tokens, access templates, webhooks, developer portal |
