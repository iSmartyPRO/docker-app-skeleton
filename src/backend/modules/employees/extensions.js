/*
 * Extension point of the employee card (docs/employees.md → «Hooks for other
 * modules»). Another module — first of all the AD directory module — adds a
 * section to the card without the Employees module knowing about it:
 *
 *   import { registerEmployeeExtension } from '../employees/extensions.js';
 *
 *   registerEmployeeExtension({
 *     id: 'ad',                                   // unique; the key in `extensions` of GET /employees/:id
 *     module: 'ad',                               // hidden while that module is off (optional)
 *     visible: (rights, employee) => rights.hr,   // who gets the section (default: HR only)
 *     load: async (req, employee, rights) => ({ account: 'ivanov', enabled: true }),  // any JSON
 *   });
 *
 * GET /api/app/employees/employees/:id answers `extensions: { ad: {...} }`;
 * a failing extension is reported as { error } and never breaks the card.
 * The browser side is registerEmployeeTab() in
 * src/frontend/src/modules/employees/extensions.js.
 */

import { getSettings, parseSettings } from '../../services/settings.js';

const extensions = new Map();

export function registerEmployeeExtension(definition) {
  if (!definition?.id || typeof definition.load !== 'function') throw new Error('registerEmployeeExtension needs { id, load }');
  extensions.set(definition.id, definition);
  return () => {
    if (extensions.get(definition.id) === definition) extensions.delete(definition.id);
  };
}

export const listEmployeeExtensions = () => [...extensions.values()];

/** { [id]: data | { error } } of every extension the viewer may see. */
export async function extensionsFor(req, employee, rights) {
  if (!extensions.size) return {};
  const modules = parseSettings(await getSettings()).modules;
  const out = {};
  for (const extension of extensions.values()) {
    if (extension.module && modules[extension.module] && !modules[extension.module].enabled) continue;
    const visible = extension.visible ? extension.visible(rights, employee) : rights.hr;
    if (!visible) continue;
    try {
      out[extension.id] = await Promise.race([
        extension.load(req, employee, rights),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
    } catch (err) {
      out[extension.id] = { error: String(err?.message || err).slice(0, 200) };
    }
  }
  return out;
}
