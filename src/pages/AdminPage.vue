<template>
  <f7-page name="admin" @page:afterin="cargar">
    <f7-navbar large transparent>
      <f7-nav-title>Configuración</f7-nav-title>
      <f7-nav-title-large>Configuración</f7-nav-title-large>
    </f7-navbar>

    <!-- Sólo oficina/dirección. El backend vuelve a comprobarlo en cada
         llamada: esto es para no enseñar una pantalla que no se puede usar. -->
    <div v-if="!esAdmin" class="aviso glass">
      <i class="f7-icons aviso-icono">lock_fill</i>
      <div class="aviso-t">Sin acceso</div>
      <div class="aviso-s">Esta sección es para oficina y dirección.</div>
    </div>

    <template v-else>
      <div class="segmentos">
        <button type="button" class="seg" :class="{ act: vista === 'usuarios' }" @click="vista = 'usuarios'">
          Usuarios
        </button>
        <button type="button" class="seg" :class="{ act: vista === 'rutas' }" @click="vista = 'rutas'">
          Vueltas por chofer
        </button>
      </div>

      <div v-if="cargando" class="aviso"><f7-preloader /></div>

      <!-- ─────────────────────────── Usuarios ─────────────────────────── -->
      <template v-else-if="vista === 'usuarios'">
        <div class="barra-acciones">
          <span class="conteo">{{ usuarios.length }} usuario{{ usuarios.length === 1 ? '' : 's' }}</span>
          <button type="button" class="btn-alta" @click="abrirAlta">
            <i class="f7-icons">plus</i> Nuevo
          </button>
        </div>

        <div class="lista">
          <div v-for="u in usuarios" :key="u.id" class="glass tarjeta" :class="{ baja: !u.activo }">
            <div class="fila1">
              <span class="avatar" :style="u.avatar ? { backgroundImage: `url(${u.avatar})` } : null">
                <template v-if="!u.avatar">{{ iniciales(u.nombre) }}</template>
              </span>
              <div class="quien">
                <div class="nombre">{{ u.nombre }}</div>
                <div class="email">{{ u.email || 'sin correo' }}</div>
              </div>
              <span class="chip" :class="u.rol">{{ ROLES[u.rol] || u.rol }}</span>
            </div>

            <div class="fila2">
              <span v-if="u.vehiculo" class="dato"><i class="f7-icons">car_fill</i>{{ u.vehiculo }}</span>
              <span v-if="u.ruta" class="dato"><i class="f7-icons">map_fill</i>{{ u.ruta }}</span>
              <span v-if="!u.activo" class="chip baja-chip">Dada de baja</span>
            </div>

            <div class="acciones">
              <button type="button" class="acc" @click="abrirEdicion(u)">
                <i class="f7-icons">pencil</i> Editar
              </button>
              <button
                type="button"
                class="acc"
                :class="u.activo ? 'peligro' : 'ok'"
                :disabled="u.id === yo.id"
                @click="alternarActivo(u)"
              >
                <i class="f7-icons">{{ u.activo ? 'person_badge_minus' : 'person_badge_plus' }}</i>
                {{ u.activo ? 'Dar de baja' : 'Reactivar' }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- ───────────────────── Vueltas por chofer ─────────────────────── -->
      <template v-else>
        <div class="barra-acciones">
          <input v-model="fecha" type="date" class="fecha-input" @change="cargarRutas" />
          <span class="conteo">{{ vueltas.length }} vuelta{{ vueltas.length === 1 ? '' : 's' }}</span>
        </div>

        <div v-if="!vueltas.length" class="aviso glass">
          <i class="f7-icons aviso-icono">tray</i>
          <div class="aviso-t">Sin vueltas ese día</div>
          <div class="aviso-s">Nadie tiene reparto asignado en la fecha elegida.</div>
        </div>

        <div v-else class="lista">
          <div v-for="g in porChofer" :key="g.id" class="glass tarjeta">
            <div class="fila1">
              <div class="quien">
                <div class="nombre">{{ g.nombre }}</div>
                <div class="email">{{ g.total }} vuelta{{ g.total === 1 ? '' : 's' }}</div>
              </div>
              <span class="chip pend">{{ g.pendientes }} pend.</span>
            </div>
            <div class="barra-progreso">
              <span class="parte ok" :style="{ width: `${pct(g.entregadas, g.total)}%` }"></span>
              <span class="parte mal" :style="{ width: `${pct(g.no_entregadas, g.total)}%` }"></span>
            </div>
            <div class="fila2">
              <span class="dato ok">{{ g.entregadas }} entregadas</span>
              <span class="dato mal">{{ g.no_entregadas }} no entregadas</span>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- Hoja de alta / edición -->
    <Teleport to="body">
      <div v-if="hoja" class="hoja-fondo" @click.self="hoja = null">
        <div class="hoja glass-strong">
          <div class="hoja-tit">{{ form.id ? 'Editar usuario' : 'Nuevo usuario' }}</div>

          <label class="campo">
            <span>Nombre</span>
            <input v-model="form.nombre" type="text" placeholder="Nombre y apellido" />
          </label>

          <label class="campo">
            <span>Correo</span>
            <input v-model="form.email" type="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="persona@empresa.com" />
          </label>

          <div class="campo">
            <span>Rol</span>
            <div class="roles">
              <button
                v-for="(txt, id) in ROLES"
                :key="id"
                type="button"
                class="rol-chip"
                :class="{ act: form.rol === id }"
                @click="form.rol = id"
              >{{ txt }}</button>
            </div>
          </div>

          <label class="campo">
            <span>Vehículo</span>
            <input v-model="form.vehiculo" type="text" placeholder="Opcional" />
          </label>

          <label class="campo">
            <span>Ruta</span>
            <input v-model="form.ruta" type="text" placeholder="Opcional" />
          </label>

          <div class="hoja-btns">
            <button type="button" class="btn-sec" @click="hoja = null">Cancelar</button>
            <button type="button" class="btn-pri" :disabled="guardando" @click="guardar">
              {{ guardando ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </f7-page>
</template>

<script setup>
import { ref, computed, reactive } from 'vue';
import { f7 } from 'framework7-vue';
import { api } from '@/js/api.js';
import { store } from '@/js/store.js';
import { hoy, contarLocal } from '@/js/vueltas.js';

const ROLES = { chofer: 'Chofer', oficina: 'Oficina', direccion: 'Dirección' };

const yo = computed(() => store.usuario ?? {});
const esAdmin = computed(() => yo.value.rol === 'oficina' || yo.value.rol === 'direccion');

const vista = ref('usuarios');
const cargando = ref(true);
const usuarios = ref([]);
const vueltas = ref([]);
const fecha = ref(hoy());

const hoja = ref(false);
const guardando = ref(false);
const form = reactive({ id: null, nombre: '', email: '', rol: 'chofer', vehiculo: '', ruta: '' });

const iniciales = (n) => (n || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const pct = (n, t) => (t ? Math.round((n / t) * 100) : 0);

// Las vueltas llegan planas; se agrupan por chofer para leer de un vistazo
// cómo va cada ruta. El nombre lo trae ya el backend (chofer_nombre).
const porChofer = computed(() => {
  const mapa = new Map();
  for (const v of vueltas.value) {
    const id = v.chofer_id;
    if (!mapa.has(id)) mapa.set(id, { id, nombre: v.chofer_nombre || `Chofer ${id}`, lista: [] });
    mapa.get(id).lista.push(v);
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, ...contarLocal(g.lista) }))
    .sort((a, b) => b.pendientes - a.pendientes || a.nombre.localeCompare(b.nombre));
});

async function cargar() {
  if (!esAdmin.value) { cargando.value = false; return; }
  cargando.value = true;
  try {
    usuarios.value = await api.usuarios.list();
    await cargarRutas();
  } catch (e) {
    f7.dialog.alert(e.message || 'No se pudo cargar.', 'Configuración');
  } finally {
    cargando.value = false;
  }
}

async function cargarRutas() {
  try {
    const d = await api.vueltas.dia(fecha.value);
    vueltas.value = d.vueltas;
  } catch { /* la lista de usuarios sigue siendo útil sin esto */ }
}

function abrirAlta() {
  Object.assign(form, { id: null, nombre: '', email: '', rol: 'chofer', vehiculo: '', ruta: '' });
  hoja.value = true;
}

function abrirEdicion(u) {
  Object.assign(form, {
    id: u.id, nombre: u.nombre || '', email: u.email || '',
    rol: u.rol || 'chofer', vehiculo: u.vehiculo || '', ruta: u.ruta || '',
  });
  hoja.value = true;
}

async function guardar() {
  if (guardando.value) return;
  if (!form.nombre.trim()) return f7.dialog.alert('El nombre es obligatorio.', 'Usuario');
  guardando.value = true;
  const datos = {
    nombre: form.nombre.trim(), email: form.email.trim(),
    rol: form.rol, vehiculo: form.vehiculo.trim(), ruta: form.ruta.trim(),
  };
  try {
    if (form.id) await api.usuarios.editar(form.id, datos);
    else await api.usuarios.crear(datos);
    hoja.value = false;
    await cargar();
    f7.toast.create({ text: form.id ? 'Usuario actualizado ✓' : 'Usuario creado ✓', closeTimeout: 1600, position: 'center' }).open();
  } catch (e) {
    f7.dialog.alert(e.message || 'No se pudo guardar.', 'Usuario');
  } finally {
    guardando.value = false;
  }
}

function alternarActivo(u) {
  const baja = !!u.activo;
  const texto = baja
    ? `¿Dar de baja a ${u.nombre}? Dejará de poder entrar, pero su historial se conserva.`
    : `¿Reactivar a ${u.nombre}?`;
  f7.dialog.confirm(texto, baja ? 'Dar de baja' : 'Reactivar', async () => {
    try {
      await api.usuarios.editar(u.id, { activo: baja ? 0 : 1 });
      await cargar();
    } catch (e) {
      f7.dialog.alert(e.message || 'No se pudo cambiar.', 'Usuario');
    }
  });
}
</script>

<style scoped>
.segmentos { display: flex; gap: 6px; padding: 0 16px 12px; }
.seg {
  flex: 1; width: auto; border: none; cursor: pointer;
  padding: 9px 8px; border-radius: 12px; font-size: 13px; font-weight: 700;
  background: var(--sup-sutil); color: inherit; opacity: 0.65;
}
.seg.act {
  background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
  color: #fff; opacity: 1;
}

.barra-acciones { display: flex; align-items: center; gap: 10px; padding: 0 16px 10px; }
.conteo { font-size: 13px; opacity: 0.55; }
.btn-alta {
  width: auto; margin-left: auto; flex-shrink: 0; border: none; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 8px 14px; border-radius: 999px; font-size: 14px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
}
.btn-alta i { font-size: 15px; }
.fecha-input {
  border: 1px solid var(--glass-border); background: var(--sup-campo); color: inherit;
  border-radius: 12px; padding: 7px 10px; font-size: 14px; font-family: inherit;
}

.lista { display: flex; flex-direction: column; gap: 10px; padding: 0 16px 12px; }
.tarjeta { border-radius: 18px; padding: 13px 14px; }
.tarjeta.baja { opacity: 0.55; }

.fila1 { display: flex; align-items: center; gap: 11px; }
.avatar {
  flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
  background-size: cover; background-position: center;
  color: #fff; font-size: 14px; font-weight: 800;
}
.quien { flex: 1; min-width: 0; }
.nombre { font-size: 16px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.email { font-size: 12px; opacity: 0.55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.chip {
  flex-shrink: 0; font-size: 10px; font-weight: 700; padding: 3px 9px;
  border-radius: 999px; background: var(--sup-sutil);
}
.chip.oficina, .chip.direccion { background: var(--ambar-bg); color: var(--ambar-fg); }
.chip.pend { background: var(--ambar-bg); color: var(--ambar-fg); }
.chip.baja-chip { background: rgba(255, 69, 58, 0.16); color: #ff453a; }

.fila2 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 9px; }
.dato { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; opacity: 0.6; }
.dato i { font-size: 12px; }
.dato.ok { color: #30d158; opacity: 1; font-weight: 600; }
.dato.mal { color: #ff453a; opacity: 1; font-weight: 600; }

.barra-progreso {
  display: flex; height: 6px; border-radius: 999px; overflow: hidden;
  background: var(--sup-sutil); margin-top: 10px;
}
.parte.ok { background: #30d158; }
.parte.mal { background: #ff453a; }

.acciones { display: flex; gap: 7px; margin-top: 11px; }
.acc {
  flex: 1; width: auto; height: 38px; border: none; border-radius: 11px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 5px;
  font-size: 13px; font-weight: 700; background: var(--sup-sutil); color: inherit;
}
.acc i { font-size: 14px; }
.acc:disabled { opacity: 0.35; cursor: default; }
.acc.peligro { background: rgba(255, 69, 58, 0.16); color: #ff453a; }
.acc.ok { background: rgba(48, 209, 88, 0.18); color: var(--verde-fg); }

.aviso { margin: 30px 16px; padding: 28px 20px; border-radius: 18px; text-align: center; }
.aviso-icono { font-size: 34px; opacity: 0.3; }
.aviso-t { font-size: 16px; font-weight: 700; margin-top: 8px; }
.aviso-s { font-size: 13px; opacity: 0.55; margin-top: 4px; line-height: 1.4; }

/* Hoja de alta / edición */
.hoja-fondo {
  position: fixed; inset: 0; z-index: 14000;
  background: rgba(0, 0, 0, 0.4); display: flex; align-items: flex-end;
}
.hoja {
  width: 100%; max-height: 88vh; overflow-y: auto;
  border-radius: 22px 22px 0 0; padding: 18px 18px calc(18px + env(safe-area-inset-bottom));
}
.hoja-tit { font-size: 17px; font-weight: 800; margin-bottom: 14px; text-align: center; }
.campo { display: block; margin-bottom: 13px; }
.campo > span { display: block; font-size: 12px; font-weight: 600; opacity: 0.6; margin-bottom: 5px; }
.campo input {
  width: 100%; box-sizing: border-box; height: 44px; padding: 0 13px;
  border-radius: 12px; border: 1px solid var(--linea);
  background: var(--sup-campo); font-size: 16px; color: inherit; font-family: inherit;
}
.roles { display: flex; gap: 6px; }
.rol-chip {
  flex: 1; width: auto; border: none; cursor: pointer;
  padding: 9px 6px; border-radius: 11px; font-size: 13px; font-weight: 700;
  background: var(--sup-sutil); color: inherit;
}
.rol-chip.act {
  background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
  color: #fff;
}
.hoja-btns { display: flex; gap: 9px; margin-top: 18px; }
.btn-sec, .btn-pri {
  flex: 1; width: auto; height: 46px; border: none; border-radius: 13px; cursor: pointer;
  font-size: 15px; font-weight: 700;
}
.btn-sec { background: var(--sup-sutil); color: inherit; }
.btn-pri {
  color: #fff;
  background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
}
.btn-pri:disabled { opacity: 0.6; }
</style>
