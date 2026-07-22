<template>
  <f7-page name="vuelta-detalle">
    <f7-navbar back-link="Atrás">
      <f7-nav-title>Vuelta</f7-nav-title>
    </f7-navbar>

    <div v-if="cargando" class="centrado"><f7-preloader /></div>

    <template v-else-if="v">
      <!-- ── Encabezado ─────────────────────────────────────────────── -->
      <div class="cab glass-strong">
        <div class="cab-estado" :style="{ background: info.color }">
          <i class="f7-icons">{{ info.icono }}</i> {{ info.texto }}
        </div>
        <h1 class="cab-cliente">{{ tituloVuelta(v) }}</h1>
        <div v-if="v.destinatario && v.destinatario !== v.cliente_nombre" class="cab-dest">
          {{ v.destinatario }}
        </div>
        <div class="cab-chips">
          <span v-if="v.factura_numero" class="chip factura">{{ v.factura_numero }}</span>
          <span v-if="v.origen === 'manual'" class="chip manual">Manual</span>
          <span v-if="v.intento > 1" class="chip" :class="esCritica(v) ? 'critica' : 'reintento'">
            {{ v.intento }}º intento
          </span>
          <span class="chip fecha">{{ etiquetaFecha(v.fecha) }}</span>
        </div>
      </div>

      <!-- ── Contacto rápido (Módulo 5) ─────────────────────────────── -->
      <div class="rapidas">
        <a class="rap" :class="{ off: !tel }" :href="tel || undefined">
          <i class="f7-icons">phone_fill</i><span>Llamar</span>
        </a>
        <a class="rap wa" :class="{ off: !wa }" :href="wa || undefined" target="_blank" rel="noopener">
          <i class="f7-icons">chat_bubble_2_fill</i><span>WhatsApp</span>
        </a>
        <a class="rap mapa" :class="{ off: !mapa }" :href="mapa || undefined" target="_blank" rel="noopener">
          <i class="f7-icons">map_fill</i><span>Cómo llegar</span>
        </a>
      </div>

      <!-- ── Datos ──────────────────────────────────────────────────── -->
      <div class="seccion">
        <div class="sec-titulo">
          Datos de entrega
          <button v-if="editable" type="button" class="link-editar" @click="editar">Editar</button>
        </div>
        <div class="glass tarjeta-datos">
          <div class="dato"><i class="f7-icons">location_fill</i>
            <div><span class="dato-lbl">Dirección</span>{{ v.direccion || '—' }}</div>
          </div>
          <div class="dato"><i class="f7-icons">person_fill</i>
            <div><span class="dato-lbl">Contacto</span>{{ v.contacto || '—' }}</div>
          </div>
          <div class="dato"><i class="f7-icons">phone</i>
            <div><span class="dato-lbl">Teléfono</span>{{ v.telefono || '—' }}</div>
          </div>
          <div v-if="v.notas" class="dato"><i class="f7-icons">text_alignleft</i>
            <div><span class="dato-lbl">Notas</span>{{ v.notas }}</div>
          </div>
        </div>
      </div>

      <!-- ── Partidas de la factura ─────────────────────────────────── -->
      <div v-if="v.partidas?.length" class="seccion">
        <div class="sec-titulo">Qué se entrega <span class="sec-n">{{ v.partidas.length }}</span></div>
        <div class="glass tarjeta-datos">
          <div v-for="p in v.partidas" :key="p.id" class="partida">
            <div class="part-desc">
              <div class="part-art">{{ p.articulo }}</div>
              {{ p.descripcion }}
            </div>
            <div class="part-cant">
              <span>{{ p.cantidad }}</span>
              <small v-if="p.bultos">{{ p.bultos }} bulto{{ p.bultos == 1 ? '' : 's' }}</small>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Cierre: cómo terminó ───────────────────────────────────── -->
      <div v-if="!abierta" class="seccion">
        <div class="sec-titulo">Cierre</div>
        <div class="glass tarjeta-datos">
          <div v-if="v.recibio_nombre" class="dato"><i class="f7-icons">signature</i>
            <div><span class="dato-lbl">Recibió</span>{{ v.recibio_nombre }}</div>
          </div>
          <div v-if="v.motivo_clave" class="dato"><i class="f7-icons">exclamationmark_circle</i>
            <div><span class="dato-lbl">Motivo</span>{{ textoMotivo(v.motivo_clave) }}{{ v.motivo_texto ? ' · ' + v.motivo_texto : '' }}</div>
          </div>
          <div v-if="v.cerrada_en" class="dato"><i class="f7-icons">clock_fill</i>
            <div><span class="dato-lbl">Hora</span>{{ horaCorta(v.cerrada_en) }}</div>
          </div>
          <div v-if="v.gps_lat" class="dato"><i class="f7-icons">placemark_fill</i>
            <div>
              <span class="dato-lbl">Ubicación</span>
              <a :href="`https://www.google.com/maps?q=${v.gps_lat},${v.gps_lng}`" target="_blank" rel="noopener">
                {{ Number(v.gps_lat).toFixed(5) }}, {{ Number(v.gps_lng).toFixed(5) }}
              </a>
            </div>
          </div>
          <div v-if="v.reprogramada_en" class="dato"><i class="f7-icons">arrow_uturn_right</i>
            <div><span class="dato-lbl">Reprogramada</span>a {{ etiquetaFecha(v.reprogramada_en.fecha) }}</div>
          </div>
        </div>
      </div>

      <!-- ── Evidencias ─────────────────────────────────────────────── -->
      <div class="seccion">
        <div class="sec-titulo">
          Evidencias
          <span v-if="v.evidencias?.length" class="sec-n">{{ v.evidencias.length }}</span>
        </div>
        <div v-if="v.evidencias?.length" class="evid-grid">
          <button v-for="e in v.evidencias" :key="e.id" type="button" class="evid" @click="viendo = e">
            <img :src="e.url" :alt="e.tipo" />
            <span class="evid-tipo">{{ e.tipo === 'firma' ? 'Firma' : 'Foto' }}</span>
          </button>
        </div>
        <div v-else class="glass sin-evid">Sin fotos ni firma.</div>
      </div>

      <!-- ── Historial ──────────────────────────────────────────────── -->
      <div class="seccion">
        <div class="sec-titulo">Historial</div>
        <div class="linea">
          <div v-for="h in v.historial" :key="h.id" class="hito">
            <span class="hito-punto"></span>
            <div class="hito-cuerpo">
              <div class="hito-ev">{{ textoEvento(h.evento) }}</div>
              <div v-if="h.detalle" class="hito-det">{{ h.detalle }}</div>
              <div class="hito-meta">
                {{ horaCorta(h.ocurrido_en || h.created_at) }}
                <span v-if="h.actor"> · {{ h.actor }}</span>
                <span v-if="h.gps_lat" class="hito-gps"><i class="f7-icons">placemark</i></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Acciones de cierre ─────────────────────────────────────── -->
      <div v-if="abierta && !soloLectura" class="acciones-pie">
        <button type="button" class="btn-grande ok" @click="abrirEntrega">
          <i class="f7-icons">checkmark_alt</i> Marcar entregada
        </button>
        <div class="acciones-fila">
          <button type="button" class="btn-grande mal" @click="noEntregar">
            <i class="f7-icons">xmark</i> No entregada
          </button>
          <button type="button" class="btn-grande neutro" @click="reprogramar">
            <i class="f7-icons">calendar</i> Reprogramar
          </button>
        </div>
      </div>
    </template>

    <!-- ── Hoja de entrega: nombre + fotos + firma ──────────────────── -->
    <Teleport to="body">
      <div v-if="entregando" class="hoja-fondo" @click.self="cerrarEntrega">
        <div class="hoja">
          <div class="hoja-barra">
            <button type="button" class="hoja-x" @click="cerrarEntrega">Cancelar</button>
            <strong>Confirmar entrega</strong>
            <button type="button" class="hoja-ok" :disabled="guardando" @click="confirmarEntrega">
              {{ guardando ? '…' : 'Listo' }}
            </button>
          </div>

          <div class="hoja-cuerpo">
            <label class="campo">
              <span class="campo-lbl">¿Quién recibió?</span>
              <input v-model="recibio" type="text" autocapitalize="words" placeholder="Nombre de quien recibe" />
            </label>

            <div class="campo-lbl">Fotos de evidencia</div>
            <div class="fotos">
              <div v-for="(f, i) in fotos" :key="i" class="foto-mini">
                <img :src="f.preview" alt="" />
                <button type="button" class="foto-x" @click="fotos.splice(i, 1)">
                  <i class="f7-icons">xmark</i>
                </button>
                <span class="foto-peso">{{ pesoLegible(f.blob.size) }}</span>
              </div>
              <button type="button" class="foto-add" @click="fotoInput?.click()">
                <i class="f7-icons">camera_fill</i>
                <span>Agregar</span>
              </button>
            </div>
            <input
              ref="fotoInput" type="file" accept="image/*" capture="environment"
              class="oculto" @change="onFoto"
            />

            <div class="campo-lbl">Firma de quien recibe</div>
            <div class="firma-caja">
              <canvas
                ref="firmaCanvas"
                class="firma"
                @pointerdown="trazoInicio"
                @pointermove="trazoMueve"
                @pointerup="trazoFin"
                @pointerleave="trazoFin"
              ></canvas>
              <button v-if="hayFirma" type="button" class="firma-limpiar" @click="limpiarFirma">
                Borrar
              </button>
              <span v-else class="firma-hint">Firma aquí con el dedo</span>
            </div>

            <p class="hoja-nota">
              Se registrará la hora y la ubicación del momento en que confirmes.
            </p>
          </div>
        </div>
      </div>

      <!-- Visor de evidencias -->
      <div v-if="viendo" class="visor" @click.self="viendo = null">
        <div class="visor-barra">
          <span>{{ viendo.tipo === 'firma' ? 'Firma' : 'Foto' }} · {{ horaCorta(viendo.ocurrido_en) }}</span>
          <button type="button" @click="viendo = null"><i class="f7-icons">xmark</i></button>
        </div>
        <img :src="viendo.url" alt="" class="visor-img" />
      </div>
    </Teleport>
  </f7-page>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { f7 } from 'framework7-vue';
import { api } from '@/js/api.js';
import {
  estadoInfo, estaAbierta, esCritica, tituloVuelta, etiquetaFecha, horaCorta,
  enlaceLlamada, enlaceWhatsApp, enlaceMapa, sumarDias, hoy,
} from '@/js/vueltas.js';
import { comprimirFoto, firmaABlob, subirEvidencia, nombreFoto, nombreFirma, pesoLegible } from '@/js/evidencias.js';

const props = defineProps({ f7route: Object, f7router: Object });
const id = Number(props.f7route?.params?.id);

const v = ref(null);
const cargando = ref(true);
const motivos = ref([]);
const viendo = ref(null);

const info = computed(() => estadoInfo(v.value?.estado));
const abierta = computed(() => !!v.value && estaAbierta(v.value));
const soloLectura = computed(() => !!v.value && v.value.fecha < hoy());
const editable = computed(() => abierta.value && !soloLectura.value);

const tel = computed(() => enlaceLlamada(v.value?.telefono));
const wa = computed(() => enlaceWhatsApp(v.value?.telefono));
const mapa = computed(() => enlaceMapa(v.value?.direccion));

const EVENTOS = {
  creada: 'Creada', editada: 'Editada', entregada: 'Entregada',
  no_entregada: 'No entregada', reprogramada: 'Reprogramada', conflicto: 'Conflicto',
};
const textoEvento = (e) => EVENTOS[e] ?? e;
const textoMotivo = (c) => motivos.value.find((m) => m.clave === c)?.texto ?? c;

async function cargar() {
  cargando.value = true;
  try {
    v.value = await api.vueltas.detalle(id);
    if (!motivos.value.length) {
      try { motivos.value = (await api.catalogos.todo()).motivos; } catch { /* opcional */ }
    }
  } catch (e) {
    f7.dialog.alert(e.message || 'No se pudo cargar.', 'Error');
  } finally {
    cargando.value = false;
  }
}

/* GPS de mejor esfuerzo: nunca bloquea el cierre. */
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

/* ------------------------- Hoja de entrega ------------------------- */
const entregando = ref(false);
const guardando = ref(false);
const recibio = ref('');
const fotos = ref([]);
const fotoInput = ref(null);
const firmaCanvas = ref(null);
const hayFirma = ref(false);

async function abrirEntrega() {
  entregando.value = true;
  recibio.value = '';
  fotos.value = [];
  hayFirma.value = false;
  await nextTick();
  prepararCanvas();
}

function cerrarEntrega() {
  fotos.value.forEach((f) => URL.revokeObjectURL(f.preview));
  entregando.value = false;
}

async function onFoto(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const blob = await comprimirFoto(file);
    fotos.value.push({ blob, preview: URL.createObjectURL(blob) });
  } catch (err) {
    f7.dialog.alert(err.message, 'Foto');
  }
}

/* --------------------------- Firma en canvas ------------------------ */
let ctx = null, dibujando = false;

function prepararCanvas() {
  const c = firmaCanvas.value;
  if (!c) return;
  // Escala por densidad de pantalla para que el trazo no salga pixelado.
  const dpr = window.devicePixelRatio || 1;
  const r = c.getBoundingClientRect();
  c.width = r.width * dpr;
  c.height = r.height * dpr;
  ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111';
}

const punto = (ev) => {
  const r = firmaCanvas.value.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
};

function trazoInicio(ev) {
  if (!ctx) prepararCanvas();
  dibujando = true;
  hayFirma.value = true;
  firmaCanvas.value.setPointerCapture?.(ev.pointerId);
  const p = punto(ev);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
}
function trazoMueve(ev) {
  if (!dibujando) return;
  ev.preventDefault();
  const p = punto(ev);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
}
function trazoFin() { dibujando = false; }

function limpiarFirma() {
  const c = firmaCanvas.value;
  ctx?.clearRect(0, 0, c.width, c.height);
  hayFirma.value = false;
}

/* --------------------------- Confirmar ------------------------------ */
async function confirmarEntrega() {
  guardando.value = true;
  // El sello se toma AQUÍ, cuando el chofer confirma, no cuando termine de
  // subir las fotos: eso puede tardar o hacerse después con señal.
  const ocurrido_en = new Date().toISOString();
  try {
    const gps = await ubicacion();
    await api.vueltas.entregar(id, {
      recibio_nombre: recibio.value.trim() || null,
      ocurrido_en,
      gps,
    });

    // Las evidencias van después: si alguna falla, la entrega ya quedó firme.
    const fallos = [];
    for (const f of fotos.value) {
      try { await subirEvidencia(id, f.blob, { tipo: 'foto', nombre: nombreFoto(id), ocurrido_en }); }
      catch (e) { fallos.push('foto: ' + e.message); }
    }
    if (hayFirma.value) {
      try {
        const blob = await firmaABlob(firmaCanvas.value);
        await subirEvidencia(id, blob, { tipo: 'firma', nombre: nombreFirma(id), ocurrido_en });
      } catch (e) { fallos.push('firma: ' + e.message); }
    }

    cerrarEntrega();
    await cargar();

    if (fallos.length) {
      f7.dialog.alert(
        `La entrega quedó registrada, pero no se pudo subir:\n\n${fallos.join('\n')}`,
        'Evidencias pendientes'
      );
    } else {
      f7.toast.create({ text: 'Entregada ✓', closeTimeout: 1500, position: 'center' }).open();
    }
  } catch (e) {
    f7.dialog.alert(e.message, 'No se pudo marcar');
  } finally {
    guardando.value = false;
  }
}

/* ------------------------- Otras acciones --------------------------- */
async function noEntregar() {
  if (!motivos.value.length) {
    try { motivos.value = (await api.catalogos.todo()).motivos; } catch { /* sigue */ }
  }
  f7.dialog.create({
    title: '¿Por qué no se entregó?',
    buttons: [
      ...motivos.value.map((m) => ({ text: m.texto, onClick: () => registrarNoEntrega(m) })),
      { text: 'Cancelar', color: 'gray' },
    ],
    verticalButtons: true,
  }).open();
}

async function registrarNoEntrega(motivo) {
  const guardar = async (texto) => {
    try {
      await api.vueltas.noEntregar(id, {
        motivo_clave: motivo.clave,
        motivo_texto: texto ?? null,
        ocurrido_en: new Date().toISOString(),
        gps: await ubicacion(),
      });
      await cargar();
      f7.dialog.confirm('¿Reprogramar para mañana?', 'No entregada', () => moverA(sumarDias(v.value.fecha, 1)));
    } catch (e) {
      f7.dialog.alert(e.message, 'Error');
    }
  };
  if (motivo.pide_texto) f7.dialog.prompt('Describe el motivo', motivo.texto, (t) => guardar(t?.trim() || null));
  else guardar(null);
}

function reprogramar() {
  const manana = sumarDias(v.value.fecha, 1);
  f7.dialog.create({
    title: 'Reprogramar',
    buttons: [
      { text: `Mañana (${etiquetaFecha(manana)})`, onClick: () => moverA(manana) },
      { text: 'Elegir otra fecha', onClick: elegirFecha },
      { text: 'Cancelar', color: 'gray' },
    ],
    verticalButtons: true,
  }).open();
}

function elegirFecha() {
  f7.dialog.prompt('Fecha destino (AAAA-MM-DD)', 'Reprogramar', (txt) => {
    const f = String(txt ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return f7.dialog.alert('Formato: 2026-07-30', 'Fecha inválida');
    moverA(f);
  }, null, sumarDias(v.value.fecha, 1));
}

async function moverA(fecha_destino) {
  try {
    await api.vueltas.reprogramar(id, {
      fecha_destino,
      ocurrido_en: new Date().toISOString(),
      gps: await ubicacion(),
      client_uuid: crypto.randomUUID(),
    });
    f7.toast.create({ text: `Movida a ${etiquetaFecha(fecha_destino)} ✓`, closeTimeout: 1600, position: 'center' }).open();
    await cargar();
  } catch (e) {
    f7.dialog.alert(e.message, 'No se pudo reprogramar');
  }
}

function editar() {
  const d = v.value;
  f7.dialog.prompt('Dirección', 'Editar', (dir) => {
    f7.dialog.prompt('Teléfono', 'Editar', async (telf) => {
      f7.dialog.prompt('Notas', 'Editar', async (notas) => {
        try {
          await api.vueltas.editar(id, {
            direccion: dir ?? d.direccion,
            telefono: telf ?? d.telefono,
            notas: notas ?? d.notas,
          });
          await cargar();
        } catch (e) { f7.dialog.alert(e.message, 'Error'); }
      }, null, d.notas ?? '');
    }, null, d.telefono ?? '');
  }, null, d.direccion ?? '');
}

onMounted(cargar);
</script>

<style scoped>
.centrado { display: flex; justify-content: center; padding: 60px 0; }

/* ---------------- Encabezado ---------------- */
.cab { margin: 12px 16px; padding: 16px; border-radius: 20px; }
.cab-estado {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 11px; border-radius: 999px;
  font-size: 12px; font-weight: 800; color: #fff; margin-bottom: 9px;
}
.cab-estado i { font-size: 13px; }
.cab-cliente { margin: 0; font-size: 23px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
.cab-dest { font-size: 14px; opacity: 0.6; margin-top: 3px; }
.cab-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }

.chip { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: rgba(0,0,0,0.07); }
.chip.factura { background: rgba(91,91,214,0.14); color: var(--inova-primary); }
.chip.manual { background: rgba(255,159,10,0.18); color: #b26a00; }
.chip.reintento { background: rgba(255,159,10,0.2); color: #b26a00; }
.chip.critica { background: #ff453a; color: #fff; }

/* ---------------- Contacto rápido ---------------- */
.rapidas { display: flex; gap: 8px; padding: 0 16px 4px; }
.rap {
  flex: 1; height: 62px; border-radius: 16px; text-decoration: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  background: rgba(255,255,255,0.6); border: 1px solid var(--glass-border);
  color: var(--inova-primary); font-size: 11px; font-weight: 700;
}
.rap i { font-size: 21px; }
.rap.wa { color: #25d366; }
.rap.mapa { color: #ff9f0a; }
.rap.off { opacity: 0.3; pointer-events: none; }

/* ---------------- Secciones ---------------- */
.seccion { padding: 14px 16px 0; }
.sec-titulo {
  display: flex; align-items: center; gap: 7px;
  font-size: 13px; font-weight: 700; opacity: 0.55; margin-bottom: 8px;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.sec-n {
  background: var(--inova-primary); color: #fff; border-radius: 999px;
  min-width: 18px; height: 18px; padding: 0 5px; font-size: 11px;
  display: inline-flex; align-items: center; justify-content: center;
}
.link-editar {
  margin-left: auto; border: none; background: transparent; cursor: pointer;
  color: var(--inova-primary); font-size: 13px; font-weight: 700; text-transform: none;
}

.tarjeta-datos { border-radius: 16px; padding: 4px 14px; }
.dato { display: flex; gap: 11px; padding: 11px 0; border-bottom: 1px solid rgba(0,0,0,0.06); font-size: 15px; }
.dato:last-child { border-bottom: none; }
.dato i { font-size: 17px; opacity: 0.35; flex-shrink: 0; margin-top: 2px; }
.dato-lbl { display: block; font-size: 11px; opacity: 0.5; margin-bottom: 1px; }

.partida { display: flex; gap: 12px; padding: 11px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }
.partida:last-child { border-bottom: none; }
.part-desc { flex: 1; min-width: 0; font-size: 14px; }
.part-art { font-size: 11px; opacity: 0.5; font-weight: 700; }
.part-cant { text-align: right; flex-shrink: 0; }
.part-cant span { font-size: 19px; font-weight: 800; }
.part-cant small { display: block; font-size: 10px; opacity: 0.5; }

/* ---------------- Evidencias ---------------- */
.evid-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.evid {
  position: relative; aspect-ratio: 1; border: none; padding: 0; cursor: pointer;
  border-radius: 13px; overflow: hidden; background: rgba(0,0,0,0.05);
}
.evid img { width: 100%; height: 100%; object-fit: cover; display: block; }
.evid-tipo {
  position: absolute; left: 0; right: 0; bottom: 0; padding: 3px;
  background: rgba(0,0,0,0.55); color: #fff; font-size: 10px; font-weight: 700;
}
.sin-evid { border-radius: 14px; padding: 16px; text-align: center; font-size: 13px; opacity: 0.5; }

/* ---------------- Historial ---------------- */
.linea { padding-left: 6px; }
.hito { display: flex; gap: 12px; padding-bottom: 14px; position: relative; }
.hito:not(:last-child)::before {
  content: ''; position: absolute; left: 4px; top: 14px; bottom: 0;
  width: 2px; background: rgba(0,0,0,0.1);
}
.hito-punto {
  width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex-shrink: 0;
  background: var(--inova-primary); z-index: 1;
}
.hito-ev { font-size: 14px; font-weight: 700; }
.hito-det { font-size: 13px; opacity: 0.6; margin-top: 1px; }
.hito-meta { font-size: 11px; opacity: 0.45; margin-top: 2px; }
.hito-gps i { font-size: 11px; }

/* ---------------- Acciones ---------------- */
.acciones-pie { padding: 20px 16px calc(110px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 9px; }
.acciones-fila { display: flex; gap: 9px; }
.btn-grande {
  flex: 1; height: 54px; border: none; border-radius: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 7px;
  font-size: 16px; font-weight: 700; color: #fff;
  transition: transform 0.1s ease;
}
.btn-grande:active { transform: scale(0.97); }
.btn-grande i { font-size: 19px; }
.btn-grande.ok { background: #30d158; box-shadow: 0 6px 18px rgba(48,209,88,0.35); }
.btn-grande.mal { background: #ff453a; }
.btn-grande.neutro { background: rgba(0,0,0,0.4); }

/* ---------------- Hoja de entrega ---------------- */
.hoja-fondo {
  position: fixed; inset: 0; z-index: 19000;
  background: rgba(8,6,16,0.5);
  display: flex; align-items: flex-end;
}
.hoja {
  width: 100%; max-height: 92dvh; display: flex; flex-direction: column;
  background: var(--aurora-color, #f4f2fb);
  border-radius: 22px 22px 0 0; overflow: hidden;
}
.hoja-barra {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid rgba(0,0,0,0.08);
  font-size: 16px; flex-shrink: 0;
}
.hoja-x, .hoja-ok {
  border: none; background: transparent; cursor: pointer;
  font-size: 16px; font-weight: 700; color: var(--inova-primary);
}
.hoja-x { opacity: 0.6; font-weight: 500; }
.hoja-ok:disabled { opacity: 0.4; }
.hoja-cuerpo { overflow-y: auto; padding: 16px 16px calc(20px + env(safe-area-inset-bottom)); }

.campo { display: block; margin-bottom: 16px; }
.campo-lbl { display: block; font-size: 12px; font-weight: 700; opacity: 0.55; margin: 0 0 7px 2px; text-transform: uppercase; letter-spacing: 0.03em; }
.campo input {
  width: 100%; box-sizing: border-box; height: 50px; padding: 0 14px;
  border-radius: 14px; border: 1px solid var(--glass-border);
  background: rgba(255,255,255,0.75); font-size: 16px; color: inherit;
}
.campo input:focus { outline: none; border-color: var(--inova-primary); }

.fotos { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
.foto-mini { position: relative; width: 82px; height: 82px; border-radius: 13px; overflow: hidden; }
.foto-mini img { width: 100%; height: 100%; object-fit: cover; display: block; }
.foto-x {
  position: absolute; top: 3px; right: 3px; width: 22px; height: 22px;
  border: none; border-radius: 50%; background: rgba(0,0,0,0.6); color: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center; padding: 0;
}
.foto-x i { font-size: 12px; }
.foto-peso {
  position: absolute; left: 0; right: 0; bottom: 0; padding: 2px;
  background: rgba(0,0,0,0.55); color: #fff; font-size: 9px; text-align: center;
}
.foto-add {
  width: 82px; height: 82px; border-radius: 13px; cursor: pointer;
  border: 2px dashed rgba(0,0,0,0.18); background: transparent; color: inherit;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  font-size: 11px; font-weight: 600; opacity: 0.6;
}
.foto-add i { font-size: 20px; }
.oculto { display: none; }

.firma-caja { position: relative; margin-bottom: 14px; }
.firma {
  width: 100%; height: 150px; display: block; touch-action: none;
  border-radius: 14px; border: 1px solid var(--glass-border);
  background: rgba(255,255,255,0.85);
}
.firma-hint {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 14px; opacity: 0.3; pointer-events: none;
}
.firma-limpiar {
  position: absolute; right: 8px; top: 8px; border: none; cursor: pointer;
  background: rgba(0,0,0,0.06); border-radius: 9px; padding: 5px 11px;
  font-size: 12px; font-weight: 700; color: inherit;
}
.hoja-nota { font-size: 12px; opacity: 0.5; margin: 0; line-height: 1.4; }

/* ---------------- Visor ---------------- */
.visor {
  position: fixed; inset: 0; z-index: 20000; background: rgba(8,6,16,0.97);
  display: flex; flex-direction: column;
}
.visor-barra {
  display: flex; align-items: center; justify-content: space-between;
  padding: calc(12px + env(safe-area-inset-top)) 16px 12px; color: #fff; font-size: 14px;
}
.visor-barra button {
  border: none; background: rgba(255,255,255,0.15); color: #fff; cursor: pointer;
  width: 34px; height: 34px; border-radius: 50%;
}
.visor-img { flex: 1; min-height: 0; object-fit: contain; width: 100%; }
</style>
