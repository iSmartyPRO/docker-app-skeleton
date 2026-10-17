export default {
  id: 'api',
  icon: 'code',
  title: 'API and integrations',
  tagline: 'Connect 1C, bots, HR and other systems to the portal — with precise access control',
  summary: 'Other systems work with the portal through a REST API using a **token**: they create tasks, post to chat, sync calendars and staff. Every token acts on behalf of a specific person and never gets more than their rights, and the administrator narrows access further with templates, areas, resources and rules. **Webhooks** work the other way, telling external systems about portal events as they happen.',
  highlights: [
    {
      icon: '🔑',
      title: 'Tokens act as a person',
      text: 'A token works with its owner’s rights — never more than that person can do.',
    },
    {
      icon: '🧩',
      title: 'Access templates',
      text: 'Ready-made sets like “Read only”, “Chat bot”, “HR directory sync”, plus your own.',
    },
    {
      icon: '🎯',
      title: 'Fine-grained control',
      text: 'Per-area levels, specific projects and calendars, path rules, IP, expiry and rate limit.',
    },
    {
      icon: '📡',
      title: 'Webhooks',
      text: 'Signed notifications about tasks, messages, calendar events and users, retried on failure.',
    },
    {
      icon: '📊',
      title: 'Request log',
      text: 'Every token call: who, what, with which result and how many milliseconds.',
    },
    {
      icon: '📘',
      title: 'Developer portal',
      text: 'Reference with examples, a “Try it” console and OpenAPI for Postman — at /developers.',
    },
  ],
  tips: [
    'Give each integration its own technical account and its own token.',
    'A token is shown only once — store it in the integration’s secret store right away.',
    'The “Check a request” panel in the token editor tells you at once whether the token allows a call.',
    'Set an expiry and an IP list on every integration token — free insurance against leaks.',
    'Watch “Needs attention” on the overview: expiring and idle tokens and failing webhooks show up there.',
  ],
  sections: [
    {
      id: 'tokens',
      title: 'What a token is',
      body: `An **API token** is a long secret key like \`pat_k3Jd9xQe_…\` that another system uses to talk to the portal. It is sent in the \`Authorization: Bearer …\` header and works like signing in as its owner: their roles, groups and access to projects and folders apply.

Where tokens are managed:

- **Admin console → API & integrations** ([/admin/api](/admin/api)) — every token, templates, webhooks, the log and settings. Needs the “API administration” permission.
- **Account → API tokens** ([/account/api](/account/api)) — your own tokens. Needs the “Personal API tokens” permission.

The portal keeps only a fingerprint of the token, so it can’t be shown again. If it is lost, press **New secret**: the old one stops working at once. **Revoke** switches the token off for good, immediately.`,
      note: 'Tokens can never sign in or out, change passwords or sessions, or manage other tokens — those actions are for people in the interface only.',
    },
    {
      id: 'owners',
      title: 'Personal tokens and tokens on behalf of others',
      body: `- A **personal token** is created by a person for themselves in the cabinet — say, for their own task export script. It has the author’s rights.
- A **token on behalf of** another account is issued by an API administrator (the **Acts on behalf of** field). Such tokens are marked “On behalf of” in the list.

For integrations, create a dedicated **technical account** (“1C integration”, “Support bot”), give it exactly the groups it needs and issue the token on its behalf. The integration then doesn’t depend on an employee: if that person leaves and their account is disabled, their tokens stop working.`,
      example: {
        title: 'Integration with 1C',
        body: `1. In [Users](/admin/users) create a “1C integration” account without a password and add it to a group with access to the right task project.
2. In **API & integrations → New token** choose it under “Acts on behalf of”, template **Task integration**.
3. Under “Only selected resources” tick the “Accounting” project, under “Allowed IP addresses” the 1C server, expiry 1 year.
4. Copy the token and hand it to the 1C developer over a secure channel.

1C creates tasks only in “Accounting”, only from its server, and every call is in the log.`,
      },
    },
    {
      id: 'templates',
      title: 'Access templates',
      body: `A **template** is a named set of area levels and rules. A token refers to a template and stores only its own differences. Changing a template therefore changes every token built on it.

Built-in templates (read-only, but you can **Duplicate** and edit the copy):

- **Read only** — reads everything the owner sees. Reports, BI, exports.
- **Full user access** — everything in modules, no administration.
- **Task integration** — tasks and their chats, read calendar and profile.
- **Calendar sync** — creates and changes events.
- **Chat bot** — posts to chats, reads notifications, never deletes messages.
- **HR directory sync** — creates and updates accounts and groups; deleting is denied.
- **Monitoring and audit** — security events, settings, dashboard — read only.
- **Full access** — every area including administration. Use with care.

Your own templates are made on the **Access templates** tab: name, description, color, icon, levels and rules. A template used by active tokens cannot be deleted.`,
    },
    {
      id: 'scopes',
      title: 'Fine-tuning by area',
      body: `The API is split into **areas**: Profile, Notifications, one per module (Tasks, Chat, Calendar, Files, Knowledge base, Counterparties…) and three admin ones — Users and groups, Security, Portal settings. Each area gets a level on the token:

- **No access**;
- **Read** — fetch data only;
- **Read & write** — create, change and delete.

Template levels can be changed for one token — changes are marked “changed”, and “Reset to template” undoes one. The **Effective access** panel on the right shows the result.`,
      note: 'An area level never extends the owner’s rights: a token with “Read & write” on Tasks still can’t change a project where the owner can only view.',
    },
    {
      id: 'resources',
      title: 'Only selected resources',
      body: `A token (and a webhook) can be narrowed to specific:

- **task projects** — including “No project (TSK)”;
- **calendars**;
- **file spaces** — shared ones only; such a token can’t reach the owner’s personal files.

The limit applies to every module call: lists, search, cards, creation, dashboard widgets, the task chat. A narrowed token never gets a module administrator’s bypass, even if the owner holds that right.`,
      example: {
        title: 'Meeting room booking',
        body: 'A booking site must create meetings in the “Room 1” calendar and nowhere else. Token: template **Calendar sync**, “Only selected resources” → Calendars with only “Room 1” ticked. Touching any other calendar returns `TOKEN_LIMITED`.',
      },
    },
    {
      id: 'rules',
      title: 'Precise rules',
      body: `A rule allows or denies one API path. It has an effect (**Allow** / **Deny**), methods (empty = any) and a path relative to \`/api/v1\`, where \`*\` is one path segment and \`**\` the rest of the path.

Check order:

1. A path never available to tokens — denied.
2. A **Deny** rule matches — denied. Deny always wins.
3. An **Allow** rule matches — passes, even if the area is closed.
4. Otherwise the area level decides.
5. Then the owner’s rights and resource limits apply inside the module.

Examples:

- Deny \`DELETE /app/**\` — the token never deletes anything.
- Allow \`POST /app/chat/rooms/*/messages\` — posting is allowed while the Chat area is read-only.`,
      example: {
        title: 'A bot in the team chat',
        body: 'A monitoring bot posts to the “On-call” chat. Create a “Monitoring bot” account, add it to that chat and issue a token with the **Chat bot** template — it already contains “Deny `DELETE /app/chat/**`”. The bot sends messages but can’t delete anyone’s, including its own. Type `POST /app/chat/rooms/12/messages` in “Check a request” to see “Allowed”.',
      },
    },
    {
      id: 'limits',
      title: 'IP addresses, expiry and rate limit',
      body: `- **Allowed IP addresses** — addresses or IPv4 networks (\`10.0.0.0/8\`). From other addresses the token is refused. Empty = from anywhere.
- **Expiry** — 30 days, 90 days, 1 year, a date or never. The token stops working at the end of that day. If settings define a maximum lifetime, “never” is unavailable.
- **Rate limit** — requests per minute for this token. Empty = the portal default (120). Over the limit the integration is told to wait and for how long.`,
    },
    {
      id: 'log',
      title: 'Overview and request log',
      body: `The **Overview** tab shows active tokens, requests and errors for 24 hours, latency, a traffic chart, the busiest endpoints and tokens, plus **Needs attention**: tokens expiring within 7 days, tokens idle for 30 days and webhooks that fail to deliver.

The **Request log** tab lists every token call: time, token, owner, method, path, area, result, error code, duration and IP. Filters: token, result (successful / errors), method, area, part of the path. Entries are kept for the days set in settings (30 by default).

People see the log of their own tokens on the API tokens page in their cabinet.`,
      note: 'Common log errors: `SCOPE_DENIED` — the token lacks the area level or a rule blocks it; `FORBIDDEN` — the owner has no right; `TOKEN_EXPIRED` — expired; `IP_NOT_ALLOWED` — wrong source address.',
    },
    {
      id: 'webhooks',
      title: 'Webhooks',
      body: `A **webhook** is an address in an external system that the portal calls when something happens. It is set up on the **Webhooks** tab:

- **Name** and **URL** — receives POST requests with JSON.
- **Events** — single or a whole group: tasks (created, updated, completed, deleted, comment, result, due soon, overdue), chat message, calendar events, users (created, updated, deleted).
- **Sees as** — the person through whose eyes the webhook sees the portal: only events about things this person may see are sent.
- **Only selected resources** — the same project and calendar limits as tokens.

Tools: **Send a test** shows the receiver’s answer at once; every delivery shows its payload, response and attempts; **Send again** repeats a delivery.

On failure the portal retries after 1 min, 5 min, 30 min, 2 h and 6 h. After 20 failed deliveries in a row the webhook switches itself off — you’ll see it under “Needs attention”.`,
      example: {
        title: 'Sync with the HR system',
        body: 'The HR system owns the staff list and must create people in the portal. Token on behalf of an “HR” account with the right to manage users, template **HR directory sync** — create and update allowed, delete denied. To let the HR system know about manual edits in the portal, add a webhook for “User created / updated” with “Sees as” set to the same “HR” account.',
      },
      note: 'An event may arrive twice (a retry after a timeout). The receiver should recognise processed events by their `id`.',
    },
    {
      id: 'signature',
      title: 'Webhook signatures and private networks',
      body: `When a webhook is created, the portal shows its **signing secret** (\`whsec_…\`) once. Every call carries an \`X-Portal-Signature\` header signing the body with that secret. The receiver checks the signature and drops anything that didn’t come from the portal. Ready-made verification code for Node.js, Python and PHP is on the developer portal.

**New secret** issues a different key — update it on the receiver right away.

By default webhooks to private network addresses (10.x, 172.16–31.x, 192.168.x, localhost) are refused, to protect internal services. If the receiver is inside your network, turn on **Private network addresses** in API settings.`,
    },
    {
      id: 'developers',
      title: 'Developer portal and OpenAPI',
      body: `Give developers the link [/developers](/developers). It has:

- **Guide** — quick start, authentication, access and templates, errors, limits, webhooks and signature checks;
- **API reference** — every endpoint with parameters and examples in cURL, JavaScript, Python and PHP, search with ⌘K / Ctrl+K;
- **Try it** — a live call from the browser with a pasted token or your own session;
- **OpenAPI** — a description file to import into Postman, Insomnia or a code generator.

The reference is built from the running portal, so new modules’ endpoints appear on their own. By default only signed-in people can read it; **Public documentation** opens it to anyone with the link.`,
      note: 'The “Try it” console really changes data. A pasted token is kept only in that browser tab.',
    },
    {
      id: 'security',
      title: 'Security and API settings',
      body: `The **Settings** tab:

- **API is on** — turn it off and every token request is refused; the portal itself keeps working. An emergency switch for leaks.
- **Personal tokens** — let people with “Personal API tokens” create their own.
- **Longest token lifetime** — in days, 0 = no limit.
- **Default rate limit** — requests per minute for tokens without their own limit (120).
- **Keep the request log** — days (30).
- **Public documentation**, **Webhooks**, **Private network addresses**.

Good practice:

- keep tokens in environment variables or a secret store, never in website code or a repository;
- give the narrowest template, limit by resources, IP and expiry;
- if you suspect a leak, **revoke** the token or issue a **New secret** at once — it takes effect within seconds.`,
      note: 'The “Personal API tokens” and “API administration” permissions are in no built-in role except super administrator. Grant them through a role in [Roles](/admin/roles).',
    },
  ],
  faq: [
    {
      q: 'I lost my token. Can I see it again?',
      a: 'No, the portal keeps only a fingerprint. Press “New secret” to get a new token with the same settings; the old one stops working at once.',
    },
    {
      q: 'The integration gets SCOPE_DENIED. What should I check?',
      a: 'Open the token and enter the method and path in “Check a request”: it shows which area level is needed or which rule blocks it. FORBIDDEN means the token’s owner lacks the right.',
    },
    {
      q: 'The employee who created the token has left. Will the integration break?',
      a: 'Yes: once the account is disabled its tokens answer OWNER_INACTIVE. That’s why integrations should use technical accounts and tokens on their behalf.',
    },
    {
      q: 'Why doesn’t the webhook receive some events?',
      a: 'The webhook only receives what the “Sees as” person can see, and only for the selected resources. If events about a private project don’t arrive, add that person to the project or choose someone else.',
    },
    {
      q: 'The webhook switched itself off. Why?',
      a: 'After 20 failed deliveries in a row the webhook turns off. Check the receiver’s answers in the delivery list, fix the cause, turn the webhook back on and press “Send a test”.',
    },
    {
      q: 'A webhook to an internal server is refused',
      a: 'Private network addresses are refused by default. Turn on “Private network addresses” on the API Settings tab.',
    },
    {
      q: 'How do I stop all integrations at once?',
      a: 'Turn off “API is on” in API settings: every token request is refused, while people keep using the portal as usual.',
    },
  ],
  fields: {
    owner: {
      title: 'Acts on behalf of',
      text: 'The token gets this person’s rights and never more. For integrations pick a dedicated technical account, not an employee.',
      more: 'owners',
    },
    template: {
      title: 'Access template',
      text: 'A ready set of levels and rules. The token stores only its differences, so changing the template changes every token based on it.',
      more: 'templates',
    },
    scopes: {
      title: 'Areas',
      text: '“Read” fetches data only, “Read & write” also creates, changes and deletes. The owner’s own rights still apply.',
      more: 'scopes',
    },
    resources: {
      title: 'Only selected resources',
      text: 'Limit the token to specific task projects, calendars or shared file spaces — it won’t see anything else.',
      more: 'resources',
    },
    rules: {
      title: 'Precise rules',
      text: 'Deny always beats allow. `*` is one path segment, `**` the rest; paths are relative to `/api/v1`, e.g. `DELETE /app/**`.',
      more: 'rules',
    },
    ipAllow: {
      title: 'Allowed IP addresses',
      text: 'Enter the integration server’s address or a network like `10.0.0.0/8`. Even a stolen token won’t work from elsewhere.',
      more: 'limits',
    },
    expiry: {
      title: 'Expiry',
      text: 'The token stops working at the end of the chosen day. One year with a renewal reminder suits most integrations.',
      more: 'limits',
    },
    rateLimit: {
      title: 'Rate limit',
      text: 'Requests per minute for this token. Empty = the portal default from API settings.',
      more: 'limits',
    },
    runAs: {
      title: 'Sees as',
      text: 'The webhook receives only events about what this person can see: their projects’ tasks, their chats and calendars.',
      more: 'webhooks',
    },
    privateNetwork: {
      title: 'Private network addresses',
      text: 'Allows webhooks to 10.x, 172.16–31.x, 192.168.x and localhost. Turn on only if the receiver really is inside your network.',
      more: 'signature',
    },
    personalTokens: {
      title: 'Personal tokens',
      text: 'People with “Personal API tokens” create their own tokens in the cabinet. Turn off so only administrators issue tokens.',
      more: 'owners',
    },
  },
  related: [
    'admin',
    'account',
  ],
};
