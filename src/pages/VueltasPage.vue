<template>
  <f7-page
    name="vueltas"
    class="pagina-vueltas"
    ptr
    @ptr:refresh="alJalarParaActualizar"
    @page:afterin="cargar"
  >
    <!-- ── Barra de días (Módulo 6) ───────────────────────────────────── -->
    <div class="barra-dias glass-strong">
      <button type="button" class="dia-nav" @click="moverDias(-1)" aria-label="Días anteriores">
        <i class="f7-icons">chevron_left</i>
      </button>

      <div
        class="dias"
        @pointerdown="iniciarSwipe"
        @pointermove="moverSwipe"
        @pointerup="terminarSwipe"
        @pointercancel="cancelarSwipe"
      >
        <button
          v-for="(d, i) in diasVisibles"
          :key="d.fecha"
          type="button"
          class="dia"
          :class="{ sel: d.fecha === fecha, hoy: d.fecha === hoyStr, pasado: d.fecha < hoyStr }"
          :style="estiloDia(d, i)"
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
      <!-- Cola offline (Módulo 7): visible sólo cuando hay algo sin sincronizar. -->
      <span v-if="store.sinConexion || store.pendientesSync > 0" class="pill-cola">
        <i class="f7-icons">{{ store.sinConexion ? 'wifi_slash' : 'arrow_2_circlepath' }}</i>
        {{ store.sinConexion ? 'Sin conexión' : `Sincronizando (${store.pendientesSync})` }}
      </span>
      <button v-if="fecha !== hoyStr" type="button" class="btn-hoy" @click="irA(hoyStr)">Hoy</button>
    </div>

    <!-- ── Contadores (Módulo 4): además filtran la lista ─────────────── -->
    <div class="contadores">
      <button
        v-for="f in FILTROS"
        :key="f.id"
        type="button"
        class="cont"
        :class="[f.tono, { act: filtro === f.id }]"
        :aria-pressed="filtro === f.id"
        @click="alternarFiltro(f.id)"
      >
        <span class="cont-num">{{ contadores[f.campo] }}</span>
        <span class="cont-lbl">{{ f.texto }}</span>
      </button>
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
      <div v-if="busqueda" class="aviso-s">Nada coincide con «{{ busqueda }}».</div>
      <div v-else class="aviso-s">
        Ninguna vuelta está en «{{ etiquetaFiltro }}».
        <button type="button" class="link-limpiar" @click="filtro = 'todo'">Ver todas</button>
      </div>
    </div>

    <div v-else class="lista" :class="{ reordenando: arrastreId !== null }">
      <div
        v-for="(v, i) in filtradas"
        :key="v.id"
        class="glass tarjeta"
        :class="{ cerrada: !abierta(v), arrastrando: arrastreId === v.id }"
        :data-idx="i"
        @click="abrirDetalle(v)"
      >
        <!-- Barra lateral con el color del estado -->
        <span class="tarjeta-estado" :style="{ background: estadoInfo(v.estado).color }"></span>

        <div class="tarjeta-cuerpo">
          <div class="tarjeta-fila1">
            <!-- Agarre para reordenar: mantener presionado y arrastrar (pointer
                 events; el drag HTML5 no funciona en iOS Safari). -->
            <span
              v-if="puedeReordenar"
              class="agarre"
              @click.stop
              @pointerdown="iniciarArrastre(v, i, $event)"
            ><i class="f7-icons">line_horizontal_3</i></span>
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
          <div v-if="abierta(v) && !soloLectura && !v.__temporal" class="acciones" @click.stop>
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
  </f7-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { f7 } from 'framework7-vue';
import { api } from '@/js/api.js';
import { store, setMotivos } from '@/js/store.js';
import * as cola from '@/js/cola.js';
import * as haptics from '@/js/haptics.js';
import {
  hoy, sumarDias, partesFecha, etiquetaFecha, horaCorta,
  estadoInfo, estaAbierta, esCritica, tituloVuelta, direccionCorta, coincide, contarLocal,
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

const abierta = estaAbierta;
const etiqueta = computed(() => etiquetaFecha(fecha.value, hoyStr.value));

// Filtro por estado. El orden es el que el chofer usa en la calle: primero lo
// que le falta. `campo` apunta al contador que ya calcula contarLocal().
const FILTROS = [
  { id: 'pendientes', campo: 'pendientes', texto: 'Pendientes', tono: 'pend' },
  { id: 'entregadas', campo: 'entregadas', texto: 'Entregadas', tono: 'ok' },
  { id: 'no_entregadas', campo: 'no_entregadas', texto: 'No entreg.', tono: 'mal' },
  { id: 'todo', campo: 'total', texto: 'Todo', tono: '' },
];
const filtro = ref('todo');

// Volver a tocar el filtro activo lo quita: así no hay que ir a buscar "Todo".
function alternarFiltro(id) {
  haptics.tap();
  filtro.value = filtro.value === id && id !== 'todo' ? 'todo' : id;
}

const etiquetaFiltro = computed(() => FILTROS.find((f) => f.id === filtro.value)?.texto ?? '');

function pasaFiltro(v) {
  if (filtro.value === 'todo') return true;
  if (filtro.value === 'pendientes') return estaAbierta(v);
  if (filtro.value === 'entregadas') return v.estado === 'entregada';
  if (filtro.value === 'no_entregadas') return v.estado === 'no_entregada';
  return true;
}

// Reordenar sobre una lista recortada movería posiciones que no se ven, así
// que sólo se permite con la lista completa.
const puedeReordenar = computed(
  () => !soloLectura.value && !busqueda.value && filtro.value === 'todo' && vueltas.value.length > 1
);

const filtradas = computed(() => vueltas.value.filter((v) => coincide(v, busqueda.value) && pasaFiltro(v)));

// 5 días: 2 antes, el ancla al centro, 2 después.
const diasVisibles = computed(() =>
  [-2, -1, 0, 1, 2].map((n) => {
    const f = sumarDias(ancla.value, n);
    return { fecha: f, ...partesFecha(f), abiertas: carga.value[f] ?? 0 };
  })
);

/* ------------------------- Barra en corona -------------------------- */
// La curvatura de cada botón se calcula sólo a partir de su distancia al
// centro (índice 2 de los 5 visibles): nada de valores fijos por día. El
// arrastre en curso (dx) se suma como una fracción de "paso" para que la
// corona siga al dedo antes de asentarse en el día definitivo.
const UMBRAL_SWIPE = 46;   // px para confirmar el cambio de día al soltar
const PASO_ARRASTRE = 90;  // px de arrastre ≈ un paso completo de la corona
const dx = ref(0);
let swipeActivo = false;
let punteroId = null;
let inicioX = 0;

function reduceMovimiento() {
  return typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function estiloDia(d, i) {
  const offsetArrastre = reduceMovimiento() ? 0 : dx.value / PASO_ARRASTRE;
  const offset = Math.min(2.6, Math.max(-2.6, (i - 2) + offsetArrastre));
  const distancia = Math.abs(offset);
  const seleccionado = d.fecha === fecha.value;
  // Curva cóncava: el día central queda en el punto bajo del arco, que es
  // donde cae el pulgar. Se hunde el centro en vez de levantar los extremos
  // (mismo arco) para que la barra no se derrame por encima del borde.
  const angulo = -offset * 13;
  const bajada = Math.max(0, 4 - offset * offset) * 3.4;
  const escala = Math.max(0.78, 1 - distancia * 0.07) * (seleccionado ? 1.08 : 1);
  const opacidad = Math.max(0.45, 1 - distancia * 0.12);
  return {
    transform: `translateY(${bajada}px) rotate(${angulo}deg) scale(${escala})`,
    opacity: opacidad,
  };
}

function iniciarSwipe(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  swipeActivo = true;
  punteroId = e.pointerId;
  inicioX = e.clientX;
  dx.value = 0;
}

function moverSwipe(e) {
  if (!swipeActivo || e.pointerId !== punteroId) return;
  dx.value = e.clientX - inicioX;
}

function terminarSwipe(e) {
  if (!swipeActivo || e.pointerId !== punteroId) return;
  swipeActivo = false;
  const delta = dx.value;
  dx.value = 0;
  if (delta <= -UMBRAL_SWIPE) irA(sumarDias(fecha.value, 1));
  else if (delta >= UMBRAL_SWIPE) irA(sumarDias(fecha.value, -1));
}

function cancelarSwipe() {
  swipeActivo = false;
  dx.value = 0;
}

/* ------------------------------ Datos ------------------------------ */
// Recalcula contadores y guarda la vuelta ya mutada, sin esperar al servidor.
function mutarLocal(id, cambios) {
  const i = vueltas.value.findIndex((v) => v.id === id);
  if (i === -1) return;
  vueltas.value[i] = { ...vueltas.value[i], ...cambios };
  contadores.value = contarLocal(vueltas.value);
}

// `silencioso` (jalar para actualizar): no se muestra el preloader de página
// —eso escondería la lista y con ella el spinner del propio gesto—, sólo se
// refrescan los datos por debajo.
async function cargar(silencioso = false) {
  if (!silencioso) cargando.value = true;
  try {
    const d = await api.vueltas.dia(fecha.value);
    soloLectura.value = d.solo_lectura;
    store.soloLectura = d.solo_lectura; // la pastilla atenúa "Nueva" con esto
    hoyStr.value = d.hoy;
    // Sobre lo que trae el servidor, reaplica lo que la cola offline aún no
    // sincronizó: así una recarga en modo avión no deshace lo ya marcado.
    vueltas.value = await cola.aplicarPendientes(d.vueltas, fecha.value);
    contadores.value = contarLocal(vueltas.value);
    await cargarBarra();
  } catch (e) {
    if (!silencioso) f7.dialog.alert(e.message || 'No se pudieron cargar las vueltas.', 'Error');
  } finally {
    cargando.value = false;
  }
}

// Jalar hacia abajo para actualizar (Framework7 PTR). Manda a la cola lo que
// haya pendiente y recarga del servidor, sin tapar la lista.
async function alJalarParaActualizar(done) {
  haptics.tap();
  try {
    await cola.flush();
    await cargar(true);
  } finally {
    done(); // cierra el spinner del gesto pase lo que pase
  }
}

function alSincronizar() { cargar(true); }
onMounted(() => window.addEventListener(cola.EVENTO_SINCRONIZADO, alSincronizar));
onUnmounted(() => {
  window.removeEventListener(cola.EVENTO_SINCRONIZADO, alSincronizar);
  // Si se sale de la pantalla a mitad de un arrastre, no dejar listeners vivos.
  window.removeEventListener('pointermove', moverArrastre);
});

// La pastilla de navegación (App.vue) dispara esto al tocar "Nueva": el ítem
// central no es un tab, vive como acción sobre esta pantalla (Módulo 3).
onMounted(() => f7.on('abrirCaptura', nuevaManual));
onUnmounted(() => f7.off('abrirCaptura', nuevaManual));

async function cargarBarra() {
  try {
    const { carga: c } = await api.vueltas.carga(sumarDias(ancla.value, -2), sumarDias(ancla.value, 2));
    carga.value = c;
  } catch { /* la barra sin contadores no impide operar */ }
}

function irA(f) {
  haptics.tap();
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
// Arrastre con el dedo (pointer events): el <div draggable> de HTML5 no
// dispara en iOS Safari, así que la lista nunca se pudo reordenar en el
// teléfono. Aquí el agarre captura el puntero y, según sobre qué tarjeta esté
// el dedo, se reacomoda en vivo; al soltar se encola el nuevo orden.
const arrastreId = ref(null);
let desdeIdx = null;
let punteroArrastre = null;
let huboMovimiento = false;

function idxBajoElDedo(clientY) {
  // La tarjeta que se está arrastrando tiene pointer-events desactivados
  // (ver CSS), así que elementFromPoint devuelve la de abajo, no ella misma.
  const el = document.elementFromPoint(window.innerWidth / 2, clientY)?.closest('.tarjeta[data-idx]');
  return el ? Number(el.dataset.idx) : null;
}

function iniciarArrastre(v, i, e) {
  if (!puedeReordenar.value || v.__temporal) return;
  e.preventDefault();
  arrastreId.value = v.id;
  desdeIdx = i;
  punteroArrastre = e.pointerId;
  huboMovimiento = false;
  haptics.tap();
  window.addEventListener('pointermove', moverArrastre, { passive: false });
  window.addEventListener('pointerup', soltarArrastre, { once: true });
  window.addEventListener('pointercancel', soltarArrastre, { once: true });
}

function moverArrastre(e) {
  if (desdeIdx === null || e.pointerId !== punteroArrastre) return;
  e.preventDefault(); // no dejar que la página haga scroll mientras se arrastra
  const sobre = idxBajoElDedo(e.clientY);
  if (sobre === null || sobre === desdeIdx) return;
  huboMovimiento = true;
  const arr = [...vueltas.value];
  const [m] = arr.splice(desdeIdx, 1);
  arr.splice(sobre, 0, m);
  vueltas.value = arr;
  desdeIdx = sobre;
  haptics.tap();
}

async function soltarArrastre() {
  window.removeEventListener('pointermove', moverArrastre);
  if (desdeIdx === null) return;
  arrastreId.value = null;
  desdeIdx = null;
  punteroArrastre = null;
  if (!huboMovimiento) return; // fue un toque sin arrastre: nada que guardar
  // Las vueltas creadas offline (temporales) todavía no tienen id real: se
  // excluyen del orden hasta que la cola las sincronice.
  const ids = vueltas.value.filter((v) => !v.__temporal).map((v) => v.id);
  await cola.encolar({ tipo: 'reordenar', payload: { ids, fecha: fecha.value } });
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

// Todas las acciones siguen el mismo patrón offline-first: aplican el cambio
// de una vez en la UI y encolan la operación; la cola la manda al servidor en
// cuanto hay señal (Módulo 7). Nunca hay un `await` de red aquí.
async function entregar(v) {
  f7.dialog.prompt('¿Quién recibió? (opcional)', 'Marcar entregada', async (nombre) => {
    const gps = await ubicacion();
    const payload = { recibio_nombre: nombre?.trim() || null, ocurrido_en: new Date().toISOString(), gps };
    mutarLocal(v.id, {
      estado: 'entregada', recibio_nombre: payload.recibio_nombre,
      cerrada_en: payload.ocurrido_en, gps_lat: gps?.lat ?? null, gps_lng: gps?.lng ?? null,
    });
    await cola.encolar({ tipo: 'entregar', vuelta_id: v.id, payload });
    f7.toast.create({ text: 'Entregada ✓', closeTimeout: 1400, position: 'center' }).open();
  });
}

async function noEntregar(v) {
  if (!store.motivos.length) {
    try { setMotivos((await api.catalogos.todo()).motivos); } catch { /* sigue: se cargan al abrir la app */ }
  }
  const botones = [
    ...store.motivos.map((m) => ({ text: m.texto, onClick: () => registrarNoEntrega(v, m) })),
    { text: 'Cancelar', color: 'gray' },
  ];
  f7.dialog.create({ title: '¿Por qué no se entregó?', buttons: botones, verticalButtons: true }).open();
}

async function registrarNoEntrega(v, motivo) {
  const guardar = async (texto) => {
    const gps = await ubicacion();
    const payload = {
      motivo_clave: motivo.clave, motivo_texto: texto ?? null,
      ocurrido_en: new Date().toISOString(), gps,
    };
    mutarLocal(v.id, {
      estado: 'no_entregada', motivo_clave: payload.motivo_clave, motivo_texto: payload.motivo_texto,
      cerrada_en: payload.ocurrido_en, gps_lat: gps?.lat ?? null, gps_lng: gps?.lng ?? null,
    });
    await cola.encolar({ tipo: 'no_entregar', vuelta_id: v.id, payload });
    // Tras el motivo, ofrecemos reprogramar en el mismo flujo (Módulo 5).
    f7.dialog.confirm('¿Reprogramar esta vuelta para mañana?', 'No entregada', () => pasarAManana(v, true));
  };
  if (motivo.pide_texto) f7.dialog.prompt('Describe el motivo', motivo.texto, (t) => guardar(t?.trim() || null));
  else guardar(null);
}

async function pasarAManana(v, yaCerrada = false) {
  const destino = sumarDias(fecha.value, 1);
  const hacerlo = async () => {
    const gps = await ubicacion();
    const payload = { fecha_destino: destino, ocurrido_en: new Date().toISOString(), gps };
    mutarLocal(v.id, { estado: 'reprogramada', cerrada_en: payload.ocurrido_en });
    await cola.encolar({ tipo: 'reprogramar', vuelta_id: v.id, payload });
    f7.toast.create({ text: `Movida a ${etiquetaFecha(destino, hoyStr.value).toLowerCase()} ✓`, closeTimeout: 1600, position: 'center' }).open();
  };
  if (yaCerrada) return hacerlo();
  f7.dialog.confirm(`¿Pasar «${tituloVuelta(v)}» a mañana?`, 'Reprogramar', hacerlo);
}

function nuevaManual() {
  f7.dialog.prompt('Cliente o descripción', 'Vuelta manual', async (nombre) => {
    if (!nombre?.trim()) return;
    const payload = { origen: 'manual', cliente_nombre: nombre.trim(), fecha: fecha.value, ocurrido_en: new Date().toISOString() };
    const client_uuid = crypto.randomUUID();
    vueltas.value = [...vueltas.value, cola.vueltaTemporal(client_uuid, payload)];
    contadores.value = contarLocal(vueltas.value);
    await cola.encolar({ tipo: 'crear', payload, client_uuid });
    f7.toast.create({ text: 'Vuelta agregada ✓', closeTimeout: 1400, position: 'center' }).open();
  });
}

function abrirDetalle(v) {
  if (v.__temporal) {
    f7.toast.create({ text: 'Se está sincronizando, un momento…', closeTimeout: 1400, position: 'center' }).open();
    return;
  }
  // La página inicial de un tab no siempre recibe el prop f7router; en ese
  // caso tomamos el router de la vista visible.
  const router = props.f7router ?? f7.views?.current?.router ?? f7.view?.current?.router;
  if (router) router.navigate(`/vueltas/${v.id}/`);
}

onMounted(cargar);
</script>

<style scoped>
/* Framework7 marca esta pantalla como `.page.no-navbar` (no lleva navbar) y
   por esa regla le suma `--f7-page-navbar-offset` —el inset del notch— al
   padding de `.page-content`. Como la barra de días ya reserva ese mismo
   inset en su propio padding, el hueco se contaba DOS veces y quedaba una
   franja muerta bajo la isla dinámica. Se anula aquí: la barra arranca
   pegada al borde y su vidrio pasa por debajo del notch. */
.pagina-vueltas {
  --f7-page-navbar-offset: 0px;
}

/* ---------------- Barra de días: corona ---------------- */
/* El arco no está "dibujado": cada .dia recibe su transform por JS
   (estiloDia), calculado sólo a partir de su distancia al centro. Aquí sólo
   van el contenedor, la transición y el estado visual de cada botón. */
.barra-dias {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 2px;
  /* Pegada al tope: sólo el inset del notch más lo justo para que el giro de
     los días de los extremos (~10px de esquina) no se meta bajo la isla. */
  padding: calc(10px + env(safe-area-inset-top)) 6px 10px;
  border-radius: 0 0 30px 30px;
  box-shadow: var(--glass-shadow);
  border-bottom: 1px solid var(--glass-border);
}
.dia-nav {
  border: none; background: transparent; color: inherit; opacity: 0.35;
  width: 30px; height: 54px; cursor: pointer; flex-shrink: 0;
}
.dia-nav i { font-size: 20px; }
.dias {
  flex: 1; display: flex; justify-content: space-around; gap: 2px;
  /* Deja el scroll vertical de la página libre; el arrastre horizontal
     de esta barra lo captura el pointerdown/move/up en JS. */
  touch-action: pan-y;
}

.dia {
  flex: 1;
  border: none; background: transparent; color: inherit;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 6px 2px 5px; border-radius: 14px; cursor: pointer;
  /* El pivote va arriba para que, al girar, los extremos abran hacia arriba
     y el arco quede cóncavo (ver estiloDia). */
  transform-origin: top center;
}
@media (prefers-reduced-motion: no-preference) {
  .dia { transition: background 0.15s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease; }
}
.dia-semana { font-size: 10px; opacity: 0.5; text-transform: capitalize; }
.dia-num { font-size: 19px; font-weight: 700; line-height: 1.1; }
.dia.pasado .dia-num { opacity: 0.45; }
.dia.hoy .dia-num { color: var(--inova-primary); }
/* El día seleccionado va más grande y con fondo, como pide el Módulo 6.
   El tamaño real (escala) lo agrega estiloDia() en el mismo transform que
   la curvatura, para no pelear con dos reglas de `transform` distintas. */
.dia.sel {
  background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
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
.pill-cola {
  display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
  background: var(--ambar-bg); color: var(--ambar-fg);
  padding: 5px 11px; border-radius: 999px; font-size: 12px; font-weight: 700;
  margin-top: 2px;
}
.pill-cola i { font-size: 12px; }
/* `width: auto` es obligatorio: Framework7 declara `button { width: 100% }` a
   nivel global, y combinado con flex-shrink:0 el botón medía todo el ancho de
   la cabecera y se salía de la pantalla. Cualquier <button> propio que se
   agregue aquí necesita lo mismo. */
.btn-hoy {
  width: auto;
  flex-shrink: 0; border: none; border-radius: 999px; cursor: pointer;
  padding: 8px 16px; font-size: 14px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
}

/* ---------------- Contadores ---------------- */
.contadores { display: flex; gap: 8px; padding: 0 16px 12px; }
/* `width: auto` porque Framework7 declara `button { width: 100% }` global. */
.cont {
  flex: 1; width: auto; border-radius: 14px; padding: 9px 4px; text-align: center;
  background: var(--sup-campo);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  color: inherit; font-family: inherit; cursor: pointer;
  transition: transform 0.12s ease, border-color 0.15s ease, background 0.15s ease;
}
.cont:active { transform: scale(0.95); }
/* El filtro activo se marca con el borde y un realce del fondo, no con color
   de texto: los números ya usan el color para decir de qué estado son. */
.cont.act {
  border-color: var(--inova-primary);
  background: rgba(var(--f7-theme-color-rgb), 0.14);
}
.cont.act .cont-lbl { opacity: 0.9; font-weight: 700; }
.cont-num { display: block; font-size: 20px; font-weight: 800; line-height: 1.1; }
.cont-lbl { display: block; font-size: 10px; opacity: 0.55; margin-top: 1px; }
.cont.pend .cont-num { color: var(--inova-primary); }
.cont.ok .cont-num { color: #30d158; }
.cont.mal .cont-num { color: #ff453a; }

/* ---------------- Buscador ---------------- */
.buscador {
  display: flex; align-items: center; gap: 8px; margin: 0 16px 12px;
  padding: 0 12px; height: 42px; border-radius: 14px;
  background: var(--sup-campo); border: 1px solid var(--glass-border);
}
.buscador i { font-size: 17px; opacity: 0.4; }
.buscador input {
  flex: 1; min-width: 0; border: none; background: transparent;
  font-size: 15px; color: inherit; outline: none;
}
.limpiar { border: none; background: transparent; color: inherit; opacity: 0.35; cursor: pointer; }

/* ---------------- Lista ---------------- */
/* El padding inferior deja libre la última tarjeta por encima de la pastilla
   de navegación (crecida: ver .floating-nav en app.css). */
.lista { display: flex; flex-direction: column; gap: 10px; padding: 0 16px 12px; }

.tarjeta {
  position: relative; overflow: hidden;
  border-radius: 18px; padding: 12px 12px 12px 18px;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.12s ease;
}
.tarjeta.cerrada { opacity: 0.62; }
/* La tarjeta que se arrastra se realza y deja de captar el puntero, para que
   elementFromPoint devuelva la tarjeta de abajo y sepamos dónde soltar. */
.tarjeta.arrastrando {
  transform: scale(1.02);
  opacity: 0.92;
  box-shadow: 0 12px 30px rgba(17, 12, 46, 0.28);
  pointer-events: none;
  z-index: 5;
}
/* Mientras se reordena, ninguna tarjeta hace su transición de posición: se ven
   saltar al hueco al instante, sin arrastre visual que confunda. */
.lista.reordenando .tarjeta:not(.arrastrando) { transition: none; }
.tarjeta-estado { position: absolute; left: 0; top: 0; bottom: 0; width: 6px; }

.tarjeta-fila1 { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; }
/* touch-action:none: el agarre se queda el gesto para reordenar y no deja que
   la página haga scroll mientras se arrastra. */
.agarre { opacity: 0.3; cursor: grab; flex-shrink: 0; touch-action: none; padding: 2px; margin: -2px; }
.agarre i { font-size: 16px; }
.orden {
  flex-shrink: 0; min-width: 21px; height: 21px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  background: var(--sup-sutil); font-size: 11px; font-weight: 700;
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
  background: var(--sup-sutil);
}
.chip.manual { background: var(--ambar-bg); color: var(--ambar-fg); }
.chip.factura { background: rgba(91,91,214,0.14); color: var(--inova-primary); }
.chip.reintento { background: var(--ambar-bg); color: var(--ambar-fg); }
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
.acc.mas { flex: 0 0 48px; background: var(--btn-neutro); }

/* ---------------- Avisos ---------------- */
.aviso { margin: 30px 16px; padding: 28px 20px; border-radius: 18px; text-align: center; }
.aviso-icono { font-size: 34px; opacity: 0.3; }
.aviso-t { font-size: 16px; font-weight: 700; margin-top: 8px; }
.aviso-s { font-size: 13px; opacity: 0.55; margin-top: 4px; line-height: 1.4; }
.link-limpiar {
  display: block; width: auto; margin: 8px auto 0; border: none; background: transparent;
  color: var(--inova-primary); font-size: 13px; font-weight: 700; cursor: pointer;
}
</style>
