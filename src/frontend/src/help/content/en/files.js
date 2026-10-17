export default {
  id: 'files',
  icon: 'folder',
  title: 'Files',
  tagline: 'Personal and shared files, sharing and public links',
  summary: 'Keep work documents in the portal: in your personal My files or in your team’s shared spaces. Share any file or folder with colleagues, or send it outside by a public link with a password and an expiry date. Files open right in the browser: PDF, Word, Excel, images, video.',
  highlights: [
    {
      icon: '🗂',
      title: 'My files',
      text: 'Personal storage: only you see it until you share something.',
    },
    {
      icon: '👥',
      title: 'Shared spaces',
      text: 'Team drives with their own rules: view, edit, manage.',
    },
    {
      icon: '🤝',
      title: 'Share with colleagues',
      text: 'Open a file or folder to people and groups, for viewing or editing.',
    },
    {
      icon: '🔗',
      title: 'Public links',
      text: 'A link for partners without a portal account: view only, a file drop box or full access, with a password and expiry.',
    },
    {
      icon: '👁',
      title: 'View in the browser',
      text: 'PDF, Office, images, video and audio open without downloading; PDFs even as a presentation.',
    },
    {
      icon: '🗑',
      title: 'Trash',
      text: 'Deleted items are kept for 30 days, so an accidental delete can be undone.',
    },
  ],
  tips: [
    'Drag files or a whole folder from Explorer straight onto a folder window: everything uploads there, sub-folders included.',
    'Share a folder rather than single files: everything you add later becomes available automatically.',
    'For colleagues, send the Link button from the file page, not a public link: it opens only for people with access.',
    'Give public links to important documents a password and an expiry date.',
    'Right-click a file to open the menu with every action.',
    'Need a file from the company file server? It lives in [File server](/app/drive).',
  ],
  sections: [
    {
      id: 'my-files',
      title: 'My files and places',
      body: `The places are on the left:

- **My files**: your personal folder. Create sub-folders and keep anything here.
- **Shared with me**: everything colleagues shared with you or your groups, with the owner shown.
- **Shared spaces**: team spaces you have access to.
- **Recent**: your latest uploads and changes.
- **Trash**: deleted files.

Show the list as a grid or a table, select several files and move or delete them together. Breadcrumbs above the list show where you are. On a phone the places open from the side drawer.`,
      note: 'Files uploaded to the [Knowledge Base](/app/kb) live here too, in the system folder My files → Knowledge base.',
    },
    {
      id: 'upload',
      title: 'Uploading and drag & drop',
      body: `Upload with the **Upload** button, or just drag files from Explorer onto the folder window; you will see a “Drop to upload” hint. Many files can go at once.

**Whole folders** can be dropped too, or picked with the arrow next to the button → **Upload folder**. Sub-folders are created for you and every file lands in its place; folders with the same name are merged, empty folders are kept. The panel in the bottom right shows how many files are done, lets you cancel, and lists any files that failed with the reason. Phones cannot pick folders (an iOS and Android limitation).

If the folder already has a file with that name, nothing is overwritten: the new file is saved as “Report (2).pdf”.`,
      steps: [
        'Open the folder in My files or in a shared space.',
        'Press New folder if you want to sort files into folders.',
        'Drag files or a whole folder onto the window, or press Upload and pick them.',
      ],
      note: 'The administrator sets the maximum file size and allowed types. If a file will not upload, check its size and format.',
    },
    {
      id: 'spaces',
      title: 'Shared spaces and access',
      body: `A shared space is a team drive, such as *Accounting* or *Marketing*. Files in it belong to the space, not to whoever uploaded them, so nothing is lost when someone leaves.

When you create one, choose who gets access:

- **Everyone can add and edit**: a common drive for the whole team;
- **Everyone can view**: only people you add can change files;
- **Only me**: add people later.

Change the rules later in the space menu → **Access**. Levels: **View** (open and download), **Edit** (upload, rename, move, delete), **Manage** (all of that plus access, links and the space’s trash).`,
      example: {
        title: 'A space for the sales team',
        body: 'The head of sales creates a *Sales* space with “Everyone can view”, then in Access gives the *Sales team* group the Edit level. The whole company sees price lists and contract templates, but only the sales team can change them.',
      },
      note: 'Whether everyone or only administrators can create spaces is up to the portal administrator.',
    },
    {
      id: 'viewer',
      title: 'Viewing files, PDF slides and presenting',
      body: `A click opens the file on **its own page**: ‹ › move through the folder’s other files, and the **Link** button copies the page address for colleagues (it opens for anyone who has access).

PDF, Word, Excel and other Office documents, images, text and Markdown, video and audio open in the browser. Unknown formats are simply downloaded.

PDFs have three modes: **Pages** (normal scrolling), **Slides** (one page at a time) and **Present** (full screen). In a presentation use ← → or Space to move, Esc to leave.`,
      example: {
        title: 'Show a deck in a meeting',
        body: 'Save the deck as PDF and upload it to your team’s space. In the meeting, open the file and press Present: slides fill the screen, no PowerPoint needed.',
      },
      note: 'The administrator can switch files to open in a window over the folder instead of their own page.',
    },
    {
      id: 'share',
      title: 'Sharing with people',
      body: `Open the file or folder menu → **Share…** → the **People** tab. Add colleagues or groups and pick a level:

- **View**: open, preview and download;
- **Edit**: also upload, rename, move and delete inside.

Access to a folder covers everything in it, including files added later. Recipients get a notification and find the item under **Shared with me**.`,
      steps: [
        'Right-click the file or folder → Share….',
        'Find a colleague or group in “Add people or groups”.',
        'Choose View or Edit and press Save.',
      ],
      example: {
        title: 'A folder for a report',
        body: 'Create an *Annual report 2026* folder in My files and give the *Finance* group Edit. Colleagues drop their spreadsheets there and you see everything in one place.',
      },
      note: 'Only the owner can change access, create links and delete for good.',
    },
    {
      id: 'links',
      title: 'Public links: permissions, password and expiry',
      body: `A public link opens a file or folder **without signing in**, for a client or a contractor say. A folder link shows only what is inside; visitors cannot go above it.

In Share… → the **Public links** tab the main settings are right there:

- **What the recipient can do**: View or View and download; for folders More… opens the other options (see [Link permissions](#link-permissions));
- **Expires**: no expiry, 1, 7 or 30 days, or a date (the link works until the end of that day);
- **Password**: optional, at least 4 characters; Generate makes an easy one;
- **Link address**: a readable address such as \`/l/dogovor-keykompani\` (see [Your own link address](#link-address)).

Everything else (upload rules, the visitor’s name, notifications, the link’s name) is in the collapsed **Advanced settings**.

Each link in the list shows its address, permissions, expiry, a password lock and views. Copy or edit it; the ⋯ menu shows a QR code, opens it “as the recipient”, lists the activity, **revokes** it (and restores later) or deletes it. Revoking or changing the password cuts off everyone who already opened it.`,
      steps: [
        'File menu → Share… → Public links.',
        'Choose what the recipient can do, the expiry and, if you like, a password and your own address.',
        'Press Create and copy: the link is on the clipboard.',
        'Send the link and the password through different channels.',
      ],
      example: {
        title: 'A contract for a client, for a week',
        body: 'Create a link to the contract PDF with “View only”, a password and “7 d”. Email the link and send the password by messenger. After a week the link stops working by itself.',
      },
      note: 'The administrator can turn public links off, make a password mandatory or cap their lifetime. Links to items in the trash do not work.',
    },
    {
      id: 'link-address',
      title: 'Your own link address',
      body: `Instead of a random address you can set a readable one: \`portal…/l/dogovor-keykompani\`. Type in any language: the portal turns it into latin letters; From the name fills in the file name.

- Latin letters, digits and hyphens only, 3 to 64 characters; service words (\`admin\`, \`login\`, \`api\`…) are taken;
- the address is checked as you type: **Available** or **Taken**, with alternatives (\`-2\`, \`-2026\`…);
- the random address keeps working too;
- change the address or delete the link and the old address **stops opening at once**; for 90 days only you can take it again.

A revoked or expired link keeps its address, so a link you sent never opens someone else’s file.`,
      note: 'A readable address is easier to guess. Turn on a password for important files.',
    },
    {
      id: 'link-permissions',
      title: 'Link permissions: view, upload, change',
      body: `For every link choose what the recipient can do:

- **View only**: open files in the browser, no downloads;
- **View and download**: as before, the default;
- **Upload only**: a drop box. The recipient sees a “Send files to …” page and can send files but never sees what is in the folder (only what they sent);
- **View and upload**: see, download and add new files;
- **Full access**: also folders, renaming, replacing with a new version and deleting;
- **Customize…**: separate switches for view, download, upload, create folders, rename and move, replace, delete.

Links with uploads have **rules**: maximum file size, allowed types (e.g. \`.pdf, .jpg\`), a total limit for the link, **ask the visitor’s name** (and e-mail) and **notify me**, one notice per visit.

What arrives through a link is yours and counts against your quota. Files show “via link · Name”, and the link menu → **Activity** lists who did what. Items a visitor deletes go to your trash; on replace the previous version stays in the trash too.`,
      example: {
        title: 'Collecting documents from a client',
        body: 'Make a folder “Client documents”, an “Upload only” link with “.pdf, .jpg”, “up to 20 MB” and “Ask the visitor’s name”, and turn on “Notify me”. The client drops the scans on the page; you get one notice and see the files with their name.',
      },
      note: 'You can only grant what you can do yourself: uploads and changes need edit rights. The administrator can turn off links that allow changes or require a password for them.',
    },
    {
      id: 'trash',
      title: 'Trash',
      body: `Deleted files and folders go to the **trash** and stay there for 30 days (the administrator sets the period), then disappear for good.

In the trash you can **restore** an item to where it was, **delete it for good**, or **empty the trash**.`,
      note: 'A file used by the Knowledge Base cannot be deleted: the portal lists the articles and folders to remove it from first.',
    },
    {
      id: 'search',
      title: 'Search',
      body: 'The **Search files** box searches names in every place you can open: My files, items shared with you and shared spaces. Each result shows its folder path, so you know where it lives.',
    },
    {
      id: 'quota',
      title: 'Quota and storage',
      body: `Below the places you see how much your personal files take, e.g. “120 MB of 2 GB”. The quota counts My files **including the trash**; shared spaces do not count.

If you run out, delete what you no longer need and **empty the trash**: only then is the space freed.`,
    },
    {
      id: 'settings',
      title: 'Module settings (administrators)',
      body: `**Settings → Modules → Files**:

- **Maximum file size**: 200 MB by default;
- **Personal storage per user**: the My files quota, 0 means unlimited;
- **Keep deleted files**: the trash period, 30 days by default;
- **Allow any file type**, or only chosen groups (images, PDF, office, text, media, archives);
- **Who creates shared spaces**: everyone or administrators only;
- **Public links**, **Require a password on every link**, **Maximum link lifetime**;
- **Who publishes links**: owners only or anyone with access (within their own rights);
- **Links that allow changes** and **Password for links that allow changes**;
- **Opening files**: own page or modal window.

The Files admin permission manages every shared space. Employees’ personal files stay private even from administrators.`,
    },
  ],
  faq: [
    {
      q: 'Can anyone see my personal files?',
      a: 'No. Only you see My files, not even administrators. Others get access only when you share an item or create a link.',
    },
    {
      q: 'I deleted a file by mistake. How do I get it back?',
      a: 'Open Trash, find the file and press Restore. Files stay there for 30 days unless the administrator set another period.',
    },
    {
      q: 'How is a public link different from the Link button on a file page?',
      a: 'The Link button copies the portal page address, which opens only for colleagues with access. A public link opens for anyone without signing in, so protect it with a password and an expiry.',
    },
    {
      q: 'The recipient says the link does not open.',
      a: 'Check its state in Share… → Public links: it may have expired or been revoked. A link also stops working when the file is moved to the trash.',
    },
    {
      q: 'Why can’t I delete a file?',
      a: 'Either you only have view access, or the file is used in the Knowledge Base. In the second case the portal lists the articles to remove it from first.',
    },
    {
      q: 'It says my quota is exceeded. What now?',
      a: 'Delete files you no longer need and empty the trash: deleted items count until the trash is emptied. Keep team materials in a shared space, which does not count against your quota.',
    },
    {
      q: 'How is Files different from File server?',
      a: 'Files are stored in the portal itself. [File server](/app/drive) shows the company network folders (like a drive in Windows Explorer), with rights granted by IT.',
    },
  ],
  fields: {
    sharePeople: {
      title: 'Access for people',
      text: 'Add colleagues or groups: View lets them open and download, Edit also lets them change and delete. Folder access covers everything inside.',
      more: 'share',
    },
    linkPassword: {
      title: 'Link password',
      text: 'At least 4 characters. Send it separately from the link, e.g. by messenger.',
      more: 'links',
    },
    linkExpires: {
      title: 'Expiry',
      text: 'After this date the link stops working by itself. Empty means no expiry, unless the administrator capped it.',
      more: 'links',
    },
    linkSlug: {
      title: 'Link address',
      text: 'A readable address instead of a random one: latin letters, digits and hyphens, 3–64 characters. Empty means a random address nobody can guess.',
      more: 'link-address',
    },
    linkPermissions: {
      title: 'What the recipient can do',
      text: 'Pick a preset or Customize…. Upload only is a drop box: the recipient sends files but never sees what is in the folder.',
      more: 'link-permissions',
    },
    allowDownload: {
      title: 'Allow download',
      text: 'Switch off so the file can only be viewed in the browser.',
      more: 'links',
    },
    spaceVisibility: {
      title: 'Who gets access',
      text: 'The space’s starting rules. Fine-tune them later in the space menu → Access.',
      more: 'spaces',
    },
    quota: {
      title: 'Personal storage',
      text: 'The limit for each person’s My files, including their trash. Shared spaces do not count.',
      more: 'quota',
    },
    requirePassword: {
      title: 'Mandatory password',
      text: 'New public links cannot be created without a password. Existing links are not changed.',
      more: 'links',
    },
  },
  related: [
    'drive',
    'kb',
    'chat',
  ],
};
