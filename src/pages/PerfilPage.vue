<template>
  <f7-page name="perfil">
    <f7-navbar large transparent>
      <f7-nav-title>Perfil</f7-nav-title>
      <f7-nav-title-large>Perfil</f7-nav-title-large>
    </f7-navbar>

    <div class="block">
      <div class="card glass-strong perfil-card">
        <div class="card-content card-content-padding perfil-head">
          <button type="button" class="perfil-avatar" :class="{ 'con-foto': usuario.avatar }" @click="pickFoto" :disabled="subiendoFoto">
            <img v-if="usuario.avatar" :src="usuario.avatar" alt="Foto de perfil" />
            <span v-else>{{ iniciales }}</span>
            <span class="avatar-cam"><i class="f7-icons">{{ subiendoFoto ? 'hourglass' : 'camera_fill' }}</i></span>
          </button>
          <input ref="fotoInput" type="file" accept="image/*" class="foto-oculto" @change="onFoto" />
          <div class="perfil-datos">
            <div class="perfil-nombre">{{ usuario.nombre }}</div>
            <div class="perfil-rol">{{ etiquetaRol }}</div>
            <div class="perfil-email">@{{ usuario.usuario }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Datos de operación (Módulo 1) -->
    <div class="block-title">Mis datos</div>
    <div class="list glass-list no-hairlines">
      <ul>
        <li>
          <div class="item-content">
            <div class="item-media"><i class="f7-icons dato-icono">person_crop_circle</i></div>
            <div class="item-inner">
              <div class="item-title">Usuario</div>
              <div class="item-after">{{ usuario.usuario || '—' }}</div>
            </div>
          </div>
        </li>
        <li>
          <div class="item-content">
            <div class="item-media"><i class="f7-icons dato-icono">car_fill</i></div>
            <div class="item-inner">
              <div class="item-title">Vehículo</div>
              <div class="item-after">{{ usuario.vehiculo || 'Sin asignar' }}</div>
            </div>
          </div>
        </li>
        <li>
          <div class="item-content">
            <div class="item-media"><i class="f7-icons dato-icono">map_fill</i></div>
            <div class="item-inner">
              <div class="item-title">Ruta</div>
              <div class="item-after">{{ usuario.ruta || 'Sin asignar' }}</div>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <!-- Notificaciones push -->
    <div class="block-title">Notificaciones</div>
    <div class="list glass-list no-hairlines">
      <ul>
        <li v-if="pushEstado === 'activo' || pushEstado === 'inactivo'" class="item-content">
          <div class="item-inner">
            <div class="item-title">
              Notificaciones push
              <div class="item-footer">Recibe avisos de InovaTrack en este dispositivo</div>
            </div>
            <div class="item-after">
              <label class="toggle toggle-init">
                <input type="checkbox" :checked="pushEstado === 'activo'" :disabled="pushCargando" @change="togglePush" />
                <span class="toggle-icon"></span>
              </label>
            </div>
          </div>
        </li>
        <li v-else class="item-content">
          <div class="item-inner">
            <div class="item-title text-color-gray" style="font-weight:400;font-size:14px;">{{ pushMensaje }}</div>
          </div>
        </li>
      </ul>
    </div>

    <!-- Apariencia: claro / oscuro / seguir al sistema -->
    <div class="block-title">Apariencia</div>
    <div class="color-row">
      <button
        v-for="a in APARIENCIAS"
        :key="a.id"
        type="button"
        class="tema-chip"
        :class="{ activo: aparienciaId === a.id }"
        @click="elegirApariencia(a.id)"
      >
        <span class="tema-circulo">{{ a.emoji }}</span>
        <span class="color-nombre">{{ a.nombre }}</span>
      </button>
    </div>

    <!-- Temática (figuras de fondo) -->
    <div class="block-title">Temática</div>
    <div class="color-row">
      <button
        v-for="t in TEMATICAS"
        :key="t.id"
        type="button"
        class="tema-chip"
        :class="{ activo: tematicaId === t.id }"
        @click="elegirTematica(t.id)"
      >
        <span class="tema-circulo">{{ t.emoji }}</span>
        <span class="color-nombre">{{ t.nombre }}</span>
      </button>
    </div>

    <!-- Color -->
    <div class="block-title">Color</div>
    <div class="color-row">
      <button
        v-for="c in COLORES"
        :key="c.id"
        type="button"
        class="color-chip"
        :class="{ activo: colorId === c.id }"
        @click="elegirColor(c.id)"
      >
        <span class="color-muestra" :style="{ background: c.muestra }">
          <i v-if="colorId === c.id" class="f7-icons">checkmark</i>
        </span>
        <span class="color-nombre">{{ c.nombre }}</span>
      </button>
    </div>

    <div class="list glass-list no-hairlines">
      <ul>
        <li class="item-content">
          <div class="item-inner">
            <div class="item-title">Versión</div>
            <div class="item-after">v{{ version }}</div>
          </div>
        </li>
        <li class="item-content">
          <div class="item-inner">
            <div class="item-title">Build</div>
            <div class="item-after">
              {{ buildId }}
              <span v-if="estadoActualizacion.disponible" class="badge-nuevo">Nueva versión lista</span>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <div class="block">
      <f7-button large class="glass-btn" @click="buscarActualizacion" :disabled="actualizando">
        {{ actualizando ? 'Buscando…' : 'Actualizar app' }}
      </f7-button>
      <div class="update-hint">Trae la última versión sin reinstalar la PWA.</div>
    </div>

    <div class="block">
      <f7-button large class="glass-btn" color="orange" @click="confirmarReinstalar" :disabled="actualizando">
        Reinstalar app
      </f7-button>
      <div class="update-hint">Solo si "Actualizar app" no resuelve un problema. Puede pedirte activar las notificaciones de nuevo; tus vueltas pendientes sin sincronizar no se pierden.</div>
    </div>

    <div class="block">
      <f7-button large class="glass-btn" color="red" @click="salir">Cerrar sesión</f7-button>
    </div>
  </f7-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { f7 } from 'framework7-vue';
import { api } from '@/js/api.js';
import { store, limpiarSesion } from '@/js/store.js';
import { estadoPush, activarPush, desactivarPush } from '@/js/push.js';
import {
  TEMATICAS, COLORES, APARIENCIAS,
  tematicaActual, colorActual, aparienciaActual,
  aplicarTematica, aplicarColor, aplicarApariencia,
} from '@/js/tema.js';
import { estadoActualizacion, comprobarActualizacion, aplicarActualizacion, reinstalarApp } from '@/js/actualizacion.js';

const usuario = computed(() => store.usuario ?? { nombre: '', rol: '', usuario: '', vehiculo: '', ruta: '' });
const version = __APP_VERSION__ || '0.1.0';
const buildId = __BUILD_ID__ || '—';

const ROLES = { chofer: 'Chofer', oficina: 'Oficina', direccion: 'Dirección' };
const etiquetaRol = computed(() => ROLES[usuario.value.rol] ?? usuario.value.rol);

const iniciales = computed(() =>
  (usuario.value.nombre || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
);

const actualizando = ref(false);

// Apariencia: claro/oscuro + temática (figuras) + color, independientes.
const tematicaId = ref(tematicaActual());
const colorId = ref(colorActual());
const aparienciaId = ref(aparienciaActual());
function elegirApariencia(id) {
  aparienciaId.value = id;
  aplicarApariencia(id);
}
function elegirTematica(id) {
  tematicaId.value = id;
  aplicarTematica(id);
}
function elegirColor(id) {
  colorId.value = id;
  aplicarColor(id);
}

// Foto de perfil
const fotoInput = ref(null);
const subiendoFoto = ref(false);
function pickFoto() {
  if (!subiendoFoto.value) fotoInput.value?.click();
}
// Reduce la imagen a un cuadrado (recorte centrado) y la comprime a JPEG.
function reducirImagen(file, max = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const lado0 = Math.min(img.width, img.height);
      const lado = Math.min(max, lado0);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = lado;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, (img.width - lado0) / 2, (img.height - lado0) / 2, lado0, lado0, 0, 0, lado, lado);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}
async function onFoto(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { f7.dialog.alert('Elige una imagen.', 'Foto de perfil'); return; }
  subiendoFoto.value = true;
  try {
    const dataUrl = await reducirImagen(file, 256);
    const actualizado = await api.usuarios.actualizar({ avatar: dataUrl });
    if (store.usuario) store.usuario.avatar = actualizado.avatar;
    f7.toast.create({ text: 'Foto actualizada ✓', closeTimeout: 1600, position: 'center' }).open();
  } catch (err) {
    f7.dialog.alert(err.message || 'No se pudo actualizar la foto.', 'Foto de perfil');
  } finally {
    subiendoFoto.value = false;
  }
}

// Notificaciones push
const pushEstado = ref('no-soportado');
const pushCargando = ref(false);
const pushMensaje = computed(() => ({
  'no-soportado': 'Este dispositivo no soporta notificaciones push.',
  'no-instalada': 'Para recibir notificaciones, añade InovaTrack a tu pantalla de inicio.',
  bloqueado: 'Notificaciones bloqueadas. Actívalas en los ajustes de tu dispositivo.',
}[pushEstado.value] || ''));

async function refrescarPush() {
  try { pushEstado.value = await estadoPush(); } catch { pushEstado.value = 'no-soportado'; }
}

async function togglePush(e) {
  const activar = e.target.checked;
  pushCargando.value = true;
  try {
    if (activar) {
      await activarPush();
      f7.toast.create({ text: 'Notificaciones activadas ✓', closeTimeout: 1800, position: 'center' }).open();
    } else {
      await desactivarPush();
    }
  } catch (err) {
    f7.dialog.alert(err.message || 'No se pudo cambiar.', 'Notificaciones');
  } finally {
    await refrescarPush();
    pushCargando.value = false;
  }
}

function salir() {
  f7.dialog.confirm('¿Cerrar sesión en este dispositivo?', 'Cerrar sesión', async () => {
    try { await api.auth.salir(); } catch { /* aunque falle, limpiamos local */ }
    limpiarSesion();
  });
}

// registerType:'prompt' (vite.config.js) deja un SW nuevo "esperando" en vez
// de activarlo solo: así se puede avisar de verdad si hay o no una versión
// nueva, en vez de recargar a ciegas cada vez que se toca el botón (que es lo
// que pasaba antes). Nunca desregistra el SW ni borra cachés — ver
// reinstalarApp() para ese camino, aparte y con aviso previo.
async function buscarActualizacion() {
  if (actualizando.value) return;
  actualizando.value = true;
  f7.toast.create({ text: 'Buscando actualización…', position: 'center', closeTimeout: 4000 }).open();

  try {
    const hay = await comprobarActualizacion();
    if (hay) {
      // aplicarActualizacion() recarga sola en cuanto el SW nuevo toma el control.
      await aplicarActualizacion();
    } else {
      f7.toast.create({ text: `Ya tienes la última versión (build ${buildId})`, closeTimeout: 2400, position: 'center' }).open();
    }
  } catch {
    f7.toast.create({ text: 'No se pudo comprobar. Intenta de nuevo.', closeTimeout: 2200, position: 'center' }).open();
  } finally {
    actualizando.value = false;
  }
}

// Camino aparte y explícito: sí desregistra el service worker y borra
// cachés (nunca la cola offline, que vive en IndexedDB). Se avisa antes
// porque puede pedir reactivar notificaciones.
function confirmarReinstalar() {
  f7.dialog.confirm(
    'Vuelve a preparar la app desde cero en este dispositivo. Puede que tengas que activar otra vez las notificaciones. Tus vueltas pendientes sin sincronizar no se pierden.',
    'Reinstalar app',
    () => reinstalarApp()
  );
}

onMounted(async () => {
  await refrescarPush();
});
</script>

<style scoped>
.perfil-head { display: flex; align-items: center; gap: 16px; }
.perfil-datos { flex: 1; min-width: 0; }
.perfil-avatar {
  position: relative; width: 66px; height: 66px; border-radius: 50%; padding: 0; border: none;
  background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 24px; font-weight: 800; flex-shrink: 0; cursor: pointer; overflow: visible;
}
.perfil-avatar span { display: flex; align-items: center; justify-content: center; }
.perfil-avatar img { width: 66px; height: 66px; border-radius: 50%; object-fit: cover; display: block; }
.perfil-avatar .avatar-cam {
  position: absolute; right: -2px; bottom: -2px; width: 24px; height: 24px; border-radius: 50%;
  background: var(--inova-primary); border: 2px solid #fff; display: flex; align-items: center; justify-content: center;
}
.perfil-avatar .avatar-cam i { font-size: 12px; color: #fff; }
.perfil-avatar:active { transform: scale(0.96); }
.foto-oculto { display: none; }

/* Selector de tema */
.tema-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 16px; }
.tema-card {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px;
  border: 1.5px solid var(--linea); background: var(--sup-campo);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  border-radius: 18px; padding: 14px 10px; cursor: pointer; transition: all 0.15s ease;
}
.tema-card:active { transform: scale(0.97); }
.tema-card.activo { border-color: var(--inova-primary); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08); }
/* Selectores en fila de círculos (temática y color) */
.color-row { display: flex; gap: 12px; overflow-x: auto; padding: 4px 16px 8px; -webkit-overflow-scrolling: touch; }
.color-chip, .tema-chip {
  flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 6px;
  border: none; background: transparent; cursor: pointer; padding: 0; width: 64px;
}
.tema-circulo {
  width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 25px; background: var(--sup-sutil); border: 2px solid var(--borde-chip);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1); transition: transform 0.12s ease;
}
.tema-chip.activo .tema-circulo { transform: scale(1.08); outline: 2.5px solid var(--inova-primary); outline-offset: 2px; background: rgba(var(--f7-theme-color-rgb), 0.14); }
.tema-chip:active .tema-circulo { transform: scale(0.94); }
.color-muestra {
  width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18); border: 2px solid var(--borde-chip); transition: transform 0.12s ease;
}
.color-muestra i { color: #fff; font-size: 22px; font-weight: 800; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); }
.color-chip.activo .color-muestra { transform: scale(1.08); outline: 2.5px solid var(--inova-primary); outline-offset: 2px; }
.color-chip:active .color-muestra { transform: scale(0.94); }
.color-nombre { font-size: 11px; font-weight: 600; color: var(--texto-tenue); white-space: nowrap; }
.tema-chip .color-nombre { white-space: normal; line-height: 1.15; text-align: center; }
.perfil-nombre { font-size: 20px; font-weight: 800; }
.perfil-rol { opacity: 0.7; font-size: 14px; }
.perfil-email { opacity: 0.45; font-size: 12px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; }
.dato-icono { font-size: 26px; color: var(--inova-primary); }
.update-hint { text-align: center; font-size: 13px; opacity: 0.55; margin-top: 10px; }
.badge-nuevo {
  display: inline-flex; align-items: center; margin-left: 6px;
  font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px;
  background: var(--verde-bg); color: var(--verde-fg);
}
</style>
