# Calendar (`/app/calendar`)

The third [module](modules.md) covers:
- personal and shared calendars;
- events that repeat;
- attendees with RSVP;
- reminders;
- the deadlines of your tasks;
- your Google calendars, shown live next to the portal ones.

## Views

The views are **Month**, **Week**, **Work week** (no weekends), **Day** and **Agenda** (FullCalendar).

- **Creating:** click an empty slot (or drag over the grid for a length) and choose **Event** or **Task**. A click gives the event the person's usual length. *+ Event* and *Task* buttons are in the sidebar too.
- **Tasks:** every task the person takes part in that has a deadline is shown on its date and time (☐ open, ✓ crossed out done, a red edge when overdue). Dragging a task moves its deadline (`PUT /api/app/tasks/tasks/:ref`, the task's own rules apply, e.g. a locked deadline is refused and the task jumps back). The sidebar lists **Without a deadline** — the person's open tasks without one; dragging one onto the calendar schedules it. *Task* creates a task assigned to the person with the chosen deadline.
- **Following a calendar:** ⋯ → *Notify me about changes* (see [notifications.md](notifications.md)).
- **Personal settings** (⚙ in the toolbar, stored in `cal_user_prefs`): view on open, week start, working hours, grid step (15/30/60 min), weekends, week numbers, declined events, tasks (on/off, which: *I am doing* / *All my tasks* / *All visible tasks*, completed, block length), and defaults for new events (calendar, length, reminder). *Reset to defaults* returns to the portal settings.
- **Moving events:**
  - drag an event to move it, or drag its edge to resize it;
  - click an event to see details.
- **Sidebar:**
  - the "New event" button;
  - a mini month for jumping to a date;
  - calendar toggles (remembered per browser);
  - Invitations;
  - My task deadlines;
  - Google calendars.
- **Phones:** the Day view by default and a drawer instead of the sidebar.
- `/app/calendar/e/:id` opens an event card. Notifications link there.

## Calendars and access

- **Personal calendar:** every user gets one on first visit. It is private until shared.
  - Administrators do **not** see personal calendars of others.
  - `calendar.admin` applies only to shared calendars.
- **Shared calendars** are for teams and resources, such as a meeting room or a department. Visibility when created:
  - everyone can see;
  - everyone can edit;
  - only me.

  Settings can restrict creation to administrators.
- **Levels** (same editor as in Tasks and the Knowledge Base):
  - *view*: events and details;
  - *edit*: create, move and delete events;
  - *manage*: name, colour, access and deletion.
- **Invitations:** invited people see the event even without access to its calendar.

## Events

| Field | Notes |
|-------|-------|
| Title, description, location | |
| Video call link | Shown as a "Join" button |
| All day / start–end | Timed events up to 62 days |
| Repeat | Daily, weekdays, weekly, monthly, yearly, or custom: every N days/weeks/months/years, chosen weekdays, ending never / on a date / after N times |
| Attendees | Any active users; the organizer joins automatically |
| Reminders | Up to 5: at start, 5–30 min, 1–2 h, 1–2 days, 1 week before |
| Colour | Overrides the calendar colour |

**Recurrence:**
- Recurrence is stored as an RFC 5545 `RRULE`, a safe subset: FREQ, INTERVAL, BYDAY, BYMONTHDAY, COUNT, UNTIL.
- It is expanded **in the event's own time zone**, so "every Monday 09:00" stays 09:00 across daylight-saving changes.
- Rules are validated:
  - `BYMONTHDAY=0` is refused;
  - years must fall between 1970 and 10 years ahead;
  - an expansion stops at 1,000 occurrences;
  - one broken event never stops the reminder job.
- Changing a series' start time or rule removes its exceptions, because they belonged to the old schedule.
- Editing *all events* from one occurrence keeps the series' own start when the time was not changed; a changed time shifts the series' start by as much as the occurrence moved (as dragging does). The event keeps its own time zone when someone else edits it.
- Changing one occurrence (time, place, attendees) notifies the attendees like a change of the whole event.
- Series that ended (`UNTIL`) long before the requested range are not loaded or expanded.
- All-day reminders fire relative to local midnight in the event's time zone.
- Editing or deleting one occurrence asks *this event* or *all events*:
  - *This event* stores an exception: the original date goes to `exdates`, and a changed occurrence becomes a separate event linked to the series.
  - Exceptions are deleted with the series.

**RSVP:**
- Attendees answer Yes / Maybe / No.
- The organizer gets an in-app notification.
- Pending invitations are hatched in the grid; declined ones are faded.

## Notifications and reminders

| Event | Who |
|-------|-----|
| Invited | New attendees |
| Time, place or repeat changed | Attendees |
| Removed from the event / event or occurrence deleted | Those attendees |
| RSVP | Organizer (in-app only) |
| Reminder | Attendees who did not decline, the organizer, and the owner of a personal calendar |

**How reminders are sent:**
- The job runs every minute and looks 7 days ahead.
- Each reminder of each occurrence is sent exactly once (`cal_reminders_sent`).
- A reminder that falls due during a short restart is sent with a 10-minute grace period, stating the real time left.

## Google Calendar

This needs the [Google integration](integrations.md#google) with *Google Calendar for users* switched on.

1. A user connects their own Google account in **Profile → Connected accounts**. This grants `calendar.events` and `calendar.calendarlist.readonly`.
2. They choose which of their Google calendars to show.
3. Google events are read **live** for the visible range, with no copy kept in the portal, and shown with a Google mark.
4. Events in writable Google calendars can be created, moved and deleted from the portal.
5. Single occurrences of Google series are read-only here. "Open in Google Calendar" opens them in Google.

## Settings (Admin → Settings → Modules → Calendar)

| Setting | Default |
|---------|---------|
| Enabled | on |
| Who creates shared calendars | everyone |
| Show task deadlines | on (needs Tasks) |
| Default view / week starts on | week / Monday |
| Working hours | 07:00–21:00 (highlighted; the grid scrolls to the start) |
| Reminders / default for new events | on / 15 minutes |

## API (`/api/app/calendar`, signed-in users)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Calendars (creates the personal one), Google status, config, the person's `prefs` |
| GET / PUT / DELETE | `/prefs` | The person's calendar settings (see above); `DELETE` resets them |
| POST / PUT / DELETE | `/calendars[/:id]` | Shared calendars; personal ones cannot be deleted |
| GET / PUT | `/calendars/:id/access` | Access list |
| GET | `/events?from&to&calendars=1,2&invitations=0\|1` | Occurrences in a range (max 120 days) |
| POST | `/events` | Create |
| GET / PUT / DELETE | `/events/:id` | `PUT`/`DELETE` take `scope` (`all` \| `single`) and `occurrence` for recurring events |
| PUT | `/events/:id/rsvp` | `{ status: accepted \| tentative \| declined }` |
| GET / POST / PUT / DELETE | `/google/events` | The user's Google events (live) |

Errors: `INVALID_RANGE`, `INVALID_DATE`, `TITLE_REQUIRED`, `INVALID_URL`, `PERSONAL`, `GOOGLE_NOT_CONNECTED`, `GOOGLE_REVOKED`, `GOOGLE_API`.

## Demo data and tour

- `modules/calendar/demo.js` (after Tasks, Org structure and Employees): a shared calendar «Демо: команда» — a recurring stand-up, a meeting with «ООО «Пример»», a site walk, a training with a video link, last week's review, a budget meeting and two all-day days next week — and a site calendar «Демо: объект «Северный квартал»» with an inspection, a delivery and a client visit. Attendees are the demo colleagues of `modules/shared/demoPeople.js`. Purge also drops the invitation notifications of the demo events.
- Tour `calendar` (`tour/content/calendar.js`, texts `tour.calendar.*` in `i18n/coreTours.js`): the grid, «Событие / Задача», the month picker, the calendar list, invitations and tasks, the toolbar (today, arrows, views), personal settings. Anchors: `cal.grid`, `cal.create`, `cal.mini`, `cal.calendars`, `cal.more`, `cal.toolbar`, `cal.prefs`.
