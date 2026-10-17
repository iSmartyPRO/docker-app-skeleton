export default {
  id: 'kb',
  icon: 'graduation',
  title: 'Knowledge base',
  tagline: 'Instructions, documents and answers — in one place, neatly organised.',
  summary: 'The knowledge base is your company library: folders of any depth holding articles, files and links. Documents open right in the browser, search finds things by title and text, and access is set per folder and per material. A folder can be shared with people outside the portal through a public link.',
  highlights: [
    {
      icon: '📁',
      title: 'Folders of any depth',
      text: 'A tree on the left, breadcrumbs on top, and every folder has its own icon and colour.',
    },
    {
      icon: '📝',
      title: 'Articles, files and links',
      text: 'Write how-tos in a friendly editor, upload documents or save useful websites.',
    },
    {
      icon: '👁',
      title: 'View without downloading',
      text: 'PDF, Word, Excel, images and video open right in the portal — on your phone too.',
    },
    {
      icon: '🔎',
      title: 'Quick search',
      text: 'Searches folder and material names, descriptions, file names and article text.',
    },
    {
      icon: '🔐',
      title: 'Flexible access',
      text: 'View, edit or manage — for everyone, a group, a role or a specific person.',
    },
    {
      icon: '🔗',
      title: 'Public links',
      text: 'Open a folder to a partner or a new hire without sign-in — with a password and an expiry date.',
    },
  ],
  tips: [
    'Drag files straight into an open folder — several upload at once.',
    'In the article editor switch to “Split” to see the result while you type.',
    'Fill in the “Description” — search uses it too, and colleagues see at a glance what is inside.',
    'Turn off “Inherit access” to make a folder private to just the right people.',
    'A PDF can be shown as a presentation: the “Present” button opens full-screen slides.',
    'Link no longer needed? Click “Revoke” — you can restore it later.',
  ],
  sections: [
    {
      id: 'folders',
      title: 'Folder structure',
      body: `Everything in the knowledge base lives in folders. Folders can be nested to any depth.

- The **tree** on the left shows every folder you can access (a slide-out panel on phones).
- **Breadcrumbs** on top take you one level up.
- **Grid** or **List** — pick the view you like.
- Every folder has a **Name**, **Description**, **Colour** and **Icon**. If you leave colour or icon unset, the “Default” from the module settings is used.

Folder actions are in the “Actions” menu: “Folder settings”, “Move”, “Access…”, “Public links…” and delete.`,
      steps: [
        'Open the folder that should contain the new one (or the base home page).',
        'Click “Add” → “New folder”.',
        'Enter a name and, if you like, a description, colour and icon. The preview shows how it will look.',
        'Click “Create”.',
      ],
      example: {
        title: 'Sample structure',
        body: `- 📘 **New hires** — first day, contacts, office rules
- 📊 **Accounting** → Contract templates, Policies
- 🛠 **IT** → How to set up VPN, Printers

Blue for general topics, green for departments — folders are easy to tell apart at a glance.`,
      },
      note: 'Deleting a folder also deletes everything inside: subfolders, materials and public links. Files stored in the Files module stay there.',
    },
    {
      id: 'materials',
      title: 'Materials: articles, files and links',
      body: `Folders hold three kinds of materials:

- **Article** — text right in the portal: an instruction, a policy, an answer to a common question. You can embed pictures and attach files.
- **File** — any document: PDF, Word, Excel, slides, image, video. It opens in the browser.
- **Link** — the address of an external site (\`http\` or \`https\` only), e.g. the tax portal or a booking service.

Everything is added with the “Add” button: “Upload files”, “Add from Files”, “New article”, “New link”. A material can be edited, renamed, moved to another folder or deleted from its menu.`,
      steps: [
        'Open a folder and click “Add”.',
        'Pick a kind: “Upload files”, “New article” or “New link”.',
        'Fill in the “Title” and optionally the “Description” — it shows in the list and is searchable.',
        'Click “Create”.',
      ],
    },
    {
      id: 'editor',
      title: 'Article editor',
      body: `An article has two editors — the switch is above the text:

- **Visual** (the default for new articles) — like a regular document: headings, bold, italic, underline, highlight, lists, checklists, quotes, code, alignment, links and tables. **Pictures and files** can be pasted (Ctrl+V), dragged right into the text, uploaded from the computer or chosen from Files (the 🖼 and 📎 buttons). **Click a picture** to get its toolbar: size (S, M, L, 100% or “Auto” — the original), position relative to the text (centred, left, right, or **wrapped** left/right — the text flows beside the picture; on phones wrapped pictures take the full width), a caption, a description (alt text, for screen readers and search), a link, replace, open the original, download and delete. You can also drag a corner to resize; double-click adds a caption, Delete removes the picture. Readers click a picture to see it full screen. ⤢ opens the editor full screen, Esc returns.
- **Markdown** — plain text with marks and a toolbar. Three modes in the top right:

- **Text** — just the input;
- **Split** — text and result side by side;
- **Preview** — the article as readers see it.

If you know Markdown, type it directly: \`# Heading\`, \`**bold**\`, \`- list item\`.

A written article can be switched at any time: the content stays; going to Markdown drops only alignment and highlights; tables and pictures with a size, position or caption stay as HTML.`,
      example: {
        title: 'A short how-to',
        body: `\`## How to order a guest pass\`

\`1. Open the form on the security site\`
\`2. Enter the **full name** and visit time\`
\`3. Submit before 5 pm the day before\`

In “Preview” this becomes a heading and a numbered list with “full name” in bold.`,
      },
    },
    {
      id: 'attachments',
      title: 'Pictures and attachments in articles',
      body: `When the [Files](/app/files) module is on, you can add files to an article in two ways:

- **📎 File** on the editor toolbar inserts a file into the text. A picture is shown in the article; any other file becomes a link.
- **Attachments → “Attach files”** below the editor lists files under the article.

Files inserted in the text are attached automatically. Readers do not need access to these files in Files — access to the article is enough.`,
      steps: [
        'Put the cursor where the picture should go.',
        'Click “📎 File” and pick a file from Files.',
        'Click “Insert” — the picture appears in the text.',
      ],
      example: {
        title: 'A how-to with screenshots',
        body: 'In “Setting up mail on your phone” a screenshot is inserted after each step with “📎 File”, and a printable PDF cheat sheet sits in “Attachments”.',
      },
    },
    {
      id: 'viewers',
      title: 'Viewing documents and PDFs',
      body: `Most files open right in the portal, no download needed:

- **PDF** — page thumbnails, “Fit width” / “Fit page”, zoom, jump to page, select and copy text, “Full screen”. The **“Present”** button shows the document as slides: ← → or Space to flip, Esc to exit.
- **Images** — a gallery with zoom, pan and swipe (gestures on phones).
- **Word (.docx)** — rendered in the browser.
- **Excel and CSV** — a sheet grid with tabs (first 3,000 rows).
- **PowerPoint, legacy .doc / .xls, OpenDocument, RTF** — shown as PDF when the administrator has connected a conversion server.
- **Text and Markdown**, **video and audio** — built-in viewer and player.

Other formats show a card with a “Download” button.`,
      note: 'Seeing “a conversion server is needed to view”? You can still download the file; ask your administrator to connect document conversion for in-browser viewing.',
    },
    {
      id: 'search',
      title: 'Search',
      body: `The “Search the knowledge base” box at the top looks everywhere at once:

- folder names and descriptions;
- material titles and descriptions;
- file names;
- article text.

Results include only what you can access. Private folders and materials never show up.`,
      example: {
        title: 'Find by a word from the text',
        body: 'Looking for how to join the guest Wi-Fi? Type **wi-fi** — the “Office network” article is found even if the word is only in the text, not the title.',
      },
      note: 'Search does not read inside PDF and Word files — so give files a clear “Description”.',
    },
    {
      id: 'access',
      title: 'Access to folders and materials',
      body: `Access is set at three places: the whole base (“Access to the base” on the home page), a folder, and a single material (“Access…” in the menu). Each level includes the one before:

- **View** — open and download;
- **Edit** — plus add, rename, move and delete materials;
- **Manage** — plus change access, share links and delete folders.

Access can be given to “Everyone signed in”, a group, a role or a specific person.

**Inheritance.** By default a folder gets its parent’s access, and its own entries only add to it. Turn off “Inherit access” and the folder becomes **private**: only its own entries apply, and subfolders inherit from it.`,
      steps: [
        'Open a folder and choose “Access…” (or the “Access” button).',
        'In “Add a person, group or role…” pick who gets access.',
        'Choose the level: “View”, “Edit” or “Manage”.',
        'To make the folder private, turn off “Inherit access”. Click “Save”.',
      ],
      example: {
        title: 'A private folder for managers',
        body: 'Folder “Salaries and bonuses”: turn off “Inherit access”, add the “Managers” group with “View” and the accountant with “Edit”. Other staff will not even see the folder — not in the tree, not in search.',
      },
      note: 'You cannot lock yourself out: if you save rules that remove your “Manage”, you keep it. Knowledge base administrators can always manage every folder.',
    },
    {
      id: 'sharing',
      title: 'Public links to a folder',
      body: `A public link opens a folder to people **without a portal sign-in**: a contractor, a candidate, a client. The link shows the folder and everything that inherits its access. **Private** subfolders and materials are never visible through a link.

Link settings:

- **Link title** — visitors see it instead of the folder name;
- **Address** — a readable name such as \`/s/onboarding\`. The portal checks availability as you type and suggests an alternative if taken;
- **Password** — visitors enter it once;
- **Expiry** — “Never”, 1, 7, 30 days or a specific date;
- **Allow downloads** — turn off for view-only.

A folder can have several links with different settings. Each shows its view count. A link can be copied, edited, “Revoked” (and later “Restored”) or deleted.`,
      steps: [
        'Open the folder and click “Share” (or “Public links…” in the menu).',
        'Check the link title and address.',
        'Turn on a password and choose an expiry if needed.',
        'Click “Create link”, then copy it with ⧉ and send it.',
      ],
      example: {
        title: 'Materials for a new hire',
        body: 'A week before a new hire starts, create a link to the “New hires” folder at `/s/welcome`, with a password and a 7-day expiry. Send the password separately. After a week the link stops working on its own.',
      },
      note: 'Changing the password or revoking a link immediately cuts off everyone who already opened it. Only people with “Manage” on the folder can handle its links.',
    },
    {
      id: 'from-files',
      title: 'Uploading and “Add from Files”',
      body: `Upload with “Add” → “Upload files” or simply **drag files into the folder**. File size and types are limited by your administrator.

When the [Files](/app/files) module is on, uploaded files also appear in **Files → My files → Knowledge base**.

**“Add from Files”** takes files that already live in Files (My files, “Shared with me” or shared spaces) **without copying**: update the file there and it is updated in the knowledge base too.`,
      steps: [
        'Open a knowledge base folder and click “Add” → “Add from Files”.',
        'Tick the files you need.',
        'Click “Add to folder”.',
      ],
      note: 'A file used in the knowledge base cannot be moved to the trash in Files until it is removed from the materials. Deleting a material does not delete the file from Files.',
    },
    {
      id: 'settings',
      title: 'Module settings (for administrators)',
      body: `Administrators configure the knowledge base under **Settings → Modules → Knowledge base**:

- **Enabled** — show the knowledge base in the apps menu;
- **Folder look** — “Default colour” and “Default icon” for folders without their own;
- **Maximum file size** — 1 to 1024 MB (50 MB by default);
- **Allowed types** — images, PDF, Office, text, video and audio, archives;
- **Office preview** — whether a conversion server is connected for exact Word, PowerPoint and legacy formats;
- **Public links** — allow them, require a password and cap the “Maximum duration” (0 means no limit).

Who can use the base is set not here but in the knowledge base itself, with “Access to the base”.`,
      note: 'Turning off “Allow public links” stops all existing links at once. Turn it back on and they work again.',
    },
  ],
  faq: [
    {
      q: 'Why can’t I see a folder a colleague mentions?',
      a: 'Most likely it is private and you are not on its access list. Ask whoever manages the folder to add you via “Access…”.',
    },
    {
      q: 'My file won’t upload — what now?',
      a: 'Check its size and format: the administrator limits the maximum file size and allowed types. A file renamed from another format (say, a program disguised as a PDF) is rejected.',
    },
    {
      q: 'A PowerPoint deck won’t open in the browser. Why?',
      a: 'PowerPoint, legacy .doc/.xls and OpenDocument need a document conversion server. Until one is connected, download the file. Word (.docx), Excel and PDF open without it.',
    },
    {
      q: 'Will a public link expose private subfolders?',
      a: 'No. A link shows only what inherits the folder’s access. Private subfolders and materials with their own access stay hidden.',
    },
    {
      q: 'A visitor forgot the link password. What now?',
      a: 'Passwords are never shown. Open the link, click “Edit”, set a new password and send it to the visitor.',
    },
    {
      q: 'How is “Revoke” different from deleting a link?',
      a: '“Revoke” switches the link off temporarily — you can “Restore” it at the same address. Deleting removes it for good and frees the address.',
    },
    {
      q: 'If I delete a material, is the file gone from Files?',
      a: 'No, the file stays in Files. Only the knowledge base material is removed.',
    },
    {
      q: 'How do I move a material to another folder?',
      a: 'In the material menu choose “Move” and pick a folder. You need “Edit” in both folders.',
    },
  ],
  fields: {
    attachments: {
      title: 'Attachments',
      text: 'Files listed below the article. To show a picture inside the text, use “📎 File” on the editor toolbar.',
      more: 'attachments',
    },
    folderIcon: {
      title: 'Icon and colour',
      text: 'Help recognise the folder at a glance. “Default” comes from the module settings.',
      more: 'folders',
    },
    accessLevels: {
      title: 'Access levels',
      text: '**View** — open and download. **Edit** — also change materials. **Manage** — also access, links and deleting folders.',
      more: 'access',
    },
    inherit: {
      title: 'Inherit access',
      text: 'On — the parent folder’s access applies plus the entries below. Off — the folder is private: only those listed get in.',
      more: 'access',
    },
    shareSlug: {
      title: 'Link address',
      text: 'A short readable name: Latin letters, digits and hyphens, 3–64 characters. If taken, the portal suggests a free one.',
      more: 'sharing',
    },
    sharePassword: {
      title: 'Link password',
      text: 'Visitors enter it once. Send the password separately from the link. Changing it cuts off everyone who already opened the link.',
      more: 'sharing',
    },
    shareExpiry: {
      title: 'Expiry',
      text: 'After this date the link shows “This link has expired”. The administrator may cap the maximum duration.',
      more: 'sharing',
    },
    fileTypes: {
      title: 'Allowed types',
      text: 'Files of other formats cannot be uploaded. PDFs and images are also checked by content.',
      more: 'settings',
    },
    conversion: {
      title: 'Office preview',
      text: 'Without a conversion server, PowerPoint and legacy formats can only be downloaded. Word (.docx), Excel and CSV open either way.',
      more: 'viewers',
    },
    maxShareDays: {
      title: 'Maximum link duration',
      text: 'How many days a new public link may live. 0 means no limit, and “Never” becomes available.',
      more: 'settings',
    },
  },
  related: [
    'files',
    'drive',
  ],
};
