export default {
  id: 'qr',
  icon: 'qr',
  title: 'QR codes',
  tagline: 'Branded QR codes for a website, business cards, Wi-Fi and more — with your logo, company colours and a scan check.',
  summary: 'Pick what the code should do, choose a company template and, if you like, adjust shapes, colours, logo and frame. Every change shows in the preview at once and is checked for scanning. Download the finished code as PNG up to 4096 px or as a vector SVG for print.',
  highlights: [
    {
      icon: '🔳',
      title: '11 kinds of code',
      text: 'Website, business card, Wi-Fi, text, e-mail, phone, SMS, WhatsApp, Telegram, a place on the map and an event.',
    },
    {
      icon: '🎨',
      title: 'Company templates',
      text: 'Ready-made looks shown with your own content; some of them lock the brand colours and logo.',
    },
    {
      icon: '✅',
      title: 'Scan check',
      text: 'A built-in decoder reads every change and tells you when the code is hard to scan.',
    },
    {
      icon: '🖨',
      title: 'Print quality',
      text: 'PNG 512–4096 px, vector SVG for the print shop, or a picture copied to the clipboard.',
    },
    {
      icon: '🔁',
      title: 'Dynamic codes',
      text: 'A website code with a short portal link: change the address after printing and count the scans.',
    },
    {
      icon: '🗂',
      title: 'My codes',
      text: 'A personal library with search and filters; only you see your codes.',
    },
  ],
  tips: [
    'Start with the kind buttons above the library — the studio opens with the right fields.',
    'The «Scans reliably» badge in the preview is your main guide; if it turns to «Hard to scan», read the tip under it.',
    'Download SVG for the print shop: it stays sharp at any size.',
    'Keep a quiet zone of 3–4 modules and dark dots on a light background.',
    'Scan a test print with a phone before printing a batch.',
    'For a flyer you cannot reprint, make the code dynamic — you can change the address later.',
  ],
  sections: [
    {
      id: 'kinds',
      title: 'Kinds of code',
      body: `The kind decides what happens when someone points a camera at the code:

- **Website** — opens a link.
- **Business card** — offers to save a contact (vCard 3.0): first and last name, company, position, mobile and work phones, e-mail, website, address, note.
- **Wi-Fi** — joins a network: network name (SSID), WPA, WEP or no password, the password, «Hidden network».
- **Text** — shows a message of up to 1,500 characters.
- **E-mail** — writes a letter: recipient, subject and message.
- **Phone** — calls a number.
- **SMS** — prepares a text to a number.
- **WhatsApp** — opens a chat through a wa.me link, optionally with a prefilled message.
- **Telegram** — opens a profile, bot or channel (t.me/name).
- **Location** — shows a point on a map. Paste a Google, Yandex, 2GIS or OpenStreetMap link or coordinates; add a place name.
- **Event** — adds a meeting to a calendar (iCalendar): title, all day or a time, start and end, venue, description.`,
      note: 'Write phone numbers with the country code, e.g. +996 555 123 456 — otherwise the code may fail for people from another country.',
    },
    {
      id: 'studio',
      title: 'Creating a code',
      body: `**«Create a QR code»** opens the studio (\`/app/qr/new\`). Three steps on the left, a live preview on the right.

1. **What the code does** — the kind and its fields. The preview updates as you type.
2. **Template** — the company's looks, each drawn with your content. **«Own design»** starts without a template (unless your administrator allows codes only in templates).
3. **Design** — fine-tuning in the Shape, Colours, Logo and Frame tabs.

Name the code and press **«Save to my codes»**. A saved code opens at \`/app/qr/<number>\`; after edits press **«Save changes»**.`,
      steps: [
        'Press **«Create a QR code»** or the button of the kind you need above the library.',
        'Fill in the fields — the code appears in the preview.',
        'Choose a template or «Own design».',
        'Adjust shape, colours, logo and frame if needed.',
        'Check the «Scans reliably» badge, then download or save the code.',
      ],
      example: {
        title: 'A manager’s business card',
        body: 'Aida picks **«Business card»**, enters her name, position, mobile and e-mail, takes the **«Brand»** template and downloads an SVG for the print shop. A client points a camera — the phone offers to save the contact.',
      },
      note: 'Some options may be fixed by the template («Fixed by the template») — that is how the company keeps codes on brand.',
    },
    {
      id: 'shape',
      title: 'Shape',
      body: `The **Shape** tab:

- **Dots** — rounded, fluid, square, dots, classy, diamonds.
- **Corner frames** — rounded, square, circle, leaf, soft; **corner centres** separately.
- **Quiet zone** — an empty border of 0 to 8 modules; 3–4 read best.
- **Error correction** — Auto, L, M, Q or H: how much of the code may be damaged or covered. Auto picks H when there is a logo in the centre.`,
      note: 'Higher correction makes the code denser. If the preview says there is too much content, shorten the text or lower the correction.',
    },
    {
      id: 'colors',
      title: 'Colours',
      body: `The **Colours** tab:

- **Colour sets** — matched palettes in one click.
- **Fill of the dots** — solid, linear or radial gradient (with an angle).
- **Corner frame and centre colours** — «Like the dots» or your own.
- **Background** — any colour or transparent; **corner rounding** of the background.

The **«Company colour»** chip takes the primary colour of the portal theme. Such a code changes colour by itself when the portal theme changes.`,
      note: 'Dots must be clearly darker than the background. Light dots on a dark background (inverted) are not read by some older scanners — the preview warns you.',
    },
    {
      id: 'logo',
      title: 'Logo',
      body: `The **Logo** tab puts a picture in the centre of the code:

- **None**;
- **Company logo** — from Settings → Appearance, and **«Logo for dark»** — its dark variant;
- **Upload** — your own PNG, SVG, WebP or JPEG up to 1 MB (if your administrator allows it);
- **Icon** — from the icon library.

**Size** — 10 to 30% of the code width, up to 22% is safe. The **plate** under the logo — none, square, rounded or circle, with its own colour and padding.`,
      note: 'A logo covers part of the code. With a large logo the preview suggests making it smaller or switching correction to H.',
    },
    {
      id: 'frame',
      title: 'Frame and caption',
      body: `The **Frame** tab: none, caption, card, ticket or badge. Set the caption text, the frame colour and the text colour.

Leave the caption empty and it reads «Scan me» in the language of whoever looks at it.`,
    },
    {
      id: 'preview',
      title: 'Preview, check and download',
      body: `On the right is a live preview. Every change is re-drawn at once and checked by a built-in decoder:

- **«Scans reliably»** — the code reads;
- **«Hard to scan»** — a camera may not read it; a tip below says what to fix.

The preview also warns about low contrast, inverted colours and a logo that is too large, and shows the version, the correction level and the number of characters under the code.

**Download:** PNG 512, 1024, 2048 or 4096 px; **SVG** — vector for print; **«Copy as picture»** — paste into a letter or a document.`,
    },
    {
      id: 'dynamic',
      title: 'Dynamic codes',
      body: `For the **Website** kind you can switch on **«Dynamic code»** if your administrator allows it. The code then holds a short portal link \`https://<portal>/q/<name>\`, which leads to your address.

- **Change the address after printing** — printed codes lead to the new one.
- **Pause the link** — visitors see «This QR code is paused».
- **Scans are counted**: total, 30 days, last scan and daily bars. Link-preview bots (messengers, social networks) are not counted.

The short link appears once the code is saved; you can copy it.`,
      example: {
        title: 'A restaurant menu',
        body: 'Tables carry a dynamic code linking to the menu. The menu moves to a new site: the owner changes the address in the code, and the stickers need no reprint.',
      },
      note: '**Careful.** Turning «Dynamic code» off or deleting a dynamic code makes printed copies stop opening the link. A regular (static) code holds its content itself and keeps working even after it is deleted from the library.',
    },
    {
      id: 'library',
      title: 'My codes',
      body: `The **QR codes** page (\`/app/qr\`) is your personal library. Only you see your codes.

- **Quick start** buttons by kind open the studio with the right fields.
- **Search** by name and content, **filters** by kind and «Dynamic».
- On a code's card: download PNG, SVG or PNG 4096 px, **«Duplicate»**, **«Delete»**.`,
      note: 'How many codes one person may keep is set by the administrator (500 by default).',
    },
    {
      id: 'templates',
      title: 'Templates (for managers)',
      body: `The **Templates** page (\`/app/qr/templates\`) needs the «Manage QR templates» permission; super administrators have it.

Ready-made templates: **Brand** (the default — locks colours and logo), **Brand card**, **Classic**, **Graphite**, **Ocean**, **Sunset**, **Emerald**, **Midnight and gold**, **Amethyst**.

- Drag to set the order in the gallery.
- The **star** marks the default template: it is offered first and cannot be hidden.
- Templates can be **shown or hidden** and **deleted** — codes already made with a template keep their look.
- **«Restore ready-made»** adds back the ready-made templates you deleted.

In the template editor you set the name and description in each language and the **locks**: Colours, Shape, Logo, Frame. Locked groups cannot be changed in codes made from the template — the server enforces it. The sample switch (website, business card, Wi-Fi) shows the template on a short and on a dense code.`,
    },
    {
      id: 'print',
      title: 'Tips for print',
      body: `- Keep the **quiet zone** — do not crop the code tight or put text right next to it.
- **Dark dots on a light background** read best.
- **Minimum printed size** — about 2 × 2 cm for short links; print dense business cards bigger.
- Use **SVG** for the print shop and PNG 1024–2048 px for screens and documents.
- **Test with a phone** on a sample print before printing a batch.`,
    },
  ],
  faq: [
    {
      q: 'The code says «Hard to scan». What should I do?',
      a: 'Make the dots darker or the background lighter, shrink the logo, widen the quiet zone or choose correction H. The badge updates at once.',
    },
    {
      q: 'I deleted a code from the library. Will printed copies stop working?',
      a: 'A regular (static) code — no, it holds its content itself. A dynamic code — yes: the short link stops opening.',
    },
    {
      q: 'Why can I not change the colours or the logo?',
      a: 'The template locks them to keep codes on brand. Or your administrator allows codes only in templates.',
    },
    {
      q: 'There is no «Dynamic code» switch.',
      a: 'It exists only for the Website kind and only when the administrator has turned dynamic codes on in the module settings.',
    },
    {
      q: 'Can I change the address in a code that is already printed?',
      a: 'Only in a dynamic code. A static code carries the address in its dots — a new address needs a new code.',
    },
    {
      q: 'Do colleagues see my codes?',
      a: 'No, the library is personal. To share, download the file or copy the picture.',
    },
    {
      q: 'Which size should I download?',
      a: 'For print — SVG; for slides and websites — PNG 1024 or 2048 px; 4096 px — for large banners.',
    },
  ],
  related: [
    'resources',
    'admin',
  ],
};
