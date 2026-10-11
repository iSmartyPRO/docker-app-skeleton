# Notifications, push and the scheduler

## Notification center

Every module notifies through one service (`src/backend/services/notifications.js`):

```js
await notify({
  userIds: [assigneeId],
  kind: 'tasks.assigned',
  module: 'tasks',
  link: '/app/tasks/HR-12',
  actorId: req.user.id,                 // never notified about their own action
  render: (locale) => ({ title, body }), // text in the recipient's language
});
```

- **In-app (always):**
  - stored in `notifications`;
  - the bell in the top bar shows an unread counter (polled every 45 s and on focus) and a panel with All / Unread, mark-all-read and links;
  - kept 120 days.
- **External channels:** delivered after the request finishes, so a slow mail server never delays the user.

  | Channel | Reaches the user when |
  |---------|-----------------------|
  | **Push** | They enabled *Push on this device* (installed app, see [pwa.md](pwa.md)) |
  | **Email** | SMTP or the Gmail sender is configured and the profile has an email |
  | **Telegram** | The bot is configured and Telegram is linked |
  | **Mattermost** | Mattermost is configured and the profile has a Mattermost username |

- **Preferences:**
  - each user switches channels in **Profile → Notifications** (`users.notify_prefs`, all on by default);
  - unreachable channels explain how to fix them.
- **Email:** an HTML template with the product name and an *Open* button, plus a plain-text part. Links use `PUBLIC_URL` / `FRONTEND_URL`.
- **App badge:** the unread count shows on the app icon (Badging API), from the page and from push messages.

### API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/notifications?limit&before&unread=1` | Inbox page, unread count |
| GET | `/api/notifications/unread` | Counter only |
| POST | `/api/notifications/read` | `{ ids: [] }` or `{ all: true }` |
| GET / PUT | `/api/account/notifications` | Channel preferences and reachability |

## Web Push

- **Standard:** Web Push with VAPID (`web-push`).
- **Keys:** generated on first use and stored in `app_settings.webpush`. The private key is sealed (see below).
- **Allowed endpoints:** only real push services are accepted: FCM, Mozilla, Apple, Windows, on the standard HTTPS port. This rules out using subscriptions to make the server call internal hosts.
- **Sign-out:** the device unsubscribes and the app badge is cleared, so a shared device does not keep receiving the previous person's notifications.
- **Subscriptions:** one per device in `push_subscriptions`. Those the push service reports as gone (404/410) are deleted automatically.
- **Payload:** title, body, link, tag and the unread count. The service worker shows the notification, updates the badge and opens the link on tap.
- **iPhone / iPad:** iOS 16.4+, and only in the app added to the home screen.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/pwa/vapid` | Public key |
| GET / POST / DELETE | `/api/pwa/push` | Device count / subscribe `{ subscription }` / unsubscribe `{ endpoint }` |
| POST | `/api/pwa/push/test` | Test notification to all my devices |

## Scheduler

`services/scheduler.js` runs registered jobs on a timer (20-second tick):
- each job runs inside a **Postgres advisory lock**, so several app instances never run the same job twice;
- failures are logged, never thrown;
- `DISABLE_SCHEDULER=true` turns it off, e.g. for a worker-less replica.

```js
registerJob({ name: 'tasks:reminders', everyMs: 5 * 60 * 1000, run: runReminders });
```

| Job | Interval |
|-----|----------|
| `tasks:reminders` | 5 min |
| `calendar:reminders` | 1 min |
| `calendar:cleanup` | 12 h |
| `notifications:retention` | 6 h |

## Sealed secrets

`services/crypto.js` stores credentials kept on behalf of users with AES-256-GCM:
- Google refresh tokens;
- the Gmail sender token;
- the VAPID private key.

The key is `ENCRYPTION_KEY`, or one derived from `JWT_SECRET` when that is not set. Changing it makes the stored tokens unreadable: users reconnect Google, and new VAPID keys are generated, so devices subscribe to push again.
