import { useSyncExternalStore } from 'react';

/*
 * Work in progress that a page reload would destroy: uploads, long saves.
 * While anything is marked busy the app does not reload itself for an update
 * and the browser asks before the tab is closed or reloaded.
 *
 * Usage:
 *   const done = markBusy('drive-upload');   // returns the unmark function
 *   try { await upload(); } finally { done(); }
 * or markBusy(key) / unmarkBusy(key) with the same key; marks are counted, so
 * two parallel uploads under one key need two unmarks.
 *
 * Requests sent through services/api with `onUploadProgress` are marked busy
 * automatically, so module upload code usually needs nothing.
 */

const marks = new Map();
const listeners = new Set();
let busy = false;

function onBeforeUnload(event) {
  event.preventDefault();
  // Older browsers need returnValue set to show the "leave site?" prompt.
  event.returnValue = '';
  return '';
}

function update() {
  const next = marks.size > 0;
  if (next === busy) return;
  busy = next;
  if (typeof window !== 'undefined') {
    if (busy) window.addEventListener('beforeunload', onBeforeUnload);
    else window.removeEventListener('beforeunload', onBeforeUnload);
  }
  listeners.forEach((listener) => listener());
}

export function markBusy(key = 'work') {
  marks.set(key, (marks.get(key) || 0) + 1);
  update();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    unmarkBusy(key);
  };
}

export function unmarkBusy(key = 'work') {
  const count = marks.get(key) || 0;
  if (count <= 1) marks.delete(key);
  else marks.set(key, count - 1);
  update();
}

export function isBusy() {
  return busy;
}

export function onBusyChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while something reload-sensitive is running. */
export function useBusy() {
  return useSyncExternalStore(onBusyChange, isBusy, isBusy);
}
