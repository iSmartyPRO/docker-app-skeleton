export default {
  id: 'files',
  purpose: 'Files is the portal’s cloud storage: everyone’s personal files, department spaces, sharing and public links with a password and expiry. The knowledge base keeps its materials here too.',
  audience: 'Every employee; the files administrator manages spaces, quotas and the link policy.',
  setup: [
    {
      title: 'Limits',
      text: 'In the [settings](/admin/settings/files): maximum file size, personal quota, trash retention, allowed file types.',
    },
    {
      title: 'Public link policy',
      text: 'Whether links are allowed, whether a password is required, the longest lifetime, whether visitors may upload.',
    },
    {
      title: 'Shared spaces',
      text: 'Decide who creates them (everyone or administrators) and create department spaces with group access.',
    },
    {
      title: 'Office document previews',
      text: 'Connect a [document server](/admin/settings/documents) (Collabora) for exact previews and online editing.',
    },
  ],
  roles: {
    'files.admin': 'Create shared spaces when others may not, manage every space and the module settings. It does not open other people’s personal files.',
  },
  access: 'Access is set on a space, folder or file: view, edit, manage — for a user, group or role.',
  scenarios: [
    {
      title: 'Exchange with a client',
      text: 'A manager links the «For the client» folder with a password, a 14-day expiry and upload rights — the client sends documents without e-mail.',
    },
    {
      title: 'Accounting space',
      text: 'The space is open to the «Accounting» group to edit and to management to view.',
    },
  ],
  faq: [
    {
      q: 'Where are files stored?',
      a: 'In the portal server’s upload folder; they are served only after an access check.',
    },
    {
      q: 'What if public links are turned off?',
      a: 'Every existing link stops working at once.',
    },
    {
      q: 'Can a deleted file be restored?',
      a: 'Yes, from the trash within the retention period.',
    },
  ],
};
