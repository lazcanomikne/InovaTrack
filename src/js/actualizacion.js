// Ciclo de vida del service worker de la PWA (Perfil > "Actualizar app").
//
// registerType:'prompt' en vite.config.js hace que un service worker nuevo se
// quede "esperando" (reg.waiting) en vez de tomar el control solo: aquí
// decidimos cuándo activarlo, para poder avisarle al chofer si de verdad hay
// una versión nueva en vez de recargar a ciegas cada vez que toca el botón.
import { reactive } from 'vue';
import { registerSW } from 'virtual:pwa-register';

export const estadoActualizacion = reactive({
  disponible: false, // hay un SW nuevo esperando a que lo activemos
});

let registro = null;
let actualizarSW = null;

export function iniciarActualizaciones() {
  actualizarSW = registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) { registro = reg; },
    onNeedRefresh() { estadoActualizacion.disponible = true; },
    // Sin service worker la app sigue funcionando con lo último que cargó
    // el navegador: no hay actualización que ofrecer, pero tampoco se rompe nada.
    onRegisterError() { /* noop */ },
  });
}

// Pide al navegador que revise si hay un sw.js nuevo y espera (con límite)
// a que Workbox confirme si quedó una versión nueva en espera. Es el único
// salvavidas de este flujo: si algo se cuelga, simplemente se reporta "sin
// novedades" — nunca se recurre a desregistrar el SW ni borrar cachés.
const LIMITE_ESPERA_MS = 8000;
export async function comprobarActualizacion() {
  if (estadoActualizacion.disponible) return true;
  try { await registro?.update(); } catch { /* sin señal: se reporta como "sin novedades" */ }

  const limite = Date.now() + LIMITE_ESPERA_MS;
  while (!estadoActualizacion.disponible && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 300));
  }
  return estadoActualizacion.disponible;
}

// Activa el service worker que ya quedó en espera y recarga UNA sola vez
// cuando el navegador confirme que tomó el control.
//
// No basta con dejarle el reload al 'controlling' que arma por su cuenta
// registerSW/workbox-window: ese reload sólo dispara si `event.isUpdate` viene
// true, y workbox-window fija ese flag una sola vez, al registrar el SW por
// primera vez en esta pestaña (según si YA había un controller en ese
// instante). En una pestaña donde el primer service worker se instala y
// luego, en la misma sesión, aparece uno nuevo, ese flag queda en false para
// siempre y el reload automático nunca llega — por eso ponemos el nuestro.
export async function aplicarActualizacion() {
  if (!actualizarSW) return;
  let recargado = false;
  const recargarUnaVez = () => {
    if (recargado) return;
    recargado = true;
    location.reload();
  };
  navigator.serviceWorker?.addEventListener('controllerchange', recargarUnaVez, { once: true });
  await actualizarSW(true);
  // Salvavidas: si el navegador no llega a disparar 'controllerchange' (por
  // ejemplo porque ya era el controller), no se deja al chofer colgado a
  // medio actualizar. Sigue siendo sólo un reload, nunca un desregistro.
  setTimeout(recargarUnaVez, 4000);
}

// Reinicio "duro": única vía de este módulo que sí desregistra el service
// worker y borra las cachés de Workbox. Es un camino aparte, explícito y con
// aviso previo (ver PerfilPage.vue) — nunca el resultado de "Actualizar app".
//
// CRÍTICO: esto NO debe tocar IndexedDB. La cola offline (src/js/cola.js, base
// 'inovatrack-cola') vive ahí, es un almacén completamente distinto de Cache
// Storage/Service Worker, y un chofer con entregas sin sincronizar no puede
// perderlas por reinstalar la app.
export async function reinstalarApp() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs || []).map((r) => r.unregister()));
  } catch { /* seguimos igual: el objetivo es dejar la app en un estado limpio */ }
  try {
    const nombres = await caches?.keys?.();
    await Promise.all((nombres || []).map((n) => caches.delete(n)));
  } catch { /* idem */ }
  // Bandera para que, tras el reload, App.vue vuelva a registrar el push de
  // este dispositivo (la suscripción anterior puede no sobrevivir al
  // desregistro del service worker al que estaba asociada).
  try { localStorage.setItem('inovatrack_recien_reinstalado', '1'); } catch { /* modo privado */ }
  location.reload();
}
