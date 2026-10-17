import { evaluateIpAccess, normalizeIp, recordSecurityEvent } from '../services/security.js';
import { getSetupStatus } from '../services/setup.js';

const OPEN_PREFIXES = ['/health', '/ready'];

export function clientIp(req) {
  return normalizeIp(req.ip || req.socket?.remoteAddress);
}

export async function ipGuard(req, res, next) {
  try {
    if (OPEN_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
      return next();
    }
    if (req.path.startsWith('/api/setup')) {
      const status = await getSetupStatus();
      if (status.needsSetup) return next();
    }

    const ip = clientIp(req);
    req.clientIp = ip;
    const verdict = await evaluateIpAccess(ip);
    if (!verdict.allowed) {
      await recordSecurityEvent({
        kind: verdict.reason === 'whitelist' ? 'ip_denied' : 'ip_blocked',
        severity: 'danger',
        ip,
        detail:
          verdict.reason === 'whitelist'
            ? 'Address is not on the allow-list'
            : `Blocked by rule ${verdict.rule?.ip || ''}`.trim(),
        code: verdict.reason === 'whitelist' ? 'ip_not_allowed' : 'ip_rule',
        params: { rule: verdict.rule?.ip || '' },
        debounceMinutes: 5,
      });
      return res.status(403).json({
        success: false,
        error:
          verdict.reason === 'whitelist'
            ? 'Access is restricted to the allow-list'
            : 'This address is blocked',
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
