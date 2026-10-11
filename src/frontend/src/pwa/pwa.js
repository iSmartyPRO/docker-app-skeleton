import { useEffect, useState } from 'react';

/*
 * Progressive Web App runtime: service worker registration, the browser's
 * install prompt (Chrome / Edge / Samsung Internet on Android and desktop),
 * platform detection for the install guide, and the standalone flag.
 */

let deferredPrompt = null;
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

export function isStandalone() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone);
}

/** { os: 'ios' | 'android' | 'desktop', browser: 'safari' | 'chrome' | 'samsung' | 'firefox' | 'edge' | 'other', inApp } */
export function detectPlatform() {
  const ua = navigator.userAgent || '';
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const os = /iPhone|iPad|iPod/i.test(ua) || iPadOs ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop';
  let browser = 'other';
  if (/SamsungBrowser/i.test(ua)) browser = 'samsung';
  else if (/EdgA?\//i.test(ua) || /EdgiOS/i.test(ua)) browser = 'edge';
  else if (/FxiOS|Firefox/i.test(ua)) browser = 'firefox';
  else if (/CriOS|Chrome/i.test(ua)) browser = 'chrome';
  else if (/Safari/i.test(ua)) browser = 'safari';
  // Messenger / social in-app browsers cannot install apps.
  const inApp = /Instagram|FBAN|FBAV|Telegram|WhatsApp|Line\/|VKClient|; wv\)/i.test(ua);
  return { os, browser, inApp, iPad: iPadOs || /iPad/i.test(ua) };
}

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });

  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker registration failed:', err));
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'navigate' && event.data.url) window.location.assign(event.data.url);
  });
}

export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  emit();
  return outcome;
}

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    const media = window.matchMedia?.('(display-mode: standalone)');
    media?.addEventListener?.('change', listener);
    return () => {
      listeners.delete(listener);
      media?.removeEventListener?.('change', listener);
    };
  }, []);
  return { canPrompt: Boolean(deferredPrompt), installed: isStandalone(), platform: detectPlatform() };
}
