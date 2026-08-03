<template>
  <Teleport to="body">
    <div v-if="abierto" class="cap-fondo" @click.self="cerrar">
      <div class="cap glass-strong">
        <div class="cap-barra">
          <button v-if="paso !== 'tipo'" type="button" class="cap-atras" @click="retroceder">
            <i class="f7-icons">chevron_left</i>
          </button>
          <span class="cap-tit">{{ titulo }}</span>
          <button type="button" class="cap-cerrar" @click="cerrar"><i class="f7-icons">xmark</i></button>
        </div>

        <!-- Paso 1: ¿qué va a hacer el chofer? -->
        <div v-if="paso === 'tipo'" class="cap-cuerpo">
          <button type="button" class="opcion" @click="elegirTipo('entrega')">
            <span class="op-emoji">📦</span>
            <span class="op-txt"><b>Entrega</b><small>Llevar mercancía al cliente</small></span>
            <i class="f7-icons op-flecha">chevron_right</i>
          </button>
          <button type="button" class="opcion" @click="elegirTipo('recoleccion')">
            <span class="op-emoji">📥</span>
            <span class="op-txt"><b>Recolección</b><small>Recoger algo del cliente</small></span>
            <i class="f7-icons op-flecha">chevron_right</i>
          </button>
          <button type="button" class="opcion" @click="elegirTipo('otro')">
            <span class="op-emoji">🧭</span>
            <span class="op-txt"><b>Otros</b><small>Cualquier otra diligencia</small></span>
            <i class="f7-icons op-flecha">chevron_right</i>
          </button>
        </div>

        <!-- Paso 2 (sólo entrega): ¿de dónde salen los datos? -->
        <div v-else-if="paso === 'modo'" class="cap-cuerpo">
          <button type="button" class="opcion destacada" @click="irAEscaner">
            <span class="op-emoji">🔦</span>
            <span class="op-txt"><b>Escanear factura</b><small>Lee el código de barras</small></span>
            <i class="f7-icons op-flecha">chevron_right</i>
          </button>
          <button type="button" class="opcion" @click="paso = 'manual'">
            <span class="op-emoji">✏️</span>
            <span class="op-txt"><b>Manual</b><small>Sólo el nombre del cliente</small></span>
            <i class="f7-icons op-flecha">chevron_right</i>
          </button>
        </div>

        <!-- Paso 3: captura manual (entrega-manual / recolección / otros) -->
        <div v-else-if="paso === 'manual'" class="cap-cuerpo">
          <label class="campo">
            <span>{{ tipo === 'entrega' ? 'Cliente' : 'Cliente o descripción' }}</span>
            <input
              ref="inputNombre"
              v-model="nombre"
              type="text"
              :placeholder="tipo === 'entrega' ? 'Nombre del cliente' : 'A quién / qué'"
              @keyup.enter="confirmarManual"
            />
          </label>
          <label class="campo">
            <span>Nota (opcional)</span>
            <input v-model="notas" type="text" placeholder="Referencia, indicaciones…" @keyup.enter="confirmarManual" />
          </label>
          <button type="button" class="btn-pri" :disabled="!nombre.trim()" @click="confirmarManual">
            Agregar {{ etiquetaTipo.toLowerCase() }}
          </button>
        </div>

        <!-- Paso 4: escáner de código de barras -->
        <div v-else-if="paso === 'escaner'" class="cap-cuerpo">
          <div v-if="escanerError" class="escaner-aviso">
            <i class="f7-icons">exclamationmark_triangle_fill</i>
            <div>{{ escanerError }}</div>
          </div>
          <div v-else class="escaner-marco">
            <video ref="video" class="escaner-video" playsinline muted></video>
            <div class="escaner-linea"></div>
            <div class="escaner-ayuda">Apunta al código de barras de la factura</div>
          </div>

          <div class="escaner-manual">
            <div class="escaner-o">o escribe el folio</div>
            <div class="escaner-fila">
              <input
                v-model="folioManual"
                type="text"
                inputmode="text"
                autocapitalize="characters"
                placeholder="Folio de la factura"
                @keyup.enter="resolverFolio(folioManual)"
              />
              <button type="button" class="btn-pri chico" :disabled="!folioManual.trim() || buscando" @click="resolverFolio(folioManual)">
                {{ buscando ? '…' : 'Buscar' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Paso 5: confirmar la factura encontrada -->
        <div v-else-if="paso === 'factura'" class="cap-cuerpo">
          <div class="factura-tarjeta">
            <div class="factura-folio">{{ factura.factura_numero || folioActual }}</div>
            <div class="factura-cliente">{{ factura.cliente_nombre }}</div>
            <div v-if="factura.direccion" class="factura-dato"><i class="f7-icons">location</i>{{ factura.direccion }}</div>
            <div v-if="factura.destinatario" class="factura-dato"><i class="f7-icons">building_2_fill</i>{{ factura.destinatario }}</div>
            <div v-if="factura.partidas?.length" class="factura-dato"><i class="f7-icons">cube_box</i>{{ factura.partidas.length }} partida{{ factura.partidas.length === 1 ? '' : 's' }}</div>
            <div v-if="factura._stub" class="factura-stub">Datos de prueba (SAP en modo demo)</div>
          </div>
          <button type="button" class="btn-pri" @click="confirmarFactura">Agregar a mi ruta</button>
          <button type="button" class="btn-sec" @click="paso = 'escaner'">Escanear otra</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted, onUnmounted } from 'vue';
import { f7 } from 'framework7-vue';
import { api } from '@/js/api.js';
import * as haptics from '@/js/haptics.js';

const props = defineProps({ abierto: Boolean, fecha: String });
const emit = defineEmits(['update:abierto', 'crear']);

const paso = ref('tipo');
const tipo = ref('entrega');
const nombre = ref('');
const notas = ref('');
const inputNombre = ref(null);

// Escáner
const video = ref(null);
const escanerError = ref('');
const folioManual = ref('');
const folioActual = ref('');
const buscando = ref(false);
const factura = ref({});
let lector = null;      // instancia de zxing (carga diferida)
let controles = null;   // handle para detener la cámara

const ETIQUETAS = { entrega: 'Entrega', recoleccion: 'Recolección', otro: 'Otros' };
const etiquetaTipo = computed(() => ETIQUETAS[tipo.value] ?? 'Vuelta');
const titulo = computed(() => {
  if (paso.value === 'tipo') return 'Nueva vuelta';
  if (paso.value === 'escaner') return 'Escanear factura';
  if (paso.value === 'factura') return 'Factura encontrada';
  return etiquetaTipo.value;
});

watch(() => props.abierto, (v) => {
  if (v) reiniciar();
  else detenerLectura();
});

function reiniciar() {
  paso.value = 'tipo';
  tipo.value = 'entrega';
  nombre.value = '';
  notas.value = '';
  folioManual.value = '';
  escanerError.value = '';
  factura.value = {};
}

function cerrar() {
  detenerLectura();
  emit('update:abierto', false);
}

function retroceder() {
  detenerLectura();
  if (paso.value === 'modo') paso.value = 'tipo';
  else if (paso.value === 'manual') paso.value = tipo.value === 'entrega' ? 'modo' : 'tipo';
  else if (paso.value === 'escaner') paso.value = 'modo';
  else if (paso.value === 'factura') paso.value = 'escaner';
}

function elegirTipo(t) {
  haptics.tap();
  tipo.value = t;
  // Sólo la entrega tiene el paso factura/manual; recolección y otros van
  // directo a capturar el nombre.
  if (t === 'entrega') {
    paso.value = 'modo';
  } else {
    paso.value = 'manual';
    enfocarNombre();
  }
}

function enfocarNombre() {
  nextTick(() => inputNombre.value?.focus());
}

function confirmarManual() {
  if (!nombre.value.trim()) return;
  haptics.tap();
  emit('crear', {
    origen: 'manual',
    tipo_vuelta: tipo.value,
    cliente_nombre: nombre.value.trim(),
    notas: notas.value.trim() || null,
  });
  cerrar();
}

/* ------------------------------ Escáner ------------------------------ */
async function irAEscaner() {
  haptics.tap();
  paso.value = 'escaner';
  escanerError.value = '';
  await nextTick();
  arrancarCamara();
}

// Cámara compartida: getUserMedia es lo que dispara el permiso, así que se
// llama UNA sola vez y el MediaStream se reutiliza en cada escaneo. Así iOS no
// vuelve a preguntar en cada factura. Se suelta de verdad (apaga el indicador)
// sólo al mandar la app a segundo plano o cerrarla (liberarCamara).
let streamCompartido = null;

async function obtenerStream() {
  const vivo = streamCompartido?.getVideoTracks().some((t) => t.readyState === 'live');
  if (vivo) return streamCompartido;
  streamCompartido = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  return streamCompartido;
}

function liberarCamara() {
  detenerLectura();
  try { streamCompartido?.getTracks().forEach((t) => t.stop()); } catch { /* ya suelta */ }
  streamCompartido = null;
}

async function arrancarCamara() {
  // BarcodeDetector nativo (Android/Chrome) es lo más ligero; si no está, se
  // carga zxing bajo demanda (iOS Safari). El folio a mano siempre funciona.
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      escanerError.value = 'Esta cámara no está disponible aquí. Escribe el folio abajo.';
      return;
    }
    if ('BarcodeDetector' in window) {
      await escanearConNativo();
    } else {
      await escanearConZxing();
    }
  } catch (e) {
    // El caso más común es que el chofer no dé permiso de cámara.
    escanerError.value = e?.name === 'NotAllowedError'
      ? 'No diste permiso a la cámara. Escribe el folio abajo, o actívala en los ajustes.'
      : 'No se pudo abrir la cámara. Escribe el folio abajo.';
  }
}

// El folio de las facturas de Crystal Reports va en Code 39 (fuente
// Code39AzaleaWide3). Se prioriza ese formato y se acompaña de otros comunes
// por si algún reporte usa otro; restringir la lista hace la lectura más
// rápida y menos propensa a falsos positivos que el "multiformato" abierto.
const FORMATOS_NATIVO = ['code_39', 'code_128', 'itf', 'ean_13', 'qr_code'];

async function escanearConNativo() {
  const stream = await obtenerStream();
  const v = video.value;
  if (!v) return;
  v.srcObject = stream;
  await v.play();
  controles = null; // el loop se detiene solo al soltar el <video> (srcObject = null)
  // Sólo los formatos que el navegador soporte de verdad (algunos no traen
  // code_39); si la consulta falla, se deja que detecte todo.
  let formats = FORMATOS_NATIVO;
  try {
    const soportados = await window.BarcodeDetector.getSupportedFormats();
    const f = FORMATOS_NATIVO.filter((x) => soportados.includes(x));
    if (f.length) formats = f;
  } catch { /* usamos la lista completa */ }
  const detector = new window.BarcodeDetector({ formats });
  const loop = async () => {
    if (paso.value !== 'escaner' || !v.srcObject) return;
    try {
      const cods = await detector.detect(v);
      if (cods.length) { onCodigo(cods[0].rawValue); return; }
    } catch { /* fotograma sin código; seguimos */ }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

async function escanearConZxing() {
  // Import diferido: sólo el chofer que abre el escáner descarga la librería.
  const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  // Prioriza Code 39 (el de las facturas) e insiste más en cada fotograma.
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_39, BarcodeFormat.CODE_128, BarcodeFormat.ITF,
    BarcodeFormat.EAN_13, BarcodeFormat.QR_CODE,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  lector = new BrowserMultiFormatReader(hints);
  // decodeFromVideoElement (no ...VideoDevice): el stream lo abrimos y
  // reutilizamos nosotros; el stop() de zxing sólo corta el loop, no el track.
  const stream = await obtenerStream();
  const v = video.value;
  if (!v) return;
  v.srcObject = stream;
  await v.play();
  controles = await lector.decodeFromVideoElement(v, (resultado) => {
    if (resultado) onCodigo(resultado.getText());
  });
}

function onCodigo(texto) {
  const folio = String(texto ?? '').trim();
  if (!folio) return;
  haptics.exito();
  detenerLectura();
  resolverFolio(folio);
}

// Detiene el escaneo y suelta el <video>, PERO conserva el stream de cámara
// vivo para el próximo escaneo (no re-pedir permiso). Para apagar la cámara
// de verdad, ver liberarCamara().
function detenerLectura() {
  try { controles?.stop?.(); } catch { /* ya estaba detenida */ }
  controles = null;
  lector = null;
  const v = video.value;
  if (v?.srcObject) v.srcObject = null;
}

async function resolverFolio(folio) {
  const f = String(folio ?? '').trim();
  if (!f || buscando.value) return;
  buscando.value = true;
  folioActual.value = f;
  try {
    const r = await api.vueltas.escanear(f);
    if (r.ok) {
      factura.value = r.factura;
      paso.value = 'factura';
    } else {
      // Ya en ruta / ya entregada / no encontrada: se avisa y se ofrece
      // capturarla a mano sin perder lo andado.
      f7.dialog.confirm(
        `${r.mensaje}\n\n¿Capturarla como vuelta manual?`,
        'Factura',
        () => { tipo.value = 'entrega'; nombre.value = f; paso.value = 'manual'; detenerLectura(); enfocarNombre(); }
      );
    }
  } catch (e) {
    f7.dialog.alert(e.message || 'No se pudo consultar la factura.', 'Escanear');
  } finally {
    buscando.value = false;
  }
}

function confirmarFactura() {
  haptics.tap();
  const fa = factura.value;
  emit('crear', {
    origen: 'factura',
    tipo_vuelta: 'entrega',
    factura_folio: folioActual.value,
    factura_numero: fa.factura_numero ?? null,
    cliente_codigo: fa.cliente_codigo ?? null,
    cliente_nombre: fa.cliente_nombre ?? null,
    destinatario: fa.destinatario ?? null,
    contacto: fa.contacto ?? null,
    telefono: fa.telefono ?? null,
    direccion: fa.direccion ?? null,
    // `fa.partidas` es un array REACTIVO de Vue (Proxy); IndexedDB no puede
    // clonar Proxies (DataCloneError al encolar). Se copia a objetos planos.
    partidas: (fa.partidas ?? []).map((p) => ({
      articulo: p.articulo ?? null,
      descripcion: p.descripcion ?? null,
      cantidad: p.cantidad ?? null,
      bultos: p.bultos ?? null,
    })),
  });
  cerrar();
}

// La cámara se conserva viva entre escaneos (para no re-pedir permiso), pero
// se suelta cuando la app pasa a segundo plano: así no queda el indicador
// encendido mientras el chofer usa otra cosa.
function alOcultar() { if (document.hidden) liberarCamara(); }
onMounted(() => document.addEventListener('visibilitychange', alOcultar));
onUnmounted(() => document.removeEventListener('visibilitychange', alOcultar));
onBeforeUnmount(liberarCamara);
</script>

<style scoped>
.cap-fondo {
  position: fixed; inset: 0; z-index: 14000;
  background: rgba(0, 0, 0, 0.45); display: flex; align-items: flex-end;
}
.cap {
  width: 100%; max-height: 90vh; overflow-y: auto;
  border-radius: 24px 24px 0 0;
  padding: 8px 18px calc(20px + env(safe-area-inset-bottom));
}
.cap-barra { display: flex; align-items: center; gap: 8px; padding: 8px 0 14px; }
.cap-tit { flex: 1; text-align: center; font-size: 17px; font-weight: 800; }
.cap-atras, .cap-cerrar {
  width: 34px; height: 34px; flex-shrink: 0; border: none; cursor: pointer;
  background: var(--sup-sutil); color: inherit; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.cap-atras i, .cap-cerrar i { font-size: 18px; }
.cap-cuerpo { display: flex; flex-direction: column; gap: 12px; }

.opcion {
  width: auto; border: none; cursor: pointer; text-align: left;
  display: flex; align-items: center; gap: 14px;
  padding: 16px 16px; border-radius: 16px;
  background: var(--sup-campo); border: 1px solid var(--glass-border); color: inherit;
  transition: transform 0.12s ease;
}
.opcion:active { transform: scale(0.98); }
.opcion.destacada {
  background: linear-gradient(135deg, rgba(var(--f7-theme-color-rgb), 0.16), rgba(var(--f7-theme-color-rgb), 0.06));
  border-color: rgba(var(--f7-theme-color-rgb), 0.4);
}
.op-emoji { font-size: 28px; flex-shrink: 0; width: 34px; text-align: center; }
.op-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.op-txt b { font-size: 16px; font-weight: 700; }
.op-txt small { font-size: 12px; opacity: 0.6; }
.op-flecha { font-size: 18px; opacity: 0.3; flex-shrink: 0; }

.campo { display: block; }
.campo > span { display: block; font-size: 12px; font-weight: 600; opacity: 0.6; margin-bottom: 5px; }
.campo input {
  width: 100%; box-sizing: border-box; height: 46px; padding: 0 14px;
  border-radius: 12px; border: 1px solid var(--linea);
  background: var(--sup-campo); font-size: 16px; color: inherit; font-family: inherit;
}
.campo input:focus { outline: 2px solid var(--inova-primary); outline-offset: -1px; }

.btn-pri, .btn-sec {
  width: auto; height: 48px; border: none; border-radius: 13px; cursor: pointer;
  font-size: 15px; font-weight: 700;
}
.btn-pri {
  color: #fff; background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
}
.btn-pri:disabled { opacity: 0.5; }
.btn-pri.chico { width: auto; flex-shrink: 0; height: 46px; padding: 0 16px; }
.btn-sec { background: var(--sup-sutil); color: inherit; }

/* Escáner */
.escaner-marco {
  position: relative; width: 100%; aspect-ratio: 4 / 3;
  border-radius: 16px; overflow: hidden; background: #000;
}
.escaner-video { width: 100%; height: 100%; object-fit: cover; display: block; }
.escaner-linea {
  position: absolute; left: 8%; right: 8%; top: 50%; height: 2px;
  background: #ff453a; box-shadow: 0 0 10px #ff453a;
  animation: escanea 1.6s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) { .escaner-linea { animation: none; } }
@keyframes escanea { 0%, 100% { top: 22%; } 50% { top: 78%; } }
.escaner-ayuda {
  position: absolute; left: 0; right: 0; bottom: 10px; text-align: center;
  color: #fff; font-size: 13px; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}
.escaner-aviso {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 14px; border-radius: 14px; font-size: 14px; line-height: 1.4;
  background: var(--ambar-bg); color: var(--ambar-fg);
}
.escaner-aviso i { font-size: 20px; flex-shrink: 0; }
.escaner-o { text-align: center; font-size: 12px; opacity: 0.5; margin: 4px 0 8px; }
.escaner-fila { display: flex; gap: 8px; }
.escaner-fila input {
  flex: 1; min-width: 0; box-sizing: border-box; height: 46px; padding: 0 14px;
  border-radius: 12px; border: 1px solid var(--linea);
  background: var(--sup-campo); font-size: 16px; color: inherit; font-family: inherit;
  text-transform: uppercase;
}

/* Factura encontrada */
.factura-tarjeta {
  padding: 16px; border-radius: 16px;
  background: var(--sup-campo); border: 1px solid var(--glass-border);
}
.factura-folio { font-size: 13px; font-weight: 700; color: var(--inova-primary); }
.factura-cliente { font-size: 19px; font-weight: 800; margin: 2px 0 8px; }
.factura-dato { display: flex; align-items: center; gap: 6px; font-size: 13px; opacity: 0.7; margin-top: 4px; }
.factura-dato i { font-size: 14px; flex-shrink: 0; }
.factura-stub { margin-top: 10px; font-size: 11px; opacity: 0.5; font-style: italic; }
</style>
