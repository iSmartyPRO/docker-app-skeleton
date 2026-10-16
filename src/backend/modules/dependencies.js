import { MODULE_MANIFEST } from './manifest.js';

/*
 * Switching modules on and off with their requirements (spec §1.3). Pure:
 * the settings service calls planModuleChanges() before it stores a
 * `modules` patch, and the Modules page reads moduleStatus() through
 * GET /api/admin/modules.
 *
 *   - turning on a module whose required module is off is refused
 *     (409 MODULE_REQUIRES, info.missing) unless the patch says
 *     `alsoEnable: true` — then the required modules are switched on with it;
 *   - a required integration that is off cannot be switched on from here
 *     (info.missing entries with `integration`, canAlsoEnable false) — unless the
 *     requirement says `demo: true`: then the module may be switched on and shows
 *     how to set the integration up (status stays «needs» until it is on);
 *   - turning off a module that switched-on modules require is refused
 *     (409 MODULE_REQUIRED_BY, info.dependents), unless they go off in the same patch.
 * Only modules the patch switches on or off are checked, so a legacy state
 * never blocks saving an unrelated setting.
 */

const conflict = (message, code, details) => Object.assign(new Error(message), { statusCode: 409, code, details });

const nameOf = (manifest, id) => manifest[id]?.name?.en || id;

/** Modules switched on that require `id` (directly). */
export function dependentsOf(id, enabled, manifest = MODULE_MANIFEST) {
  return Object.entries(manifest)
    .filter(([other, entry]) => other !== id && enabled[other] && (entry.requires || []).some((link) => link.id === id))
    .map(([other, entry]) => ({ id: other, reason: entry.requires.find((link) => link.id === id).reason }));
}

/** Requirements of `id` that are not met: modules off and integrations off. */
export function missingFor(id, enabled, { manifest = MODULE_MANIFEST, integrations = {} } = {}) {
  return (manifest[id]?.requires || [])
    .filter((link) => (link.integration ? !integrations[link.integration] : !enabled[link.id]))
    .map((link) => (link.integration ? { integration: link.integration, reason: link.reason, ...(link.demo ? { demo: true } : {}) } : { id: link.id, reason: link.reason }));
}

/** Every module `id` needs, transitively (ids only, nearest first). */
export function requiredClosure(id, manifest = MODULE_MANIFEST) {
  const out = [];
  const walk = (current, seen) => {
    for (const link of manifest[current]?.requires || []) {
      if (!link.id || seen.has(link.id)) continue;
      seen.add(link.id);
      out.push(link.id);
      walk(link.id, seen);
    }
  };
  walk(id, new Set([id]));
  return out;
}

/**
 * `current`: { id: boolean } enabled state; `patch`: the `modules` part of a
 * settings patch ({ id: { enabled, alsoEnable } }). `core`: ids that are
 * always on. Returns { enabled: next state, autoEnabled: [ids] } or throws 409.
 */
export function planModuleChanges(current, patch = {}, { manifest = MODULE_MANIFEST, integrations = {}, core = [] } = {}) {
  const next = { ...current };
  for (const id of core) next[id] = true;
  const switchedOn = [];
  const switchedOff = [];
  for (const [id, change] of Object.entries(patch || {})) {
    if (!change || typeof change.enabled !== 'boolean' || core.includes(id) || !(id in current)) continue;
    if (change.enabled === Boolean(current[id])) continue;
    next[id] = change.enabled;
    (change.enabled ? switchedOn : switchedOff).push(id);
  }
  const autoEnabled = [];
  for (const id of switchedOn) {
    if (!patch[id]?.alsoEnable) continue;
    for (const required of requiredClosure(id, manifest)) {
      if (!next[required] && required in current) {
        next[required] = true;
        autoEnabled.push(required);
      }
    }
  }
  for (const id of [...switchedOn, ...autoEnabled]) {
    // An integration marked `demo: true` does not block: the module explains its setup (and can show demo data).
    const missing = missingFor(id, next, { manifest, integrations }).filter((item) => !(item.integration && item.demo));
    if (missing.length) {
      const names = missing.map((item) => item.integration || nameOf(manifest, item.id)).join(', ');
      throw conflict(`${nameOf(manifest, id)} needs ${names}`, 'MODULE_REQUIRES', {
        module: id,
        missing,
        // Switching the required modules on in the same request would work (integrations need their own setup).
        canAlsoEnable: missing.every((item) => item.id),
      });
    }
  }
  for (const id of switchedOff) {
    const dependents = dependentsOf(id, next, manifest);
    if (dependents.length) {
      throw conflict(`${nameOf(manifest, id)} is required by ${dependents.map((item) => nameOf(manifest, item.id)).join(', ')}`, 'MODULE_REQUIRED_BY', {
        module: id,
        dependents,
      });
    }
  }
  return { enabled: next, autoEnabled, switchedOn, switchedOff };
}

/**
 * State of one module for the Modules page: 'on', 'off', or 'needs' (switched
 * on, or wanting to be, while a requirement is missing).
 */
export function moduleStatus(id, enabled, options = {}) {
  const missing = missingFor(id, enabled, options);
  if (enabled[id]) return { status: missing.length ? 'needs' : 'on', missing };
  return { status: 'off', missing };
}
