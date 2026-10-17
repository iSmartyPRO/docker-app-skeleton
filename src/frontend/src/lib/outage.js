import { useSyncExternalStore } from 'react';
import axios from 'axios';
import { fmtDateTime, getRegional } from './datetime';
import { t } from '../i18n/translations';

/*
 * Outages: the server restarting (deploys), the database gone, the network
 * lost. Instead of falling back to defaults (the login page of a bare
 * skeleton), the app shows a "technical works" screen with what a person can
 * send to support — the error code, the request id and this tab's session id —
 * checks the server every few seconds and continues by itself.
 */

// ── Tab session id (sent with every request, shown on error screens) ─────────
const SESSION_KEY = 'da_client_session';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomPart(length) {
  const bytes = new Uint8Array(length);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

let sessionId = null;
export function clientSessionId() {
  if (sessionId) return sessionId;
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY);
  } catch {
    sessionId = null;
  }
  if (!/^S-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(sessionId || '')) {
    sessionId = `S-${randomPart(4)}-${randomPart(4)}`;
    try {
      sessionStorage.setItem(SESSION_KEY, sessionId);
    } catch {
      /* storage unavailable: the id lives for this page */
    }
  }
  return sessionId;
}

export const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

// ── Outage state ────────────────────────────────────────────────────────────
let state = { active: false, code: null, requestId: null, status: null, since: null, checking: false, nextCheck: null };
const listeners = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export function useOutage() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state
  );
}

// Requests the app cannot start without: a timeout there means the server is
// unreachable for practical purposes. Elsewhere a timeout is the request's own
// problem (a slow report, a big export) and the page shows its own error.
const BOOT_PATHS = ['/status', '/settings', '/auth/me'];

function isBootRequest(config) {
  const url = String(config?.url || '').split('?')[0].replace(/^\/api(?=\/)/, '');
  return BOOT_PATHS.includes(url);
}

/**
 * What an error says about the server: null when it is not an outage.
 * Only the whole portal being away counts — a module's own failure (a file
 * server gateway down, a registry answering 502, an API switched off) carries
 * its own JSON code and is shown by that page, not by the outage screen.
 */
export function outageOf(error) {
  const res = error?.response;
  if (!res) {
    if (axios.isCancel?.(error) || error?.code === 'ERR_CANCELED') return null;
    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
      return isBootRequest(error?.config) ? { code: 'TIMEOUT', status: null } : null;
    }
    return { code: navigator.onLine === false ? 'OFFLINE' : 'NETWORK', status: null };
  }
  const data = res.data;
  const code = data && typeof data === 'object' ? data.code : undefined;
  if (code === 'MAINTENANCE' || code === 'DB_UNAVAILABLE') return { code, status: res.status, requestId: data?.requestId || res.headers?.['x-request-id'] };
  // Bare gateway errors (nginx or an outer proxy with the app server away)
  // carry no JSON code; answers of the app itself always do.
  if (!code && [502, 504].includes(res.status)) return { code: `HTTP_${res.status}`, status: res.status, requestId: res.headers?.['x-request-id'] };
  if (res.status === 503 && !(data && typeof data === 'object')) return { code: 'HTTP_503', status: res.status, requestId: res.headers?.['x-request-id'] };
  return null;
}

const recent = [];
let poll = null;
const EVERY = 5000;

/**
 * Called for every failed request. A clear outage (maintenance, database) or
 * two failures within 20 seconds switch the screen on.
 */
export function reportFailure(error, { immediate = false } = {}) {
  const outage = outageOf(error);
  if (!outage) return;
  const now = Date.now();
  recent.push(now);
  while (recent.length && now - recent[0] > 20000) recent.shift();
  const clear = immediate || outage.code === 'MAINTENANCE' || outage.code === 'DB_UNAVAILABLE';
  if (!state.active && !clear && recent.length < 2) return;
  set({
    active: true,
    code: outage.code,
    status: outage.status,
    requestId: outage.requestId || state.requestId,
    since: state.since || new Date().toISOString(),
  });
  startPolling();
}

/** Asks the server whether it is back: API up and the database connected. */
export async function checkNow() {
  set({ checking: true });
  try {
    const res = await axios.get('/api/status', { timeout: 6000, headers: { 'X-Client-Session': clientSessionId() } });
    if (res.data?.database?.connected === false) {
      set({ code: 'DB_UNAVAILABLE', requestId: res.headers?.['x-request-id'] || state.requestId });
      return false;
    }
    stopPolling();
    recent.length = 0;
    set({ active: false, code: null, requestId: null, status: null, since: null });
    listeners.forEach((listener) => listener());
    window.dispatchEvent(new Event('outage:recovered'));
    return true;
  } catch (error) {
    const outage = outageOf(error);
    if (outage) set({ code: outage.code, status: outage.status, requestId: outage.requestId || state.requestId });
    return false;
  } finally {
    set({ checking: false, nextCheck: state.active ? Date.now() + EVERY : null });
  }
}

function startPolling() {
  if (poll) return;
  set({ nextCheck: Date.now() + EVERY });
  poll = setInterval(() => {
    if (!state.checking) checkNow();
  }, EVERY);
}

function stopPolling() {
  clearInterval(poll);
  poll = null;
}

/** Text a person can paste to support. */
/** "13.10.2026, 14:30 (Asia/Bishkek) · 2026-10-13T08:30:00.000Z" — the person's time plus UTC for support. */
export function supportTime(at = new Date()) {
  return `${fmtDateTime(at)} (${getRegional().timeZone}) · ${at.toISOString()}`;
}

export function outageDetails({ code, requestId } = state) {
  return [
    `${t('outage.details.code')}: ${code || '—'}`,
    `${t('outage.details.request')}: ${requestId || '—'}`,
    `${t('outage.details.session')}: ${clientSessionId()}`,
    `${t('outage.details.time')}: ${supportTime()}`,
    `${t('outage.details.page')}: ${window.location.pathname}`,
    `${t('outage.details.build')}: ${BUILD}`,
  ].join('\n');
}

/** A crash in the browser goes to the server's incident list (best effort). */
export function reportClientError(error, code = 'APP_CRASH') {
  try {
    return axios
      .post(
        '/api/client-errors',
        { code, message: String(error?.message || error).slice(0, 500), stack: String(error?.stack || '').slice(0, 2000), url: window.location.pathname, build: BUILD },
        { timeout: 5000, headers: { 'X-Client-Session': clientSessionId() } }
      )
      .then((res) => res.data?.id || null)
      .catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}
