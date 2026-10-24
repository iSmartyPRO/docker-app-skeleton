/*
 * In-process event bus of the core (docs/extending.md «Module events»).
 *
 * One module announces what happened; any number of modules react, without
 * importing each other. The announcer does not know who listens:
 *
 *   import { emit, on } from '../../platform/events.js';
 *
 *   on('contract.signed', async ({ contract, actor }) => { … }, { module: 'masterplan' });
 *   const results = await emit('contract.signed', { contract, actor });
 *
 * - Handlers run one after another, in subscription order, and are awaited.
 * - A handler that throws never breaks the event or the other handlers: the
 *   error is logged and that handler's result is left out.
 * - `emit` resolves to the handlers' non-empty results ([] when nobody
 *   listens), so an announcer may show what followers did (Contracts shows
 *   «the unit moved to Договор»), but it must work with [] too.
 * - Payloads are plain data; `actor` is { userId, req } when a person caused
 *   the event (req lets followers act with that person's rights), null for jobs.
 *
 * Names: `<entity>.<what happened>` in the past tense, e.g. contract.signed.
 * Events used today (docs/extending.md keeps the list):
 *   contract.signed, contract.deposit_received, contract.paid  (Contracts → Masterplan)
 *   crm.deal.stage                                              (CRM → Masterplan)
 *   module.installed, module.updated, module.removed,          (package installer → anyone caching
 *   module.data_removed                                          another module's tables; { id })
 */

const handlers = new Map();

/** Subscribes `handler(payload, { name })`. Returns a function that unsubscribes it. */
export function on(name, handler, { module = null } = {}) {
  if (typeof handler !== 'function') throw new TypeError(`events.on(${name}): handler must be a function`);
  if (!handlers.has(name)) handlers.set(name, []);
  const entry = { handler, module };
  handlers.get(name).push(entry);
  return () => {
    const list = handlers.get(name) || [];
    const index = list.indexOf(entry);
    if (index >= 0) list.splice(index, 1);
  };
}

/** Runs every handler of `name`; resolves to their non-empty results. Never rejects. */
export async function emit(name, payload = {}) {
  const results = [];
  for (const { handler, module } of [...(handlers.get(name) || [])]) {
    try {
      const result = await handler(payload, { name });
      if (result !== undefined && result !== null) results.push(result);
    } catch (err) {
      console.warn(`[events] ${name} handler${module ? ` of ${module}` : ''} failed:`, err?.message || err);
    }
  }
  return results;
}

/** Number of handlers of `name` (tests, diagnostics). */
export function listenerCount(name) {
  return (handlers.get(name) || []).length;
}

/** Drops every handler of a module (a module switched off for good / tests). */
export function offModule(module) {
  for (const list of handlers.values()) {
    for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].module === module) list.splice(i, 1);
  }
}

export const events = { on, emit, listenerCount, offModule };
export default events;
