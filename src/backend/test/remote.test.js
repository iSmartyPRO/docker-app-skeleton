import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_CATALOG } from '../modules/catalog.js';
import { MODULE_MANIFEST } from '../modules/manifest.js';

/*
 * Remote access (docs/specs/remote-access.ru.md). The module's transparency is
 * a product promise, so it is pinned by tests: the settings cannot be made
 * covert, and the policy acknowledgement is a server timestamp, never a value
 * the client can forge.
 */

const remote = MODULE_CATALOG.find((m) => m.id === 'remote');

test('remote: the module is installable and off by default', () => {
  assert.ok(remote, 'remote is in the catalog');
  assert.equal(remote.defaultEnabled, false);
  assert.ok(!remote.core, 'not a core service');
  assert.deepEqual(remote.permissions, ['remote.view', 'remote.connect', 'remote.monitor', 'remote.admin']);
  assert.equal(MODULE_MANIFEST.remote.category, 'infrastructure');
});

test('remote: settings cannot be made covert — no hidden / silent switch', () => {
  const defaults = remote.defaults;
  // The default has no flag that would suppress the audit or the notice.
  for (const key of Object.keys(defaults)) {
    assert.ok(!/silent|hidden|covert|stealth|notify|announce|audit|log/i.test(key), `unexpected settings key ${key}`);
  }
  // A client trying to smuggle such a flag is ignored by sanitize.
  const next = remote.sanitize(defaults, { silent: true, hidden: true, notifyWatched: false, audit: false });
  assert.equal(next.silent, undefined);
  assert.equal(next.hidden, undefined);
  assert.equal(next.notifyWatched, undefined);
});

test('remote: the monitoring policy is a server timestamp, not client input', () => {
  const base = remote.sanitize(remote.defaults, {});
  assert.equal(base.policyAckAt, null, 'monitoring is off until acknowledged');

  // The client cannot set an arbitrary timestamp directly.
  const forged = remote.sanitize(remote.defaults, { policyAckAt: '2000-01-01T00:00:00.000Z' });
  assert.equal(forged.policyAckAt, null);

  // Only the explicit acknowledgement sets it, to "now".
  const acked = remote.sanitize(remote.defaults, { policyAck: true });
  assert.ok(acked.policyAckAt);
  assert.ok(Math.abs(Date.parse(acked.policyAckAt) - Date.now()) < 5000);

  // And it can be withdrawn.
  assert.equal(remote.sanitize(acked, { policyAck: false }).policyAckAt, null);
});

test('remote: the usual settings are whitelisted and clamped', () => {
  const next = remote.sanitize(remote.defaults, {
    guacdHost: 'guacd; rm -rf /',
    guacdPort: 999999,
    requireConsentForControl: false,
    recording: 'yes',
    retentionDays: -4,
  });
  assert.equal(next.guacdHost, 'guacdrm-rf', 'host stripped of shell / space / slash characters');
  assert.equal(next.guacdPort, remote.defaults.guacdPort, 'out-of-range port ignored');
  assert.equal(next.requireConsentForControl, false);
  assert.equal(next.recording, remote.defaults.recording, 'non-boolean ignored');
  assert.equal(next.retentionDays, 1, 'clamped to the minimum');
});
