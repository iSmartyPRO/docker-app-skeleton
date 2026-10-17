export default {
  id: 'kb',
  purpose: 'The knowledge base is a library of policies, how-tos and templates: folders of any depth, articles, files and links, PDF and Office previews in the browser, folder permissions and public links.',
  audience: 'Everyone reads; department editors (HR, legal, IT) fill their sections.',
  setup: [
    {
      title: 'Default look',
      text: 'Icon and colour of folders without their own — in the [settings](/admin/settings/kb).',
    },
    {
      title: 'File types and size',
      text: 'Which file groups may be uploaded and the maximum size.',
    },
    {
      title: 'Structure and access',
      text: 'Create sections per department, give editors edit rights on their folders and everyone else view.',
    },
    {
      title: 'Public links',
      text: 'Allow them if materials are shared outside; require a password if needed.',
    },
  ],
  roles: {
    'kb.admin': 'Full access to every folder and the module settings.',
  },
  access: 'Access is inherited down the folders; a folder or material can have its own.',
  scenarios: [
    {
      title: 'Onboarding',
      text: 'A «Newcomers» section with «Your first day», «Who does what» and links to forms.',
    },
    {
      title: 'Contract templates',
      text: 'Lawyers keep a templates folder; others see only the current versions.',
    },
  ],
  faq: [
    {
      q: 'Why does Word show as PDF?',
      a: 'Exact layout needs a document server (Collabora). Without it a simplified view is shown.',
    },
    {
      q: 'Are KB files linked with Files?',
      a: 'Yes, they are stored in Files; one file can appear in several articles.',
    },
  ],
};
