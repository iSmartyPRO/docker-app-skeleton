# Chat (`/app/chat`)

A messenger built into the portal: one-to-one and group conversations, plus conversations attached to records of other modules (a task has its own chat). It works in real time, sends push notifications to people who are not looking, and fits a phone screen.

## URLs

| URL | Page |
|-----|------|
| `/app/chat` | Conversation list (pinned, unread first) and an empty state |
| `/app/chat/u/12` | The direct conversation with user 12, created on the first message |
| `/app/chat/34` | Conversation 34 |

The chat icon in the header shows the unread count on every page and opens a list of recent conversations.

## Conversations

| Kind | Who is in it | Title |
|------|--------------|-------|
| **Direct** | Two people, one room per pair | The other person |
| **Group** | The creator is the owner: adds and removes members, renames and recolours the group | Set by the creator |
| **Entity** | Whoever can see the record (e.g. the task's participants) | Taken from the record, e.g. `TSK-12 · Contract` |

Each person can **pin**, **mute** or **hide** a conversation for themselves. A hidden conversation comes back when a new message arrives.

## Messages

- Text with light Markdown (`**bold**`, `_italic_`, `` `code` ``, links); messages made only of emoji are shown large.
- **Replies** quote the original message; clicking the quote jumps to it.
- **Mentions:** type `@` to pick a member. The mentioned person gets a notification through every channel they have enabled, even if the room is muted.
- **Files and images:** use the paperclip, paste, or drop files. Images show a preview, other files a card. Uploads are limited to *Max upload* MB. Only safe types (images, PDF, plain text, audio and video) open inline; everything else downloads.
- **Reactions:** an emoji set on each message, with who reacted shown on hover.
- **Edit and delete:** authors can edit or delete their own messages; deleted ones leave a stub. Group owners and `chat.admin` can delete any message.
- **Read receipts:** one tick means sent, two mean read by everyone else. Group rooms show who has read a message.
- **Typing** indicator, an **unread separator** and a *jump to latest* button.
- **Search** inside a conversation (side panel) and across all conversations (list header).
- **Files** tab in the side panel: everything shared in the conversation.
- **Call:** starts a video meeting from the *Call URL* template (Jitsi by default) and posts the link into the conversation. Leave the template empty to hide the button.

**System messages** (`kind: 'system'`) record events in a conversation: a member joined, the room was renamed, a task changed status. They do not count as unread. Modules render their own events on the frontend with `registerSystemEvents(prefix, render)`.

## Real time and notifications

- Each browser tab opens one Server-Sent Events stream, `GET /api/app/chat/stream`. New messages, edits, reactions, read marks and typing arrive through it. The stream reconnects by itself and the page refetches what it missed.
- The tab reports whether the user is looking at a room (`POST /focus`, sent when focus or visibility changes). People watching a room get no push for it; everyone else gets a web push (tag `chat-<room id>`, so a newer message replaces the older one on the device). Muted rooms send no push except for mentions.
- Mentions go through the [notification center](notifications.md) as `chat.mention`, so they also reach email, Telegram and Mattermost if the person enabled them.
- **Reverse proxy:** the stream needs buffering off. The bundled `nginx.conf` has a dedicated `location = /api/app/chat/stream` (no buffering, 1-hour timeouts), and the backend sends `X-Accel-Buffering: no` and skips compression for `text/event-stream`. A proxy placed in front of the container must not buffer either.

## Chats for other modules

A module gives its records a conversation by registering an adapter (see `src/backend/modules/chat/entities.js`):

```js
import { registerChatEntity } from '../chat/entities.js';

registerChatEntity('task', {
  access: async (req, id) => ({ view, write, title, subtitle, link, color }) /* or null */,
  describe: async (id) => ({ title, link }),     // rooms made without a request
  participants: async (id) => [userId, ...],     // who gets unread counts and pushes
  seed: async (roomId, id) => {},                // optional: import old history once
});
```

- The room is created the first time someone opens it (`GET /entity/:type/:id`). Its access is always the record's access; the chat module stores no permissions of its own for entity rooms.
- The backend posts events with `postSystem(type, id, { actorId, data, notifyText })`.
- The frontend embeds a conversation with `<Conversation entity={{ type, id }} header="bare" compact />`.

Tasks use this mechanism: the task chat replaces the old comments and history (see [Tasks](tasks.md#task-chat)).

## Settings (Admin → Settings → Modules → Chat)

| Setting | Default |
|---------|---------|
| Enabled | on |
| Anyone may create group chats | on (off: only `chat.admin`) |
| Max upload, MB | 100 (1–2048) |
| Call URL | `https://meet.jit.si/{room}`; `{room}` becomes a unique code, empty hides calls |

The `chat.admin` permission allows creating groups when that is restricted and moderating (deleting) any message. Uploads never attached to a message are removed after a day by the `chat:orphans` job (every 6 hours).

## API (`/api/app/chat`, signed-in users)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/stream` | Server-Sent Events stream |
| POST | `/focus` | `{ roomId \| null, visible }`: what this tab is looking at |
| GET | `/`, `/rooms` | Conversations with last message and unread count |
| GET | `/unread` | Total unread |
| GET | `/directory` | People one can write to |
| GET | `/search?q=` | Search messages in all my conversations |
| POST | `/rooms` | Create a group `{ title, color, memberIds }` |
| POST | `/direct/:userId` | Open (or create) the direct room |
| GET | `/entity/:type/:id` | Open (or create) a record's room |
| GET / PUT | `/rooms/:id` | Room / rename, recolour |
| PUT | `/rooms/:id/prefs` | `{ pinned, muted, hidden }` for me |
| GET / POST / DELETE | `/rooms/:id/members[/:userId]` | Members |
| POST | `/rooms/:id/read` | `{ messageId }`: mark read up to a message |
| POST | `/rooms/:id/typing` | Typing signal |
| GET | `/rooms/:id/files` | Files shared in the room |
| POST | `/rooms/:id/call` | Start a call, posts the link |
| GET | `/rooms/:id/messages` | `before`, `after`, `around` (message id), `q`, `limit` |
| POST | `/rooms/:id/messages` | `{ body, replyTo, fileIds }` |
| POST | `/rooms/:id/files` | Upload (multipart `files`), returns ids to send with a message |
| PUT / DELETE | `/messages/:id` | Edit / delete |
| POST | `/messages/:id/reactions` | `{ emoji }`: toggle |
| GET | `/files/:id[?download=1]` | A file, for room members |
