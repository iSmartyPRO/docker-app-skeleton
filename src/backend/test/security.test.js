import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideIpAccess,
  ipMatchesRule,
  isValidIpOrCidr,
  normalizeIp,
} from '../services/security.js';

test('normalizeIp unwraps IPv4-mapped IPv6 and loopback', () => {
  assert.equal(normalizeIp('::ffff:10.0.0.5'), '10.0.0.5');
  assert.equal(normalizeIp('::1'), '127.0.0.1');
  assert.equal(normalizeIp('203.0.113.9, 10.0.0.1'), '203.0.113.9');
  assert.equal(normalizeIp(''), '');
});

test('isValidIpOrCidr accepts IPv4, IPv6 and IPv4 CIDR', () => {
  for (const ok of ['10.0.0.1', '192.168.0.0/16', '0.0.0.0/0', '2001:db8::1']) {
    assert.ok(isValidIpOrCidr(ok), ok);
  }
  for (const bad of ['', '300.1.1.1', '10.0.0.0/33', 'example.com', '10.0.0']) {
    assert.ok(!isValidIpOrCidr(bad), bad);
  }
});

test('ipMatchesRule handles exact and CIDR matches', () => {
  assert.ok(ipMatchesRule('10.0.0.1', '10.0.0.1'));
  assert.ok(ipMatchesRule('10.0.0.0/8', '10.20.30.40'));
  assert.ok(!ipMatchesRule('10.0.0.0/8', '11.0.0.1'));
  assert.ok(ipMatchesRule('0.0.0.0/0', '8.8.8.8'));
});

test('decideIpAccess: block-list wins, allow-list denies strangers', () => {
  const rules = [
    { ip: '10.0.0.0/8', list_type: 'whitelist' },
    { ip: '10.6.6.6', list_type: 'blacklist' },
  ];
  assert.equal(decideIpAccess('10.6.6.6', { whitelistEnabled: true }, rules).reason, 'blacklist');
  assert.equal(decideIpAccess('10.1.1.1', { whitelistEnabled: true }, rules).allowed, true);
  assert.equal(decideIpAccess('8.8.8.8', { whitelistEnabled: true }, rules).reason, 'whitelist');
  assert.equal(decideIpAccess('8.8.8.8', { whitelistEnabled: false }, rules).allowed, true);
  assert.equal(
    decideIpAccess('10.6.6.6', { blacklistEnabled: false }, rules).allowed,
    true,
    'disabled block-list is ignored'
  );
});

test('decideIpAccess always lets loopback through', () => {
  assert.equal(decideIpAccess('::1', { whitelistEnabled: true }, []).allowed, true);
});
