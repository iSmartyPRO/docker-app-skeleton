export default {
  groups: {
    console: 'Console',
    people: 'People & access',
    audit: 'Audit',
    settings: 'Settings',
    module_kb: 'Knowledge base',
    module_tasks: 'Tasks',
    module_calendar: 'Calendar',
    module_files: 'Files',
    module_drive: 'File server',
    module_dashboard: 'Dashboard',
    module_chat: 'Chats',
    api: 'API',
    module_resources: 'Online resources',
    module_companies: 'Counterparties',
    module_crm: 'CRM',
    module_masterplan: 'Masterplan',
    module_approvals: 'Approvals',
    module_contracts: 'Module: Contracts',
    module_procurement: 'Procurement',
    module_warehouse: 'Warehouse',
    module_org: 'Org structure',
    module_employees: 'Employees',
    module_directory: 'AD directory',
  },
  console_access: {
    title: 'Open the admin console',
    desc: 'Required for any work in /admin.',
  },
  users_view: {
    title: 'View users',
    desc: 'See accounts, groups and roles.',
  },
  users_manage: {
    title: 'Manage users',
    desc: 'Create accounts, edit profiles, reset passwords, block, assign groups and roles they hold.',
  },
  users_delete: {
    title: 'Delete users',
    desc: 'Permanently remove accounts.',
  },
  groups_manage: {
    title: 'Manage groups',
    desc: 'Create groups, set their roles and members.',
  },
  roles_manage: {
    title: 'Manage roles',
    desc: 'Create roles and change which permissions they grant.',
  },
  activity_view: {
    title: 'View activity',
    desc: 'Security events and sign-in history.',
  },
  settings_view: {
    title: 'View settings',
    desc: 'Read every settings screen without changing it.',
  },
  settings_general: {
    title: 'Branding & appearance',
    desc: 'Name, logos, theme, typography, icons.',
  },
  settings_security: {
    title: 'Security policy',
    desc: 'Site access, lockouts, sessions, IP filtering.',
  },
  settings_auth: {
    title: 'Sign-in methods',
    desc: 'Password, Active Directory, Telegram, one-time codes.',
  },
  settings_integrations: {
    title: 'Integrations',
    desc: 'Email, Telegram, WhatsApp, Wazzup, Active Directory.',
  },
  settings_system: {
    title: 'System',
    desc: 'API rate limits and runtime information.',
  },
  settings_modules: {
    title: 'Modules',
    desc: 'Switch modules on or off and change their system settings.',
  },
  kb_admin: {
    title: 'Knowledge base admin',
    desc: 'Full access to every folder and material, regardless of folder access.',
  },
  tasks_admin: {
    title: 'Tasks admin',
    desc: 'Manage every project, its tasks and access, regardless of project access.',
  },
  calendar_admin: {
    title: 'Calendar admin',
    desc: 'Manage every shared calendar and its access. Personal calendars stay private.',
  },
  files_admin: {
    title: 'Files admin',
    desc: 'Manage every shared space and its access. Personal files stay private.',
  },
  drive_admin: {
    title: 'File server admin',
    desc: 'Add file servers and folders, and see every public link. Content access is still decided by the server.',
  },
  drive_audit: {
    title: 'File server activity log',
    desc: 'See who opened, downloaded, changed or deleted what on the file server, and export the log.',
  },
  drive_access: {
    title: 'File server: folder access groups (system administrator)',
    desc: 'File server → «Access»: add and remove people in the folder security groups (sg_…), except protected root groups. Changes are made with the administrator’s own AD account.',
  },
  dashboard_admin: {
    title: 'Dashboard admin',
    desc: 'Set the starting dashboard everyone gets until they arrange their own.',
  },
  chat_admin: {
    title: 'Chat admin',
    desc: 'Create group chats when they are limited, delete any message.',
  },
  api_tokens: {
    title: 'Personal API tokens',
    desc: 'Create tokens that act with your own rights, narrowed by scopes.',
  },
  api_admin: {
    title: 'API administration',
    desc: 'Tokens of anyone, access templates, webhooks, request log and API settings.',
  },
  resources_admin: {
    title: 'Manage online resources',
    desc: 'Add, edit and order resources and choose who sees each one.',
  },
  companies_admin: {
    title: 'Counterparties admin',
    desc: 'Change any card, delete for good and configure the module.',
  },
  crm_admin: {
    title: 'CRM administrator',
    desc: 'Settings, pipelines and stages; sees and edits every deal.',
  },
  crm_all: {
    title: 'All deals',
    desc: 'Sees and edits every deal, whoever owns it.',
  },
  masterplan_admin: {
    title: 'Administrator',
    desc: 'Everything: hierarchy, site plans, team, directories, booking rules.',
  },
  masterplan_executive: {
    title: 'Management',
    desc: 'Sees everything incl. minimum prices and money; closes / opens sales, rolls statuses back, changes prices without limits.',
  },
  masterplan_sales_head: {
    title: 'Head of sales',
    desc: 'All sales in the zone: reserves, bookings, extensions, releases, contracts, rollbacks with a reason; prices within the limit; sees minimum prices.',
  },
  masterplan_sales: {
    title: 'Sales manager',
    desc: 'Reserves and books available units, extends own booking once, releases own with a reason; sees clients of own bookings only.',
  },
  masterplan_finance: {
    title: 'Finance',
    desc: 'Confirms deposits and full payment (Booking → Deposit, Contract → Sold); sees amounts.',
  },
  masterplan_legal: {
    title: 'Legal',
    desc: 'Contracts (number and date) and handover acts; sees clients and amounts.',
  },
  masterplan_construction_head: {
    title: 'Head of construction',
    desc: 'Construction in the zone: stages, journal, moderation; sees statuses without clients and amounts; hands over.',
  },
  masterplan_foreman: {
    title: 'Foreman',
    desc: 'Reports and stage progress only in the zone; no sales data.',
  },
  masterplan_marketing: {
    title: 'Marketing',
    desc: 'Media and characteristics of units; statuses and prices without clients.',
  },
  approvals_admin: {
    title: 'Approvals administrator',
    desc: 'Routes of every document type, urgency levels, everyone’s substitutes; sees and manages every approval.',
  },
  contracts_create: {
    title: 'Create contracts',
    desc: 'Add contracts to the registry and send them to approval.',
  },
  contracts_view_all: {
    title: 'See every contract',
    desc: 'Management: the whole registry. Others see their own contracts, their group’s and those they approve.',
  },
  contracts_legal: {
    title: 'Lawyer',
    desc: 'Every contract; risks; marks contracts as signed, in force, completed and terminated.',
  },
  contracts_admin: {
    title: 'Contracts administrator',
    desc: 'Settings, the approval route of contracts, everything a lawyer can do.',
  },
  contracts_finance: {
    title: 'Finance (contracts)',
    desc: 'Confirms deposits, registers payments received, the payments registry. Sees the contracts that have a deposit or a payment schedule.',
  },
  procurement_create: {
    title: 'File purchase requests',
    desc: 'Needed when «anyone may file requests» is off in the module settings.',
  },
  procurement_view_all: {
    title: 'See every request',
    desc: 'Management: all requests and the summary over them. Others see their own, their groups’ and those they approve.',
  },
  procurement_pay: {
    title: 'Accounting: payments',
    desc: 'Payments registry, marking payments with payment orders; sees approved requests.',
  },
  procurement_admin: {
    title: 'Procurement administrator',
    desc: 'Categories, currencies, numbering, the approval route; manages every request.',
  },
  warehouse_view: {
    title: 'See stock',
    desc: 'Stock and availability without sums, «my tools», own documents. On every warehouse (or per warehouse by assignment).',
  },
  warehouse_request: {
    title: 'File requisitions',
    desc: 'Create an issue requisition (draft → storekeeper).',
  },
  warehouse_operate: {
    title: 'Storekeeper',
    desc: 'Create and post receipts, issues, transfers and returns.',
  },
  warehouse_writeoff: {
    title: 'Write off',
    desc: 'Write-offs (with approval above the threshold).',
  },
  warehouse_inventory: {
    title: 'Inventory',
    desc: 'Inventory counts and acts.',
  },
  warehouse_cost: {
    title: 'See costs and sums',
    desc: 'Cost and sums in every screen, report, export and API answer.',
  },
  warehouse_backdate: {
    title: 'Backdate documents',
    desc: 'Documents dated in the past, in the open period.',
  },
  warehouse_admin: {
    title: 'Warehouse administrator',
    desc: 'Directories, warehouses, bins, norms, corrections, settings.',
  },
  org_manage: {
    title: 'Manage the org structure',
    desc: 'Edit units, move them, set heads, unit types and purposes, place accounts in units.',
  },
  employees_view: {
    title: 'Employee directory',
    desc: 'Names, positions, units, sites and work contacts of working people.',
  },
  employees_hr: {
    title: 'HR: everything about employees',
    desc: 'Every card and status, personal contacts and birthdays, documents, clearances, HR notes; creating cards and portal accounts.',
  },
  employees_admin: {
    title: 'Employees administrator',
    desc: 'The positions directory and the module settings.',
  },
  ad_view: {
    title: 'AD directory: view',
    desc: 'Browse OUs, users, groups and computers within the managed root, the journal.',
  },
  ad_manage: {
    title: 'AD directory: manage accounts',
    desc: 'Create users, edit attributes, move, enable / disable, unlock, group membership (not folder access groups). Runs with the administrator’s own AD account.',
  },
  ad_passwords: {
    title: 'AD directory: reset passwords',
    desc: 'Reset passwords (with «must change at next logon») and unlock accounts. Needs LDAPS or StartTLS.',
  },
  ad_admin: {
    title: 'AD directory: administrator',
    desc: 'Everything in the module, including protected (administrative) accounts.',
  },
};
