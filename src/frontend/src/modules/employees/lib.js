import api from '../../services/api';
import { knownError } from '../org/public';

export const STATUS_COLORS = { active: 'green', vacation: 'gold', terminated: 'default', candidate: 'purple' };
export const CLEARANCE_COLORS = { expired: 'red', soon: 'orange', ok: 'green', none: 'default' };

/** An API error of the module in the UI language (emp.errors.<CODE>). */
export const empError = (err, t) => knownError(err, t, 'emp');

/** Downloads a GET endpoint (CSV) through the API client, so the session cookie and base path apply. */
export async function downloadFile(path, params, fallbackName) {
  const res = await api.get(path, { params, responseType: 'blob' });
  const header = res.headers?.['content-disposition'] || '';
  const name = /filename="?([^";]+)"?/.exec(header)?.[1] || fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

/** Days until a YYYY-MM-DD date from today (local calendar). */
export function daysUntil(day) {
  if (!day) return null;
  const [y, m, d] = String(day).split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}
