import { timingSafeEqual } from 'crypto';
import { getSetupStatus } from '../services/setup.js';

function setupToken() {
  return String(process.env.SETUP_TOKEN || '').trim();
}

function tokensMatch(expected, received) {
  const left = Buffer.from(expected);
  const right = Buffer.from(String(received || ''));
  if (!expected || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function setupTokenConfigured() {
  return Boolean(setupToken());
}

export function readSetupToken(req) {
  return req.get('x-setup-token') || req.body?.setupToken || req.query?.setupToken || '';
}

export function hasValidSetupToken(req) {
  const expected = setupToken();
  if (!expected) return true;
  return tokensMatch(expected, readSetupToken(req));
}

export function requireSetupToken(req, res, next) {
  if (hasValidSetupToken(req)) return next();
  return res.status(401).json({
    success: false,
    error: 'Setup token required',
    setupTokenRequired: true,
  });
}

export async function assertSetupAllowed(req, res, next) {
  try {
    const status = await getSetupStatus();
    if (!status.needsSetup) {
      return res.status(403).json({
        success: false,
        error: 'Setup is already complete',
      });
    }
    req.setupStatus = status;
    return next();
  } catch (err) {
    return next(err);
  }
}
