# Time zones and date/time formats

The portal shows every date and time in **one place's rules**: those of the portal, unless a person chose their own.

| Setting | Values | Where |
|---|---|---|
| Time zone | any IANA zone (`Asia/Bishkek`, `Europe/Moscow`, …) | Settings → General → *Region and time* |
| Date format | `DD.MM.YYYY`, `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`, `D MMM YYYY` | same |
| Time format | 24-hour (`14:30`) or 12-hour (`2:30 PM`) | same |
| Week starts on | Monday, Sunday or Saturday | same |

Each person may override any of them in **Account → Appearance → Date and time**. Every field there has *As the portal* (the default). The time zone also has *As on this device*, which follows the zone the browser reports. That option suits people who travel.

## What applies

```
person's choice (users.regional)  →  portal setting (settings.regional)  →  defaults
```

- **Portal defaults:** the server's `TZ` environment variable when it is valid, otherwise `Asia/Bishkek`; then `DD.MM.YYYY`, 24-hour, Monday.
- **The person's zone:**
  - *As on this device* uses `users.device_tz`, which the app saves whenever the browser's zone changes. It is not saved while signed in as someone else.
  - Until the app has saved that zone once, the older `notify_prefs.tz` is used, and failing that the portal's zone.
- **Code:**
  - Server: `resolveRegional(portal, userRow)` in `src/backend/services/datetime.js`, and `regionalFor(user)` in `services/settings.js`.
  - Browser: `resolveRegional(portal, own, locale)` in `src/frontend/src/lib/datetime.js`.
  - `RegionalSync` (in `App.jsx`) applies the result.

Settings are saved through `PUT /api/admin/settings` (`regional`, permission `settings.general`) and `PUT /api/account/profile` (`regional`, `deviceTz`). Invalid values are ignored. In a person's settings, `null`, `''` or `'portal'` means "as the portal".

## Rules for storing and showing

1. **Moments are stored in UTC**, as `TIMESTAMPTZ` and ISO strings in the API. A time zone matters only when a moment is shown to a person, or when a wall-clock value ("tomorrow at 9:00", "today") becomes a moment.
2. **Calendar days are stored as `YYYY-MM-DD`** and never shift with a zone. Examples: a deal's close date, a birthday, a due day without a time.
3. **"Today", "this week" and "overdue"** are computed in the person's zone, with their week start.
4. **Server messages** use the recipient's settings: chat and bot notifications, reminders, e-mails and exports. Jobs that address nobody in particular use the portal's settings.
5. **Quiet hours** for notifications are counted in the person's zone.

## In the browser (`lib/datetime.js`)

| Helper | Use |
|---|---|
| `fmtDate(v)`, `fmtTime(v)`, `fmtDateTime(v)` | Text in the person's zone and formats |
| `fmtSmart(v)` | "Today, 14:30", "Tomorrow, 09:00", otherwise the full date |
| `intlOptions(opts)` | Adds `timeZone` and the hour cycle to `Intl` / `toLocaleString` options, for custom layouts such as "13 окт." |
| `inZone(v)`, `nowInZone()`, `todayISO()` | dayjs values in the person's zone |
| `toPicker(iso)` / `fromPicker(d)` | antd pickers work in the **device's** zone; these move the wall-clock time across, so a person whose zone differs from the device's picks *their* 9:00 |
| `dayToPicker` / `dayFromPicker` | `YYYY-MM-DD` ↔ picker, with no zone involved |
| `pickerFormat()` | `format` strings for pickers |
| `useRegional()` | The current settings, as a hook |

Components: `DateTimeField` (a moment, as an ISO string), `DateField` (`YYYY-MM-DD`) and `TimeField` (`HH:mm`) live in `components/ui/DateTimeField.jsx`. Use them instead of bare antd `DatePicker` and `TimePicker`. `lib/format.js` `formatDateTime()` already follows the settings.

Changing the settings remounts the app, so components need no special handling. `dayjs.tz.setDefault()` is set to the person's zone, and the dayjs locales `ru` and `en-gb` take the week start.

## On the server (`services/datetime.js`)

| Helper | Use |
|---|---|
| `formatDate`, `formatTime`, `formatDateTime(v, r)` | Text for a person (`r` = `regionalFor(user)`) |
| `startOfDay(v, tz, addDays)`, `startOfWeek(v, tz, weekStart, addWeeks)` | Boundaries of days and weeks |
| `wallToInstant({year, month, day, hour, minute}, tz)` | A wall-clock time to a moment. It handles daylight saving time. |
| `isoDay(v, tz)` | The calendar day of a moment in a zone |
| `zonedParts`, `zoneOffsetMinutes`, `zoneLabel` | Lower-level pieces, for example "UTC+6" |

## Module notes

- **Calendar:**
  - FullCalendar runs in the person's zone through `@fullcalendar/luxon3`. With `timeZone` set, callback dates are real moments.
  - For all-day values, read the `…Str` fields or use `inZone(date).format('YYYY-MM-DD')`.
  - The week starts on the regional week start; the calendar's own `weekStart` preference is no longer used.
  - A new event without a zone gets its author's zone, which recurrence and all-day reminders use.
  - Messages add a zone label (for example "(UTC+6)") only when the event's zone has a different offset from the recipient's.
- **Tasks:**
  - A deadline without a time ends at the end of that day in the person's zone.
  - "Today", "tomorrow" and "this week" groups and presets are counted in that zone.
  - A recurring template without `tz` uses its author's zone.
- **CRM:**
  - Requests send `tz` and `weekStart`. A valid request parameter wins; otherwise the server uses the person's settings.
  - Kanban buckets ("this week", "next week") follow the week start, and `createdFrom`/`createdTo` filters are the viewer's days.
  - The close date and date fields are calendar days.
- **Dashboard:** "today" and the month grid use the person's zone and week start. The clock follows the 12/24-hour setting unless the widget has its own.
- **Notifications:**
  - Quiet hours use the person's zone. If none is set, they fall back to the legacy `notify_prefs.tz`, then `device_tz`, then the portal's zone.
  - "Pause until tomorrow" means 9:00 in that zone.
- **Exports (CRM, File server activity):** times are written in the requester's zone as sortable `YYYY-MM-DD HH:MM`; the file name's date is that zone's date.
- **Share links (Files, File server, KB) and API tokens:** an expiry chosen as a date ends at 23:59:59 in the person's zone.
- **Support text** (crash and outage screens): local time, zone and UTC ISO.
- **API log charts:** grouped by UTC day; their day labels are shown in UTC.

- **Masterplan** ([masterplan.md](masterplan.md)): booking timers are instants; contract, act, stage plan / fact and report dates are calendar days (`YYYY-MM-DD`). "Today" for schedules and delays is the portal's day; warnings, CRM history lines and notifications are written in the recipient's (or the portal's) zone and formats.

## Pitfalls

- Do not use `new Date().setHours(…)` or `getDay()` on the server for a person: the container's zone is not theirs.
- `toLocaleString()` without `intlOptions()` shows the **device's** zone, not the person's.
- `dayjs(value)` is in the device's zone. `inZone(value)` is in the person's zone.
- For "tomorrow at 9:00", build the wall-clock time with `dayjs.tz('YYYY-MM-DD 09:00', zone)` or `toPicker`/`fromPicker`. Do not call `.hour(9)` on a `.tz()` object: it goes wrong across daylight saving time.
- node-pg returns `DATE` columns as local midnight. Do not turn them into days with `toISOString()`.
- Sending `date.toISOString()` for a calendar day can shift it by one day. Send `YYYY-MM-DD` instead.
