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
