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

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    const error = new Error(permission === 'denied' ? 'PUSH_DENIED' : 'PUSH_DISMISSED');
    error.code = error.message;
    throw error;
  }
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { data } = await api.get('/pwa/vapid');
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.publicKey) });
  }
  await api.post('/pwa/push', { subscription: subscription.toJSON() });
  return subscription;
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api.delete('/pwa/push', { data: { endpoint: subscription.endpoint } }).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

export const testPush = () => api.post('/pwa/push/test');
