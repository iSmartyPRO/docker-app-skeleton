export default {
  id: 'companies',
  icon: 'building',
  title: 'Counterparties',
  tagline: 'The companies and people we work with — with details from public registers and the full history.',
  summary: 'A shared directory of clients, suppliers, partners and government bodies. Enter the INN and the details load from the register; people keep their career history even when they change jobs. Every change, call and rating stays in the history with its author and date.',
  highlights: [
    {
      icon: '⤓',
      title: 'Details by INN',
      text: 'For Kyrgyzstan and Russia the card fills from the register with one button, together with the official extract.',
    },
    {
      icon: '🌍',
      title: 'Rules for each country',
      text: 'INN, BIN, UNP, OGRN and other numbers are checked against the format of that country.',
    },
    {
      icon: '🛡',
      title: 'No duplicates',
      text: 'If a company with the same number already exists, the portal warns you and links to it.',
    },
    {
      icon: '👥',
      title: 'People and careers',
      text: 'A contact can work at several companies, and their history is kept when they leave.',
    },
    {
      icon: '🕓',
      title: 'Full history',
      text: 'Who changed what and when — plus notes about calls, meetings and deals.',
    },
    {
      icon: '⭐',
      title: 'Ratings from colleagues',
      text: 'Scores for reliability, payment discipline and quality help decide who to work with.',
    },
  ],
  tips: [
    'Start a new company with its number: type the INN and press **Enter** — same as “Fill from the register”.',
    'Once a quarter press “Check with the register” for key clients — you will see a new head or address at once.',
    'Someone left? Don’t delete them — press “Left the company” and they stay in contacts with their history.',
    'After a call or meeting add an entry on the “History” tab — colleagues stay informed without asking.',
    'Make yourself responsible and the company appears under “My companies”.',
    'Don’t need a company? Archive it instead of deleting: everything is kept and restores with one click.',
  ],
  sections: [
    {
      id: 'card',
      title: 'The company card',
      body: `The card keeps everything about a company in one place. At the top: the name, country, number, status and the date of the last register check. Below are tabs:

- **Overview** — details, management, addresses, contacts, bank accounts, notes;
- **People** — who works there now and who has left;
- **History** — every change, note, call and meeting;
- **Rating** — scores from colleagues;
- **Documents** — contracts, extracts and other files.

In the edit form the fields are grouped: “Main”, “Registration details”, “Management”, “Addresses”, “Contacts”, “Bank details”, “Notes”. Only the **Name** is required — the rest can be added later.`,
      steps: [
        'Open “Companies” and press “Add company”.',
        'Choose the country and enter the main number (for example, the INN).',
        'Press “Fill from the register” or fill the fields by hand.',
        'Set the relationship, the responsible person and tags, then press “Create”.',
      ],
      note: 'Phones and emails can carry a label — “accounting”, “sales”. Colleagues will know right away where to call.',
    },
    {
      id: 'countries',
      title: 'Countries and identifiers',
      body: `First choose the **country** — it defines the numbers, how they are checked, the legal forms and the connected register. A number in the wrong format is marked “Check the number”.

- 🇰🇬 **Kyrgyzstan** — INN (14 digits), registration number, OKPO (8 digits); Ministry of Justice register.
- 🇷🇺 **Russia** — INN (10 digits, 12 for sole traders), KPP, OGRN / OGRNIP, OKPO; INN and OGRN check digits are verified; EGRUL / DaData register.
- 🇰🇿 **Kazakhstan** — BIN / IIN (12 digits).
- 🇺🇿 **Uzbekistan** — INN (STIR), 9 digits.
- 🇧🇾 **Belarus** — UNP, 9 digits.
- 🇹🇯 **Tajikistan** — INN, 9 digits.
- 🇨🇳 **China** — USCC, 18 characters.
- 🇹🇷 **Türkiye** — tax number VKN, 10 digits.
- 🌐 **Other country** — tax ID, registration number, VAT.

For Kazakhstan, Uzbekistan and the other countries no register is connected yet — fill the card by hand.`,
      example: {
        title: 'A Russian INN with a typo',
        body: 'You type INN `7707083894` instead of `7707083893`. The length is right but the check digit fails — the portal says “Check the number” and the typo never reaches the directory.',
      },
    },
    {
      id: 'registry',
      title: 'Filling from the register',
      body: `Enter the number and press **“Fill from the register”** — the portal asks the public register and puts the data into the fields.

- **Ministry of Justice of KG** (Kyrgyzstan, no key needed): names in Russian, Kyrgyz and English, registration number, OKPO, registering authority, legal address, head, status, registration and closure dates, number of founders.
- **DaData** (Russia, if an administrator added a key): names, legal form, INN, KPP, OGRN, OKPO, OKVED, status, dates, head, full address.
- **EGRUL of the Federal Tax Service** (Russia, free, no key): names, INN, KPP, OGRN, head, registration and closure dates.

The official PDF extract is attached to the card on the “Documents” tab once you save. Phones and emails you already typed by hand are kept.`,
      example: {
        title: 'A new supplier from Bishkek',
        body: 'Country — 🇰🇬 Kyrgyzstan, INN — the 14 digits from the contract. You press “Fill from the register”: in a couple of seconds a green banner says “Details loaded from Ministry of Justice of KG”, the Russian and Kyrgyz names, address, head and OKPO are filled, and below — “The official extract will be attached”. All that is left is the accounting phone and the bank account.',
      },
      note: 'The register is not responding or asks for a captcha? Wait a minute or fill the card by hand. You can make up to 20 register requests a minute.',
    },
    {
      id: 'verify',
      title: 'Checking with the register',
      body: `Companies change heads, addresses and status. **“Check with the register”** on the card compares it with the register field by field and shows a “Field — In the card — In the register” table.

- Empty card fields are pre-selected — they simply need filling.
- You decide on differing values: tick the ones to take.
- If everything matches, press “Record the check” to note the check.

After the check the history shows an entry with the changed fields, the header shows “Checked with … · date”, and a fresh extract is added to “Documents”.`,
      steps: [
        'Open the company card and press “Check with the register”.',
        'Review the differences; untick anything that should stay.',
        'Press “Take N values” or “Record the check”.',
      ],
      example: {
        title: 'A new director',
        body: 'Before signing a contract a manager checks the client. The “Head” row shows Asanov in the card and Toktogulov in the register. The manager takes the new value, and the history keeps “Checked with Ministry of Justice of KG: 1 field(s) updated” with the extract for that date.',
      },
      note: 'Checking works only for countries with a connected register — currently Kyrgyzstan and Russia.',
    },
    {
      id: 'duplicates',
      title: 'Duplicates',
      body: `Before saving, the portal looks for a company with the same main number (INN, BIN, UNP…) — including the archive. If there is one, a yellow warning “A company with this identifier is already in the directory” links to it.

- Usually the right move is to open the existing card and complete it.
- If it really is a separate record — for example, a branch with the same INN — press “Create anyway”.`,
      note: 'Found one marked “in the archive”? Open it and press “Restore” — its whole history comes back.',
    },
    {
      id: 'people',
      title: 'Contacts and jobs',
      body: `The **“Contacts”** section holds the people at counterparties. A contact has a name (only the first name is required), phones, emails, Telegram, WhatsApp, LinkedIn, birthday, city, languages, tags and notes.

The link between a person and a company is a **job**: position, department, start date, work phone and email, and the “Decision maker” switch. One person can work at several companies at once. On a company’s “People” tab decision makers are shown first.

When someone leaves, press **“Left the company”**: set the date, the reason and what next — “Nowhere yet — keep as a contact” or “Moves to another company” with the new position. The old job stays on the “Career” tab.`,
      steps: [
        'On the company card open the “People” tab.',
        'Press “New employee”, or “Existing contact” if the person is already in the directory.',
        'Set the position and, if needed, turn on “Decision maker”.',
      ],
      example: {
        title: 'A buyer changes jobs',
        body: 'Aigul, a buyer at “Alfa” LLC, moves to “Beta” LLP in Almaty. Open her contact, on the Alfa job press “Left the company”, choose “Moves to another company”, find Beta and set the new position. Alfa lists her among former employees, Beta among current ones, and all notes about her are kept.',
      },
      note: 'In the contacts list the “Without a company” filter shows people who, as far as we know, are not working anywhere now.',
    },
    {
      id: 'relations',
      title: 'Relationship, responsible person and tags',
      body: `- **Relationship** — client, supplier, partner, prospect, contractor, government, competitor. You can pick several; each type has its own colour, and the company list can be filtered by it.
- **Responsible** — the employee who looks after the company or contact. Companies where you are responsible are collected under “My companies”.
- **Tags** — any words for your own marks: “VIP”, “tender”, “Osh”. Type a word and press Enter or a comma.`,
      note: 'If an administrator chose “Responsible, author and admins”, only they can change the card — everyone else sees it read-only.',
    },
    {
      id: 'history',
      title: 'History: notes, events and documents',
      body: `The **“History”** tab is a feed of everything that happened to a company or contact. The portal records creation, every change (old → new), register checks, people joining and leaving, ratings, documents, archive and restore.

Add your own entries at the top: **Note, Call, Meeting, Email, Deal, Issue** — with a date if you like. Filters: “Everything”, “Notes and contacts”, “Changes”.

The **“Documents”** tab keeps the company’s files — contracts, certificates, extracts (up to 25 MB each). Register extracts land there automatically.`,
      example: {
        title: 'Logging a call',
        body: 'You spoke with the client’s accountant: choose “Call”, write “Confirmed payment of invoice #125 by the 15th” and press “Add to history”. A colleague opening the card tomorrow sees the agreement and who made it.',
      },
      note: 'System entries cannot be deleted; your own notes can. So the change history can always be trusted.',
    },
    {
      id: 'rating',
      title: 'Ratings',
      body: `On the **“Rating”** tab every employee can give 1 to 5 stars and, optionally, rate criteria:

- companies — reliability, payment discipline, quality, communication;
- contacts — reliability, communication, quality.

The average counts each colleague’s **latest** score: give a new one and the old one stays in the history marked “replaced by a newer score”. A comment helps colleagues see why.`,
      note: 'Sort the company list “By rating” to find the most reliable suppliers quickly.',
    },
    {
      id: 'archive',
      title: 'Archive',
      body: `If you no longer work with a company, archive it: **“More” → “Archive”**, with a reason if you like. The card, people, history and documents are kept — it just leaves the main lists. Find it under “Archive” and bring it back with “Restore”.

Contacts are archived the same way — see “Contacts archive”.

“Delete for good” is available only to the counterparties administrator and erases the card with its history, ratings and documents for ever.`,
    },
    {
      id: 'search',
      title: 'Search and filters',
      body: `In the **“Companies”** list the search box looks through the name (including full and state-language names), INN and other numbers, phone, email and head. Next to it: a quick country filter, the relationship filter and sorting — by name, recently updated, recently added, by rating.

In the **“Contacts”** list search covers name, phone, email, messengers and current company; filters are “Mine”, “Everyone” and “Without a company”.

The module menu: “Companies”, “My companies”, “Archive”, “Contacts”, “Contacts archive”.`,
      example: {
        title: 'Who called from an unknown number?',
        body: 'Paste the number (or its last digits, say `55 12 34`) into the “Contacts” or “Companies” search — the portal finds the card where that phone is stored.',
      },
    },
    {
      id: 'settings',
      title: 'Module settings (for administrators)',
      body: `Settings live in **Settings → Modules → Counterparties** and are available to the counterparties administrator.

- **Countries** — the default country and the list of countries offered (their order is the filter order).
- **Who may change cards** — “Everyone” (default) or “Responsible, author and admins”. Everyone can always see the directory.
- **Relationship types** — rename, recolour or add your own besides “Client”, “Supplier” and others.
- **Custom fields** — extra fields for companies or contacts: text, long text, number, date, list, link; for all countries or only chosen ones.
- **Registers** — Ministry of Justice of KG and EGRUL work without a key; DaData needs one.`,
      steps: [
        'Sign up at dadata.ru (the free plan gives 10,000 requests a day).',
        'In your profile open “API keys” and copy the **API key** (the secret key is not needed).',
        'In “Registers” paste the key into the DaData field and press “Save”.',
      ],
      note: 'The key is stored encrypted; after saving only a masked hint is shown. Without a key Russia uses the free EGRUL, but the tax service sometimes asks for a captcha — DaData does not.',
    },
  ],
  faq: [
    {
      q: 'Why is there no “Fill from the register” button?',
      a: 'No public register is connected for that country. Auto-fill works for Kyrgyzstan and Russia; for other countries fill the card by hand.',
    },
    {
      q: 'The register says there is no company with this number, but it exists.',
      a: 'Check the number and country: a Kyrgyz INN has 14 digits, a Russian one 10 (12 for sole traders). A newly registered company may appear in the register later — fill the card by hand and check again later.',
    },
    {
      q: 'The portal says the company exists, but I can’t see it in the list.',
      a: 'Most likely it is archived — the link is marked “in the archive”. Open it and press “Restore”.',
    },
    {
      q: 'I can’t edit a card — the fields are locked.',
      a: 'An administrator allowed changes only by the responsible person, the author and administrators. Ask the responsible person to make the change or to make you responsible.',
    },
    {
      q: 'How do I remove a client’s employee who left?',
      a: 'No need to delete: press “Left the company” on their job. The person stays in contacts with their career history and can be found if they join another counterparty.',
    },
    {
      q: 'Can I change my rating?',
      a: 'Just give a new one — it counts towards the average, and the old one stays in the history as “replaced by a newer score”.',
    },
    {
      q: 'Will my phones be lost if I press “Fill from the register”?',
      a: 'No. Phones and emails you already typed are kept; the register fills the other fields.',
    },
    {
      q: 'Do we need a DaData key?',
      a: 'Only if you work with Russian companies. Without a key the free EGRUL is used; with a key you also get the full address, OKVED, OKPO and status, with no captcha. Kyrgyzstan needs no key.',
    },
  ],
  fields: {
    country: {
      title: 'Country',
      text: 'Choose it first: the country defines the numbers, their checks, legal forms and the register for auto-fill.',
      more: 'countries',
    },
    primaryId: {
      title: 'Main number',
      text: 'INN, BIN, UNP or the country’s other number. It is used to fill the card from the register and find duplicates. Press Enter to query the register.',
      more: 'registry',
    },
    fillFromRegistry: {
      title: 'Fill from the register',
      text: 'The details come from the public register and the official extract is attached. Phones and emails typed by hand are kept.',
      more: 'registry',
    },
    duplicates: {
      title: 'Possible duplicate',
      text: 'A company with this number already exists — open it via the link. Use “Create anyway” only if it really is a separate record.',
      more: 'duplicates',
    },
    relations: {
      title: 'Relationship',
      text: 'Client, supplier, partner… You can pick several. The company list can be filtered by it.',
      more: 'relations',
    },
    owner: {
      title: 'Responsible',
      text: 'The employee who looks after this counterparty. It appears in their “My companies”.',
      more: 'relations',
    },
    tags: {
      title: 'Tags',
      text: 'Any words for your own marks: VIP, tender, Osh. Type a word and press Enter or a comma.',
      more: 'relations',
    },
    verify: {
      title: 'Register check',
      text: 'Empty card fields are pre-selected. Tick differing values yourself — taken changes and the extract are saved in the history.',
      more: 'verify',
    },
    workplace: {
      title: 'Where they work',
      text: 'Link the person to a company right away. More jobs can be added later — a person can work at several companies.',
      more: 'people',
    },
    decisionMaker: {
      title: 'Decision maker',
      text: 'Mark people who approve deals and sign documents — they are shown first on the company card.',
      more: 'people',
    },
    leaveNext: {
      title: 'What next?',
      text: 'If the person moved to another counterparty, choose “Moves to another company” — the new job is created at once.',
      more: 'people',
    },
    rating: {
      title: 'Your rating',
      text: 'Your latest score counts towards the average; criteria and a comment are optional but help colleagues.',
      more: 'rating',
    },
    editPolicy: {
      title: 'Who may change cards',
      text: '“Everyone” — anyone can change cards. The other option leaves it to the responsible person, the author and admins. Everyone can see the directory.',
      more: 'settings',
    },
    relationTypes: {
      title: 'Relationship types',
      text: 'The choices for the “Relationship” field. Rename, recolour or add your own.',
      more: 'settings',
    },
    customFields: {
      title: 'Custom fields',
      text: 'Extra fields for companies or contacts — for all or only chosen countries. They appear under “Additional fields” in the form.',
      more: 'settings',
    },
    dadataKey: {
      title: 'DaData key',
      text: 'Needed only for Russian companies: adds the full address, OKVED, OKPO and status with no captcha. Paste the API key from your dadata.ru profile — the secret key is not needed.',
      more: 'settings',
    },
  },
  related: [
    'tasks',
    'files',
  ],
};
