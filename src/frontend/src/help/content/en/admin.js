export default {
  id: 'admin',
  icon: 'shield',
  title: 'Administration',
  tagline: 'People, access, security and portal settings in one console',
  summary: 'The admin console lives at [/admin](/admin). Here you create and block accounts, put people into groups, decide through roles who may do what, watch the security log and configure the portal: branding, sign-in methods, integrations and modules.',
  highlights: [
    {
      icon: '👥',
      title: 'Groups → roles → permissions',
      text: 'People get permissions through their department’s groups; direct roles are only for exceptions.',
    },
    {
      icon: '🔐',
      title: 'Flexible sign-in',
      text: 'Password, Active Directory, Google, Telegram and one-time codes via WhatsApp, email, Telegram or Mattermost.',
    },
    {
      icon: '🛡️',
      title: 'Safety rails',
      text: 'You cannot grant more than you hold, lock yourself out or remove the last super administrator.',
    },
    {
      icon: '📜',
      title: 'Security log',
      text: 'Failed sign-ins, lockouts and IP denials for 90 days, with address and details.',
    },
    {
      icon: '🎨',
      title: 'Your company’s look',
      text: 'Name, logos for light and dark themes, palette, fonts and menu icons with a live preview.',
    },
    {
      icon: '🧩',
      title: 'Modules and integrations',
      text: 'Turn on only the apps you need and connect email, messengers, Google and document conversion.',
    },
  ],
  tips: [
    'Press Ctrl+K (⌘K on a Mac) in the console to jump to any page or setting.',
    'Grant access through groups, not to a person directly: when someone changes department, just change the group.',
    'Keep at least two super administrators in case of a holiday or a lost password.',
    'Before turning on the IP allow list, press “Allow my IP” — otherwise the portal will refuse the change.',
    '“Test connection” in integrations checks the values in the form, even unsaved ones.',
  ],
  sections: [
    {
      id: 'notifications',
      title: 'Notification delivery',
      body: `**Settings → Integrations → Notifications** gathers delivery in one place:
- **Channels for notifications** — whether e-mail, push, WhatsApp, Telegram and Mattermost carry notifications, and how many people each can reach (who has a phone, linked Telegram and so on).
- **WhatsApp for notifications** — the provider: as for sign-in codes, only the WhatsApp gateway or only Wazzup, plus a fallback.
- **Test message** — to any number, e-mail, Telegram chat or Mattermost user, with the provider’s exact answer.

The integrations themselves (gateway address, Wazzup key, Telegram bot) are set up on their own pages under Integrations. What to receive is each person’s choice in Profile → Notifications, where they can also add a phone and get a test at once.`,
      example: {
        title: 'Codes through the gateway, notifications through Wazzup',
        body: 'Sign-in codes must arrive instantly — keep the WhatsApp gateway for them in Sign-in methods. For notifications choose Wazzup and turn on the fallback: if Wazzup is down, the message goes through the gateway. Send a test to your number to be sure.',
      },
    },
    {
      id: 'console',
      title: 'How the console is organised',
      body: `The console’s sidebar has a few sections:

- **Overview** — the portal’s state at a glance.
- **Users**, **Groups**, **Roles** — people and their access.
- **Activity** — security events.
- **API & integrations** — tokens and webhooks for other systems (see [API and integrations](/help/api)).
- **Settings** — everything else, grouped: Project, Appearance, Security, Integrations, Modules, System. There is a search box at the top.

Everyone sees only the sections they have permissions for. With “View settings” every screen opens, but the fields are read-only.`,
      note: 'A changed form shows a Save / Discard bar at the bottom. Nothing is applied until you press Save.',
    },
    {
      id: 'users',
      title: 'Users: creating and editing',
      body: `The [Users](/admin/users) page lists everyone who can sign in, with search by name, username and email and filters by role, group and status.

When creating an account, enter a **username** (3–32 characters: Latin letters, digits, dot, underscore, hyphen), a name and optionally email, phone and groups. The password is optional: leave it empty for people who sign in through Active Directory, Google, Telegram or a code.

The user page has a **Sign-in contacts** block: phone (for WhatsApp codes), email, Mattermost username and linked Telegram. The portal uses these to recognise the person when they sign in with a code.`,
      steps: [
        'Open Users and press “New user”.',
        'Fill in the username and name, and if needed email and phone in international format.',
        'Choose groups. If you choose none, the person joins the default group.',
        'Set a password (10+ characters) or leave it empty for password-less sign-in.',
      ],
      note: 'Email must be unique: if two accounts share an address, neither will receive email codes.',
    },
    {
      id: 'user-access',
      title: 'Blocking, password and session reset',
      body: `The **Access** block on the user page has two switches:

- **Active** — turn it off so the account cannot sign in at all (e.g. the person has left).
- **Blocked** — sign-in is refused even with the right password. Handy as a temporary measure, for example if you suspect the account was compromised.

**Password reset**: enter a new password and save — the person is signed out everywhere. The **Sessions** block shows where the person is signed in (device, browser or app, IP, sign-in method, activity, “sign in as” sessions): **“End”** signs out one device, **“Sign out everywhere”** ends them all at once without changing the password.

Any access change — groups, roles, status — also ends the user’s sessions, so they sign in again with the new rights.`,
      example: {
        title: 'An employee has left',
        body: 'Open their page, turn **Active** off and save — every session on their phone and laptop ends at once. Don’t delete the account: their tasks, messages and history keep the right author. Any API tokens they had stop working as well.',
      },
      note: 'You cannot change your own roles, groups or status — ask another administrator. An account with more rights than yours is read-only to you.',
    },
    {
      id: 'groups',
      title: 'Groups',
      body: `[Groups](/admin/groups) are teams and departments. Every member automatically gets all of the group’s **member roles**. A person can be in several groups — permissions add up.

One group is the **default**: new accounts join it when an administrator creates them without groups, or when they are created automatically on first sign-in through Active Directory, Google or Telegram. The default group cannot be deleted — make another group the default first.

With Active Directory, people can be added to portal groups automatically on sign-in — see “Sign-in methods”.`,
      example: {
        title: 'Let the sales team manage counterparties',
        body: `1. In [Roles](/admin/roles) create a role “Counterparties — manage” and tick “Counterparties admin”.
2. In [Groups](/admin/groups) create a “Sales” group (or open the existing one).
3. Tick the new role under “Member roles” and add the employees under “Members”.
4. Save. New sales people now only need to join the group — the rights follow.

Every employee can view the counterparties directory without this role; it is needed to change any card and configure the module.`,
      },
      note: 'You cannot give a group a role you don’t hold yourself — such roles are greyed out.',
    },
    {
      id: 'roles',
      title: 'Roles and permissions',
      body: `A **permission** is one specific action: “Open the admin console”, “Manage users”, “Sign-in methods” and so on. The list is fixed; modules add their own (for example “Knowledge base admin”).

A **role** is a named set of permissions. It is given to a group (recommended) or directly to a person. A person’s effective permissions are the sum of all their roles, direct and via groups; you see them on the user page under **Effective access**.

Built-in roles:

- **Super administrator** — everything; cannot be edited or deleted.
- **Administrator** — users, groups, activity, branding, integrations.
- **Moderator** — helps users: profiles, password resets, blocking, activity.
- **Auditor** — read-only: users, activity, settings.
- **User** — personal cabinet only.

You can change the permissions of built-in roles — the changes survive upgrades. Your own roles can be created and deleted.`,
      example: {
        title: 'A role for an external auditor',
        body: 'Create an account for the auditor and add it to the “Auditors” group (with the Auditor role). They see users, the activity log and every setting but cannot change anything. When the audit ends, turn **Active** off.',
      },
      note: 'Safety rules: you can grant or remove only what you hold yourself; an administrator cannot create a super administrator; there is always at least one active super administrator — a change that would break this is refused.',
    },
    {
      id: 'activity',
      title: 'Security log',
      body: `The [Activity](/admin/activity) page shows security events for 90 days, with 24-hour counters at the top. Event types:

- **Failed login** and **Account lockout** — password guessing or a forgetful employee.
- **Disabled / Blocked account** — a sign-in attempt on a closed account.
- **IP on block-list** and **IP not on allow-list** — IP filter denials.
- **Login rate limit** — too many attempts from one address.
- **Code for unknown contact** and **Code delivery failed** — problems with sign-in codes.

The event type filter narrows the list. Each row has the time, username, IP address and details.`,
      example: {
        title: 'Someone is guessing passwords',
        body: 'The log shows dozens of failed sign-ins from one unknown IP under different usernames. Copy the address, open **Settings → IP filtering** and add it to the block list with the reason “password guessing”. To hear about this immediately, turn on security alerts in the Mattermost integration.',
      },
    },
    {
      id: 'branding',
      title: 'Appearance',
      body: `The **Project** and **Appearance** settings groups:

- **General** — portal name and description, logo (SVG, PNG, JPG or WebP up to 2 MB), a separate logo for the dark theme and the logo height in the header.
- **Color theme** — palette template, fine-tuning of colors (accent, background, text, statuses) and the default theme for people who haven’t chosen one.
- **Typography** — one of 28 font systems, base size and heading weight.
- **Menu icons** — colored tiles or monochrome glyphs, and an icon for every menu item.

Every change shows to you as a live preview. Others see it only after you press Apply / Save.`,
      note: 'If your logo is dark, upload a light version “For the dark theme” — otherwise it disappears on the dark background.',
    },
    {
      id: 'regional',
      title: 'Region and time',
      body: `In [Settings → General](/admin/settings/general), the **Region and time** block sets the portal’s **time zone**, **date format**, **time format** and **first day of the week**.

- The portal’s time zone decides “today”, “end of day” deadlines, reminders, quiet hours and dates in e-mails — for everyone who hasn’t chosen their own zone.
- Date and time formats are how dates look on screen and in notifications; the first day of the week is used in calendars and date pickers.
- Each person may override any of them in [Account → Appearance](/account/appearance).

The bottom of the block shows how dates will look.`,
      note: 'Change the portal’s time zone with care: for everyone without their own zone, reminder times and quiet hours move. Saved meetings and deadlines stay the same moments — only how they are shown changes.',
    },
    {
      id: 'languages',
      title: 'Interface languages',
      body: `In [Settings → Languages](/admin/settings/languages) a **superadministrator** decides which languages people may choose: Russian, English, Kyrgyz, Turkish and Chinese.

- Switch languages on or off; at least one stays on. Drag them to set the order the language switchers show them in — in the header, on the sign-in page, in the profile and on public pages.
- **Default language** — for guests and for people who have not chosen one: a fixed language, or **browser language** — the first of the visitor’s browser languages that is switched on, else the fallback language you pick.
- A person’s own choice always wins while that language is on. Switch it off and they get the default; notifications and e-mails follow the same rule.

The tag next to a language shows how much of the interface is translated; anything not translated yet appears in English.`,
      note: 'Other administrators see this page but cannot change it.',
    },
    {
      id: 'signin',
      title: 'Sign-in methods',
      body: `The **Security → Sign-in methods** screen decides how people get in. The sign-in page shows only methods that are enabled **and** whose integration is configured; each method shows whether its integration is ready, with a link to set it up.

- **Username and password** — the classic way. If you turn it off, super administrators can still use their password — a break-glass entrance.
- **Google** — a Google or Google Workspace account, optionally limited to company domains.
- **Active Directory / LDAP** — domain username and password. Accounts can be created automatically and directory groups mapped to portal groups.
- **Telegram Login** — one tap; the person links Telegram in their profile first.
- **One-time codes** — 6 digits via WhatsApp, email, Telegram or Mattermost. A code lives 5 minutes and allows 5 attempts.
- **Sign-in links (magic link)** — a one-click link instead of a code, valid for 15 minutes.`,
      example: {
        title: 'Sign-in with the domain account',
        body: `1. **Integrations → Active Directory**: domain controller, service account and Base DN, then Test connection.
2. **Sign-in methods**: enable Active Directory and “Create accounts automatically”.
3. Under “Directory group mapping” add rows: \`Sales\` → “Sales”, \`Portal Admins\` → “Administrators”.

Employees now sign in with their domain login (\`ivanov\` or \`ivanov@corp.local\`), the account is created automatically, and on every sign-in they are added to portal groups according to their AD groups.`,
      },
      note: 'Telegram auto-provisioning creates an account for any unknown Telegram user — keep it off for a closed corporate portal.',
    },
    {
      id: 'site-access',
      title: 'Site access',
      body: `The **Security → Site access** screen:

- **Closed** mode — guests see the sign-in form straight away; nothing is shown without signing in. Right for most corporate portals.
- **Open** mode — the public home page is visible to everyone, but the cabinet, modules and the console still require sign-in.

The same screen sets the **Home page** — what opens at the site’s address: the welcome page or one of the enabled modules (for example Dashboard or Online resources).`,
    },
    {
      id: 'login',
      title: 'Sign-in, lockouts and sessions',
      body: `The **Security → Sign-in & sessions** screen:

- **Failed attempts before lockout** (3–30, default 8) and **Lockout duration** (5–180 minutes, default 15). Counted separately per username and per IP address: guessing from one address locks that address; guessing one username from many addresses locks that username.
- **Session lifetime** (1–90 days, default 7) — after how many days people must sign in again. Applies to new sign-ins.

Failed code sign-ins also count towards lockouts and appear in the log.`,
      note: 'An attacker who knows someone’s username can trigger their lockout. If an employee complains about being locked out, check the log — the attacker’s address may belong on the block list.',
    },
    {
      id: 'ip',
      title: 'IP filtering',
      body: `The **Security → IP filtering** screen lets people in or keeps them out by address:

- **Block list** — listed addresses are refused. The block list always wins.
- **Allow-list mode** — only listed addresses are let in; everyone else is refused.

A rule is a single address (IPv4 or IPv6) or an IPv4 network in CIDR form, e.g. \`10.0.0.0/8\` or \`192.168.1.0/24\`, with an optional reason. The server’s own address is always allowed.

The portal refuses a change that would cut you off: first add your own address to the allow list with **Allow my IP**.`,
      example: {
        title: 'Office-only access',
        body: `1. Get the external office and VPN addresses from your network administrator, e.g. \`203.0.113.10\` and the network \`198.51.100.0/24\`.
2. Add them to the allow list with reasons “Office” and “VPN”. Press “Allow my IP” if you are not in the office.
3. Turn on **Allow-list mode** and save.

People working from home now get in only through the VPN.`,
      },
      note: 'CIDR networks are supported for IPv4 only; IPv6 addresses must be exact.',
    },
    {
      id: 'integrations',
      title: 'Integrations',
      body: `All integrations are off by default. Each has an Enabled switch, connection fields and a **Test connection** button. Passwords, tokens and keys are kept on the server only: once saved, the field shows “Saved — type to replace”; leave it empty to keep the value.

- **Email (SMTP)** — sign-in codes and links, notifications. Host, port, SSL/TLS (on for port 465, off for 587), user, password, sender.
- **Telegram bot** — Telegram Login and codes in Telegram. Token from @BotFather; the bot name fills in after the test. Run \`/setdomain\` in @BotFather with the portal’s address.
- **WhatsApp Gateway** — your WhatsApp gateway: address and API key (one key = one sender number).
- **Wazzup** — WhatsApp, Telegram, Instagram and more through one account. Enter the API key, load channels and choose a channel per messenger.
- **Mattermost** — sign-in codes as a direct message from a bot and security alerts to a channel.
- **Google** — Google sign-in, Google Calendar for users and sending email through Gmail.
- **Document conversion** — the Collabora / LibreOffice server address for viewing Office files as PDF.
- **Active Directory** — domain controller, service account, Base DN.`,
      example: {
        title: 'WhatsApp sign-in codes with a fallback',
        body: `1. Set up and test **WhatsApp Gateway** and **Wazzup** (pick a WhatsApp channel in Wazzup).
2. In **Sign-in methods** turn on “Code in WhatsApp”, choose the main provider under “Send through” and turn on the fallback.
3. Make sure employees have their phone in international format in the profile.

If the main provider fails, the code goes through the other one, and the failure shows in the log as “Code delivery failed”.`,
      },
    },
    {
      id: 'modules',
      title: 'Modules',
      body: `Modules are the portal’s apps: Dashboard, Counterparties, Online resources, File server, Files, Knowledge base, Tasks, Chat, Calendar. The **Modules** screen has a switch for each.

- An **enabled** module appears in the apps menu and the header.
- A **disabled** module disappears everywhere; its addresses and public links answer “not found”. **Data is kept** — turning it back on restores everything.

Most modules have their own settings (the Settings link on the card): upload limits, who may change counterparty cards, the DaData key and so on. This needs the “Modules” permission.`,
      note: 'Managing a module’s content is a separate permission in roles: “Knowledge base admin”, “Counterparties admin” and so on. It is unrelated to turning modules on.',
    },
    {
      id: 'system',
      title: 'System and limits',
      body: `The **System** screen shows the portal version, environment, uptime, time zone and database status — useful when contacting support.

The **API rate limit** block protects the portal from overload:

- **Guests: requests per IP** — 300 per window by default.
- **Signed-in: requests per person** — 5000 by default; colleagues behind one office IP don’t share a budget.
- **Window** — the counting period, 15 minutes by default.

Page loads, file views and sign-in are not counted. Limits apply at once; a new window applies after a server restart. API token limits are set separately under API & integrations.`,
    },
  ],
  faq: [
    {
      q: 'What’s the difference between Disabled and Blocked?',
      a: 'Both prevent sign-in and end sessions. “Active: off” is the usual state for people who have left. “Blocked” flags a problem (suspected compromise, violation); such sign-in attempts are logged separately.',
    },
    {
      q: 'Why can’t I grant a role or edit a user?',
      a: 'You can grant only permissions you hold yourself, and accounts with more rights than yours are read-only. You also cannot change your own roles, groups or status — ask another administrator.',
    },
    {
      q: 'I turned on the allow list and can’t get in. What now?',
      a: 'The portal refuses a rule that would cut off your current address, but if you come from another network, ask a colleague on an allowed network to add your IP. The server itself (localhost) is always allowed.',
    },
    {
      q: 'An employee doesn’t receive a sign-in code. Where do I look?',
      a: 'Check the phone (international format), email (must not be shared) or Mattermost username on their page. Then look at [Activity](/admin/activity): “Code for unknown contact” means the portal couldn’t match the person, “Code delivery failed” means the integration failed.',
    },
    {
      q: 'Telegram says “Bot domain invalid”',
      a: 'In @BotFather run `/setdomain`, choose your bot and enter the portal’s domain (for example `portal.company.com`).',
    },
    {
      q: 'Is data lost when a module is turned off?',
      a: 'No. The module just becomes invisible and unreachable. Turn it back on and all data and links work again.',
    },
    {
      q: 'Can password sign-in be turned off completely?',
      a: 'For regular users, yes. Super administrators keep password sign-in as a break-glass entrance, so a broken directory or messenger never locks everyone out.',
    },
    {
      q: 'How do I make someone an administrator?',
      a: 'Add them to the “Administrators” group (or any group with the Administrator role). Only a super administrator can appoint another super administrator.',
    },
  ],
  fields: {
    notifyChannels: {
      title: 'Notification channels',
      text: 'A channel delivers notifications when its integration is set up and it is on here. The bar shows how many people have the needed contact.',
      more: 'notifications',
    },
    notifyWhatsapp: {
      title: 'WhatsApp for notifications',
      text: 'Choose the provider separately from sign-in codes: e.g. codes through the gateway and notifications through Wazzup, with a fallback.',
      more: 'notifications',
    },
    regional: {
      title: 'Region and time',
      text: 'Time zone and formats for the whole portal. Each person may choose their own in Account → Appearance.',
      more: 'regional',
    },
    groups: {
      title: 'Groups',
      text: 'The main way to grant access: the person gets all roles of their groups. When they change department, just change the group.',
      more: 'groups',
    },
    directRoles: {
      title: 'Direct roles',
      text: 'For exceptions only — e.g. one person needs access their department doesn’t have. Direct roles and group roles add up.',
      more: 'roles',
    },
    blocked: {
      title: 'Active and Blocked',
      text: 'Both keep the person out and end their sessions at once. “Active: off” is for people who left, “Blocked” for a suspected compromise or violation.',
      more: 'user-access',
    },
    sessions: {
      title: 'Sign out everywhere',
      text: 'Ends the user’s sessions on every device without changing the password. A password reset or access change does this automatically.',
      more: 'user-access',
    },
    defaultGroup: {
      title: 'Default group',
      text: 'New accounts without explicit groups land here — created manually or automatically via AD, Google or Telegram. Give it minimal rights.',
      more: 'groups',
    },
    groupRoles: {
      title: 'Member roles',
      text: 'Every member gets all ticked roles. You cannot give roles you don’t hold yourself.',
      more: 'groups',
    },
    permissions: {
      title: 'Permissions',
      text: 'Each row is one action. A role grants the sum of ticked permissions; locked rows are permissions you don’t hold.',
      more: 'roles',
    },
    accessMode: {
      title: 'Access mode',
      text: '“Closed” — guests see only the sign-in form. “Open” — guests see the home page; everything else still needs sign-in.',
      more: 'site-access',
    },
    lockout: {
      title: 'Brute-force protection',
      text: 'After the set number of failed attempts in a row, the username or IP address is locked for the given time. Usernames and IPs are counted separately.',
      more: 'login',
    },
    sessionDays: {
      title: 'Session lifetime',
      text: 'How many days after sign-in a person has to sign in again. Applies to new sign-ins.',
      more: 'login',
    },
    whitelist: {
      title: 'Allow-list mode',
      text: 'Lets in only allow-listed addresses. Add your own address first with “Allow my IP”, or the portal won’t enable it.',
      more: 'ip',
    },
    ipRules: {
      title: 'IP rules',
      text: 'A single address (IPv4 or IPv6) or an IPv4 network like `10.0.0.0/8`. The block list always beats the allow list.',
      more: 'ip',
    },
    groupMap: {
      title: 'Directory group mapping',
      text: 'On every sign-in a member of the AD group is added to the chosen portal group. Enter the group name (CN) or full DN. Manually added groups are kept.',
      more: 'signin',
    },
    magicLink: {
      title: 'Sign-in links',
      text: 'Instead of a 6-digit code the person gets a one-click link through the same channel. It is single-use and valid for 15 minutes.',
      more: 'signin',
    },
    smtp: {
      title: 'Email (SMTP)',
      text: 'Turn SSL/TLS on for port 465 and off for 587. Many providers need an app password, not the mailbox password.',
      more: 'integrations',
    },
    telegramBot: {
      title: 'Telegram bot',
      text: 'Paste the token from @BotFather and press Test connection — the bot name fills in. Don’t forget `/setdomain` in @BotFather.',
      more: 'integrations',
    },
    whatsappGateway: {
      title: 'WhatsApp Gateway',
      text: 'Your gateway’s address and an API key from its admin. Each key is tied to one number — codes are sent from it.',
      more: 'integrations',
    },
    wazzup: {
      title: 'Wazzup',
      text: 'The API key from Wazzup (Integrations → API). After loading channels, choose the channel to use for each messenger.',
      more: 'integrations',
    },
    mattermost: {
      title: 'Mattermost',
      text: 'Server address and bot account token. For alerts, add the bot to a channel and enter the channel ID (26 characters), not its name.',
      more: 'integrations',
    },
    documents: {
      title: 'Document conversion',
      text: 'A Collabora / LibreOffice server address reachable from the portal server. Documents stay inside your network and are not kept on the converter.',
      more: 'integrations',
    },
    activeDirectory: {
      title: 'Active Directory',
      text: 'Port 389, or 636 with TLS. The service account only needs to search users. The test performs a real bind and a search under the Base DN.',
      more: 'integrations',
    },
    rateLimit: {
      title: 'Rate limit',
      text: 'Overload protection: guests are counted per IP, signed-in people per account. If people see “too many requests”, raise the limit.',
      more: 'system',
    },
  },
  related: [
    'api',
    'account',
    'notifications',
  ],
};
