export default {
  id: 'drive',
  purpose: 'The file server opens the company’s Windows shares (SMB, Samba) in the browser as one network drive: viewing, editing, uploads, links and an activity log. Rights come from the server (NTFS, Active Directory groups); the portal never bypasses them.',
  audience: 'People working with shared folders; the system administrator connects servers and manages access.',
  setup: [
    {
      title: 'Switch it on and name the drive',
      text: 'The module is off by default. In the [settings](/admin/settings/drive) give it a name, e.g. «Company drive».',
    },
    {
      title: 'Add servers and folders',
      text: 'Server address and the shares people see. Sign-in uses each person’s domain account.',
    },
    {
      title: 'Connect Active Directory',
      text: 'The [AD integration](/admin/settings/ad) is needed for «Access management» (folder access groups) and reusing the domain password.',
    },
    {
      title: 'Links and log',
      text: 'Public link policy, the activity log and how long it is kept.',
    },
  ],
  roles: {
    'drive.admin': 'Module settings, servers and folders.',
    'drive.audit': 'Activity log: who opened, changed or deleted what.',
    'drive.access': 'Membership of folder access groups in AD (except protected ones). NTFS rights are for superadministrators only.',
  },
  scenarios: [
    {
      title: 'Remote work',
      text: 'An employee opens the department folder from home in the browser, without VPN; rights are the same as in the office.',
    },
    {
      title: 'Granting folder access',
      text: 'A manager asks for access — the administrator adds the person to the folder’s read group in the «Access» panel, logged in the journal.',
    },
  ],
  faq: [
    {
      q: 'Does the portal keep copies?',
      a: 'No, files stay on the file server; only previews are cached.',
    },
    {
      q: 'Does it work without Active Directory?',
      a: 'Yes for plain share access. Without AD only access group management is unavailable.',
    },
  ],
};
