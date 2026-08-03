// Cola offline (Módulo 7): el chofer pudo entregar a las 11:40 sin señal y
// sincronizar a las 15:00. Cada acción se guarda aquí, en IndexedDB, y se
// manda a POST /api/sync (api/sync.js) en cuanto hay conexión. El servidor ya
// es idempotente por client_uuid; esta cola sólo reintenta hasta que confirme.
//
// Contrato de operaciones (debe seguir exactamente lo que espera api/sync.js):
//   crear       { tipo, client_uuid, origen, cliente_nombre, fecha, ocurrido_en, gps }
//   reordenar   { tipo, client_uuid, ids, fecha }
//   entregar    { tipo, client_uuid, vuelta_id, recibio_nombre?, ocurrido_en, gps }
//   no_entregar { tipo, client_uuid, vuelta_id, motivo_clave, motivo_texto?, ocurrido_en, gps }
//   reprogramar { tipo, client_uuid, vuelta_id, fecha_destino, motivo_texto?, ocurrido_en, gps }
//   editar      { tipo, client_uuid, vuelta_id, <campos editables> }
//   evidencia   { tipo, client_uuid, vuelta_id, tipo_evidencia, url, ocurrido_en }
import { openDB } from 'idb';
import { f7 } from 'framework7-vue';
import { api } from './api.js';
import { store } from './store.js';
import { subirBlobEvidencia } from './evidencias.js';

const DB_NOMBRE = 'inovatrack-cola';
const DB_VERSION = 1;
const ALMACEN = 'operaciones';
const MAX_LOTE = 200; // mismo límite que MAX_OPERACIONES en api/sync.js

// Evento global: se dispara cuando un lote se sincronizó con éxito, para que
// las pantallas abiertas recarguen del servidor (fuente de verdad) y reconcilien.
export const EVENTO_SINCRONIZADO = 'inovatrack:cola-sincronizada';

let dbPromise = null;
function db() {
  dbPromise ??= openDB(DB_NOMBRE, DB_VERSION, {
    upgrade(d) {
      const s = d.createObjectStore(ALMACEN, { keyPath: 'id', autoIncrement: true });
      s.createIndex('por_tipo', 'tipo');
    },
  });
  return dbPromise;
}

async function avisarPendientes() {
  store.pendientesSync = await (await db()).count(ALMACEN);
}

/**
 * Encola una operación y dispara un intento de envío. Nunca lanza por falta
 * de red: si no hay señal, la operación simplemente queda en IndexedDB.
 */
export async function encolar({ tipo, vuelta_id = null, payload = {}, client_uuid }) {
  const c = await db();

  if (tipo === 'reordenar') {
    // Sólo importa el último orden de cada día: los reordenamientos previos
    // del mismo día que sigan sin sincronizar quedan obsoletos.
    const previos = await c.getAllFromIndex(ALMACEN, 'por_tipo', 'reordenar');
    for (const p of previos) {
      if (p.payload?.fecha === payload.fecha) await c.delete(ALMACEN, p.id);
    }
  }

  const entrada = {
    tipo,
    client_uuid: client_uuid ?? crypto.randomUUID(),
    vuelta_id,
    payload,
    estado: 'pendiente',
    intentos: 0,
    ultimo_error: null,
    creado_en: new Date().toISOString(),
  };
  await c.add(ALMACEN, entrada);
  await avisarPendientes();
  flush();
  return entrada.client_uuid;
}

export async function todasPendientes() {
  return (await db()).getAll(ALMACEN);
}

/** Objeto de vuelta "de mentiras" para mostrar en la lista mientras se sincroniza. */
export function vueltaTemporal(client_uuid, payload) {
  return {
    id: `tmp-${client_uuid}`,
    __temporal: true,
    client_uuid,
    fecha: payload.fecha,
    estado: 'pendiente',
    origen: payload.origen ?? 'manual',
    intento: 1,
    cliente_nombre: payload.cliente_nombre ?? null,
    destinatario: null,
    factura_folio: null,
    factura_numero: null,
    direccion: null,
    contacto: null,
    telefono: null,
    notas: null,
    evidencias: 0,
    partidas: 0,
  };
}

/**
 * Reconstruye, sobre las vueltas que acaban de llegar del servidor (o de la
 * caché del service worker), el efecto de lo que sigue pendiente en la cola.
 * Así una recarga en modo avión no "deshace" lo que el chofer ya marcó.
 */
export async function aplicarPendientes(vueltas, fecha) {
  const pendientes = await todasPendientes();
  let lista = vueltas.map((v) => ({ ...v }));

  for (const p of pendientes) {
    if (p.tipo === 'crear' && (p.payload.fecha ?? fecha) === fecha) {
      lista.push(vueltaTemporal(p.client_uuid, p.payload));
    }
  }

  for (const p of pendientes) {
    const i = lista.findIndex((v) => v.id === p.vuelta_id);
    if (i === -1) continue;

    if (p.tipo === 'entregar' || p.tipo === 'no_entregar') {
      lista[i] = {
        ...lista[i],
        estado: p.tipo === 'entregar' ? 'entregada' : 'no_entregada',
        recibio_nombre: p.payload.recibio_nombre ?? null,
        motivo_clave: p.payload.motivo_clave ?? null,
        motivo_texto: p.payload.motivo_texto ?? null,
        cerrada_en: p.payload.ocurrido_en,
        gps_lat: p.payload.gps?.lat ?? lista[i].gps_lat ?? null,
        gps_lng: p.payload.gps?.lng ?? lista[i].gps_lng ?? null,
      };
    } else if (p.tipo === 'reprogramar') {
      lista[i] = { ...lista[i], estado: 'reprogramada', cerrada_en: p.payload.ocurrido_en };
    } else if (p.tipo === 'editar') {
      lista[i] = { ...lista[i], ...p.payload };
    } else if (p.tipo === 'evidencia') {
      lista[i] = { ...lista[i], evidencias: Number(lista[i].evidencias || 0) + 1 };
    }
  }

  const reorden = [...pendientes].reverse().find((p) => p.tipo === 'reordenar' && p.payload.fecha === fecha);
  if (reorden) {
    const pos = new Map(reorden.payload.ids.map((id, idx) => [id, idx]));
    lista.sort((a, b) => (pos.get(a.id) ?? 999999) - (pos.get(b.id) ?? 999999));
  }

  return lista;
}

// Vista previa local (URL.createObjectURL) de las evidencias que aún no se
// suben, una por client_uuid: se reutiliza en cada refresco de la pantalla en
// vez de crear una nueva cada vez, y se libera cuando la cola ya no la tiene.
const previasLocales = new Map();
function liberarPrevia(client_uuid) {
  if (!previasLocales.has(client_uuid)) return;
  URL.revokeObjectURL(previasLocales.get(client_uuid));
  previasLocales.delete(client_uuid);
}

/**
 * Igual que `aplicarPendientes`, pero para la pantalla de detalle (una sola
 * vuelta). Además arma miniaturas locales para las evidencias que aún no
 * suben (con la url ya resuelta si el blob ya se subió) para que el chofer
 * las vea de inmediato, sin esperar la vuelta de /api/sync.
 */
export async function aplicarPendientesDetalle(vuelta) {
  const pendientes = (await todasPendientes()).filter((p) => p.vuelta_id === vuelta.id);
  let v = { ...vuelta };
  const evidenciasPendientes = [];

  for (const p of pendientes) {
    if (p.tipo === 'entregar' || p.tipo === 'no_entregar') {
      v = {
        ...v,
        estado: p.tipo === 'entregar' ? 'entregada' : 'no_entregada',
        recibio_nombre: p.payload.recibio_nombre ?? null,
        motivo_clave: p.payload.motivo_clave ?? null,
        motivo_texto: p.payload.motivo_texto ?? null,
        cerrada_en: p.payload.ocurrido_en,
        gps_lat: p.payload.gps?.lat ?? v.gps_lat ?? null,
        gps_lng: p.payload.gps?.lng ?? v.gps_lng ?? null,
      };
    } else if (p.tipo === 'reprogramar') {
      v = { ...v, estado: 'reprogramada', cerrada_en: p.payload.ocurrido_en };
    } else if (p.tipo === 'editar') {
      v = { ...v, ...p.payload };
    } else if (p.tipo === 'evidencia') {
      let url = p.payload.url;
      if (!url && p.payload.blob) {
        if (!previasLocales.has(p.client_uuid)) previasLocales.set(p.client_uuid, URL.createObjectURL(p.payload.blob));
        url = previasLocales.get(p.client_uuid);
      }
      if (url) {
        evidenciasPendientes.push({
          id: `tmp-${p.client_uuid}`, tipo: p.payload.tipo_evidencia, url,
          ocurrido_en: p.payload.ocurrido_en, __pendiente: true,
        });
      }
    }
  }

  v.evidencias = [...(vuelta.evidencias ?? []), ...evidenciasPendientes];
  return v;
}

/** Arma el objeto exacto que espera /api/sync a partir de una entrada de la cola. */
function aOperacionSync(p) {
  const base = { tipo: p.tipo, client_uuid: p.client_uuid };
  if (p.vuelta_id != null) base.vuelta_id = p.vuelta_id;

  if (p.tipo === 'evidencia') {
    return { ...base, tipo_evidencia: p.payload.tipo_evidencia, url: p.payload.url, ocurrido_en: p.payload.ocurrido_en };
  }
  if (p.tipo === 'reordenar') {
    return { ...base, ids: p.payload.ids, fecha: p.payload.fecha };
  }
  return { ...base, ...p.payload };
}

/* --------------------------------- Flush -------------------------------- */
let enVuelo = false;
let reintentarAlTerminar = false;

/** Manda la cola al servidor. Un lock simple evita envíos concurrentes. */
export async function flush() {
  if (enVuelo) { reintentarAlTerminar = true; return; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  enVuelo = true;
  try {
    await intentarEnvio();
  } finally {
    enVuelo = false;
    if (reintentarAlTerminar) {
      reintentarAlTerminar = false;
      flush();
    }
  }
}

async function intentarEnvio() {
  const c = await db();
  let pendientes = await todasPendientes();
  if (!pendientes.length) return;

  // Evidencias: primero sube el blob a Vercel Blob (requiere señal); sin url
  // resuelta no se puede armar la operación 'evidencia' que espera el server.
  for (const p of pendientes) {
    if (p.tipo !== 'evidencia' || p.payload.url) continue;
    try {
      const url = await subirBlobEvidencia(p.vuelta_id, p.payload.blob, p.payload.nombre);
      p.payload = { ...p.payload, url };
      delete p.payload.blob;
      await c.put(ALMACEN, p);
    } catch (e) {
      p.intentos += 1;
      p.ultimo_error = e.message || 'No se pudo subir la foto';
      await c.put(ALMACEN, p);
    }
  }

  const listas = pendientes.filter((p) => p.tipo !== 'evidencia' || p.payload.url).slice(0, MAX_LOTE);
  if (!listas.length) { await avisarPendientes(); return; }

  let respuesta;
  try {
    respuesta = await api.sync.enviar(listas.map(aOperacionSync));
  } catch {
    await avisarPendientes(); // sin red o error del servidor: se reintenta después
    return;
  }

  let sincronizoAlgo = false;
  const conflictos = [];

  for (const r of respuesta.resultados ?? []) {
    const entrada = listas.find((p) => p.client_uuid === r.client_uuid);
    if (!entrada) continue;

    if (r.ok) {
      sincronizoAlgo = true;
      await c.delete(ALMACEN, entrada.id);
      liberarPrevia(entrada.client_uuid);
    } else if (r.conflicto) {
      // El servidor ya se pronunció: reintentar no lo cambiaría. Se saca de la
      // cola y se avisa al chofer (persistir 'revision' en servidor: PR2).
      await c.delete(ALMACEN, entrada.id);
      liberarPrevia(entrada.client_uuid);
      conflictos.push({ vuelta_id: entrada.vuelta_id, mensaje: r.error });
    } else {
      entrada.intentos += 1;
      entrada.ultimo_error = r.error;
      await c.put(ALMACEN, entrada);
    }
  }

  await avisarPendientes();

  for (const conf of conflictos) {
    f7.dialog.alert(conf.mensaje || 'La vuelta quedó en revisión.', 'Conflicto de sincronización');
  }
  if (sincronizoAlgo) {
    window.dispatchEvent(new CustomEvent(EVENTO_SINCRONIZADO));
  }
}

/* ------------------------------ Disparadores ----------------------------- */
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { store.sinConexion = false; flush(); });
  window.addEventListener('offline', () => { store.sinConexion = true; });
  // Reintento periódico: cubre el caso de "hay señal pero el primer intento
  // falló" sin depender de que el evento 'online' se dispare de nuevo.
  setInterval(() => { if (store.pendientesSync > 0) flush(); }, 30000);
  avisarPendientes();
}
