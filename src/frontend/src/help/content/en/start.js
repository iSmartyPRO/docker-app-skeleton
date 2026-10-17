export default {
  id: 'start',
  icon: 'rocket',
  title: 'Getting started',
  tagline: 'How to sign in, where things are and how to find what you need fast',
  summary: 'The portal is one workplace: tasks, calendar, chats, files and other apps open from the same header. This guide covers signing in, the layout of the screen, installing the portal on your phone and what to do when something goes wrong.',
  highlights: [
    {
      icon: '🔑',
      title: 'Easy sign-in',
      text: 'Password, corporate login, Google, Telegram or a one-time code — whatever your administrator enabled.',
    },
    {
      icon: '🧭',
      title: 'Everything from the header',
      text: 'Help, chats, notifications, apps and your profile sit in the top-right corner of every page.',
    },
    {
      icon: '🧩',
      title: 'Apps',
      text: 'The nine-dot icon opens every part of the portal: tasks, calendar, files and more.',
    },
    {
      icon: '📱',
      title: 'Like an app',
      text: 'Install the portal on your phone or computer: its own icon, full screen and push notifications.',
    },
    {
      icon: '🌗',
      title: 'Language and theme',
      text: 'The interface language and a light or dark theme — switched in the header with one click.',
    },
    {
      icon: 'ⓘ',
      title: 'Hints everywhere',
      text: 'The ⓘ icon next to a field explains it; the ? key opens help for the current page.',
    },
  ],
  tips: [
    'Press ? on any page to open help for that very page.',
    'Fill in your email and phone in the profile — then you can sign in with a code if you forget your password.',
    'Install the portal on your phone to get push notifications about tasks and meetings.',
    'The nine-dot icon in the header is the fastest way into any app.',
    'If a page seems stuck, first just reload it (F5, or pull down on a phone).',
  ],
  sections: [
    {
      id: 'sign-in',
      title: 'Signing in',
      body: `The sign-in page shows only the methods your administrator enabled. Most often:

- **Password** — username and password. If the company uses Active Directory, your usual work login and computer password will do.
- **Sign in with Google** — the button above the tabs, one click with your work Google account.
- **Telegram** — confirm the sign-in in Telegram without a password, or get a code from the portal bot.
- **Email**, **WhatsApp**, **Mattermost** — the portal sends a 6-digit code (or a sign-in link) to the contact in your profile.

A code is valid for 5 minutes and works once; a sign-in link — for 15 minutes. You are signed in as soon as you type the last digit. The portal remembers your method and opens the same tab next time.`,
      steps: [
        'Open the portal address in your browser.',
        'Pick the tab with your sign-in method (or press “Sign in with Google”).',
        'Enter your username and password — or your email, phone, Telegram/Mattermost name and press “Get code”.',
        'Type the 6 digits from the message — you are signed in automatically.',
      ],
      example: {
        title: 'Forgot your password',
        body: 'Anna forgot her password, but her profile has her work email. On the sign-in page she opens the “Email” tab, enters the address and presses “Get code”. A minute later an email with 6 digits arrives — she types them and is in. Then she sets a new password in “Account → Security”.',
      },
      note: 'Codes go only to the contacts in your profile. Never share a code — portal staff never ask for it by phone or in chat.',
    },
    {
      id: 'home',
      title: 'Home page',
      body: `Your administrator decides what the home page shows. It can be:

- **Dashboard** — your day at a glance: tasks, meetings, files and numbers;
- another portal app, such as “Tasks” or “Resources”;
- a start page with “Open account” and “Administration” buttons.

You can always get back home by clicking the logo and portal name in the top-left corner.`,
    },
    {
      id: 'header',
      title: 'The header: where things are',
      body: `The header is the same on every page. On the left is the logo (it leads home). On the right, in order:

- **Flag** and **Theme** — switch the interface language (Russian/English) and light/dark theme;
- **?** — help for the current page;
- **Chats** — recent conversations and a link to the messenger;
- **Bell** — notifications; the number shows how many are unread;
- **Nine dots** — every portal app;
- **Four squares** — the administrator console (administrators only);
- **Avatar with your name** — a menu: “Account”, “Install the app”, “Sign out”.`,
      note: 'On a narrow phone screen some labels hide and only icons remain — the order is the same.',
    },
    {
      id: 'apps',
      title: 'Opening apps',
      body: `The portal is made of apps: “Dashboard”, “Tasks”, “Calendar”, “Chats”, “Files”, “Knowledge base” and others. Which ones you see depends on what your administrator enabled and on your permissions.

There are two ways to open an app:

- click the nine-dot icon in the header and pick the app from the grid;
- at the bottom of that grid click “All apps →” — the [Apps](/apps) page opens with tiles and a short description of each.`,
      example: {
        title: 'A bookmark to the right place',
        body: 'Sergey starts every day with his tasks. He opens “Tasks” via the nine dots and bookmarks the page in his browser. Now tasks open straight away, with no extra clicks.',
      },
      note: 'Can’t see an app you need? It is probably turned off or you have no access to it — ask your administrator.',
    },
    {
      id: 'search',
      title: 'Quick search (Ctrl+K)',
      body: `In the administrator console press **Ctrl+K** (**⌘K** on a Mac) to open quick navigation. Start typing the name of a page or setting — for example “users” or “theme” — pick a line with the arrow keys and press Enter. Esc closes the window.

Elsewhere in the portal use the nine-dot icon to jump between apps, and the search inside each app (tasks, files, knowledge base).`,
      example: {
        title: 'Find a setting in a second',
        body: 'An administrator needs to add an employee. He presses Ctrl+K, types “use”, hits Enter — and lands on the “Users” page right away.',
      },
      note: 'The quick search window exists only in the administrator console. Regular staff do not need it — everything they can use opens from the header.',
    },
    {
      id: 'language-theme',
      title: 'Language and theme',
      body: `The language and theme switches are in the header, to the left of the “?” icon. Changes apply at once.

To keep the choice in your account on every device, set it in [Account → Appearance](/account/appearance):

- **Language**: “As the portal”, “Русский” or “English”;
- **Theme**: “Light”, “Dark” or “System” — follows your phone or computer setting.`,
    },
    {
      id: 'install',
      title: 'Installing on your phone and computer',
      body: `You can install the portal as an app — no App Store or Google Play. You get an icon on the screen, the portal opens full screen and can send push notifications.

Step-by-step instructions with pictures for your device are on the [Install the app](/install) page. You can also open it from the menu under your avatar or from the sign-in page.

**What changes in the installed app:**

- there is no address bar and no browser buttons;
- so a **Back** button (an arrow) appears on the left of the header — it returns to the previous screen;
- the app icon shows the number of unread notifications;
- updates arrive on their own, nothing needs reinstalling.`,
      steps: [
        'iPhone: open the portal in Safari → Share → “Add to Home Screen” → Add.',
        'Android: open the portal in Chrome → ⋮ menu → “Install app” → Install.',
        'Computer (Chrome, Edge, Yandex Browser): the install icon on the right of the address bar.',
        'Open the app from its icon and turn on notifications in “Account → Notifications”.',
      ],
      example: {
        title: 'A link from Telegram won’t install',
        body: 'A colleague sent the portal link in Telegram; it opened inside the messenger and there is no install button. Tap ⋯ → “Open in browser” (Safari on iPhone or Chrome on Android) and install from there.',
      },
      note: 'On iPhone push notifications work only in the installed app and on iOS 16.4 or later.',
    },
    {
      id: 'bell-chat',
      title: 'Notifications and chats in the header',
      body: `The **bell** collects everything that concerns you: new assignments, comments and mentions, meeting invitations, deadline reminders. The number on it is the unread count. The panel has “All” and “Unread” tabs and a “Mark all read” button; clicking a notification opens the task or event. Notifications are kept for 120 days.

You can also receive them by email, Telegram, Mattermost and push — set this up in [Account → Notifications](/account/notifications). More in the [Notifications](/help/notifications) guide.

The **chats icon** next to it shows recent conversations and leads to the “Chats” app.`,
      note: 'You are never notified about your own actions: if you assign a task to yourself, the bell stays quiet.',
    },
    {
      id: 'help',
      title: 'Using the help',
      body: `Help is built into the portal and always at hand:

- **ⓘ next to a field** — hover or tap it for a short explanation and a “More” link to the right part of the guide;
- **the ? key** (or the **?** icon in the header) — opens help for the page you are on;
- **Help center** [/help](/help) — every guide, questions and answers, and a search across the help.

Each guide starts with a short “What you can do” and “Tips”, followed by detailed topics with examples and questions and answers.`,
      example: {
        title: 'Find an answer with search',
        body: 'You want to know how to share a folder. Open the [Help center](/help), type “share a folder” — the search shows the right topic in the files guide.',
      },
      note: 'The ? key does nothing while you are typing in a field — click an empty spot on the page and press it again.',
    },
    {
      id: 'troubleshooting',
      title: 'If something does not work',
      body: `Most problems are solved in a minute:

1. **Reload the page** — F5 (⌘R on a Mac) or pull down on a phone. If you see “A new version is available”, press “Reload”.
2. **Sign out and back in** — the menu under your avatar → “Sign out”.
3. **Check your connection** — offline, the installed app shows a “no connection” screen.
4. **Try another browser** — an up-to-date Chrome, Edge, Safari or Yandex Browser.

If that does not help, contact the portal administrator or your company’s IT support. Describe what you did, what you expected and what you saw; attach a screenshot.`,
      note: 'Your data lives on the server: reloading, signing out or reinstalling the app deletes nothing.',
    },
  ],
  faq: [
    {
      q: 'How do I update the app on my phone?',
      a: `The portal updates itself. When a new version is out, a **“A new version is out”** banner appears at the bottom — tap “Update”. If the app was in the background for a while it updates on its own when you come back, otherwise on the next page change.

If something still looks old, close the app completely (swipe it away from recent apps) and open it again.`,
    },
    {
      q: 'It says “Invalid username or password” although I type it correctly.',
      a: 'Check the keyboard layout and Caps Lock. If you really forgot the password, sign in with a code by email or Telegram (if enabled) and set a new one in “Account → Security”. Otherwise ask an administrator to reset it.',
    },
    {
      q: 'It says “Too many failed attempts”.',
      a: 'Sign-in is temporarily blocked to protect against password guessing. Wait a few minutes and try again, or use another method.',
    },
    {
      q: 'The sign-in code does not arrive.',
      a: 'The code goes only to the contact in your profile. Check your spam folder and that the number or address is right; for Telegram — that it is linked in “Account → Security” and the bot is not blocked. New employees should ask an administrator to add their phone or email.',
    },
    {
      q: 'Where is the app a colleague has?',
      a: 'Click the nine dots in the header → “All apps”. If it is not there, you have no access to it; ask your administrator.',
    },
    {
      q: 'How do I go back in the installed app?',
      a: 'Tap the Back arrow on the left of the header. On Android the system back gesture or button works too.',
    },
    {
      q: 'Is it safe to install the portal on my phone?',
      a: 'Yes. It is the same website opened in its own window: it downloads nothing bypassing the stores and gets no access to your files. You remove it like any app.',
    },
    {
      q: 'Why don’t I have the administrator console icon?',
      a: 'Only staff with administrator rights see the console. You do not need it for everyday work.',
    },
    {
      q: 'The interface suddenly switched language. How do I change it back?',
      a: 'Click the language switch (RU · EN …) in the header, or choose the language in “Account → Appearance” and save — the choice is then kept on every device.',
    },
  ],
  fields: {},
  related: [
    'account',
    'notifications',
    'dashboard',
  ],
};
