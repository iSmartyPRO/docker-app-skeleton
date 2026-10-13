import { lazy } from 'react';

/**
 * Settings screen components, keyed by the item id in navigation.js.
 * Each screen is its own chunk, so the admin bundle stays small.
 */
const Integration = lazy(() => import('../pages/admin/settings/Integration'));

export const SETTINGS_PAGES = {
  general: lazy(() => import('../pages/admin/settings/General')),
  theme: lazy(() => import('../pages/admin/settings/Theme')),
  typography: lazy(() => import('../pages/admin/settings/Typography')),
  icons: lazy(() => import('../pages/admin/settings/MenuIcons')),
  signin: lazy(() => import('../pages/admin/settings/SignIn')),
  access: lazy(() => import('../pages/admin/settings/Access')),
  login: lazy(() => import('../pages/admin/settings/Login')),
  ip: lazy(() => import('../pages/admin/settings/IpFiltering')),
  email: Integration,
  telegram: Integration,
  whatsapp: Integration,
  wazzup: Integration,
  mattermost: Integration,
  ad: Integration,
  system: lazy(() => import('../pages/admin/settings/System')),
  notifications: lazy(() => import('../pages/admin/settings/NotificationDelivery')),
  modules: lazy(() => import('../pages/admin/settings/Modules')),
  kb: lazy(() => import('../modules/kb/KbSettings')),
  documents: Integration,
  google: lazy(() => import('../pages/admin/settings/GoogleSettings')),
  dashboard: lazy(() => import('../modules/dashboard/DashboardSettings')),
  approvals: lazy(() => import('../modules/approvals/ApprovalsSettings')),
  chat: lazy(() => import('../modules/chat/ChatSettings')),
  files: lazy(() => import('../modules/files/FilesSettings')),
  drive: lazy(() => import('../modules/drive/DriveSettings')),
  resources: lazy(() => import('../modules/resources/ResourcesSettings')),
  companies: lazy(() => import('../modules/companies/CompaniesSettings')),
  tasks: lazy(() => import('../modules/tasks/TasksSettings')),
  crm: lazy(() => import('../modules/crm/CrmSettings')),
  masterplan: lazy(() => import('../modules/masterplan/MasterplanSettings')),
  procurement: lazy(() => import('../modules/procurement/ProcurementSettings')),
  contracts: lazy(() => import('../modules/contracts/ContractsSettings')),
  legalEntities: lazy(() => import('../pages/admin/settings/LegalEntities')),
  assistant: lazy(() => import('../modules/assistant/AssistantSettings')),
  calendar: lazy(() => import('../modules/calendar/CalendarSettings')),
};
