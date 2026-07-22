// Notificaciones push nativas (Web Push). En iPhone SOLO funcionan con la PWA
// instalada en la pantalla de inicio (iOS 16.4+) y con permiso concedido.
import { api } from './api.js';

export const soportaPush = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// ¿La app corre instalada (standalone)? Requisito en iOS para recibir push.
export const esStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

function b64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function nombreDispositivo() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Dispositivo';
}

// 'no-soportado' | 'no-instalada' | 'bloqueado' | 'activo' | 'inactivo'
export async function estadoPush() {
  if (!soportaPush()) return 'no-soportado';
  // En iOS sin instalar no hay push; en escritorio sí (aunque no sea standalone).
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (iOS && !esStandalone()) return 'no-instalada';
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? 'activo' : 'inactivo';
}

export async function activarPush() {
  if (!soportaPush()) throw new Error('Este dispositivo no soporta notificaciones.');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('No diste permiso para las notificaciones.');

  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api.push.llavePublica();
  if (!publicKey) throw new Error('El servidor no tiene configuradas las notificaciones.');

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64ToUint8(publicKey),
  });
  await api.push.suscribir(sub.toJSON(), nombreDispositivo());
  return true;
}

// Reasegura que ESTE dispositivo quede guardado en el servidor para el usuario
// actual. Se llama al abrir la app: si cambias de teléfono (o inicias sesión en
// uno nuevo) y ya tenías las notificaciones activas, tu nuevo dispositivo se
// registra solo, sin tener que volver a tocar el interruptor.
export async function sincronizar() {
  try {
    if (!soportaPush() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    await api.push.suscribir(sub.toJSON(), nombreDispositivo());
  } catch { /* silencioso: nunca debe romper el arranque */ }
}

export async function desactivarPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await api.push.desuscribir(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}
