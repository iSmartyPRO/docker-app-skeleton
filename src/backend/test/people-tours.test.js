import { test } from 'node:test';
import assert from 'node:assert/strict';

/*
 * The tours, admin docs and texts of the Org structure and Employees
 * (frontend files, pure JS): valid tour definitions with texts in both
 * languages, admin docs with every required part.
 */

const lookup = (dict, path) => path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), dict);

test('org and employees tours: valid, with texts in both languages', async () => {
  const engine = await import('../../frontend/src/tour/engine.js');
  const { dictionaries } = await import('../../frontend/src/i18n/translations.js');
  const { default: org } = await import('../../frontend/src/modules/org/tour.js');
  const { default: employees } = await import('../../frontend/src/modules/employees/tour.js');
  for (const def of [org, employees]) {
    const tour = engine.normalizeTour(def);
    assert.equal(tour.module, def.id);
    for (const key of [tour.title, ...tour.steps.flatMap((step) => [step.title, step.text])].filter(Boolean)) {
      for (const locale of ['ru', 'en']) assert.equal(typeof lookup(dictionaries[locale], key), 'string', `${locale} ${key}`);
    }
  }
});

test('org and employees: admin docs and translated permissions', async () => {
  const { dictionaries } = await import('../../frontend/src/i18n/translations.js');
  for (const id of ['org', 'employees']) {
    const { default: docs } = await import(`../../frontend/src/help/admin/${id}.js`);
    assert.equal(docs.id, id);
    for (const part of ['purpose', 'audience']) assert.ok(docs[part].ru && docs[part].en, `${id} ${part}`);
    assert.ok(docs.setup.length >= 3 && docs.setup.length <= 7, `${id} setup`);
    assert.ok(docs.scenarios.length >= 2 && docs.scenarios.length <= 4, `${id} scenarios`);
    assert.ok(docs.faq.length >= 3, `${id} faq`);
  }
  for (const perm of ['org.manage', 'employees.view', 'employees.hr', 'employees.admin']) {
    for (const locale of ['ru', 'en']) assert.equal(typeof lookup(dictionaries[locale], `permissions.${perm.replace('.', '_')}.title`), 'string', `${locale} ${perm}`);
  }
  for (const locale of ['ru', 'en']) {
    assert.equal(typeof lookup(dictionaries[locale], 'notifyPrefs.events.employees_clearance.title'), 'string');
    assert.equal(typeof lookup(dictionaries[locale], 'platform.core.org'), 'string');
    assert.equal(typeof lookup(dictionaries[locale], 'approvals.manager.level1'), 'string');
  }
});
