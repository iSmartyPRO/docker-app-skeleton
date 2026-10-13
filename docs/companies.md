# Counterparties (`/app/companies`)

A [module](modules.md) with the company's directory of **companies** (clients, suppliers, partners, government bodies…) and the **people** who work there. Cards fill themselves from public registers by identifier, people keep their career when they change jobs, and every change is recorded with who made it and when.

## Companies

- **Country profiles.** Each country has its own identifiers (with format checks) and legal forms:

| Country | Identifiers | Register |
|---------|-------------|----------|
| 🇰🇬 Kyrgyzstan | INN (14 digits), registration number, OKPO | Ministry of Justice, no key |
| 🇷🇺 Russia | INN (10/12, check digits), KPP, OGRN/OGRNIP (check digits), OKPO | DaData (with a key) or EGRUL of the Federal Tax Service (free) |
| 🇰🇿 Kazakhstan | BIN / IIN (12) | — |
| 🇺🇿 Uzbekistan | INN / STIR (9) | — |
| 🇧🇾 Belarus | UNP (9) | — |
| 🇹🇯 Tajikistan | INN (9) | — |
| 🇨🇳 China | USCC (18) | — |
| 🇹🇷 Türkiye | VKN (10) | — |
| 🌐 Other | Tax ID, registration number, VAT | — |

  Profiles live in `src/backend/modules/companies/countries.js`; adding a country there is enough for the forms. Administrators can add **custom fields** for companies or contacts, for all countries or only some.

- **The card:**
  - name, full registered name, name in the state language, legal form;
  - type (legal entity, sole trader, branch, government body);
  - status (active, being liquidated, liquidated, reorganising);
  - registration and closure dates, registering authority, number of founders;
  - main activity and code (OKVED);
  - head and position;
  - legal and actual address;
  - phones and emails with labels, website, messengers;
  - several bank accounts (bank, account, BIC, correspondent account, SWIFT, currency);
  - industry, size, relationship (client, supplier… — configurable with colours), tags, responsible employee, notes, custom fields, documents.

- **Fill from the register.** Choose the country, type the identifier, press *Fill from the register*:
  - **Kyrgyzstan** — `GET https://record.minjust.gov.kg/register/api/v1/register?query=<INN>` gives the names (Russian, Kyrgyz, English) and the registration number. The official PDF extract (`…/register/<INN>/record`) is read too: registering authority, OKPO, legal address, status, registration / re-registration / closure dates, number of founders and head. The extract is attached to the card as a document.
  - **Russia** — with a DaData key: names, legal form, INN, KPP, OGRN, OKPO, OKVED, status, registration and liquidation dates, head and position, full address. On the free plan contacts, founders and finances are empty. Without a key, or if DaData fails, the free EGRUL search is used (names, INN, KPP, OGRN, head, registration date, closure date) plus the PDF extract.
  - Values typed by hand (phones, emails) are kept. A company with the same main identifier is detected before saving; a link opens it, or you can *Create anyway*.
- **Check with the register** compares the card with the register field by field. Empty fields are pre-selected; you choose which differing values to take. The check is recorded in the history with the changes, the card shows *Checked with … · date*, and a fresh extract is attached.
- **Archive instead of delete.** An archived company keeps its people, history and documents and can be restored. Only `companies.admin` can delete for good.

## People and careers

- **Contact card:**
  - last, first and middle name;
  - phones and emails with labels, Telegram, WhatsApp, LinkedIn;
  - birthday, gender, country, city, languages;
  - tags, responsible employee, notes, custom fields.
- **Jobs** (`cmp_positions`):
  - fields: company, position, department, *decision maker*, work phone and email, start and end dates;
  - a person can work at several companies at once;
  - the company card shows current employees (decision makers first) and former employees with periods and reasons.
- **When someone leaves**, *Left the company* asks for:
  - the date and a reason (resigned, moved, dismissed, reorganisation, retired, other, with a comment);
  - what next: *nowhere yet — keep as a contact*, or *moves to another company* with the new position.

  The old job stays in the career history, and the person is never deleted. *Without a company* in the contacts list shows people who are not employed anywhere now.

## History and rating

- **History** of every company and contact:
  - created, every change with **old → new** values field by field, registry checks, archive and restore;
  - joining and leaving, documents, ratings;
  - manual entries: note, call, meeting, email, deal, issue (with an optional date).

  Each entry shows **who** and **when**. System entries cannot be deleted (CRM deal lines included); people delete only their own notes. Deal lines (title, amount, stage) are shown only to people who may open that deal in the CRM. Filters: everything, notes and contacts, changes.
- **Rating** from 1 to 5 stars, with optional criteria:
  - companies: reliability, payment discipline, quality, communication;
  - contacts: reliability, communication, quality.

  The average counts each colleague's latest score. Older scores stay visible as history, together with the distribution and comments.

## Access

Every signed-in employee sees the directory. *Who may change cards*: everyone (default) or the responsible person, the author and administrators. `companies.admin` changes anything, deletes for good and configures the module.

## Settings (*Settings → Modules → Counterparties*)

| Setting | Default |
|---------|---------|
| Default country / countries offered | KG / KG, RU, KZ, UZ, BY, TJ, CN, TR, Other |
| Who may change cards | Everyone |
| Relationship types | Client, supplier, partner, prospect, contractor, government, competitor — rename, recolour, add |
| Custom fields | none — text, long text, number, date, list, link; for companies or contacts; for chosen countries |
| DaData API key | not set. It is stored sealed (AES-256-GCM, `ENCRYPTION_KEY`), and only a masked hint is ever shown. Only the API key is needed, not the secret key |

## Notes

- **Registers are queried by the server.** The Kyrgyz register sits behind Cloudflare and expects a browser-like request; the server sends one. Registry requests are limited to 20 per minute per person.
- **Registry extracts** wait in `UPLOAD_DIR/companies/tmp/` (deleted after an hour) until the card is saved. Documents live in `UPLOAD_DIR/companies/`. They are served only to signed-in people, with `nosniff` and a sandbox CSP.
- **PDF text** is read with `pdfjs-dist` (no external tools).

## API

All under `/api/app/companies`, signed-in users:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/meta` · `/staff` · `/search?q=` | Country profiles and settings · employees for "responsible" · quick search |
| POST | `/lookup` | `{ country, id }` → register fields, `documentId`, `duplicates` |
| GET | `/duplicates?country=&key=&value=` | Cards with the same identifier |
| GET / POST | `/companies` | List (`q`, `country`, `relation`, `tag`, `status`, `owner=me`, `archived=1`, `sort`, `limit`, `offset`) · create (`registry`, `documentId`, `force`) |
| GET / PUT / DELETE | `/companies/:id` | Card with people and documents · update (diff recorded) · delete (admin) |
| POST | `/companies/:id/archive` · `/restore` | `{ reason }` |
| POST | `/companies/:id/verify` · `/apply` | Compare with the register · take `{ fields, registry, documentId }` |
| POST · GET · DELETE | `/companies/:id/files` · `/files/:id` | Documents |
| GET / POST | `/people` | List (`q`, `owner=me`, `free=1`, `archived=1`) · create (optional `position`) |
| GET / PUT / DELETE | `/people/:id` (+ `/archive`, `/restore`) | Contact |
| POST | `/people/:id/positions` | Add a job |
| PUT / DELETE | `/positions/:id` | Edit · remove (admin) |
| POST | `/positions/:id/end` | `{ endedOn, reason, to? }` — leave, optionally move to another company |
| GET / POST | `/{company\|person}/:id/timeline` · `/notes` | History · add a note, call, meeting… |
| DELETE | `/events/:id` | Own note |
| GET / POST | `/{company\|person}/:id/ratings` | Ratings · rate `{ score, criteria, comment }` |
| PUT | `/admin/dadata` | `{ key }` (admin) |

Errors: `DUPLICATE` (409, `info.duplicates`), `INVALID_IDS` (`info.fields`), `REGISTRY_NOT_FOUND`, `REGISTRY_UNAVAILABLE`, `REGISTRY_KEY`, `REGISTRY_LIMIT`, `REGISTRY_CAPTCHA`, `INVALID_ID`, `NO_REGISTRY`, `NO_IDENTIFIER`, `ALREADY_ENDED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`.
