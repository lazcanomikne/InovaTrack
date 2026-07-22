<template>
  <f7-page name="vueltas" @page:afterin="cargar">
    <!-- ── Barra de días (Módulo 6) ───────────────────────────────────── -->
    <div class="barra-dias glass-strong">
      <button type="button" class="dia-nav" @click="moverDias(-1)" aria-label="Días anteriores">
        <i class="f7-icons">chevron_left</i>
      </button>

      <div class="dias">
        <button
          v-for="d in diasVisibles"
          :key="d.fecha"
          type="button"
          class="dia"
          :class="{ sel: d.fecha === fecha, hoy: d.fecha === hoyStr, pasado: d.fecha < hoyStr }"
          @click="irA(d.fecha)"
        >
          <span class="dia-semana">{{ d.semana }}</span>
          <span class="dia-num">{{ d.dia }}</span>
          <span class="dia-carga" :class="{ vacia: !d.abiertas }">
            {{ d.abiertas || '' }}
          </span>
        </button>
      </div>

      <button type="button" class="dia-nav" @click="moverDias(1)" aria-label="Días siguientes">
        <i class="f7-icons">chevron_right</i>
      </button>
    </div>

    <div class="cabecera">
      <div>
        <h1 class="titulo-dia">{{ etiqueta }}</h1>
        <div class="sub-dia">
          <span v-if="soloLectura" class="pill-lectura">
            <i class="f7-icons">lock_fill</i> Solo consulta
          </span>
          <span v-else-if="fecha === hoyStr">{{ contadores.pendientes }} por entregar</span>
          <span v-else>{{ contadores.total }} vuelta{{ contadores.total === 1 ? '' : 's' }}</span>
        </div>
      </div>
      <button v-if="fecha !== hoyStr" type="button" class="btn-hoy" @click="irA(hoyStr)">Hoy</button>
    </div>

    <!-- ── Contadores (Módulo 4) ──────────────────────────────────────── -->
    <div class="contadores">
      <div class="cont"><span class="cont-num">{{ contadores.total }}</span><span class="cont-lbl">Total</span></div>
      <div class="cont pend"><span class="cont-num">{{ contadores.pendientes }}</span><span class="cont-lbl">Pendientes</span></div>
      <div class="cont ok"><span class="cont-num">{{ contadores.entregadas }}</span><span class="cont-lbl">Entregadas</span></div>
      <div class="cont mal"><span class="cont-num">{{ contadores.no_entregadas }}</span><span class="cont-lbl">No entreg.</span></div>
    </div>

    <!-- ── Buscador (Módulo 8) ────────────────────────────────────────── -->
    <div v-if="vueltas.length > 4" class="buscador">
      <i class="f7-icons">search</i>
      <input v-model="busqueda" type="search" placeholder="Buscar cliente, dirección o factura…" />
      <button v-if="busqueda" type="button" class="limpiar" @click="busqueda = ''">
        <i class="f7-icons">xmark_circle_fill</i>
      </button>
    </div>

    <!-- ── Lista de vueltas ───────────────────────────────────────────── -->
    <div v-if="cargando" class="aviso"><f7-preloader /></div>

    <div v-else-if="!vueltas.length" class="aviso glass">
      <i class="f7-icons aviso-icono">tray</i>
      <div class="aviso-t">Sin vueltas este día</div>
      <div class="aviso-s">
        {{ soloLectura ? 'No hubo movimientos.' : 'Escanea las facturas del día o captura una vuelta manual.' }}
      </div>
    </div>

    <div v-else-if="!filtradas.length" class="aviso glass">
      <div class="aviso-t">Sin resultados</div>
      <div class="aviso-s">Nada coincide con «{{ busqueda }}».</div>
    </div>

    <div v-else class="lista">
      <div
        v-for="(v, i) in filtradas"
        :key="v.id"
        class="glass tarjeta"
        :class="{ cerrada: !abierta(v), arrastrando: arrastreId === v.id }"
        :draggable="puedeReordenar"
        @dragstart="iniciarArrastre(v, i)"
        @dragover.prevent="sobreArrastre(i)"
        @dragend="terminarArrastre"
        @click="abrirDetalle(v)"
      >
        <!-- Barra lateral con el color del estado -->
        <span class="tarjeta-estado" :style="{ background: estadoInfo(v.estado).color }"></span>

        <div class="tarjeta-cuerpo">
          <div class="tarjeta-fila1">
            <span v-if="puedeReordenar" class="agarre" @click.stop><i class="f7-icons">line_horizontal_3</i></span>
            <span class="orden">{{ i + 1 }}</span>
            <span class="cliente">{{ tituloVuelta(v) }}</span>
            <span v-if="esCritica(v)" class="chip critica">{{ v.intento }}º intento</span>
            <span v-else-if="v.intento > 1" class="chip reintento">{{ v.intento }}º intento</span>
          </div>

          <div class="tarjeta-dir">
            <i class="f7-icons">location</i>{{ direccionCorta(v.direccion) }}
          </div>

          <div class="tarjeta-fila3">
            <span class="est-badge" :style="{ color: estadoInfo(v.estado).color }">
              <i class="f7-icons">{{ estadoInfo(v.estado).icono }}</i>
              {{ estadoInfo(v.estado).texto }}
            </span>
            <span v-if="v.origen === 'manual'" class="chip manual">Manual</span>
            <span v-if="v.factura_numero" class="chip factura">{{ v.factura_numero }}</span>
            <span v-if="v.cerrada_en" class="hora">{{ horaCorta(v.cerrada_en) }}</span>
          </div>

          <!-- Acciones rápidas de un toque (Módulo 4) -->
          <div v-if="abierta(v) && !soloLectura" class="acciones" @click.stop>
            <button type="button" class="acc ok" @click="entregar(v)">
              <i class="f7-icons">checkmark_alt</i> Entregada
            </button>
            <button type="button" class="acc mal" @click="noEntregar(v)">
              <i class="f7-icons">xmark</i> No entregada
            </button>
            <button type="button" class="acc mas" @click="pasarAManana(v)">
              <i class="f7-icons">calendar_badge_plus</i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Botón de captura manual (Módulo 3) ─────────────────────────── -->
    <button v-if="!soloLectura" type="button" class="fab" @click="nuevaManual">
      <i class="f7-icons">plus</i>
    </button>
  </f7-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { f7 } from 'framework7-vue';
import { api } from '@/js/api.js';
import { store } from '@/js/store.js';
import {
  hoy, sumarDias, partesFecha, etiquetaFecha, horaCorta,
  estadoInfo, estaAbierta, esCritica, tituloVuelta, direccionCorta, coincide,
} from '@/js/vueltas.js';

const props = defineProps({ f7router: Object });

const hoyStr = ref(hoy());
const fecha = ref(hoy());
const ancla = ref(hoy());        // día central de la barra
const vueltas = ref([]);
const contadores = ref({ total: 0, pendientes: 0, entregadas: 0, no_entregadas: 0 });
const carga = ref({});           // { 'YYYY-MM-DD': nAbiertas }
const cargando = ref(true);
const soloLectura = ref(false);
const busqueda = ref('');
const motivos = ref([]);

const abierta = estaAbierta;
const etiqueta = computed(() => etiquetaFecha(fecha.value, hoyStr.value));
const puedeReordenar = computed(() => !soloLectura.value && !busqueda.value && vueltas.value.length > 1);

const filtradas = computed(() => vueltas.value.filter((v) => coincide(v, busqueda.value)));

// 5 días: 2 antes, el ancla al centro, 2 después.
const diasVisibles = computed(() =>
  [-2, -1, 0, 1, 2].map((n) => {
    const f = sumarDias(ancla.value, n);
    return { fecha: f, ...partesFecha(f), abiertas: carga.value[f] ?? 0 };
  })
);

/* ------------------------------ Datos ------------------------------ */
async function cargar() {
  cargando.value = true;
  try {
    const d = await api.vueltas.dia(fecha.value);
    vueltas.value = d.vueltas;
    contadores.value = d.contadores;
    soloLectura.value = d.solo_lectura;
    hoyStr.value = d.hoy;
    await cargarBarra();
  } catch (e) {
    f7.dialog.alert(e.message || 'No se pudieron cargar las vueltas.', 'Error');
  } finally {
    cargando.value = false;
  }
}

async function cargarBarra() {
  try {
    const { carga: c } = await api.vueltas.carga(sumarDias(ancla.value, -2), sumarDias(ancla.value, 2));
    carga.value = c;
  } catch { /* la barra sin contadores no impide operar */ }
}

function irA(f) {
  fecha.value = f;
  ancla.value = f;
  busqueda.value = '';
  cargar();
}

function moverDias(n) {
  ancla.value = sumarDias(ancla.value, n * 5);
  cargarBarra();
}

/* --------------------------- Reordenar ----------------------------- */
const arrastreId = ref(null);
let desdeIdx = null;

function iniciarArrastre(v, i) {
  if (!puedeReordenar.value) return;
  arrastreId.value = v.id;
  desdeIdx = i;
}
function sobreArrastre(i) {
  if (desdeIdx === null || i === desdeIdx) return;
  const arr = [...vueltas.value];
  const [m] = arr.splice(desdeIdx, 1);
  arr.splice(i, 0, m);
  vueltas.value = arr;
  desdeIdx = i;
}
async function terminarArrastre() {
  if (desdeIdx === null) return;
  arrastreId.value = null;
  desdeIdx = null;
  try {
    await api.vueltas.reordenar(fecha.value, vueltas.value.map((v) => v.id));
  } catch (e) {
    f7.toast.create({ text: 'No se guardó el orden: ' + e.message, closeTimeout: 2500 }).open();
    cargar();
  }
}

/* ---------------------------- Acciones ----------------------------- */
// El GPS es "mejor esfuerzo": si el chofer no da permiso o no hay señal, la
// entrega igual se registra. Nunca bloqueamos la operación por la ubicación.
function ubicacion() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    const t = setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }); },
      () => { clearTimeout(t); resolve(null); },
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 30000 }
    );
  });
}

async function entregar(v) {
  f7.dialog.prompt('¿Quién recibió? (opcional)', 'Marcar entregada', async (nombre) => {
    const gps = await ubicacion();
    try {
      await api.vueltas.entregar(v.id, {
        recibio_nombre: nombre?.trim() || null,
        ocurrido_en: new Date().toISOString(),   // sello del dispositivo
        gps,
      });
      f7.toast.create({ text: 'Entregada ✓', closeTimeout: 1400, position: 'center' }).open();
      cargar();
    } catch (e) {
      f7.dialog.alert(e.message, 'No se pudo marcar');
    }
  });
}

async function noEntregar(v) {
  if (!motivos.value.length) {
    try { motivos.value = (await api.catalogos.todo()).motivos; } catch { /* sigue */ }
  }
  const botones = [
    ...motivos.value.map((m) => ({ text: m.texto, onClick: () => registrarNoEntrega(v, m) })),
    { text: 'Cancelar', color: 'gray' },
  ];
  f7.dialog.create({ title: '¿Por qué no se entregó?', buttons: botones, verticalButtons: true }).open();
}

async function registrarNoEntrega(v, motivo) {
  const guardar = async (texto) => {
    const gps = await ubicacion();
    try {
      await api.vueltas.noEntregar(v.id, {
        motivo_clave: motivo.clave,
        motivo_texto: texto ?? null,
        ocurrido_en: new Date().toISOString(),
        gps,
      });
      cargar();
      // Tras el motivo, ofrecemos reprogramar en el mismo flujo (Módulo 5).
      f7.dialog.confirm('¿Reprogramar esta vuelta para mañana?', 'No entregada', () => pasarAManana(v, true));
    } catch (e) {
      f7.dialog.alert(e.message, 'No se pudo registrar');
    }
  };
  if (motivo.pide_texto) f7.dialog.prompt('Describe el motivo', motivo.texto, (t) => guardar(t?.trim() || null));
  else guardar(null);
}

async function pasarAManana(v, yaCerrada = false) {
  const destino = sumarDias(fecha.value, 1);
  const hacerlo = async () => {
    const gps = await ubicacion();
    try {
      await api.vueltas.reprogramar(v.id, {
        fecha_destino: destino,
        ocurrido_en: new Date().toISOString(),
        gps,
        client_uuid: crypto.randomUUID(),
      });
      f7.toast.create({ text: `Movida a ${etiquetaFecha(destino, hoyStr.value).toLowerCase()} ✓`, closeTimeout: 1600, position: 'center' }).open();
      cargar();
    } catch (e) {
      f7.dialog.alert(e.message, 'No se pudo reprogramar');
    }
  };
  if (yaCerrada) return hacerlo();
  f7.dialog.confirm(`¿Pasar «${tituloVuelta(v)}» a mañana?`, 'Reprogramar', hacerlo);
}

function nuevaManual() {
  f7.dialog.prompt('Cliente o descripción', 'Vuelta manual', async (nombre) => {
    if (!nombre?.trim()) return;
    try {
      await api.vueltas.crear({
        origen: 'manual',
        cliente_nombre: nombre.trim(),
        fecha: fecha.value,
        client_uuid: crypto.randomUUID(),
      });
      f7.toast.create({ text: 'Vuelta agregada ✓', closeTimeout: 1400, position: 'center' }).open();
      cargar();
    } catch (e) {
      f7.dialog.alert(e.message, 'No se pudo crear');
    }
  });
}

function abrirDetalle(v) {
  // La página inicial de un tab no siempre recibe el prop f7router; en ese
  // caso tomamos el router de la vista visible.
  const router = props.f7router ?? f7.views?.current?.router ?? f7.view?.current?.router;
  if (router) router.navigate(`/vueltas/${v.id}/`);
}

onMounted(cargar);
</script>

<style scoped>
/* ---------------- Barra de días ---------------- */
.barra-dias {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: calc(6px + env(safe-area-inset-top)) 6px 8px;
  border-radius: 0 0 20px 20px;
}
.dia-nav {
  border: none; background: transparent; color: inherit; opacity: 0.35;
  width: 30px; height: 54px; cursor: pointer; flex-shrink: 0;
}
.dia-nav i { font-size: 20px; }
.dias { flex: 1; display: flex; justify-content: space-around; gap: 2px; }

.dia {
  flex: 1;
  border: none; background: transparent; color: inherit;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 6px 2px 5px; border-radius: 14px; cursor: pointer;
  transition: background 0.15s ease, transform 0.12s ease;
}
.dia-semana { font-size: 10px; opacity: 0.5; text-transform: capitalize; }
.dia-num { font-size: 19px; font-weight: 700; line-height: 1.1; }
.dia.pasado .dia-num { opacity: 0.45; }
.dia.hoy .dia-num { color: var(--inova-primary); }
/* El día seleccionado va más grande y con fondo, como pide el Módulo 6. */
.dia.sel {
  background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
  transform: scale(1.06);
}
.dia.sel .dia-semana, .dia.sel .dia-num { color: #fff; opacity: 1; }
.dia.sel .dia-num { font-size: 22px; }

/* Punto con las vueltas abiertas de ese día: hace visible el arrastre. */
.dia-carga {
  min-width: 17px; height: 17px; padding: 0 4px;
  border-radius: 999px; font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  background: var(--inova-primary); color: #fff;
}
.dia-carga.vacia { background: transparent; }
.dia.sel .dia-carga { background: rgba(255,255,255,0.9); color: var(--inova-primary); }
.dia.sel .dia-carga.vacia { background: transparent; }

/* ---------------- Cabecera ---------------- */
.cabecera {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; padding: 16px 16px 10px;
}
.titulo-dia { margin: 0; font-size: 27px; font-weight: 800; letter-spacing: -0.03em; }
.sub-dia { font-size: 13px; opacity: 0.55; margin-top: 2px; }
.pill-lectura {
  display: inline-flex; align-items: center; gap: 4px;
  background: rgba(142,142,147,0.2); padding: 3px 9px; border-radius: 999px;
  font-weight: 600; opacity: 1;
}
.pill-lectura i { font-size: 11px; }
.btn-hoy {
  flex-shrink: 0; border: none; border-radius: 999px; cursor: pointer;
  padding: 8px 16px; font-size: 14px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
}

/* ---------------- Contadores ---------------- */
.contadores { display: flex; gap: 8px; padding: 0 16px 12px; }
.cont {
  flex: 1; border-radius: 14px; padding: 9px 4px; text-align: center;
  background: rgba(255,255,255,0.5);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
}
.cont-num { display: block; font-size: 20px; font-weight: 800; line-height: 1.1; }
.cont-lbl { display: block; font-size: 10px; opacity: 0.55; margin-top: 1px; }
.cont.pend .cont-num { color: var(--inova-primary); }
.cont.ok .cont-num { color: #30d158; }
.cont.mal .cont-num { color: #ff453a; }

/* ---------------- Buscador ---------------- */
.buscador {
  display: flex; align-items: center; gap: 8px; margin: 0 16px 12px;
  padding: 0 12px; height: 42px; border-radius: 14px;
  background: rgba(255,255,255,0.6); border: 1px solid var(--glass-border);
}
.buscador i { font-size: 17px; opacity: 0.4; }
.buscador input {
  flex: 1; min-width: 0; border: none; background: transparent;
  font-size: 15px; color: inherit; outline: none;
}
.limpiar { border: none; background: transparent; color: inherit; opacity: 0.35; cursor: pointer; }

/* ---------------- Lista ---------------- */
/* El padding inferior deja libre la última tarjeta: por encima queda el botón
   flotante y, más abajo, la pastilla de navegación. */
.lista { display: flex; flex-direction: column; gap: 10px; padding: 0 16px 84px; }

.tarjeta {
  position: relative; overflow: hidden;
  border-radius: 18px; padding: 12px 12px 12px 18px;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.12s ease;
}
.tarjeta.cerrada { opacity: 0.62; }
.tarjeta.arrastrando { transform: scale(0.97); opacity: 0.85; }
.tarjeta-estado { position: absolute; left: 0; top: 0; bottom: 0; width: 6px; }

.tarjeta-fila1 { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; }
.agarre { opacity: 0.3; cursor: grab; flex-shrink: 0; }
.agarre i { font-size: 16px; }
.orden {
  flex-shrink: 0; min-width: 21px; height: 21px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.07); font-size: 11px; font-weight: 700;
}
.cliente {
  flex: 1; min-width: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.01em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.tarjeta-dir {
  display: flex; align-items: center; gap: 5px;
  font-size: 13px; opacity: 0.6; margin-bottom: 8px;
}
.tarjeta-dir i { font-size: 13px; flex-shrink: 0; }

.tarjeta-fila3 { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.est-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; }
.est-badge i { font-size: 13px; }
.hora { margin-left: auto; font-size: 12px; opacity: 0.5; }

.chip {
  font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px;
  background: rgba(0,0,0,0.07);
}
.chip.manual { background: rgba(255,159,10,0.18); color: #b26a00; }
.chip.factura { background: rgba(91,91,214,0.14); color: var(--inova-primary); }
.chip.reintento { background: rgba(255,159,10,0.2); color: #b26a00; }
.chip.critica { background: #ff453a; color: #fff; }

/* Botones grandes: se usan de pie, en la calle, con una mano. */
.acciones { display: flex; gap: 7px; margin-top: 11px; }
.acc {
  flex: 1; height: 42px; border: none; border-radius: 12px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 5px;
  font-size: 14px; font-weight: 700; color: #fff;
  transition: transform 0.1s ease;
}
.acc:active { transform: scale(0.95); }
.acc i { font-size: 16px; }
.acc.ok { background: #30d158; }
.acc.mal { background: #ff453a; }
.acc.mas { flex: 0 0 48px; background: rgba(0,0,0,0.35); }

/* ---------------- Avisos ---------------- */
.aviso { margin: 30px 16px; padding: 28px 20px; border-radius: 18px; text-align: center; }
.aviso-icono { font-size: 34px; opacity: 0.3; }
.aviso-t { font-size: 16px; font-weight: 700; margin-top: 8px; }
.aviso-s { font-size: 13px; opacity: 0.55; margin-top: 4px; line-height: 1.4; }

/* ---------------- Botón flotante ---------------- */
.fab {
  position: fixed; right: 18px;
  bottom: calc(96px + env(safe-area-inset-bottom));
  width: 54px; height: 54px; border-radius: 18px; border: none;
  z-index: 100; cursor: pointer; color: #fff;
  background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
  box-shadow: 0 8px 22px rgba(91,91,214,0.45);
  transition: transform 0.12s ease;
}
.fab:active { transform: scale(0.92); }
.fab i { font-size: 26px; }
</style>
