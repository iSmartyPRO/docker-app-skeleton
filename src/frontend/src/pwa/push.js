import api from '../services/api';
import { isStandalone, detectPlatform } from './pwa';

/** Web Push on this device: support check, subscribe, unsubscribe, test. */

export function pushSupport() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const { os } = detectPlatform();
  // iOS delivers web push only to apps added to the home screen (iOS 16.4+).
  const needsInstall = os === 'ios' && !isStandalone();
  return { supported: supported && !needsInstall, needsInstall, permission: supported ? Notification.permission : 'unsupported' };
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  // Development builds do not register the worker automatically.
  return navigator.serviceWorker.register('/sw.js');
}

export async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function sameKey(subscription, keyBytes) {
  const current = subscription?.options?.applicationServerKey;
  // Browsers that do not expose the key: assume it matches (the server prunes mismatches on 403).
  if (!current) return true;
  const bytes = new Uint8Array(current);
  return bytes.length === keyBytes.length && bytes.every((byte, index) => byte === keyBytes[index]);
}

/**
 * The browser's subscription for the portal's current VAPID key: an existing
 * one is reused only when it was made for that key, otherwise it is replaced
 * (keys change when the server's encryption key changed). Needs permission.
 */
async function subscribeCurrent(reg) {
  const { data } = await api.get('/pwa/vapid');
  const key = urlBase64ToUint8Array(data.publicKey);
  let subscription = await reg.pushManager.getSubscription();
  if (subscription && !sameKey(subscription, key)) {
    await subscription.unsubscribe().catch(() => {});
    subscription = null;
  }
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }
  await api.post('/pwa/push', { subscription: subscription.toJSON() });
  return subscription;
}

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    const error = new Error(permission === 'denied' ? 'PUSH_DENIED' : 'PUSH_DISMISSED');
    error.code = error.message;
    throw error;
  }
  const reg = await registration();
  await navigator.serviceWorker.ready;
  return subscribeCurrent(reg);
}

/**
 * Silent upkeep for a device that already has push on: when the server's
 * VAPID key changed (its old subscriptions were dropped), re-subscribes with
 * the new key for whoever is signed in. Never asks for permission; does
 * nothing when push is off here, the key is unchanged, or nobody is signed in
 * (the API answers 401).
 */
export async function syncPushSubscription() {
  if (!pushSupport().supported || Notification.permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const subscription = reg ? await reg.pushManager.getSubscription() : null;
  if (!subscription) return null;
  const { data } = await api.get('/pwa/vapid');
  if (sameKey(subscription, urlBase64ToUint8Array(data.publicKey))) return subscription;
  return subscribeCurrent(reg);
}

let synced = false;
/** Runs syncPushSubscription once per page load. */
export function syncPushOnce() {
  if (synced) return;
  synced = true;
  syncPushSubscription().catch(() => {});
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  // Shortly after start, off the critical path.
  setTimeout(syncPushOnce, 5000);
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api.delete('/pwa/push', { data: { endpoint: subscription.endpoint } }).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

export const testPush = () => api.post('/pwa/push/test');
