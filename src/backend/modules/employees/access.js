import { getSettings, parseSettings } from '../../services/settings.js';
import { hasPermission } from '../../services/permissions.js';
import { httpError } from './logic.js';

/*
 * Who sees what (docs/employees.md → Permissions). Decided on the server for
 * every answer:
 *   employees.view   the directory: working people (active, on vacation) with
 *                    names, photo, position, unit, site, manager, work contacts
 *   employees.hr     everything: every status, personal contacts, birth date,
 *                    personnel number, dates, HR notes, documents, clearances,
 *                    creating and editing cards, portal accounts
 *   employees.admin  the positions directory and the module settings
 *   the person       their own card (when linked): the directory part plus own
 *                    personal contacts, birthday and clearances
 * With the setting everyoneCanView every signed-in person has the directory.
 * Creating or blocking a portal account also needs users.manage.
 */

export async function employeesSettings() {
  const parsed = parseSettings(await getSettings());
  return { ...(parsed.modules.employees?.settings || {}) };
}

export async function rightsOf(req, settingsArg = null) {
  const settings = settingsArg || (await employeesSettings());
  const system = req?.system === true;
  const perms = system ? ['*'] : req?.access?.permissions || req?.user?.permissions || [];
  const can = (perm) => hasPermission(perms, perm);
  const hr = can('employees.hr');
  const admin = can('employees.admin');
  const view = hr || admin || can('employees.view') || (Boolean(settings.everyoneCanView) && Boolean(req?.user?.id));
  return {
    settings,
    userId: req?.user?.id ? Number(req.user.id) : null,
    hr,
    admin,
    view,
    manageUsers: can('users.manage'),
    perms,
  };
}

export function assertView(rights) {
  if (!rights.view && !rights.userId) throw httpError(403, 'No access to the employee directory', 'FORBIDDEN');
}
export function assertHr(rights) {
  if (!rights.hr) throw httpError(403, 'Only HR (employees.hr) can do this', 'FORBIDDEN');
}
export function assertAdmin(rights) {
  if (!rights.admin) throw httpError(403, 'Only employees administrators can do this', 'FORBIDDEN');
}
