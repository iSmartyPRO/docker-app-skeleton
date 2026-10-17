export default {
  id: 'account',
  icon: 'user',
  title: 'Profile',
  tagline: 'Your details, appearance, security and connected services',
  summary: 'In your account you set your name, email, phone and avatar, choose the language and theme, change your password and link Telegram and Google. These details decide how you can sign in and where notifications are delivered.',
  highlights: [
    {
      icon: '👤',
      title: 'Profile',
      text: 'Name, email, phone, Mattermost and avatar — how colleagues see you and how the portal recognises you at sign-in.',
    },
    {
      icon: '🎨',
      title: 'Appearance',
      text: 'Language and theme are stored in your account and apply on all your devices.',
    },
    {
      icon: '🔒',
      title: 'Security',
      text: 'Change your password and sign out of every other device with one button.',
    },
    {
      icon: '✈️',
      title: 'Telegram',
      text: 'A linked Telegram gives one-tap sign-in, codes from the bot and notifications in the messenger.',
    },
    {
      icon: '📅',
      title: 'Google',
      text: 'Sign in with Google and see your Google calendars next to the portal calendar.',
    },
    {
      icon: '🔔',
      title: 'Notifications and API',
      text: 'Notification channels and personal API tokens have their own account sections.',
    },
  ],
  tips: [
    'Add your work email and phone — a backup way to sign in if you forget your password.',
    'Enter your phone in international format: +996 700 123 456.',
    'A phone, e-mail or Mattermost name belongs to one account: if another account already has it, the portal will not save it — otherwise a code sign-in could not tell whose account it is.',
    'Link Telegram under “Security” to get notifications and sign in without a password.',
    'Remember to press “Save” at the bottom of the page — otherwise profile changes are not applied.',
    'Noticed a sign-in that was not you? Change your password and press “Sign out other devices”.',
  ],
  sections: [
    {
      id: 'open',
      title: 'Opening your account',
      body: `Click your avatar and name in the top-right corner and choose **“Account”**. A menu of sections appears on the left: “Profile”, “Appearance”, “Security”, “Notifications”, “Connected accounts” and, if you have the rights, “API tokens”.

On a phone the section menu collapses to icons — tap them the same way.`,
    },
    {
      id: 'profile',
      title: 'Profile: name, email, phone, avatar',
      body: `The [Profile](/account) section holds your details:

- **Display name** — how colleagues see you in tasks, chats and the calendar. Your username (@name) cannot be changed.
- **Email** — notifications and email sign-in codes go here.
- **Phone** — for WhatsApp sign-in codes, in international format. An invalid number is highlighted in red.
- **Mattermost** — your Mattermost username: the bot sends sign-in codes and notifications there.
- **Instagram** — optional.

Your **avatar** is changed with the “Change avatar” button at the top: JPG, PNG or WebP up to 1 MB. It is saved at once.

Other fields are saved with the **“Save”** button on the bar that appears at the bottom after your first change. “Discard” restores the previous values.`,
      steps: [
        'Open “Account” → “Profile”.',
        'Edit your name, email, phone or Mattermost.',
        'Press “Save” on the bar at the bottom.',
      ],
      example: {
        title: 'Sign in with a WhatsApp code',
        body: 'Marat often forgets his password. He enters +996 555 123 456 in the “Phone” field and saves. Now on the sign-in page he picks the “WhatsApp” tab, enters the number and gets a 6-digit code in WhatsApp.',
      },
      note: 'Email addresses must be unique: one address cannot be used in two accounts.',
    },
    {
      id: 'appearance',
      title: 'Appearance: language and theme',
      body: `In [Appearance](/account/appearance):

- **Language** — “As the portal” (the default your administrator chose), “Русский” or “English”;
- **Theme** — the basic “Light”, “Dark”, “As the system” and ready-made themes: Graphite, Ocean, Forest, Sand, Midnight, Lavender, High contrast. Picking a card previews the portal in it until you press “Save”.

After “Save” the choice is kept in your account and applies on every device. The sun/moon switch in the header toggles light and dark in this browser only. Your administrator decides which themes are offered.`,
    },
    {
      id: 'themes',
      title: 'Living themes and your own picture',
      body: `**Living themes** — Dawn, Aurora, Constellation — have a very slowly moving background. It stops while the tab is hidden or after a minute without activity, and stays still when your device asks for reduced motion or is low-powered. The **“No animation”** switch keeps it still.

**Your own theme**: pick the “Custom” card, upload a picture (JPEG, PNG, WebP or GIF, up to 8 MB and 4096 × 4096 pixels) and an accent colour. The server compresses the picture and makes a phone version; only you can see it. The picture is dimmed under text (the “Dimming” slider) and panels stay solid. A colour that would be hard to read is adjusted automatically.`,
    },
    {
      id: 'tours',
      title: 'Guided tours',
      body: `On your first sign-in the portal shows a short tour: the apps menu, “Waiting for me”, notifications, chat, help and your profile. Each app has its own tour the first time you open it. Use “Next” and “Back” or the arrow keys; Esc closes the tour. A tour only shows what you have access to.

To replay a tour, use the “Tour” button next to an app’s name or “Tour of this section” in help (the “?” key). To stop tours from starting by themselves: [Appearance → “Do not show tours”](/account/appearance).`,
    },
    {
      id: 'regional',
      title: 'Date and time',
      body: `In [Appearance → Date and time](/account/appearance) you can choose your own **time zone**, **date format**, **time format** (14:30 or 2:30 PM) and **first day of the week**. By default everything is “As the portal” — what your administrator set.

- The **time zone** affects everything: the times shown on tasks and meetings, when “today” and “tomorrow” begin, when reminders arrive and quiet hours start.
- **As on this device** takes the zone from your phone or computer. Handy when travelling: times switch to local by themselves.
- Dates without a time (a birthday, a deal’s close date) never shift when the zone changes.

The bottom of the block shows how dates will look. After “Save” the settings apply on all your devices.`,
    },
    {
      id: 'security',
      title: 'Security: password and sessions',
      body: `In [Security](/account/security):

**Password.** Enter your current password, a new one (at least 10 characters) and repeat it. After saving, all other devices are signed out — you will need to sign in there again.

If you have always signed in without a password (Telegram, Google, a code or Active Directory), you will see **“Set a password”** instead — no current password needed.

**Sessions.** Where you are signed in right now: device, browser and system, whether the portal runs as the installed **app** or in a **browser tab**, IP address, sign-in method and last activity. The current one is marked “This device”. **“End”** signs one device out, **“End all except this one”** signs out all the others. On a computer the Chrome/Edge app and the browser itself share one sign-in, so they show as one session marked “App and browser”.`,
      steps: [
        'Open “Account” → “Security”.',
        'Enter the current password, the new one and repeat it.',
        'Press “Save”.',
      ],
      example: {
        title: 'Forgot to sign out on another computer',
        body: 'Olga used the portal in a meeting room and did not sign out. From her laptop she opens “Security” and presses “Sign out other devices” — the meeting-room session closes at once.',
      },
      note: 'If you sign in with a corporate login (Active Directory), the password is changed in the company system, not in the portal — contact IT support.',
    },
    {
      id: 'telegram',
      title: 'Telegram',
      body: `The **Telegram** block is in [Security](/account/security) (it shows when the administrator has set up the bot). Linking Telegram lets you:

- sign in with one tap, without a password;
- receive sign-in codes from the portal bot;
- receive notifications in Telegram.

Press the **“Log in with Telegram”** button and confirm in the Telegram window — allow the bot to message you. Once linked, your @name appears; **“Unlink”** removes the link.`,
      steps: [
        'Open “Account” → “Security”.',
        'In the Telegram block press the blue Telegram button.',
        'Confirm and allow the bot to send you messages.',
        'Turn on the Telegram channel in “Account → Notifications”.',
      ],
      example: {
        title: 'Task notifications in Telegram',
        body: 'Ruslan rarely sits at a computer. He links Telegram under “Security”, then turns on the Telegram channel under “Notifications”. Now the bot messages him about every new assignment right away.',
      },
      note: 'If you blocked the bot in Telegram, codes and notifications stop arriving — unblock it.',
    },
    {
      id: 'connections',
      title: 'Connected accounts: Google and Mattermost',
      body: `In [Connected accounts](/account/connections) you connect **Google**:

- **Sign-in** — once connected, you can use the “Sign in with Google” button;
- **Calendar** — if the administrator enabled it, your Google calendars appear in the “Calendar” app. Tick which ones to show. “Read only” means the portal cannot add events to that calendar.

**“Disconnect”** turns off both Google sign-in and the calendar. If Google shows “Access revoked”, press “Allow Calendar access” again.

**Mattermost** needs no separate linking: just enter your Mattermost username in your [Profile](/account). The bot can then send you sign-in codes and notifications.`,
      steps: [
        'Open “Account” → “Connected accounts”.',
        'Press “Connect Google” and pick your work account.',
        'Allow Calendar access if Google asks.',
        'Tick the calendars you want to see in the portal.',
      ],
      note: 'If the section says “No external accounts are available”, Google is not set up in the portal — that is up to the administrator.',
    },
    {
      id: 'notifications',
      title: 'Notifications',
      body: `In [Notifications](/account/notifications) you choose where, besides the bell, assignments, comments, invitations and reminders are sent: email, Telegram, Mattermost or push on this device. If a channel is unavailable, it says what is missing and offers a “Fix” button.

Details are in the [Notifications](/help/notifications) guide.`,
    },
    {
      id: 'api',
      title: 'API tokens',
      body: `The [API tokens](/account/api) section is visible only to people the administrator gave this right. A token lets another program (a spreadsheet or a script, for example) work with the portal on your behalf within the access you choose.

A token is shown only once — store it safely and never paste it into a chat. More in the [API](/help/api) guide.`,
    },
  ],
  faq: [
    {
      q: 'Telegram notifications do not arrive.',
      a: 'Check two steps: 1) Telegram is linked in “Account → Security” (your @name is shown there); 2) the Telegram channel is on in “Account → Notifications”. Also make sure you have not blocked the portal bot in Telegram.',
    },
    {
      q: 'Email notifications do not arrive.',
      a: 'Add your email in “Profile” and save, then turn on the “Email” channel in “Notifications”. Check your spam folder.',
    },
    {
      q: 'My profile changes were not saved.',
      a: 'After editing, a bar with a “Save” button appears at the bottom — press it. If a field is highlighted in red (a wrong email or phone format, for example), fix it.',
    },
    {
      q: 'My avatar will not upload.',
      a: 'Only JPG, PNG or WebP up to 1 MB are accepted. Make the picture smaller or save it in another format.',
    },
    {
      q: 'Can I change my username?',
      a: 'No, the username (@name) is permanent. You can change your display name — that is what colleagues see.',
    },
    {
      q: 'After changing my password I was signed out on my phone.',
      a: 'That is by design: changing the password signs out all other devices for safety. Just sign in on the phone again with the new password.',
    },
    {
      q: 'It says “This Telegram is not linked yet”.',
      a: 'Sign in another way (password or code), open “Account → Security” and link Telegram. Next time Telegram sign-in will work.',
    },
    {
      q: 'I don’t see my Google Calendar meetings.',
      a: 'In “Connected accounts” check that Google has the green “Calendar” tag and tick the calendars you need. If the tag is orange, press “Allow Calendar access”.',
    },
  ],
  fields: {
    avatar: {
      title: 'Avatar',
      text: 'The photo colleagues see in tasks and chats. JPG, PNG or WebP up to 1 MB; saved at once.',
      more: 'profile',
    },
    email: {
      title: 'Email',
      text: 'Notifications and email sign-in codes go here. One address can belong to one account only.',
      more: 'profile',
    },
    phone: {
      title: 'Phone',
      text: 'For WhatsApp sign-in codes. Use international format, e.g. +996 700 123 456.',
      more: 'profile',
    },
    mattermost: {
      title: 'Mattermost',
      text: 'Your Mattermost username without @. The bot uses it to send sign-in codes and notifications.',
      more: 'connections',
    },
    language: {
      title: 'Language',
      text: '“As the portal” uses the administrator’s default. Your choice applies on all your devices.',
      more: 'appearance',
    },
    theme: {
      title: 'Theme',
      text: '“As the system” follows your phone or computer setting: light or dark. Ready-made and living themes and your own picture are chosen here too.',
      more: 'appearance',
    },
    regional: {
      title: 'Date and time',
      text: 'Your time zone and formats. “As the portal” matches everyone; “As on this device” uses your phone or computer zone, handy when travelling.',
      more: 'regional',
    },
    password: {
      title: 'Password',
      text: 'At least 10 characters. After a change all other devices are signed out.',
      more: 'security',
    },
    telegram: {
      title: 'Telegram',
      text: 'Linking enables one-tap sign-in, codes from the bot and notifications in Telegram.',
      more: 'telegram',
    },
    sessions: {
      title: 'Sessions',
      text: 'Where you are signed in: device, browser or app, IP and activity. End any sign-in you do not recognise.',
      more: 'security',
    },
    google: {
      title: 'Google',
      text: 'Sign in with Google and, if enabled, your Google calendars in the “Calendar” app.',
      more: 'connections',
    },
  },
  related: [
    'notifications',
    'start',
    'api',
  ],
};
