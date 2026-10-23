/*
 * Remote access settings (settings.modules.remote, docs/specs/remote-access.ru.md): the
 * defaults the package manifest carries (scripts/build-module.mjs reads them from
 * here) and the sanitizer the portal uses for them (index.js exports it as
 * `sanitizeSettings`). Plain data and pure functions, no imports: read at build time too.
 *
 * Transparency is enforced in the service (every connection is logged and the watched
 * employee is notified); there is intentionally no covert / silent setting here.
 */

export const defaultEnabled = false;

export const defaults = {
  // guacd service address (empty = the live tunnel is off; the module still manages
  // computers, access and the audit journal).
  guacdHost: '',
  guacdPort: 4822,
  // Taking control (not just viewing) in monitoring mode asks the employee first.
  requireConsentForControl: true,
  // Record sessions (stored on the server, shown in the journal). Off by default.
  recording: false,
  // Delete recordings after this many days.
  retentionDays: 30,
  // Passbolt password manager: let each person connect their own Passbolt and use its entries.
  passbolt: false,
  // Set when a superadministrator confirms the monitoring policy checklist
  // (docs/specs/remote-access.ru.md). Monitoring connections are refused until then.
  policyAckAt: null,
};

export function sanitizeSettings(current, incoming = {}) {
  const next = { ...current };
  if (typeof incoming.guacdHost === 'string') next.guacdHost = incoming.guacdHost.replace(/[^a-zA-Z0-9.\-_:]/g, '').slice(0, 120);
  const port = Number(incoming.guacdPort);
  if (Number.isInteger(port) && port > 0 && port <= 65535) next.guacdPort = port;
  for (const flag of ['requireConsentForControl', 'recording', 'passbolt']) {
    if (typeof incoming[flag] === 'boolean') next[flag] = incoming[flag];
  }
  const days = Number(incoming.retentionDays);
  if (Number.isInteger(days)) next.retentionDays = Math.min(3650, Math.max(1, days));
  // The policy acknowledgement is a server-side timestamp, never a value the client sets.
  if (incoming.policyAck === true) next.policyAckAt = new Date().toISOString();
  else if (incoming.policyAck === false) next.policyAckAt = null;
  return next;
}
