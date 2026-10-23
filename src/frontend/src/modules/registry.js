import { lazy } from 'react';
import { canAny } from '../lib/access';
import { lazyPage } from '../lib/lazyPage';

/*
 * Each module's frontend entry, modules/<id>/register.js (in a package:
 * web/index.js), runs once at start: it contributes to the shell's extension
 * points (platform/extensions.js — header buttons, public pages, chat events,
 * tours, «Связи» blocks; platform/widgets/registry.js — dashboard widgets).
 * A module without the file simply adds nothing; the shell never imports
 * module files itself. This file is the composition root.
 */
import.meta.glob('./*/register.js', { eager: true });

/**
 * Frontend side of the module platform. Each entry is an app reachable at
 * /app/<id>; the backend decides whether it is enabled (settings.modules).
 * Adding a module: an entry here, a backend module, and i18n `apps.<id>.*`.
 * `permission`: the module is listed (launcher, /apps, quick actions) only for
 * people who have it (a list: any of them) — the API enforces it again.
 */
export const MODULE_REGISTRY = [
  {
    id: 'dashboard',
    path: '/app/dashboard',
    icon: 'dashboard',
    labelKey: 'apps.dashboard.name',
    descKey: 'apps.dashboard.desc',
    App: lazyPage(() => import('./dashboard/DashboardApp')),
    Settings: lazy(() => import('./dashboard/DashboardSettings')),
  },
  {
    // Approvals: the «Ждёт меня» inbox. A core service, always on (no switch in Settings → Modules).
    id: 'approvals',
    path: '/app/approvals',
    icon: 'inbox',
    core: true,
    labelKey: 'apps.approvals.name',
    descKey: 'apps.approvals.desc',
    App: lazyPage(() => import('./approvals/ApprovalsApp')),
    Settings: lazy(() => import('./approvals/ApprovalsSettings')),
  },
  {
    id: 'chat',
    path: '/app/chat',
    icon: 'chat',
    labelKey: 'apps.chat.name',
    descKey: 'apps.chat.desc',
    App: lazyPage(() => import('./chat/ChatApp')),
    Settings: lazy(() => import('./chat/ChatSettings')),
  },
  {
    id: 'resources',
    path: '/app/resources',
    icon: 'compass',
    labelKey: 'apps.resources.name',
    descKey: 'apps.resources.desc',
    App: lazyPage(() => import('./resources/ResourcesApp')),
    Settings: lazy(() => import('./resources/ResourcesSettings')),
  },
  {
    // Counterparties: a core service (its API serves CRM, Contracts, Procurement…). An administrator
    // may still hide it in Settings → Modules: then no app, widgets or pages (docs/companies.md).
    id: 'companies',
    path: '/app/companies',
    core: true,
    icon: 'building',
    labelKey: 'apps.companies.name',
    descKey: 'apps.companies.desc',
    App: lazyPage(() => import('./companies/CompaniesApp')),
    Settings: lazy(() => import('./companies/CompaniesSettings')),
  },
  {
    id: 'files',
    path: '/app/files',
    icon: 'folder',
    labelKey: 'apps.files.name',
    descKey: 'apps.files.desc',
    App: lazyPage(() => import('./files/FilesApp')),
    Settings: lazy(() => import('./files/FilesSettings')),
  },
  {
    id: 'kb',
    path: '/app/kb',
    icon: 'graduation',
    labelKey: 'apps.kb.name',
    descKey: 'apps.kb.desc',
    App: lazyPage(() => import('./kb/KbApp')),
    Settings: lazy(() => import('./kb/KbSettings')),
  },
  {
    id: 'tasks',
    path: '/app/tasks',
    icon: 'tasks',
    labelKey: 'apps.tasks.name',
    descKey: 'apps.tasks.desc',
    App: lazyPage(() => import('./tasks/TasksApp')),
    Settings: lazy(() => import('./tasks/TasksSettings')),
  },
  {
    id: 'crm',
    path: '/app/crm',
    icon: 'target',
    labelKey: 'apps.crm.name',
    descKey: 'apps.crm.desc',
    App: lazyPage(() => import('./crm/CrmApp')),
    Settings: lazy(() => import('./crm/CrmSettings')),
  },
  {
    id: 'masterplan',
    path: '/app/masterplan',
    icon: 'siteplan',
    labelKey: 'apps.masterplan.name',
    descKey: 'apps.masterplan.desc',
    App: lazyPage(() => import('./masterplan/MasterplanApp')),
    Settings: lazy(() => import('./masterplan/MasterplanSettings')),
  },
  {
    id: 'procurement',
    path: '/app/procurement',
    icon: 'cart',
    labelKey: 'apps.procurement.name',
    descKey: 'apps.procurement.desc',
    App: lazyPage(() => import('./procurement/ProcurementApp')),
    Settings: lazy(() => import('./procurement/ProcurementSettings')),
  },
  {
    id: 'warehouse',
    path: '/app/warehouse',
    icon: 'box',
    labelKey: 'apps.warehouse.name',
    descKey: 'apps.warehouse.desc',
    App: lazyPage(() => import('./warehouse/WarehouseApp')),
    Settings: lazy(() => import('./warehouse/WarehouseSettings')),
  },
  {
    id: 'contracts',
    path: '/app/contracts',
    icon: 'clipboard',
    labelKey: 'apps.contracts.name',
    descKey: 'apps.contracts.desc',
    App: lazyPage(() => import('./contracts/ContractsApp')),
    Settings: lazy(() => import('./contracts/ContractsSettings')),
  },
  {
    id: 'calendar',
    path: '/app/calendar',
    icon: 'calendar',
    labelKey: 'apps.calendar.name',
    descKey: 'apps.calendar.desc',
    App: lazyPage(() => import('./calendar/CalendarApp')),
    Settings: lazy(() => import('./calendar/CalendarSettings')),
  },
  {
    // Employees (docs/employees.md): listed for everyone; the module itself decides what each person sees.
    id: 'employees',
    path: '/app/employees',
    icon: 'people',
    labelKey: 'apps.employees.name',
    descKey: 'apps.employees.desc',
    App: lazyPage(() => import('./employees/EmployeesApp')),
    Settings: lazy(() => import('./employees/EmployeesSettings')),
  },
  {
    // AD directory (docs/directory.md): listed only for people with an ad.* permission.
    id: 'directory',
    path: '/app/directory',
    icon: 'directory',
    permission: ['ad.view', 'ad.manage', 'ad.passwords', 'ad.admin'],
    labelKey: 'apps.directory.name',
    descKey: 'apps.directory.desc',
    App: lazyPage(() => import('./directory/DirectoryApp')),
    Settings: lazy(() => import('./directory/DirectorySettings')),
  },
  {
    // QR codes (docs/qr.md): branded codes from templates; templates for qr.admin.
    id: 'qr',
    path: '/app/qr',
    icon: 'qr',
    labelKey: 'apps.qr.name',
    descKey: 'apps.qr.desc',
    App: lazyPage(() => import('./qr/QrApp')),
    Settings: lazy(() => import('./qr/QrSettings')),
  },
  {
    // Remote access & assistance (docs/specs/remote-access.ru.md). Listed only for people with a remote.* permission.
    id: 'remote',
    path: '/app/remote',
    icon: 'remote',
    permission: ['remote.view', 'remote.connect', 'remote.monitor', 'remote.admin'],
    labelKey: 'apps.remote.name',
    descKey: 'apps.remote.desc',
    App: lazyPage(() => import('./remote/RemoteApp')),
    Settings: lazy(() => import('./remote/RemoteSettings')),
  },
  {
    id: 'drive',
    path: '/app/drive',
    icon: 'server',
    labelKey: 'apps.drive.name',
    descKey: 'apps.drive.desc',
    App: lazyPage(() => import('./drive/DriveApp')),
    Settings: lazy(() => import('./drive/DriveSettings')),
  },
];

/**
 * Modules without a page of their own (drawn over every page). They appear in
 * Settings → Modules with an on/off switch and their own settings screen.
 */
export const FEATURE_MODULES = [
  {
    id: 'assistant',
    icon: 'robot',
    labelKey: 'apps.assistant.name',
    descKey: 'apps.assistant.desc',
    Settings: lazy(() => import('./assistant/AssistantSettings')),
  },
  {
    // Org structure: a core service without a page of its own (edited in Settings → Org structure).
    id: 'org',
    icon: 'layers',
    core: true,
    labelKey: 'apps.org.name',
    descKey: 'apps.org.desc',
    Settings: lazy(() => import('./org/OrgSettings')),
  },
];

/** A module's name: the administrator's choice when the module has one (Drive), else the translation. */
export function moduleLabel(module, settings, t) {
  return settings?.modules?.[module.id]?.title || t(module.labelKey);
}

export function moduleById(id) {
  return MODULE_REGISTRY.find((module) => module.id === id) || null;
}

/**
 * Modules switched on in public settings. With `user` (null = signed out), a module
 * with a `permission` is left out unless the person has it; without it (pickers
 * that configure the portal for others) every enabled module is listed.
 */
export function enabledModules(settings, user) {
  return MODULE_REGISTRY.filter((module) => settings?.modules?.[module.id]?.enabled && (user === undefined || !module.permission || canAny(user, [].concat(module.permission))));
}
