import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * Folder uploads for Files and Drive.
 *
 * 1. Collect: a drop (DataTransfer entries, walked recursively) or a folder
 *    picked with <input webkitdirectory> becomes { files: [{ file, dir }], dirs }
 *    where `dir` is the file's folder relative to the upload target ("Photos/2026")
 *    and `dirs` lists every folder, empty ones included.
 * 2. Folders: the module creates the whole tree first (`ensure`, in chunks,
 *    parents first; existing folders are reused) and answers a reference per
 *    folder (a node id in Files, a share path in Drive) or an error.
 * 3. Files: uploaded into their folders a few at a time (`send`); a failure
 *    is recorded and the rest go on. The batch can be cancelled.
 */

export const FOLDER_LIMITS = {
  /** Files in one folder upload. */
  maxFiles: 10000,
  /** Folder levels below the target (the server refuses deeper ones too). */
  maxDepth: 32,
  /** Files uploading at the same time. */
  concurrency: 3,
  /** Folder paths per tree request. */
  treeChunk: 500,
};

// Desktop clutter that nobody means to upload.
const JUNK = new Set(['.ds_store', 'thumbs.db', 'desktop.ini', '.localized']);
const isJunk = (name) => JUNK.has(String(name).toLowerCase()) || String(name).startsWith('._');

export class FolderUploadError extends Error {
  constructor(code, info = {}) {
    super(code);
    this.code = code;
    this.info = info;
  }
}

/** iOS and Android browsers cannot pick a folder (the attribute is ignored there). */
export function canPickFolders() {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios || /Android/i.test(ua)) return false;
  return 'webkitdirectory' in document.createElement('input');
}

const parentOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const depthOf = (path) => (path ? path.split('/').length : 0);

/** Files picked with <input webkitdirectory>: their folders come from webkitRelativePath. */
export function collectPicked(fileList) {
  const files = [];
  const dirs = new Set();
  for (const file of Array.from(fileList || [])) {
    const rel = String(file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const dir = parentOf(rel);
    if (dir) dirs.add(dir);
    if (isJunk(file.name)) continue;
    files.push({ file, dir });
  }
  return finish(files, dirs, true);
}

function finish(files, dirs, hasFolders) {
  if (files.length > FOLDER_LIMITS.maxFiles) throw new FolderUploadError('TOO_MANY', { max: FOLDER_LIMITS.maxFiles });
  const deep = [...dirs].some((dir) => depthOf(dir) > FOLDER_LIMITS.maxDepth);
  if (deep) throw new FolderUploadError('TOO_DEEP', { max: FOLDER_LIMITS.maxDepth });
  const tops = new Set([...dirs].map((dir) => dir.split('/')[0]));
  files.forEach((item) => !item.dir && tops.add(item.file.name));
  return { files, dirs: [...dirs].sort((a, b) => depthOf(a) - depthOf(b) || a.localeCompare(b)), hasFolders, tops: [...tops] };
}

// readEntries answers in batches (100 at a time in Chrome): read until it returns nothing.
function readAllEntries(reader) {
  return new Promise((resolve, reject) => {
    const all = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

const fileOf = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject));

async function walkEntry(entry, dir, out) {
  if (out.files.length > FOLDER_LIMITS.maxFiles) throw new FolderUploadError('TOO_MANY', { max: FOLDER_LIMITS.maxFiles });
  if (entry.isFile) {
    if (isJunk(entry.name)) return;
    try {
      out.files.push({ file: await fileOf(entry), dir });
    } catch (err) {
      out.unreadable.push({ path: dir ? `${dir}/${entry.name}` : entry.name, error: err?.message || 'unreadable' });
    }
    return;
  }
  if (!entry.isDirectory) return;
  const path = dir ? `${dir}/${entry.name}` : entry.name;
  if (depthOf(path) > FOLDER_LIMITS.maxDepth) throw new FolderUploadError('TOO_DEEP', { max: FOLDER_LIMITS.maxDepth });
  out.dirs.add(path);
  for (const child of await readAllEntries(entry.createReader())) await walkEntry(child, path, out);
}

// File System Access handles (where entries are not offered).
async function walkHandle(handle, dir, out) {
  if (out.files.length > FOLDER_LIMITS.maxFiles) throw new FolderUploadError('TOO_MANY', { max: FOLDER_LIMITS.maxFiles });
  if (handle.kind === 'file') {
    if (!isJunk(handle.name)) out.files.push({ file: await handle.getFile(), dir });
    return;
  }
  const path = dir ? `${dir}/${handle.name}` : handle.name;
  if (depthOf(path) > FOLDER_LIMITS.maxDepth) throw new FolderUploadError('TOO_DEEP', { max: FOLDER_LIMITS.maxDepth });
  out.dirs.add(path);
  for await (const child of handle.values()) await walkHandle(child, path, out);
}

/**
 * Reads a drop. Must be called inside the drop event: the items are only
 * readable synchronously, so entries are taken first and walked after.
 * Returns { hasFolders (null: not known before the scan), plain (dataTransfer.files),
 * scan: () => Promise<{ files, dirs, hasFolders, tops, unreadable }> }.
 */
export function collectDrop(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []).filter((item) => item.kind === 'file');
  const entries = items.map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null));
  const plain = Array.from(dataTransfer?.files || []);
  if (entries.length && entries.every(Boolean)) {
    const hasFolders = entries.some((entry) => entry.isDirectory);
    const scan = async () => {
      const out = { files: [], dirs: new Set(), unreadable: [] };
      for (const entry of entries) await walkEntry(entry, '', out);
      return { ...finish(out.files, out.dirs, hasFolders), unreadable: out.unreadable };
    };
    return { hasFolders, scan, plain };
  }
  const handles = items.map((item) => (typeof item.getAsFileSystemHandle === 'function' ? item.getAsFileSystemHandle() : null));
  if (handles.length && handles.every(Boolean)) {
    // The handles are requested now (inside the event); they are walked when asked.
    handles.forEach((promise) => promise.catch(() => {}));
    const scan = async () => {
      const resolved = (await Promise.all(handles)).filter(Boolean);
      const out = { files: [], dirs: new Set(), unreadable: [] };
      for (const handle of resolved) await walkHandle(handle, '', out);
      return { ...finish(out.files, out.dirs, resolved.some((handle) => handle.kind === 'directory')), unreadable: [] };
    };
    return { hasFolders: null, scan, plain };
  }
  // No entry API: plain files only (folders show up as empty pseudo-files and are dropped by the caller).
  return { hasFolders: false, plain, scan: async () => ({ files: plain.map((file) => ({ file, dir: '' })), dirs: [], hasFolders: false, tops: plain.map((file) => file.name), unreadable: [] }) };
}

/** A label for the batch: the folder's name, or "N items". */
export function batchLabel(scan, t) {
  if (scan.tops.length === 1) return scan.tops[0];
  return t('folderUpload.items', { n: scan.tops.length });
}

/**
 * Runs folder uploads and keeps their progress for the panel. Progress is
 * gathered in place and published at most ~6 times a second, so hundreds of
 * files do not re-render the page on every byte.
 */
export function useFolderUploads() {
  const [batches, setBatches] = useState([]);
  const live = useRef(new Map());
  const timer = useRef(null);
  const mounted = useRef(true);

  // Leaving the page does not stop running uploads (as with single files); they just stop reporting here.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const publish = useCallback((now = false) => {
    const flush = () => {
      timer.current = null;
      if (!mounted.current) return;
      setBatches([...live.current.values()].map(({ controller, ...rest }) => ({ ...rest, failed: [...rest.failed] })));
    };
    if (now) {
      clearTimeout(timer.current);
      flush();
    } else if (!timer.current) timer.current = setTimeout(flush, 160);
  }, []);

  /**
   * spec: { label, files, dirs, unreadable, maxBytes, ensure(paths, first) → refs[],
   *         root, send(file, ref, { signal, onProgress }), describe(err) → text,
   *         skipped(err) → bool, tooLarge → text, onDone() }
   */
  const start = useCallback(
    async (spec) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const controller = new AbortController();
      const batch = {
        id,
        controller,
        label: spec.label,
        phase: 'folders',
        status: 'running',
        total: spec.files.length,
        folders: spec.dirs.length,
        done: 0,
        skipped: 0,
        failed: [...(spec.unreadable || [])],
        bytesTotal: spec.files.reduce((sum, item) => sum + (item.file.size || 0), 0),
        bytesDone: 0,
        error: null,
      };
      live.current.set(id, batch);
      publish(true);

      const pathOf = (item) => (item.dir ? `${item.dir}/${item.file.name}` : item.file.name);
      const refs = new Map();
      try {
        for (let index = 0; index < spec.dirs.length; index += FOLDER_LIMITS.treeChunk) {
          if (controller.signal.aborted) break;
          const chunk = spec.dirs.slice(index, index + FOLDER_LIMITS.treeChunk);
          const answer = await spec.ensure(chunk, index === 0, controller.signal);
          chunk.forEach((dir, at) => refs.set(dir, answer[at]));
        }
      } catch (err) {
        batch.status = controller.signal.aborted ? 'cancelled' : 'error';
        batch.error = spec.describe(err);
        batch.phase = 'files';
        publish(true);
        spec.onDone?.();
        return;
      }

      batch.phase = 'files';
      publish(true);
      const queue = spec.files.slice();
      const worker = async () => {
        while (queue.length && !controller.signal.aborted) {
          const item = queue.shift();
          const size = item.file.size || 0;
          const ref = item.dir ? refs.get(item.dir) : { ref: spec.root };
          if (!ref || ref.error) {
            batch.failed.push({ path: pathOf(item), error: ref?.error || spec.describe(null) });
            batch.bytesDone += size;
            publish();
            continue;
          }
          if (spec.maxBytes && size > spec.maxBytes) {
            batch.failed.push({ path: pathOf(item), error: spec.tooLarge });
            batch.bytesDone += size;
            publish();
            continue;
          }
          let sent = 0;
          try {
            await spec.send(item.file, ref.ref, {
              signal: controller.signal,
              onProgress: (fraction) => {
                const now = Math.round(size * Math.min(1, fraction || 0));
                batch.bytesDone += now - sent;
                sent = now;
                publish();
              },
            });
            batch.done += 1;
          } catch (err) {
            if (controller.signal.aborted) {
              batch.bytesDone -= sent;
              break;
            }
            if (spec.skipped?.(err)) batch.skipped += 1;
            else batch.failed.push({ path: pathOf(item), error: spec.describe(err) });
          }
          batch.bytesDone += size - sent;
          publish();
        }
      };
      await Promise.all(Array.from({ length: Math.min(FOLDER_LIMITS.concurrency, Math.max(1, queue.length)) }, worker));
      batch.status = controller.signal.aborted ? 'cancelled' : 'done';
      publish(true);
      spec.onDone?.();
    },
    [publish]
  );

  const cancel = useCallback(
    (id) => {
      const batch = live.current.get(id);
      if (batch && batch.status === 'running') {
        batch.controller.abort();
        batch.status = 'cancelled';
        publish(true);
      }
    },
    [publish]
  );

  const clear = useCallback(() => {
    for (const [id, batch] of live.current) if (batch.status !== 'running') live.current.delete(id);
    publish(true);
  }, [publish]);

  return { batches, start, cancel, clear };
}
