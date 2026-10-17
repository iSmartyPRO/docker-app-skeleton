export default {
  id: 'drive',
  icon: 'server',
  title: 'File server',
  tagline: 'The company’s network folders right in the browser',
  summary: 'All the company file-server folders are gathered into one network drive: like Windows Explorer, but in the browser and on any device. View documents and drawings, upload, rename and move files, download folders as ZIP and share them by link. What you can open and change is decided by the file server, just as on your work PC.',
  highlights: [
    {
      icon: '🗄',
      title: 'Every folder in one place',
      text: 'Folders from different servers on one screen, with your rights and free space.',
    },
    {
      icon: '🔑',
      title: 'Your domain account',
      text: 'Sign in with your Windows login; rights are the same as in Explorer.',
    },
    {
      icon: '👁',
      title: 'View without downloading',
      text: 'PDF, Word, Excel, images, video and even AutoCAD drawings open in the browser.',
    },
    {
      icon: '📦',
      title: 'Download as ZIP',
      text: 'A whole folder or a selection of files in one archive.',
    },
    {
      icon: '🔗',
      title: 'Links for partners',
      text: 'Share a file or folder by link, with a password, an expiry, or for employees only.',
    },
    {
      icon: '⭐',
      title: 'Favourites and recent',
      text: 'Star the folders you need and get back to them in one click.',
    },
  ],
  tips: [
    'Star folders you use often with ☆: they appear in Favourites.',
    'Copy network path gives an address like \\\\server\\share: paste it into Windows Explorer.',
    'Changed your domain password? Go to Connections and sign in again.',
    'Deleting on the server is final, there is no trash. Check your selection first.',
    'No access to a folder? Ask your manager or IT to add you to the right group.',
    'Keep your own documents in [Files](/app/files).',
  ],
  sections: [
    {
      id: 'connect',
      title: 'Connecting to a server and credentials',
      body: `The file server lets you in with **your domain account**, the same one you use to sign in to Windows. If you signed in to the portal through Active Directory, the connection is usually automatic.

If a folder tile says **Sign-in needed**, press **Sign in** and enter your user name and password. Any form works: ivan.petrov, CORP\\ivan.petrov or ivan@corp.local. The Domain field is usually left empty.

**Connections** shows which account opens each server. You can switch accounts there or press **Forget credentials**.`,
      steps: [
        'Open Connections, or press Sign in on a folder tile.',
        'Enter your domain user name and password.',
        'Press Sign in: the server checks them and the folders open.',
      ],
      note: 'The password is stored encrypted and cannot be viewed. If the server rejects it (say, you changed it), the portal stops trying it, so your domain account will not get locked. Just sign in again.',
    },
    {
      id: 'navigate',
      title: 'Browsing folders',
      body: `The **Overview** page shows a tile for every folder with your rights (**Read & write** or **Read only**) and free space, plus favourites and recent files.

Inside a folder:

- breadcrumbs show the path and take you back up;
- grid or list view, sorted by name, date, size or type;
- **Search in this folder** looks through the folder and all its sub-folders;
- **Show hidden files** for system files;
- **Copy network path** to open the same place in Explorer.`,
      note: 'If a folder is missing, you have no access to it on the server. IT grants access through Active Directory security groups.',
    },
    {
      id: 'files',
      title: 'Viewing, downloading and uploading',
      body: `A file opens on **its own page**, full window: ‹ › move through neighbouring files, and the address can be bookmarked or sent to a colleague.

PDF (pages, slides and a full-screen presentation), images, Word, Excel, other Office files, video and audio open in the browser. Text and Markdown files can be **edited right in the portal**: Ctrl+S saves to the server.

Upload with the button or by drag & drop. If the folder already has files with those names, choose **Replace**, **Keep both** or **Skip**.

**Whole folders** can be dropped too, or picked with the arrow next to the button → **Upload folder**: sub-folders are created on the server and every file lands in its place. If the folder is already there, the contents are merged and *Replace / Keep both / Skip* applies to the files inside. Progress, cancel and the list of files that failed are in the panel in the bottom right.`,
      example: {
        title: 'Update a price list',
        body: 'Drag the new “Prices.xlsx” into *Sales*. The portal says the file already exists; choose Replace. If a colleague has it open in Excel right now, the portal asks you to try later.',
      },
      note: 'Change buttons appear only where the server gives you write access. In Read only folders you can view and download.',
    },
    {
      id: 'organize',
      title: 'Renaming, moving and deleting',
      body: `The file menu (right-click or ⋯) lets you **rename**, **move or copy** and **delete**. Select several files to act on them at once.

Moving and copying work only between folders of **the same server**. Names cannot contain \\ / : * ? " < > |.`,
      steps: [
        'Select the files and choose Move or copy.',
        'Open the destination folder in the Destination window.',
        'Press Move here or Copy here.',
      ],
      note: 'Deleting happens directly on the file server; there is no trash. Only IT can restore a file from backup.',
    },
    {
      id: 'zip',
      title: 'Download as ZIP',
      body: 'To take many files at once, select them and press **Download ZIP**, or choose **Download folder as ZIP** in a folder’s menu. The archive is built on the fly and keeps sub-folders.',
      example: {
        title: 'Send a document set',
        body: 'An accountant needs to pass all the quarter’s acts to the auditor. She opens “Acts\\2026-Q3”, chooses Download folder as ZIP and attaches one file to the email.',
      },
    },
    {
      id: 'links',
      title: 'Public links',
      body: `In a file or folder menu choose **Share by link**. The main settings are right there:

- **What the recipient can do**: View or View and download (the default); for folders More… opens the other options;
- **Expires**: no expiry, 1, 7 or 30 days, or a date;
- **Password**: optional, at least 4 characters, with a Generate button;
- **Link address**: a readable address such as \`/d/chertezhi-sever\`, checked as you type (Available / Taken); empty means a random address.

**Advanced settings** hold Upload only (the recipient sends files and never sees what is in the folder), View and upload, Full access or single actions (upload, create folders, rename, replace, delete); upload rules (size, types, a total limit, the visitor’s name and e-mail, notifications); a title and message for the recipient; **who can open** (Anyone with the link or Employees only); and a preview of the recipient’s page.

Create and copy puts the link on the clipboard and shows a QR code and Open as recipient. You can change a link later, in the link window or under **My links**. Changing the address stops the old one at once.

Changes through a link are made with your file-server account, so you can only give what you can do yourself. **File servers have no recycle bin**: deleting through a link cannot be undone, so grant it with care.`,
      example: {
        title: 'Drawings for a contractor',
        body: 'An engineer shares “North project\\Drawings” by a link for anyone, with a password and 30 days. The contractor views the DWGs in the browser and downloads what he needs, but sees nothing outside that folder. To collect scans from a client, a manager makes an “Upload only” link that asks for a name: the client drops the files, sees only their own uploads, and the manager gets one notification.',
      },
      note: 'A link works on your behalf: while you are an employee and have access to the item on the server. If you lose access or leave the company, the link switches off automatically.',
    },
    {
      id: 'cad',
      title: 'Viewing AutoCAD drawings',
      body: `**DWG** and **DXF** files open in the built-in CAD viewer, no AutoCAD needed:

- drag to pan, scroll to zoom;
- **Fit to screen** shows the whole drawing again;
- **Layers** let you hide what you do not need.

A large drawing may take a few seconds the first time.`,
      note: 'If a drawing will not show, its format is not supported yet: download it and open it in AutoCAD.',
    },
    {
      id: 'activity',
      title: 'Activity log (administrators)',
      body: `The **Activity log** shows who did what on the file server: opened, searched, downloaded, uploaded, renamed, moved, deleted, created links and signed in. You see the time, the person (or link visitor and IP), folder, path and result.

It needs the “File server activity log” permission. **Activity history** in a file or folder menu opens the log filtered to that item.

Filters: period, search, people, actions, folders, result, portal or public links. **Export CSV** downloads everything that matches (up to 100,000 rows) for Excel.`,
      example: {
        title: 'Who deleted the contract?',
        body: 'Open the *Contracts* folder menu → Activity history, pick the Deletion group and “7 days”. The list shows who deleted the file and when.',
      },
      note: 'Opening the same file or folder again within a few minutes counts as one event.',
    },
    {
      id: 'admin',
      title: 'Servers and folders (administrators)',
      body: `**Settings → Modules → File server** (the “File server admin” permission).

**General:** drive name and subtitle, opening files (own page or modal), “Use the portal sign-in”, “Hide folders without access”, maximum upload size, public links and who may open them, the activity log and how long to keep it.

**A file server:** name, address (DNS or IP), domain, port 445 and the sign-in mode:

- **Personal domain accounts** (recommended): NTFS rights and AD groups apply to each person;
- **One service account**: everyone works as one account; limit folder visibility with portal groups.

**Test** checks the connection and lists the shares.

**A folder:** its name on the drive, the share, an optional sub-folder, the path shown to people (e.g. DFS), “Visible to” groups and “Allow public links”. Folders can be reordered.

**All public links** lists every link with its author; any of them can be turned off.`,
      example: {
        title: 'Publish the accounting folder',
        body: 'Server fs01 has a Data share with Departments\\Accounting inside. Add a folder: name *Accounting*, share Data, sub-folder Departments\\Accounting, “Allow public links” off. People see an *Accounting* tile, and only those the server grants rights can open it.',
      },
      note: 'Even a portal administrator sees inside folders only what the file server allows.',
    },
  ],
  faq: [
    {
      q: 'Which login and password do I enter?',
      a: 'The same ones you use for your Windows work PC (your domain account). The Domain field can usually be left empty.',
    },
    {
      q: 'It says the server rejected the saved password. What now?',
      a: 'You most likely changed your domain password. Open Connections and sign in again with the new one. The portal stops trying the old password, so your account will not get locked.',
    },
    {
      q: 'Why can’t I see a folder, or why does it have a lock?',
      a: 'Your account has no rights to that folder on the server. Ask your manager or IT to add you to the right security group.',
    },
    {
      q: 'Can I restore a deleted file?',
      a: 'Not in the portal: the file server has no trash. Contact IT; they can restore it from backup.',
    },
    {
      q: 'It says “The file is open in another program”.',
      a: 'A colleague has the file open, e.g. in Word or Excel. You can view it, and change it once they close it.',
    },
    {
      q: 'Why did a link I sent stop working?',
      a: 'It may have expired, you may have turned it off, the file may have been moved or deleted on the server, or you lost access to it. My links shows the state of each link.',
    },
    {
      q: 'How do I open the same folder in Windows Explorer?',
      a: 'Press Copy network path and paste it into Explorer’s address bar.',
    },
  ],
  fields: {
    linkAudience: {
      title: 'Who can open',
      text: '“Anyone with the link” is for partners and clients. “Employees only” opens only after signing in to the portal.',
      more: 'links',
    },
    linkExpires: {
      title: 'Expiry',
      text: 'After this date the link switches off by itself. The administrator may cap the lifetime.',
      more: 'links',
    },
    linkWrite: {
      title: 'Links that allow changes',
      text: 'Lets people grant uploads, new folders, renaming, replacing and deleting through links. Everything runs with the link author’s account and within their rights on the server; every action is logged with the visitor’s name.',
      more: 'links',
    },
    username: {
      title: 'User name',
      text: 'Your Windows login: ivan.petrov, CORP\\ivan.petrov or ivan@corp.local.',
      more: 'connect',
    },
    domain: {
      title: 'Domain',
      text: 'Usually left empty: the company domain is used. Fill it in only if IT asked you to.',
      more: 'connect',
    },
    authMode: {
      title: 'How people sign in',
      text: 'Personal accounts keep each person’s NTFS and AD group rights. A service account gives everyone the same rights, so limit folders with portal groups.',
      more: 'admin',
    },
    activityLog: {
      title: 'Activity log',
      text: 'Records who opened, downloaded, changed and deleted what. People with the “File server activity log” permission can read it.',
      more: 'activity',
    },
  },
  related: [
    'files',
    'kb',
  ],
};
