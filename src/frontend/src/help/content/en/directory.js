export default {
  id: 'directory',
  icon: 'directory',
  title: 'AD directory',
  tagline: 'The company’s Active Directory accounts — find, check, help, create.',
  summary: 'The AD directory shows the domain’s users, groups and computers inside the allowed part (the managed root). Find a person, see whether they are locked out and when they last signed in, reset a password, create an account for a new employee or disable a leaver. Everything runs as your own AD account and is journalled.',
  highlights: [
    {
      icon: '🌳',
      title: 'OU tree',
      text: 'Units with object counts; service OUs are hidden.',
    },
    {
      icon: '🔎',
      title: 'Search and filters',
      text: 'Across the root: disabled, locked, password expired, inactive.',
    },
    {
      icon: '🪪',
      title: 'The card',
      text: 'Status, password, last sign-in, groups, links to the portal and the employee.',
    },
    {
      icon: '🔑',
      title: 'Password reset',
      text: 'With a generator and «must change at next logon»; secure channel only.',
    },
    {
      icon: '🧭',
      title: 'New user wizard',
      text: 'Login from the template with an availability check, OU, password, groups.',
    },
    {
      icon: '📜',
      title: 'Journal',
      text: 'Who changed what, as which AD account.',
    },
  ],
  tips: [
    'The search covers the whole root, not just the selected OU.',
    '«Inactive», «Locked», «Disabled» in the left menu are ready-made lists.',
    'The column choice (the gear above the list) is remembered in the browser.',
    'Select several rows — bulk actions with a preview appear.',
    'Pass a new password on in person or by phone, not in a chat.',
  ],
  sections: [
    {
      id: 'browse',
      title: 'Tree and lists',
      body: `On the left — the units (OUs) inside the managed root; the number is how many users, groups and computers it holds. On the right — the objects of the selected OU; «Sub-OUs» shows nested ones too.

Filters: object type and status — **disabled**, **locked**, **password expired**, **never signed in**, **inactive N days**. On a phone the tree opens with the button showing the OU name.`,
    },
    {
      id: 'card',
      title: 'The card',
      body: `Click a row. The card shows the login and UPN, title, department, manager, phones, OU, the **status** (enabled / disabled / locked), when the password was set and expires, the last sign-in, **groups** with their type and the **history** of changes through the portal.

Folder access groups (\`sg_…\`) are read-only here — they are managed in «File server → Access».`,
    },
    {
      id: 'password',
      title: 'Password reset and unlocking',
      steps: [
        'Open the card and press «Reset password».',
        'Press «Generate» or type a password — the list below shows whether it fits.',
        'Keep «Must change at next logon» and, if needed, «Unlock the account too».',
        'Confirm and copy the password to pass it on.',
      ],
      note: 'If the button is off with «no secure channel» — Active Directory accepts passwords only over LDAPS/StartTLS. An administrator sets it up.',
    },
    {
      id: 'create',
      title: 'A new user',
      body: `«New user» opens the wizard: names → login (from the company template, checked across the domain) → OU → UPN and e-mail → initial password → groups → check. Without a password the account is created disabled.

From an employee card «Create AD user for the employee» does the same with the fields filled in.`,
    },
    {
      id: 'bulk',
      title: 'Bulk actions and offboarding',
      body: 'Select rows — «Disable», «Enable», «Move» and «Offboard» (disable and move to the disabled OU) appear above the list. A preview comes first: what changes and what is skipped. Nothing changes before you confirm.',
    },
    {
      id: 'password-prompt',
      title: 'Why the portal asks for my domain password',
      body: 'Changes in AD run as **your** AD account — so Active Directory checks your rights itself and the journal shows who did what. The password is entered once, checked by the domain controller and kept encrypted (the same as for the File server).',
    },
  ],
  faq: [
    {
      q: 'Why can’t I see some OUs?',
      a: 'Service and administrators’ OUs are hidden by the module settings, and nothing above the managed root is shown at all.',
    },
    {
      q: '«Last sign-in» lags behind',
      a: 'Active Directory updates it with a delay of up to two weeks — enough to find long-inactive accounts.',
    },
    {
      q: 'I changed a group but there is no access',
      a: 'Group membership applies at the person’s next Windows sign-in.',
    },
    {
      q: 'What is the «Demo directory»?',
      a: 'Demo data without a real domain: try everything without breaking anything.',
    },
  ],
  related: [
    'drive',
  ],
};
