/**
 * Static facts about every module: permissions, default system settings and a
 * pure sanitizer for them. No imports — core services read this without
 * loading module code (and without import cycles).
 */

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

export const MODULE_CATALOG = [
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
      for (const flag of ['allowAny', 'publicLinks', 'requireLinkPassword']) {
        if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
      }
      if (incoming.maxLinkDays !== undefined) next.maxLinkDays = clampInt(incoming.maxLinkDays, 0, 3650, 0);
      if (incoming.trashDays !== undefined) next.trashDays = clampInt(incoming.trashDays, 1, 365, 30);
      if (['everyone', 'admins'].includes(incoming.spaceCreation)) next.spaceCreation = incoming.spaceCreation;
      if (['page', 'modal'].includes(incoming.openMode)) next.openMode = incoming.openMode;
      return next;
    },
  },
  {
    id: 'companies',
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
    id: 'drive',
    // Off until an administrator adds a file server.
    defaultEnabled: false,
    permissions: ['drive.admin', 'drive.audit'],
    defaults: {
      // Name in the menu and launcher, e.g. "iSmarty Drive" (empty = "File server").
      title: '',
      tagline: '',
      // Reuse the Active Directory sign-in password for file servers (stored sealed).
      rememberLogin: true,
      // Hide folders the person has no rights to instead of showing them locked.
      hideDenied: true,
      maxUploadMb: 2048,
      publicLinks: true,
      // Who links may be opened by: 'any' (choice per link) or 'employees' (signed-in only).
      linkAudience: 'any',
      requireLinkPassword: false,
      maxLinkDays: 0,
      // How a file opens: 'page' (its own page with an address) or 'modal' (over the folder).
      openMode: 'page',
      // Activity log (drive.audit): on/off, folder listings too, days to keep (0 = forever).
      activityLog: true,
      logBrowsing: true,
      activityDays: 365,
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      for (const key of ['title', 'tagline']) {
        if (typeof incoming[key] === 'string') next[key] = incoming[key].replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, key === 'title' ? 40 : 160);
      }
      for (const flag of ['rememberLogin', 'hideDenied', 'publicLinks', 'requireLinkPassword', 'activityLog', 'logBrowsing']) {
        if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
      }
      if (incoming.maxUploadMb !== undefined) next.maxUploadMb = clampInt(incoming.maxUploadMb, 1, 10240, 2048);
      if (incoming.maxLinkDays !== undefined) next.maxLinkDays = clampInt(incoming.maxLinkDays, 0, 3650, 0);
      if (incoming.activityDays !== undefined) next.activityDays = clampInt(incoming.activityDays, 0, 3650, 365);
      if (['any', 'employees'].includes(incoming.linkAudience)) next.linkAudience = incoming.linkAudience;
      if (['page', 'modal'].includes(incoming.openMode)) next.openMode = incoming.openMode;
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
    },
    sanitize(current, incoming = {}) {
      const next = { ...current };
      if (['everyone', 'admins'].includes(incoming.projectCreation)) next.projectCreation = incoming.projectCreation;
      if (['board', 'list'].includes(incoming.defaultView)) next.defaultView = incoming.defaultView;
      if (typeof incoming.reminders === 'boolean') next.reminders = incoming.reminders;
      if (incoming.dueSoonHours !== undefined) next.dueSoonHours = clampInt(incoming.dueSoonHours, 1, 168, 24);
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
];

export const MODULE_IDS = MODULE_CATALOG.map((module) => module.id);

/** Stored state merged over defaults: `{ kb: { enabled, settings } }`. */
export function resolveModules(stored = {}) {
  return Object.fromEntries(
    MODULE_CATALOG.map((module) => {
      const saved = stored[module.id] || {};
      return [
        module.id,
        {
          enabled: typeof saved.enabled === 'boolean' ? saved.enabled : module.defaultEnabled,
          settings: { ...module.defaults, ...(saved.settings || {}) },
        },
      ];
    })
  );
}

export function sanitizeModules(current, incoming = {}) {
  const next = structuredClone(current);
  for (const module of MODULE_CATALOG) {
    const patch = incoming[module.id];
    if (!patch || typeof patch !== 'object') continue;
    if (typeof patch.enabled === 'boolean') next[module.id].enabled = patch.enabled;
    if (patch.settings && typeof patch.settings === 'object') {
      next[module.id].settings = module.sanitize(next[module.id].settings, patch.settings);
    }
  }
  return next;
}
