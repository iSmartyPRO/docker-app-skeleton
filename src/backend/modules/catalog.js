/**
 * Static facts about every module: permissions, default system settings and a
 * pure sanitizer for them. No imports of module code — core services read this
 * without loading module code (and without import cycles). Installed module
 * packages are appended from the disk (platform/packages/disk.js, node:fs only).
 */
import { packageCatalogEntries } from '../platform/packages/disk.js';

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

/** File type groups an administrator can allow in the knowledge base. */
export const KB_FILE_GROUPS = {
  images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'],
  pdf: ['pdf'],
  office: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'csv'],
  text: ['txt', 'md', 'json', 'xml', 'log'],
  media: ['mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a'],
  archives: ['zip', '7z', 'rar'],
};

const HEX = /^#[0-9a-f]{6}$/i;

// ── Approvals settings (docs/approvals.md) ──────────────────────────────────

/** Stock urgency levels: reaction time of a stage per level (spec: Критично 4 ч · Срочно 24 ч · Обычно 72 ч). */
export const APPROVAL_DEFAULT_URGENCIES = [
  { key: 'critical', label: '', color: '#E5484D', hours: 4, icon: 'flame' },
  { key: 'urgent', label: '', color: '#F59E0B', hours: 24, icon: 'bolt' },
  { key: 'normal', label: '', color: '#3B82F6', hours: 72, icon: 'clock' },
];
export const APPROVAL_URGENCY_ICONS = ['flame', 'bolt', 'clock', 'alert', 'flag', 'hourglass', 'star', 'leaf'];

export const APPROVALS_DEFAULTS = {
  // Ordered from the most urgent; empty `label` = the translated stock name.
  urgencies: APPROVAL_DEFAULT_URGENCIES,
  defaultUrgency: 'normal',
  // A deadline closer than this many hours is shown in yellow.
  soonHours: 24,
  // Share of the reaction time after which approvers get a reminder (75 = the last quarter is left).
  reminderPercent: 75,
  // Notify the escalation people when a stage is overdue.
  escalation: true,
};

const approvalText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

export function sanitizeApprovalUrgencies(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const raw of list.slice(0, 8)) {
    if (!raw || typeof raw !== 'object') continue;
    let key = String(raw.key || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(key)) key = `u${out.length + 1}`;
    if (seen.has(key)) continue;
    const stock = APPROVAL_DEFAULT_URGENCIES.find((level) => level.key === key);
    const label = approvalText(raw.label, 40);
    // Custom levels need a name; stock ones fall back to the translation.
    if (!label && !stock) continue;
    seen.add(key);
    out.push({
      key,
      label,
      color: typeof raw.color === 'string' && HEX.test(raw.color) ? raw.color.toUpperCase() : stock?.color || '#64748B',
      hours: clampInt(raw.hours, 1, 24 * 90, stock?.hours || 72),
      icon: APPROVAL_URGENCY_ICONS.includes(raw.icon) ? raw.icon : stock?.icon || 'clock',
    });
  }
  return out.length ? out : null;
}

export function sanitizeApprovals(current, incoming = {}) {
  const next = { ...current };
  const urgencies = sanitizeApprovalUrgencies(incoming.urgencies);
  if (urgencies) next.urgencies = urgencies;
  if (typeof incoming.defaultUrgency === 'string') next.defaultUrgency = incoming.defaultUrgency;
  if (!next.urgencies?.some((level) => level.key === next.defaultUrgency)) next.defaultUrgency = next.urgencies?.[next.urgencies.length - 1]?.key || 'normal';
  if (incoming.soonHours !== undefined) next.soonHours = clampInt(incoming.soonHours, 1, 24 * 14, 24);
  if (incoming.reminderPercent !== undefined) next.reminderPercent = clampInt(incoming.reminderPercent, 10, 95, 75);
  if (typeof incoming.escalation === 'boolean') next.escalation = incoming.escalation;
  return next;
}

// ── Org structure (core, docs/org-structure.md) ─────────────────────────────

const orgText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const ORG_KEY = /^[a-z][a-z0-9_]{0,23}$/;
export const ORG_TYPE_ICONS = ['building', 'briefcase', 'map', 'layers', 'siteplan', 'people', 'box', 'globe', 'flag', 'home', 'pin', 'cart', 'wrench', 'server'];

/** Stock unit types; an empty `label` = the translated stock name (i18n org.types.<key>). */
export const ORG_DEFAULT_TYPES = [
  // `legal`: the unit links to a legal entity of the shared directory (Settings → Legal entities).
  { key: 'company', label: '', icon: 'building', color: '#4F46E5', legal: true },
  { key: 'office', label: '', icon: 'briefcase', color: '#0EA5E9', legal: false },
  { key: 'branch', label: '', icon: 'map', color: '#14B8A6', legal: false },
  { key: 'department', label: '', icon: 'layers', color: '#8B5CF6', legal: false },
  { key: 'site', label: '', icon: 'siteplan', color: '#F59E0B', legal: false, site: true },
];
/** Stock purposes («назначение»): modules pick units by them (unitsByPurpose). */
export const ORG_DEFAULT_PURPOSES = [
  { key: 'warehouse', label: '' },
  { key: 'construction', label: '' },
  { key: 'sales', label: '' },
  { key: 'production', label: '' },
  { key: 'office', label: '' },
];

export const ORG_DEFAULTS = { types: ORG_DEFAULT_TYPES, purposes: ORG_DEFAULT_PURPOSES };

function orgList(list, stock, max, shape) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const raw of list.slice(0, max)) {
    if (!raw || typeof raw !== 'object') continue;
    const key = String(raw.key || '').trim().toLowerCase();
    if (!ORG_KEY.test(key) || seen.has(key)) continue;
    const label = orgText(raw.label, 60);
    const base = stock.find((item) => item.key === key);
    // Custom entries need a name; stock ones fall back to the translation.
    if (!label && !base) continue;
    seen.add(key);
    out.push(shape(raw, key, label, base));
  }
  return out.length ? out : null;
}

export function sanitizeOrg(current, incoming = {}) {
  const next = { ...current };
  const types = orgList(incoming.types, ORG_DEFAULT_TYPES, 20, (raw, key, label, base) => ({
    key,
    label,
    icon: ORG_TYPE_ICONS.includes(raw.icon) ? raw.icon : base?.icon || 'layers',
    color: typeof raw.color === 'string' && HEX.test(raw.color) ? raw.color.toUpperCase() : base?.color || '#64748B',
    legal: typeof raw.legal === 'boolean' ? raw.legal : Boolean(base?.legal),
    site: typeof raw.site === 'boolean' ? raw.site : Boolean(base?.site),
  }));
  if (types) next.types = types;
  const purposes = orgList(incoming.purposes, ORG_DEFAULT_PURPOSES, 30, (raw, key, label) => ({ key, label }));
  if (purposes) next.purposes = purposes;
  return { types: next.types || ORG_DEFAULT_TYPES, purposes: next.purposes || ORG_DEFAULT_PURPOSES };
}

export const MODULE_CATALOG = [
  {
    // Org structure: a core service (docs/org-structure.md). Always on; modules read it
    // through modules/org/api.js (orgUnits, unitOf, managerOf, descendants, unitsByPurpose).
    id: 'org',
    core: true,
    defaultEnabled: true,
    // manage: edit the tree, unit types and purposes, assign people to units.
    permissions: ['org.manage'],
    defaults: ORG_DEFAULTS,
    sanitize: sanitizeOrg,
  },
  {
    id: 'files',
    defaultEnabled: true,
    permissions: ['files.admin'],
    defaults: {
      maxUploadMb: 200,
      // Personal storage per user (0 = unlimited).
      quotaMb: 0,
      fileGroups: Object.keys(KB_FILE_GROUPS),
      // Any extension, beyond the groups above (served as downloads only).
      allowAny: true,
      publicLinks: true,
      requireLinkPassword: false,
      maxLinkDays: 0,
      // Public links that let visitors upload, rename, replace or delete.
      writeLinks: true,
      requireWriteLinkPassword: false,
      // Total a link that accepts files may take in when it has no quota of its own (MB, 0 = unlimited).
      linkQuotaMb: 2048,
      // Who publishes links: 'owners' (owners and space managers) or 'members'
      // (anyone with access, granting at most their own rights).
      linkSharing: 'owners',
      // Who creates shared spaces: 'everyone' or 'admins' (files.admin).
      spaceCreation: 'admins',
      trashDays: 30,
      // How a file opens: 'page' (its own page with an address) or 'modal' (over the folder).
      openMode: 'page',
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      if (incoming.maxUploadMb !== undefined) next.maxUploadMb = clampInt(incoming.maxUploadMb, 1, 4096, 200);
      if (incoming.quotaMb !== undefined) next.quotaMb = clampInt(incoming.quotaMb, 0, 10_000_000, 0);
      if (Array.isArray(incoming.fileGroups)) next.fileGroups = incoming.fileGroups.filter((group) => KB_FILE_GROUPS[group]);
      for (const flag of ['allowAny', 'publicLinks', 'requireLinkPassword', 'writeLinks', 'requireWriteLinkPassword']) {
        if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
      }
      if (incoming.maxLinkDays !== undefined) next.maxLinkDays = clampInt(incoming.maxLinkDays, 0, 3650, 0);
      if (incoming.linkQuotaMb !== undefined) next.linkQuotaMb = clampInt(incoming.linkQuotaMb, 0, 10_000_000, 2048);
      if (['owners', 'members'].includes(incoming.linkSharing)) next.linkSharing = incoming.linkSharing;
      if (incoming.trashDays !== undefined) next.trashDays = clampInt(incoming.trashDays, 1, 365, 30);
      if (['everyone', 'admins'].includes(incoming.spaceCreation)) next.spaceCreation = incoming.spaceCreation;
      if (['page', 'modal'].includes(incoming.openMode)) next.openMode = incoming.openMode;
      return next;
    },
  },
  {
    // Counterparties: a core service (docs/specs/module-packages.ru.md §2): always loaded, CRM,
    // Contracts, Procurement and Warehouse read it through modules/companies/api.js. «Hideable»:
    // an administrator may still switch it off (as before it became core) — then it is hidden:
    // no app, no widgets, its own routes answer 404 MODULE_DISABLED, and the other modules'
    // pickers work as they did with Counterparties off (companiesEnabled false).
    id: 'companies',
    core: true,
    hideable: true,
    defaultEnabled: true,
    permissions: ['companies.admin'],
    defaults: {
      defaultCountry: 'KG',
      // Countries offered when a company is added (order = order in the list).
      countries: ['KG', 'RU', 'KZ', 'UZ', 'BY', 'TJ', 'CN', 'TR', 'OTHER'],
      // Who may change cards: 'everyone' signed in, or 'owners' (responsible person, author, admins).
      editPolicy: 'everyone',
      relations: [
        { key: 'client', label: '', color: '#2563EB' },
        { key: 'supplier', label: '', color: '#F59E0B' },
        { key: 'partner', label: '', color: '#10B981' },
        { key: 'prospect', label: '', color: '#8B5CF6' },
        { key: 'contractor', label: '', color: '#0EA5E9' },
        { key: 'government', label: '', color: '#64748B' },
        { key: 'competitor', label: '', color: '#EF4444' },
      ],
      // Extra fields: { key, label, type: text|number|date|select|url, options, entity: company|person, countries: [] }.
      customFields: [],
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      const COUNTRY = /^[A-Z]{2}$|^OTHER$/;
      if (typeof incoming.defaultCountry === 'string' && COUNTRY.test(incoming.defaultCountry)) next.defaultCountry = incoming.defaultCountry;
      if (Array.isArray(incoming.countries)) {
        const list = [...new Set(incoming.countries.filter((code) => typeof code === 'string' && COUNTRY.test(code)))].slice(0, 30);
        if (list.length) next.countries = list;
      }
      if (['everyone', 'owners'].includes(incoming.editPolicy)) next.editPolicy = incoming.editPolicy;
      const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
      const key = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
      // Non-Latin labels ("Дилер") get a stable key from their text.
      const keyFor = (item) => {
        const own = key(item?.key);
        if (own) return own;
        const label = text(item?.label, 60);
        if (!label) return '';
        let hash = 0;
        for (const ch of label) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
        return `x${hash.toString(36)}`;
      };
      if (Array.isArray(incoming.relations)) {
        const seen = new Set();
        next.relations = incoming.relations
          .map((item) => ({ key: keyFor(item), label: text(item?.label, 40), color: HEX.test(item?.color || '') ? item.color.toUpperCase() : '#64748B' }))
          .filter((item) => item.key && !seen.has(item.key) && seen.add(item.key))
          .slice(0, 30);
      }
      if (Array.isArray(incoming.customFields)) {
        const seen = new Set();
        next.customFields = incoming.customFields
          .map((item) => ({
            key: keyFor(item),
            label: text(item?.label, 60),
            type: ['text', 'number', 'date', 'select', 'url', 'textarea'].includes(item?.type) ? item.type : 'text',
            entity: item?.entity === 'person' ? 'person' : 'company',
            options: Array.isArray(item?.options) ? item.options.map((option) => text(option, 60)).filter(Boolean).slice(0, 50) : [],
            countries: Array.isArray(item?.countries) ? item.countries.filter((code) => typeof code === 'string' && COUNTRY.test(code)).slice(0, 30) : [],
          }))
          .filter((item) => item.key && item.label && !seen.has(`${item.entity}:${item.key}`) && seen.add(`${item.entity}:${item.key}`))
          .slice(0, 60);
      }
      return next;
    },
  },
  {
    id: 'chat',
    defaultEnabled: true,
    permissions: ['chat.admin'],
    defaults: {
      // Anyone may create group chats (off: only chat administrators).
      allowGroups: true,
      maxUploadMb: 100,
      // Video calls: a meeting link template, {room} becomes a unique code (empty = no call button).
      callUrl: 'https://meet.jit.si/{room}',
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      if (typeof incoming.allowGroups === 'boolean') next.allowGroups = incoming.allowGroups;
      if (incoming.maxUploadMb !== undefined) next.maxUploadMb = clampInt(incoming.maxUploadMb, 1, 2048, 100);
      if (typeof incoming.callUrl === 'string') {
        const url = incoming.callUrl.trim().slice(0, 300);
        next.callUrl = !url || /^https:\/\/[^\s]+$/.test(url) ? url : current.callUrl;
      }
      return next;
    },
  },
  {
    id: 'dashboard',
    defaultEnabled: true,
    permissions: ['dashboard.admin'],
    defaults: {
      // Heading of the page (empty = "Dashboard").
      title: '',
      // People may rearrange, resize, add and remove widgets for themselves.
      personalize: true,
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      if (typeof incoming.title === 'string') next.title = incoming.title.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
      if (typeof incoming.personalize === 'boolean') next.personalize = incoming.personalize;
      return next;
    },
  },
  {
    id: 'resources',
    defaultEnabled: true,
    permissions: ['resources.admin'],
    defaults: {
      // Heading above the tiles (empty = "Online resources").
      title: '',
      subtitle: '',
      // People may reorder and hide tiles for themselves.
      personalize: true,
      showDescriptions: true,
      showSearch: true,
      density: 'comfortable',
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      for (const [key, max] of [['title', 60], ['subtitle', 200]]) {
        if (typeof incoming[key] === 'string') next[key] = incoming[key].replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
      }
      for (const flag of ['personalize', 'showDescriptions', 'showSearch']) {
        if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
      }
      if (['comfortable', 'compact'].includes(incoming.density)) next.density = incoming.density;
      return next;
    },
  },
  {
    id: 'kb',
    defaultEnabled: true,
    permissions: ['kb.admin'],
    defaults: {
      defaultIcon: 'folder',
      defaultColor: '#3B82F6',
      maxUploadMb: 50,
      fileGroups: Object.keys(KB_FILE_GROUPS),
      publicLinks: true,
      requireSharePassword: false,
      maxShareDays: 0,
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      if (typeof incoming.defaultIcon === 'string' && /^[a-z0-9_-]{2,32}$/i.test(incoming.defaultIcon)) {
        next.defaultIcon = incoming.defaultIcon;
      }
      if (typeof incoming.defaultColor === 'string' && HEX.test(incoming.defaultColor)) {
        next.defaultColor = incoming.defaultColor.toUpperCase();
      }
      if (incoming.maxUploadMb !== undefined) next.maxUploadMb = clampInt(incoming.maxUploadMb, 1, 1024, 50);
      if (Array.isArray(incoming.fileGroups)) {
        next.fileGroups = incoming.fileGroups.filter((group) => KB_FILE_GROUPS[group]);
      }
      for (const flag of ['publicLinks', 'requireSharePassword']) {
        if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
      }
      if (incoming.maxShareDays !== undefined) next.maxShareDays = clampInt(incoming.maxShareDays, 0, 3650, 0);
      return next;
    },
  },
  {
    id: 'tasks',
    defaultEnabled: true,
    permissions: ['tasks.admin'],
    defaults: {
      // Who may create projects: 'everyone' or 'admins' (holders of tasks.admin).
      projectCreation: 'everyone',
      defaultView: 'board',
      reminders: true,
      dueSoonHours: 24,
      // «Принять в работу»: hours the assignee has to accept a task (important ones: their own).
      acceptHours: 24,
      acceptHoursImportant: 4,
      // «Поручения»: tasks set by members of these groups ("leadership") are orders.
      ordersGroupIds: [],
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      if (['everyone', 'admins'].includes(incoming.projectCreation)) next.projectCreation = incoming.projectCreation;
      if (['board', 'list'].includes(incoming.defaultView)) next.defaultView = incoming.defaultView;
      if (typeof incoming.reminders === 'boolean') next.reminders = incoming.reminders;
      if (incoming.dueSoonHours !== undefined) next.dueSoonHours = clampInt(incoming.dueSoonHours, 1, 168, 24);
      if (incoming.acceptHours !== undefined) next.acceptHours = clampInt(incoming.acceptHours, 1, 720, 24);
      if (incoming.acceptHoursImportant !== undefined) next.acceptHoursImportant = clampInt(incoming.acceptHoursImportant, 1, 720, 4);
      if (Array.isArray(incoming.ordersGroupIds)) {
        next.ordersGroupIds = [...new Set(incoming.ordersGroupIds.map(Number).filter((id) => Number.isInteger(id) && id > 0 && id < 2 ** 31))].slice(0, 50);
      }
      return next;
    },
  },
  {
    id: 'calendar',
    defaultEnabled: true,
    permissions: ['calendar.admin'],
    defaults: {
      // Who may create shared calendars: 'everyone' or 'admins' (holders of calendar.admin).
      calendarCreation: 'everyone',
      defaultView: 'week',
      weekStart: 1,
      dayStart: '07:00',
      dayEnd: '21:00',
      defaultReminder: 15,
      showTasks: true,
      reminders: true,
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      const time = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (['everyone', 'admins'].includes(incoming.calendarCreation)) next.calendarCreation = incoming.calendarCreation;
      if (['month', 'week', 'day', 'agenda'].includes(incoming.defaultView)) next.defaultView = incoming.defaultView;
      if ([0, 1, 6].includes(Number(incoming.weekStart))) next.weekStart = Number(incoming.weekStart);
      if (time.test(incoming.dayStart || '')) next.dayStart = incoming.dayStart;
      if (time.test(incoming.dayEnd || '')) next.dayEnd = incoming.dayEnd;
      if (incoming.defaultReminder !== undefined) next.defaultReminder = clampInt(incoming.defaultReminder, -1, 10080, 15);
      for (const flag of ['showTasks', 'reminders']) {
        if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
      }
      return next;
    },
  },
  {
    id: 'approvals',
    // A core service: always on (other modules route their documents through it).
    core: true,
    defaultEnabled: true,
    permissions: ['approvals.admin'],
    defaults: APPROVALS_DEFAULTS,
    sanitize: sanitizeApprovals,
  },
];

/** Modules built into this core version (source «bundled»); the rest of MODULE_CATALOG are installed packages. */
export const BUILTIN_MODULE_IDS = MODULE_CATALOG.map((module) => module.id);
// Installed module packages (docs/module-packages.md): their catalog entries come from manifest.json.
MODULE_CATALOG.push(...packageCatalogEntries(BUILTIN_MODULE_IDS));

export const MODULE_IDS = MODULE_CATALOG.map((module) => module.id);

/*
 * Core services are always loaded; most are always on too. A «hideable» core service
 * (Counterparties) keeps a stored enabled=false: it stays loaded (its api.js serves the
 * other modules) but is hidden from people — see the catalog entry.
 */
export const alwaysOn = (module) => Boolean(module?.core && !module.hideable);
/** Ids of the core services that cannot be switched off. */
export const ALWAYS_ON_IDS = () => MODULE_CATALOG.filter(alwaysOn).map((module) => module.id);

/** Stored state merged over defaults: `{ kb: { enabled, settings } }`. */
/** `locale`: the portal language, for modules whose stock settings have per-language texts (localizedDefaults). */
export function resolveModules(stored = {}, { locale } = {}) {
  return Object.fromEntries(
    MODULE_CATALOG.map((module) => {
      const saved = stored[module.id] || {};
      // A copy: callers may change their settings without touching the module-level defaults.
      const defaults = structuredClone(locale && module.localizedDefaults ? module.localizedDefaults(locale) : module.defaults);
      return [
        module.id,
        {
          enabled: alwaysOn(module) ? true : typeof saved.enabled === 'boolean' ? saved.enabled : module.defaultEnabled,
          settings: module.upgrade ? module.upgrade({ ...defaults, ...(saved.settings || {}) }, saved.settings || {}) : { ...defaults, ...(saved.settings || {}) },
        },
      ];
    })
  );
}

/*
 * Stored entries of modules this core does not know (a package not installed yet, removed, or
 * failed to load; an old module id kept for a migration such as drive/access «folderaccess»)
 * are carried over unchanged by every save of the modules settings, so they come back intact
 * when the package is installed again. `stored`: the raw stored object; `next`: the sanitized
 * catalog entries, which win.
 */
export function keepUnknownModules(stored, next) {
  const known = new Set(MODULE_CATALOG.map((module) => module.id));
  const carried = {};
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const [id, value] of Object.entries(stored)) {
      if (!known.has(id) && value !== undefined && id !== '__proto__') carried[id] = value;
    }
  }
  return { ...carried, ...next };
}

export function sanitizeModules(current, incoming = {}) {
  const next = structuredClone(current);
  for (const module of MODULE_CATALOG) {
    const patch = incoming[module.id];
    if (!patch || typeof patch !== 'object') continue;
    if (typeof patch.enabled === 'boolean' && !alwaysOn(module)) next[module.id].enabled = patch.enabled;
    if (patch.settings && typeof patch.settings === 'object') {
      next[module.id].settings = module.sanitize(next[module.id].settings, patch.settings);
    }
  }
  return next;
}
