export default {
  id: 'qr',
  purpose: 'QR codes is a studio for branded QR codes: website, business card, Wi-Fi, text, e-mail, phone, SMS, WhatsApp, Telegram, a place on the map and an event. Employees make codes from company templates, with a logo and a scan check, and download them in print quality. Dynamic website codes let you change the address after printing and count scans.',
  audience: `- **Employees** — marketing, sales, office managers: business cards, guest Wi-Fi, codes for flyers and stands. Everyone has a personal library.
- **Template managers** (the «Manage QR templates» permission, which super administrators have) — prepare the looks and lock the brand style.`,
  setup: [
    {
      title: 'Switch the module on',
      text: 'The module is off by default. Switch it on in [Settings → Modules → QR codes](/admin/settings/qr).',
    },
    {
      title: 'Upload the company logo',
      text: 'In Settings → Appearance — light and dark variants. It is available at once in the Logo tab and in the «Brand» template.',
    },
    {
      title: 'Prepare the templates',
      text: 'The [Templates](/app/qr/templates) page already has 9 ready-made ones. Order them, star the default, hide the ones you do not need, create your own if needed and lock colours or the logo.',
    },
    {
      title: 'Decide what people may do',
      text: '«Change the design», «Upload own logos», «Dynamic codes» and «Codes per person» — in the [module settings](/admin/settings/qr).',
    },
    {
      title: 'Grant the template permission',
      text: 'Give «Manage QR templates» to marketing or a designer through roles; super administrators always have it.',
    },
  ],
  roles: {
    'qr.admin': 'The Templates page: create, edit, reorder, set the default, hide, delete and «Restore ready-made». The «What people may do» limits do not apply to these people.',
  },
  access: `Codes are personal: everyone sees and edits only their own. Templates are seen by everyone who makes codes; hidden templates only by managers.

**Module settings** ([/admin/settings/qr](/admin/settings/qr)):

- **Change the design** — off: codes look exactly like templates, only the content is chosen; «Own design» is unavailable.
- **Upload own logos** — off: only the company logo and icons can go in the centre.
- **Dynamic codes** — website codes with a short \`/q/…\` link: the address changes after printing, scans are counted.
- **Codes per person** — 500 by default, from 10 to 10,000.

**Template locks** (Colours, Shape, Logo, Frame) are enforced by the server: an employee without «Manage QR templates» cannot change what is locked in codes from that template, even bypassing the interface.`,
  scenarios: [
    {
      title: 'One brand style',
      text: 'Marketing keeps «Brand» as the default template (colours and logo locked) and turns «Change the design» off — every business card and flyer comes out in one style.',
    },
    {
      title: 'Guest Wi-Fi',
      text: 'The office manager makes a Wi-Fi code with a «Free Wi-Fi» frame and prints it for the reception desk — nobody has to dictate the password.',
    },
    {
      title: 'Advertising with a changeable address',
      text: 'Outdoor ads carry a dynamic website code. When the campaign ends, the address is switched to a new page, and the counter shows how many people scanned the banner.',
    },
  ],
  faq: [
    {
      q: 'What happens to printed codes if an employee deletes a code?',
      a: 'Static codes hold their content themselves and keep working. A dynamic code stops opening the link once it is deleted (or «Dynamic code» is turned off).',
    },
    {
      q: 'What if I turn «Dynamic codes» off in the settings?',
      a: 'New dynamic codes cannot be created, while existing ones keep working. But if an employee turns «Dynamic code» off on their code, they cannot turn it back on.',
    },
    {
      q: 'I deleted a template — will its codes change?',
      a: 'No, codes keep their look. A deleted ready-made template comes back with «Restore ready-made».',
    },
    {
      q: 'Are bots counted in scan statistics?',
      a: 'No. Link-preview bots (messengers, social networks, search engines) are not counted.',
    },
    {
      q: 'Why does the «Company colour» chip change the colour of codes?',
      a: 'It follows the primary colour of the portal theme: when the theme changes, such codes recolour themselves. To keep a colour fixed, pick a specific colour.',
    },
  ],
};
