import { AsyncLocalStorage } from 'node:async_hooks';

/*
 * «We are seeding demo data» for everything a module's seed calls (services
 * it reuses, the approvals engine, notifications). notify() reads it: while
 * a seed runs, only demo people get in-app notifications — real colleagues
 * are never told about made-up documents, and nothing goes out by e-mail or
 * messengers. The scope ends with the seed (timers started meanwhile do not
 * keep it).
 */

const storage = new AsyncLocalStorage();

export async function runDemoSeed(module, fn) {
  const scope = { module, active: true };
  try {
    return await storage.run(scope, fn);
  } finally {
    scope.active = false;
  }
}

/** The running seed ({ module }) or null. */
export function demoSeedScope() {
  const scope = storage.getStore();
  return scope?.active ? scope : null;
}
