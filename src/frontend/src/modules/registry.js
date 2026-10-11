import { lazy } from 'react';

/**
 * Frontend side of the module platform. Each entry is an app reachable at
 * /app/<id>; the backend decides whether it is enabled (settings.modules).
 * Adding a module: an entry here, a backend module, and i18n `apps.<id>.*`.
 */
export const MODULE_REGISTRY = [
  {
    id: 'kb',
    path: '/app/kb',
    icon: 'book',
    labelKey: 'apps.kb.name',
    descKey: 'apps.kb.desc',
    App: lazy(() => import('./kb/KbApp')),
    Settings: lazy(() => import('./kb/KbSettings')),
  },
  {
    id: 'tasks',
    path: '/app/tasks',
    icon: 'tasks',
    labelKey: 'apps.tasks.name',
    descKey: 'apps.tasks.desc',
    App: lazy(() => import('./tasks/TasksApp')),
    Settings: lazy(() => import('./tasks/TasksSettings')),
  },
  {
    id: 'calendar',
    path: '/app/calendar',
    icon: 'calendar',
    labelKey: 'apps.calendar.name',
    descKey: 'apps.calendar.desc',
    App: lazy(() => import('./calendar/CalendarApp')),
    Settings: lazy(() => import('./calendar/CalendarSettings')),
  },
];

export function moduleById(id) {
  return MODULE_REGISTRY.find((module) => module.id === id) || null;
}

/** Modules switched on in public settings. */
export function enabledModules(settings) {
  return MODULE_REGISTRY.filter((module) => settings?.modules?.[module.id]?.enabled);
}
