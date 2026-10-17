export default {
  id: 'directory',
  purpose: 'The AD directory shows and changes Active Directory accounts inside one OU — the managed root: the OU tree, users, groups and computers, status, password, last sign-in, group membership. Every change runs as the acting administrator’s own domain account, needs a confirmation and is written to the journal. It links AD accounts with portal users and employee cards.',
  audience: 'System administrators and the helpdesk: onboarding and offboarding, password resets, unlocking, finding inactive accounts.',
  setup: [
    {
      title: 'Connect Active Directory',
      text: 'In the [AD integration](/admin/settings/ad) — the domain controller and a **service account** that may **read** the managed root (any domain account can by default). The service account only reads: it never changes anything. Without the integration the module can still be switched on — its page explains the setup, and a superadministrator can fill the demo directory.',
    },
    {
      title: 'Choose the root and exclusions',
      text: 'In the [module settings](/admin/settings/directory) — the **managed root**, e.g. `OU=Accounts,DC=example,DC=local` («Browse» walks the directory from the base DN). Nothing above it is shown or changed. **Excluded OUs** — a full DN (the OU with everything below) or a name pattern (`Service*`, `Admins`): they never appear in the tree, lists or search, and a request with a crafted DN is refused too. **Hidden accounts** — login patterns (`svc_*`, `adm-*`).',
    },
    {
      title: 'A secure channel for passwords',
      text: 'Active Directory accepts a new password (`unicodePwd`) only over an encrypted connection. Turn on «Use TLS» (LDAPS, port 636) in the integration or **StartTLS** in the module settings — the domain controller needs a certificate. «Check» in the settings shows whether it works. Without it everything else works over plain LDAP, and password reset is off — the dialog says so. Passwords are never stored.',
    },
    {
      title: 'Delegate rights to the administrators in AD',
      text: 'Changes run as the portal administrator’s **own AD account** (the same as in «File server → Access»): the portal asks for the domain password once, checks it with a sign-in to the domain and keeps it encrypted. So the rights live in AD: e.g. delegate on `OU=Accounts` to the helpdesk group «Reset password», «Read/Write lockoutTime», «Read/Write pwdLastSet», and to administrators creating users, writing attributes, moving and «Write Members» on groups.',
    },
    {
      title: 'Give portal roles',
      text: 'Permissions `ad.view`, `ad.manage`, `ad.passwords`, `ad.admin` — in Roles. The portal role is an extra layer: Active Directory still decides. Set the login template, UPN suffixes, OUs for new and offboarded users — and the module is ready.',
    },
  ],
  roles: {
    'ad.view': 'Tree, lists, cards, journal. Changes nothing.',
    'ad.manage': 'Create users, attributes, move, enable / disable, unlock, group membership (except folder access groups `sg_…`).',
    'ad.passwords': 'Password reset with «must change at next logon» and unlocking — for the helpdesk. Needs LDAPS or StartTLS.',
    'ad.admin': 'Everything, including protected administrative accounts (`adminCount`).',
  },
  access: 'API tokens never reach the module; a «sign in as» session only reads. Folder access groups (`sg_…`) are shown in the card but changed only in «File server → Access».',
  scenarios: [
    {
      title: 'Onboarding an employee',
      text: 'In the employee card — the «AD account» tab → «Create AD user for the employee»: names and title are filled in, the login follows the template (`{f}.{last}` → `a.smith`, a taken one gets a number), the unit’s OU, an initial password with «must change at next logon», groups. Then «Create portal user» in the AD card — the employee signs in with the domain login.',
    },
    {
      title: 'Offboarding',
      text: 'Select the accounts → «Offboard»: the preview shows what is disabled and moved to the disabled OU (e.g. `OU=Disabled`) and what is refused (excluded, protected) — before anything changes. After the confirmation everything is journalled.',
    },
    {
      title: 'Password reset by the helpdesk',
      text: 'Find the person with the search across the root → «Reset password»: «Generate», «must change at next logon», unlock as well. The password travels only over LDAPS/StartTLS and is not stored; pass it on in person or by phone.',
    },
    {
      title: 'Inactive accounts',
      text: 'The «Inactive» section — not signed in for more than N days (a setting) or never. Review, then disable or move in bulk. AD updates `lastLogonTimestamp` with a delay of up to two weeks — that is expected.',
    },
  ],
  faq: [
    {
      q: 'Why is password reset unavailable?',
      a: 'There is no secure channel: Active Directory does not accept passwords over plain LDAP. Turn on LDAPS in the integration or StartTLS in the module settings and press «Check».',
    },
    {
      q: 'What does «Active Directory refused: no rights» mean?',
      a: 'The portal allowed it, but your AD account has no delegated right on that OU. Ask for delegation — the portal never bypasses AD rights.',
    },
    {
      q: 'Why is a new user disabled?',
      a: 'Without a password Active Directory does not enable an account. Set the password from the card (needs LDAPS/StartTLS).',
    },
    {
      q: 'Where do I manage sg_… groups?',
      a: 'In «File server → Access»: there they are tied to folders and NTFS rights. The AD card shows them read-only with a link.',
    },
    {
      q: 'Can I try the module without AD?',
      a: 'Yes: a superadministrator fills the demo directory (the module’s demo data). It is badged «Demo directory», makes no LDAP calls and goes with the demo data.',
    },
  ],
};
