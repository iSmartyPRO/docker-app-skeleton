# Review — languages and performance (2026-10-17)

**Scope:**
- the language platform for ru, en, ky, tr and zh;
- the translations;
- the lighter first load;
- the stability fixes (sign-in limits, SMB gateway, process guards, readiness, hot-path caches).

**Method:**
- a read-only code review (findings I);
- a live QA pass over 108 desktop and 81 phone pages in each of the five languages (findings Q).

**Status:** all findings fixed on 2026-10-17, except where the table says otherwise.

## I. Code review

| ID | Sev | Defect | Status |
|---|---|---|---|
| I1 | High | The SMB read slot was held for the whole download. Four slow downloads blocked everyone on a shared pool. | Fixed. The slot is held only around SMB calls. |
| I2 | Medium | Unsaved CRM stock lists followed the portal language, so existing deals no longer matched the source filter. | Fixed. Existing portals keep the Russian lists; new portals get lists in their language at setup. |
| I3 | Low | Import type and status names were ambiguous across languages (tr «Villa»), and Turkish İ/ı was not normalised. | Fixed. Matching goes by language priority, ambiguous names are refused, and a uniqueness test covers it. |
| I4 | Low | Saving the profile wiped a stored language that had been disabled. | Fixed |
| I5 | Low | A failed dictionary load was never retried. | Fixed |
| I6 | Low | In browser mode, messages sent outside a request ignored the person's language. | Fixed (`users.last_locale`) |
| I7 | Low | Race in the parsed settings view. | Fixed |
| I8 | Low | The frozen settings view froze shared module constants. | Fixed |
| I9 | Low | A failed background chunk load reloaded the page and lost input. | Fixed. Only page-level failures reload; other failures show the update banner. |
| I10 | Low | An unchanged `defaultLocale` gave non-superadmins a 403. | Fixed |
| I11 | Low | The sign-in limiter did not fold AD spellings of a login; code requests allowed 60 per address. | Fixed. Spellings are folded; code requests are capped at 20 per address. |

## Q. Live QA

| ID | Defect | Status |
|---|---|---|
| Q1 | Kyrgyz dates showed in English: Chromium has no Kyrgyz date data. | Fixed. A Kyrgyz formatting fallback matches Node's output. |
| Q2 | FullCalendar texts were not localized. | Fixed. Dictionaries cover all five languages. |
| Q3 | The antd Kyrgyz locale was English. | Fixed. It is now a full Kyrgyz locale. |
| Q4 | Chinese two-character buttons had an inserted space. | Fixed |
| Q5 | File sizes ignored the decimal separator (tr). | Fixed. One shared `formatBytes` formatter. |
| Q6 | Raw enum codes appeared in CSV exports. | Fixed |
| Q7 | Accessibility labels were hard-coded in English. | Fixed. Includes the Segmented wrapper. |
| Q8 | antd InputNumber «Increase/Decrease Value» stays English. | Open. Not reachable through antd props; documented. |
| Q9 | English used «(s)» instead of plural forms. | Fixed. Real plural keys. |
| Q10 | Long Kyrgyz and Turkish labels were truncated. | Fixed. Menus wrap and selects size to their content. |
| Q11 | Switching language downloaded every help article. | Fixed. Only the index and the open article load. |
| Q12 | The activity log was stored in English. | Fixed for core security events. Org, directory and demo events still store English text. |
| Q13 | Stored notifications keep the language they were created in. | By design; documented. |

## Verification

- **Backend tests:** unit tests pass; all DB suites pass (one test is skipped because Pillow with WebP is missing).
- **Frontend:** `npm run i18n:check` reports 100 % for ky, tr and zh in the interface, help and admin docs. The build passes.
- **Playwright:** two re-checks after the fixes found no JS errors.
- **Upgrade:** the new code started on a copy of the production database. Modules are unchanged, and the legacy `auto` default became «browser» with an English fallback.
