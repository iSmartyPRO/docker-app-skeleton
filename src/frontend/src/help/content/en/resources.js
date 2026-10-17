export default {
  id: 'resources',
  icon: 'compass',
  title: 'Online resources',
  tagline: 'All company services — mail, CRM, HR forms, the website — as tiles in one place.',
  summary: 'Online resources is a board of links to work services. Find what you need by search or category, and arrange the tiles your own way. It is often the page that opens at the portal’s address.',
  highlights: [
    {
      icon: '🧭',
      title: 'One click away',
      text: 'Mail, CRM, the knowledge base and other services as tiles with clear icons.',
    },
    {
      icon: '🔎',
      title: 'Search and categories',
      text: 'Search by title, description or address; filter with category chips.',
    },
    {
      icon: '🧩',
      title: 'Your own layout',
      text: 'Drag tiles into your order and hide the ones you don’t need — only you see it.',
    },
    {
      icon: '💾',
      title: 'On every device',
      text: 'Once signed in, your layout is kept on the server and is the same on computer and phone.',
    },
    {
      icon: '🛡',
      title: 'Right links for each person',
      text: 'The administrator decides who sees a resource: everyone, employees or selected people.',
    },
    {
      icon: '🌐',
      title: 'In your language',
      text: 'Titles and descriptions appear in the language you use, when the administrator has written them in it.',
    },
  ],
  tips: [
    'Start typing in “Find a resource” — the tiles filter instantly.',
    'The ↗ mark on a tile means the link opens in a new tab.',
    'Hid a tile by mistake? “Customize” → “Hidden” → click it to bring it back.',
    'Sign in so your layout follows you to every device, not just this browser.',
    'Put your most-used services in the first row — they are visible right when the portal opens.',
    'Missing a service? Ask the portal administrator to add it to the catalogue.',
  ],
  sections: [
    {
      id: 'tiles',
      title: 'Tiles',
      body: `Each resource is a tile with an icon, a title, a short description and the address.

- **↗** next to the address — the link opens in a new tab and the portal stays open.
- Tiles of **portal modules** (Tasks, Calendar, Knowledge base and others) open right here in the portal.
- If a portal module is switched off, its tile disappears and comes back when the module is on again.

Above the tiles is a greeting for the time of day. The administrator can choose compact tiles and hide descriptions.`,
    },
    {
      id: 'search',
      title: 'Search and categories',
      body: `The **“Find a resource”** field searches titles, descriptions and addresses. The category chips above the tiles (e.g. “Work”, “HR”, “IT”) leave only that category; **“All”** clears the filter.

Search and categories can be combined.`,
      example: {
        title: 'Finding the leave form',
        body: 'Click the **“HR”** category and type “leave” — the “Leave request” tile remains, even if the word is only in its description.',
      },
      note: 'If you don’t see search and categories, the administrator has turned them off in the module settings.',
    },
    {
      id: 'layout',
      title: 'Your own layout',
      body: `The **“Customize”** button turns on edit mode. There you can:

- drag tiles with the mouse, or on a phone after a short press;
- reorder with the keyboard;
- hide what you don’t need with **“Hide”** — hidden tiles gather in the **“Hidden”** block;
- return to the administrator’s order with **“Reset to default”**.

Click **“Done”** when finished. Only you see your layout.`,
      steps: [
        'Click **“Customize”** above the tiles.',
        'Drag the tiles into the order you like.',
        'Click **“Hide”** on tiles you don’t need.',
        'Click **“Done”** — the layout is saved.',
      ],
      example: {
        title: 'An accountant sets up the board',
        body: 'Maria puts “1C”, “Bank client” and “Mail” in the first row and hides “Company website” and “Developer wiki”. In the morning she opens the portal on her laptop and sees the same board as yesterday at work.',
      },
      note: '**Where the layout is kept.** Signed in — on the server, on every device. For guests — only in this browser. New resources appear at the end of your layout; removed ones simply disappear.',
    },
    {
      id: 'visibility',
      title: 'Who sees which resource',
      body: `Each resource has a **“Who sees it”** setting:

- **Everyone** — including guests who are not signed in, if the site is open;
- **Employees** — everyone signed in;
- **Selected** — chosen users, groups and roles.

The **“Show”** switch hides a resource from everyone without deleting it. Resource administrators see everything.`,
      example: {
        title: 'A link for the sales team only',
        body: 'The administrator adds “CRM”, picks **“Selected”** and chooses the “Sales” group. Sales managers see the tile; other employees and guests don’t.',
      },
      note: 'Can’t see a resource a colleague sees? It is probably limited to a group — ask the administrator.',
    },
    {
      id: 'icons',
      title: 'Icons',
      body: `The icon is picked when creating a resource — the preview shows the tile on light and dark backgrounds. Sources:

- **Icons** — thousands of line icons with search (mail, chart, truck…);
- **Brands** — service logos in brand colours (Gmail, Jira, Telegram…);
- **Your own** — PNG, SVG, WebP or JPEG up to 1 MB, optionally a separate dark-theme version;
- **Portal** — the portal’s menu and module icons;
- **Letter** — one or two characters on a coloured tile.

Styles: **Gradient**, **Soft**, **Solid**, **Plain**. Colour from the palette or any, optionally separate for the dark theme.`,
      note: 'Some brands (e.g. Slack, Microsoft) are not in the library — upload their logo under “Your own”.',
    },
    {
      id: 'admin',
      title: 'Managing resources (administrators)',
      body: `The **“Manage”** button on the board opens the **resource catalogue**. You need the “Manage online resources” permission.

- **“Add resource”** — a link or a portal module;
- **“Add modules”** — several portal modules in one click, with their icons and colours;
- dragging rows by ⋮⋮ sets the **default order** — everyone sees it until they arrange their own;
- **categories** — a name in both languages and a colour; deleting a category leaves its resources without one.

A resource’s title and description are filled on the **Русский / English** tabs (✓ marks filled ones). If one language is empty, the other is shown.`,
      steps: [
        'Open **“Manage”** → **“Add resource”**.',
        'Choose **“Link”** and enter the address, or **“Portal module”** and pick the module.',
        'Fill in the title and description in both languages.',
        'Set the category, how it opens and **“Who sees it”**.',
        'Pick an icon on the right and click **“Save”**.',
      ],
      example: {
        title: 'Adding corporate mail',
        body: 'Address `https://mail.company.com`, title “Corporate mail”, category “Work”, **“Employees”**, an icon from “Brands” or the letter “M” in “Gradient” style. Opens — **“In a new tab”**.',
      },
      note: 'An address can be `https://…`, `mailto:`, `tel:` or a portal page such as `/app/kb`. Other kinds of links are refused for safety.',
    },
    {
      id: 'settings',
      title: 'Module settings and home page',
      body: `In **Settings → Modules → Online resources** the administrator sets:

- the **Heading** and **Subheading** above the tiles;
- **Tile size** — comfortable or compact;
- **Show descriptions**;
- **Search and categories**;
- **Personal layout** — whether people may reorder and hide tiles.

To show the board at the site’s address, choose “Online resources” in **Settings → Site access → Home page**. Guests see “Everyone” resources if the site is open.`,
    },
  ],
  faq: [
    {
      q: 'I hid a tile. How do I get it back?',
      a: 'Click **“Customize”**, open the **“Hidden”** block and click the resource.',
    },
    {
      q: 'Do colleagues see my layout?',
      a: 'No. Your order and hidden tiles are yours only. Others see their own layout or the administrator’s order.',
    },
    {
      q: 'My layout is different on another computer. Why?',
      a: 'You probably arranged the board without signing in — then it is kept only in that browser. Sign in and arrange it again: from then on it is shared across devices.',
    },
    {
      q: 'There is no “Customize” button.',
      a: 'The administrator has turned off **personal layout** — everyone sees the same order.',
    },
    {
      q: 'A portal module tile (e.g. “Tasks”) disappeared.',
      a: 'The module is switched off in the portal settings. The tile comes back when the module is on again.',
    },
    {
      q: 'How do I add my own resource?',
      a: 'Resources are added by an administrator — send them the address, a title and who needs it. If you have “Manage online resources”, see [Managing resources](/help/resources#admin).',
    },
  ],
  fields: {
    url: {
      title: 'Address',
      text: 'Where the tile leads: `https://…`, `mailto:`, `tel:` or a portal page such as `/app/kb`. Other links are refused.',
      more: 'admin',
    },
    category: {
      title: 'Category',
      text: 'People filter the board by category with the chips above the tiles. “No category” is fine too.',
      more: 'search',
    },
    visibility: {
      title: 'Who sees it',
      text: '**Everyone** — guests too; **Employees** — everyone signed in; **Selected** — the chosen people, groups and roles.',
      more: 'visibility',
    },
    active: {
      title: 'Show',
      text: 'Turn off to hide the resource from everyone for now, without deleting it or its settings.',
      more: 'visibility',
    },
    personalize: {
      title: 'Personal layout',
      text: 'On — everyone can reorder and hide tiles for themselves. Off — everyone sees the catalogue order.',
      more: 'layout',
    },
  },
  related: [
    'start',
    'dashboard',
  ],
};
