import { notify } from '../../services/notifications.js';

/*
 * "Someone used your link": one notification per visitor burst, not one per
 * file. Changes made through a link with `notify` on are collected per link
 * and visitor session; the digest goes to the link's author once the visitor
 * has been quiet for QUIET_MS (or the burst has lasted MAX_MS). Bursts live in
 * memory: a restart in the middle of one loses that digest, never a file.
 */

const QUIET_MS = 2 * 60 * 1000;
const MAX_MS = 10 * 60 * 1000;
const bursts = new Map();

const settings = { quietMs: QUIET_MS, maxMs: MAX_MS };
let sender = notify;
/** Tests replace the sender and the timing. */
export function setLinkNotifySender(fn, timing = {}) {
  sender = fn || notify;
  if (timing.quietMs !== undefined) settings.quietMs = timing.quietMs;
  if (timing.maxMs !== undefined) settings.maxMs = timing.maxMs;
}

/**
 * Records one change: `{ action: 'upload'|'mkdir'|'rename'|'replace'|'delete', name }`.
 * `link` is the drive_links row, `visitor` { sid, name, email }.
 */
export function noteLinkChange(link, visitor, change) {
  if (!link?.notify) return;
  const key = `${link.id}:${visitor?.sid || 'anon'}`;
  let burst = bursts.get(key);
  if (!burst) {
    burst = { link, visitor: visitor || {}, changes: [], started: Date.now(), timer: null };
    bursts.set(key, burst);
  }
  burst.changes.push(change);
  clearTimeout(burst.timer);
  const wait = Math.max(0, Math.min(settings.quietMs, burst.started + settings.maxMs - Date.now()));
  burst.timer = setTimeout(() => flush(key), wait);
  burst.timer.unref?.();
}

/** Sends every pending digest now (shutdown, tests). */
export async function flushLinkNotifications() {
  await Promise.all([...bursts.keys()].map((key) => flush(key)));
}

export function digest(changes) {
  const counts = {};
  for (const change of changes) counts[change.action] = (counts[change.action] || 0) + 1;
  const names = [...new Set(changes.map((change) => change.name).filter(Boolean))];
  return { counts, names };
}

const RU = {
  upload: (n) => `загрузил(а) ${n} ${plural(n, 'файл', 'файла', 'файлов')}`,
  replace: (n) => `заменил(а) ${n} ${plural(n, 'файл', 'файла', 'файлов')}`,
  mkdir: (n) => `создал(а) ${n} ${plural(n, 'папку', 'папки', 'папок')}`,
  rename: (n) => `переименовал(а) ${n} ${plural(n, 'объект', 'объекта', 'объектов')}`,
  delete: (n) => `удалил(а) ${n} ${plural(n, 'объект', 'объекта', 'объектов')}`,
};
const EN = {
  upload: (n) => `uploaded ${n} ${n === 1 ? 'file' : 'files'}`,
  replace: (n) => `replaced ${n} ${n === 1 ? 'file' : 'files'}`,
  mkdir: (n) => `created ${n} ${n === 1 ? 'folder' : 'folders'}`,
  rename: (n) => `renamed ${n} ${n === 1 ? 'item' : 'items'}`,
  delete: (n) => `deleted ${n} ${n === 1 ? 'item' : 'items'}`,
};

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** Title and body of a digest in `locale`. */
export function renderDigest(locale, { link, visitor, changes }) {
  const ru = locale === 'ru';
  const { counts, names } = digest(changes);
  const words = ru ? RU : EN;
  const who = visitor?.name || (ru ? 'Посетитель' : 'A visitor');
  const what = ['upload', 'replace', 'mkdir', 'rename', 'delete']
    .filter((action) => counts[action])
    .map((action) => words[action](counts[action]))
    .join(', ');
  const label = link.title || link.name;
  const title = ru ? `${who} ${what} по ссылке «${label}»` : `${who} ${what} via your link “${label}”`;
  const shown = names.slice(0, 5).join(', ');
  const more = names.length > 5 ? (ru ? ` и ещё ${names.length - 5}` : ` and ${names.length - 5} more`) : '';
  const contact = visitor?.email ? `\n${visitor.email}` : '';
  return { title, body: `${shown}${more}${contact}` };
}

async function flush(key) {
  const burst = bursts.get(key);
  if (!burst) return;
  bursts.delete(key);
  clearTimeout(burst.timer);
  const { link } = burst;
  const folder = link.kind === 'dir' ? link.path : link.path.split('/').slice(0, -1).join('/');
  const url = `/app/drive/s/${link.share_id}${folder ? `/${folder.split('/').map(encodeURIComponent).join('/')}` : ''}`;
  try {
    await sender({
      userIds: [link.created_by],
      kind: 'drive.linkActivity',
      module: 'drive',
      link: url,
      render: (locale) => renderDigest(locale, burst),
    });
  } catch (err) {
    console.warn('[drive] link notification failed:', err.message);
  }
}
