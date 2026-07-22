// Reglas de negocio de las vueltas. Viven aquí (no en los endpoints) porque
// las comparten el CRUD normal y la sincronización por lotes, y porque el
// cliente puede mentir: lo que manda el teléfono se valida SIEMPRE aquí.
import { db } from './_db.js';

/* ------------------------------- Fechas ------------------------------- */
// El servidor corre en UTC, pero la operación es en México. "Hoy" para un
// chofer en Monterrey a las 19:00 del día 5 debe ser el día 5, no el 6.
const TZ = 'America/Mexico_City';

export function hoyMx() {
  // en-CA da formato YYYY-MM-DD directamente.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export const esFechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f ?? ''));

/** Suma días a 'YYYY-MM-DD' sin líos de zona horaria (aritmética en UTC puro). */
export function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  const t = Date.UTC(a, m - 1, d) + dias * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/* ------------------------------ Estados ------------------------------- */
export const ESTADOS = ['pendiente', 'entregada', 'no_entregada', 'reprogramada', 'revision'];
export const ABIERTOS = ['pendiente', 'revision'];

/**
 * ¿Se puede pasar de `desde` a `hacia`?
 * Una vuelta cerrada no se reabre: si hay que reintentar, se reprograma (lo
 * que crea una vuelta hija). Así el historial nunca pierde el intento previo.
 */
export function transicionValida(desde, hacia) {
  if (!ESTADOS.includes(hacia)) return false;
  if (desde === hacia) return true; // reenvío de la cola offline: idempotente
  if (ABIERTOS.includes(desde)) return ['entregada', 'no_entregada', 'reprogramada', 'revision'].includes(hacia);
  return false;
}

/* ----------------------------- Permisos ------------------------------- */
/** Cada chofer sólo ve y opera lo suyo (Módulo 1). Oficina/dirección ven todo. */
export const esOficina = (u) => u?.rol === 'oficina' || u?.rol === 'direccion';

export async function vueltaDe(id, usuario) {
  const { rows } = await db().execute({
    sql: 'SELECT * FROM vueltas WHERE id = ?',
    args: [id],
  });
  const v = rows[0];
  if (!v) return null;
  if (!esOficina(usuario) && Number(v.chofer_id) !== Number(usuario.id)) return null;
  return v;
}

/**
 * Los días pasados son SÓLO LECTURA (Módulo 6). Se valida contra la fecha de
 * la vuelta, no contra la del dispositivo: si el chofer trae mal el reloj o
 * sincroniza tarde, no puede editar el pasado.
 *
 * Excepción deliberada: la cola offline puede traer acciones con `ocurrido_en`
 * de hoy que llegan cuando ya cambió el día. Por eso se admite el día anterior
 * para cierres que vengan sellados desde el dispositivo.
 */
export function puedeEditar(vuelta, { desdeCola = false } = {}) {
  const hoy = hoyMx();
  if (vuelta.fecha > hoy) return true;   // futuro: se puede preparar
  if (vuelta.fecha === hoy) return true;
  if (desdeCola && vuelta.fecha >= sumarDias(hoy, -1)) return true;
  return false;
}

/* ----------------------------- Historial ------------------------------ */
/**
 * Toda transición deja rastro: quién, cuándo (reloj del dispositivo) y dónde.
 * `client_uuid` hace el registro idempotente: si la cola reenvía, no duplica.
 */
export async function registrarHistorial(client, {
  vuelta_id, evento, detalle = null, estado_anterior = null, estado_nuevo = null,
  actor_id, ocurrido_en = null, gps = null, client_uuid = null,
}) {
  await client.execute({
    sql: `INSERT INTO vuelta_historial
            (client_uuid, vuelta_id, evento, detalle, estado_anterior, estado_nuevo,
             actor_id, ocurrido_en, gps_lat, gps_lng, gps_precision)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(client_uuid) DO NOTHING`,
    args: [
      client_uuid, vuelta_id, evento, detalle, estado_anterior, estado_nuevo,
      actor_id, ocurrido_en ?? new Date().toISOString(),
      gps?.lat ?? null, gps?.lng ?? null, gps?.precision ?? null,
    ],
  });
}

/* --------------------------- Consulta de día -------------------------- */
const SELECT_VUELTA = `
  SELECT v.*,
         (SELECT COUNT(*) FROM vuelta_evidencias e WHERE e.vuelta_id = v.id) AS evidencias,
         (SELECT COUNT(*) FROM vuelta_partidas p WHERE p.vuelta_id = v.id)  AS partidas
  FROM vueltas v`;

export async function vueltasDelDia(usuario, fecha) {
  const soloMias = !esOficina(usuario);
  const { rows } = await db().execute({
    sql: `${SELECT_VUELTA}
          WHERE v.fecha = ? ${soloMias ? 'AND v.chofer_id = ?' : ''}
          ORDER BY
            CASE v.estado WHEN 'pendiente' THEN 0 WHEN 'revision' THEN 1 ELSE 2 END,
            v.orden, v.id`,
    args: soloMias ? [fecha, usuario.id] : [fecha],
  });
  return rows;
}

/** Contadores del día (Módulo 4). Los reprogramados no cuentan como pendientes. */
export function contar(vueltas) {
  const c = { total: vueltas.length, pendientes: 0, entregadas: 0, no_entregadas: 0, reprogramadas: 0 };
  for (const v of vueltas) {
    if (v.estado === 'pendiente' || v.estado === 'revision') c.pendientes++;
    else if (v.estado === 'entregada') c.entregadas++;
    else if (v.estado === 'no_entregada') c.no_entregadas++;
    else if (v.estado === 'reprogramada') c.reprogramadas++;
  }
  return c;
}

/**
 * Carga de cada día para la barra de calendario (Módulo 6): cuántas vueltas
 * siguen abiertas por fecha. Es lo que hace visible el "arrastre" a futuro.
 */
export async function cargaPorDia(usuario, desde, hasta) {
  const soloMias = !esOficina(usuario);
  const { rows } = await db().execute({
    sql: `SELECT fecha, COUNT(*) AS abiertas
          FROM vueltas
          WHERE fecha BETWEEN ? AND ?
            AND estado IN ('pendiente','revision')
            ${soloMias ? 'AND chofer_id = ?' : ''}
          GROUP BY fecha`,
    args: soloMias ? [desde, hasta, usuario.id] : [desde, hasta],
  });
  return Object.fromEntries(rows.map((r) => [r.fecha, Number(r.abiertas)]));
}

/* ------------------------- Detalle con relaciones --------------------- */
export async function detalleVuelta(id, usuario) {
  const v = await vueltaDe(id, usuario);
  if (!v) return null;
  const c = db();

  const [partidas, evidencias, historial] = await Promise.all([
    c.execute({ sql: 'SELECT * FROM vuelta_partidas WHERE vuelta_id = ? ORDER BY orden, id', args: [id] }),
    c.execute({ sql: 'SELECT * FROM vuelta_evidencias WHERE vuelta_id = ? ORDER BY id', args: [id] }),
    c.execute({
      sql: `SELECT h.*, u.nombre AS actor
            FROM vuelta_historial h LEFT JOIN usuarios u ON u.id = h.actor_id
            WHERE h.vuelta_id = ? ORDER BY h.id`,
      args: [id],
    }),
  ]);

  // Cadena de reintentos: de dónde viene y a dónde se fue.
  const { rows: hijas } = await c.execute({
    sql: 'SELECT id, fecha, estado, intento FROM vueltas WHERE vuelta_padre_id = ? ORDER BY id',
    args: [id],
  });

  return {
    ...v,
    partidas: partidas.rows,
    evidencias: evidencias.rows,
    historial: historial.rows,
    reprogramada_en: hijas[0] ?? null,
  };
}

/* ------------------------------ Creación ------------------------------ */
/**
 * Alta idempotente. Si el `client_uuid` ya existe (la cola reenvió), devuelve
 * la vuelta que ya se había creado en vez de duplicarla.
 */
export async function crearVuelta(datos, usuario) {
  const c = db();

  if (datos.client_uuid) {
    const { rows } = await c.execute({
      sql: 'SELECT * FROM vueltas WHERE client_uuid = ?',
      args: [datos.client_uuid],
    });
    if (rows[0]) return { vuelta: rows[0], duplicada: true };
  }

  const fecha = esFechaValida(datos.fecha) ? datos.fecha : hoyMx();
  const chofer = esOficina(usuario) && datos.chofer_id ? Number(datos.chofer_id) : Number(usuario.id);

  // Al final de la lista del día, salvo que venga un orden explícito.
  let orden = Number.isFinite(Number(datos.orden)) ? Number(datos.orden) : null;
  if (orden === null) {
    const { rows } = await c.execute({
      sql: 'SELECT COALESCE(MAX(orden), -1) + 1 AS sig FROM vueltas WHERE chofer_id = ? AND fecha = ?',
      args: [chofer, fecha],
    });
    orden = Number(rows[0].sig);
  }

  const { rows } = await c.execute({
    sql: `INSERT INTO vueltas
            (client_uuid, chofer_id, fecha, orden, origen, estado, intento, vuelta_padre_id,
             factura_folio, factura_numero, cliente_codigo, cliente_nombre, destinatario,
             contacto, telefono, direccion, notas, creado_por)
          VALUES (?,?,?,?,?, 'pendiente', ?,?, ?,?,?,?,?, ?,?,?,?, ?)
          RETURNING *`,
    args: [
      datos.client_uuid ?? null, chofer, fecha, orden,
      datos.origen === 'manual' ? 'manual' : 'factura',
      Number(datos.intento) || 1, datos.vuelta_padre_id ?? null,
      datos.factura_folio ?? null, datos.factura_numero ?? null,
      datos.cliente_codigo ?? null, datos.cliente_nombre ?? null, datos.destinatario ?? null,
      datos.contacto ?? null, datos.telefono ?? null, datos.direccion ?? null,
      datos.notas ?? null, usuario.id,
    ],
  });
  const vuelta = rows[0];

  if (Array.isArray(datos.partidas) && datos.partidas.length) {
    for (const [i, p] of datos.partidas.entries()) {
      await c.execute({
        sql: `INSERT INTO vuelta_partidas (vuelta_id, articulo, descripcion, cantidad, bultos, orden)
              VALUES (?,?,?,?,?,?)`,
        args: [vuelta.id, p.articulo ?? null, p.descripcion ?? null,
               p.cantidad ?? null, p.bultos ?? null, i],
      });
    }
  }

  await registrarHistorial(c, {
    vuelta_id: vuelta.id,
    evento: 'creada',
    detalle: vuelta.origen === 'manual' ? 'captura manual' : `factura ${vuelta.factura_folio ?? ''}`.trim(),
    estado_nuevo: 'pendiente',
    actor_id: usuario.id,
    ocurrido_en: datos.ocurrido_en ?? null,
    gps: datos.gps ?? null,
  });

  return { vuelta, duplicada: false };
}

/* ---------------------------- Transiciones ---------------------------- */
/**
 * Cierra una vuelta como entregada o no entregada.
 *
 * El sello (`cerrada_en` + GPS) usa SIEMPRE el momento que marcó el teléfono,
 * no el de llegada al servidor: el chofer pudo entregar a las 11:40 sin señal
 * y sincronizar a las 15:00. La evidencia debe decir 11:40.
 */
export async function cerrarVuelta(vuelta, datos, usuario) {
  const { estado } = datos;
  if (!transicionValida(vuelta.estado, estado)) {
    return { error: `No se puede pasar de "${vuelta.estado}" a "${estado}".` };
  }
  // Reenvío de la cola sobre algo ya cerrado igual: no es error, es idempotencia.
  if (vuelta.estado === estado) return { vuelta, sinCambio: true };

  if (estado === 'no_entregada' && !datos.motivo_clave) {
    return { error: 'Elige el motivo de la no entrega.' };
  }

  const c = db();
  const sello = datos.ocurrido_en ?? new Date().toISOString();

  const { rows } = await c.execute({
    sql: `UPDATE vueltas SET
            estado = ?, recibio_nombre = ?, motivo_clave = ?, motivo_texto = ?,
            cerrada_en = ?, gps_lat = ?, gps_lng = ?, gps_precision = ?,
            updated_at = datetime('now')
          WHERE id = ? RETURNING *`,
    args: [
      estado,
      estado === 'entregada' ? (datos.recibio_nombre ?? null) : null,
      estado === 'no_entregada' ? datos.motivo_clave : null,
      estado === 'no_entregada' ? (datos.motivo_texto ?? null) : null,
      sello,
      datos.gps?.lat ?? null, datos.gps?.lng ?? null, datos.gps?.precision ?? null,
      vuelta.id,
    ],
  });

  await registrarHistorial(c, {
    vuelta_id: vuelta.id,
    evento: estado,
    detalle: estado === 'entregada'
      ? (datos.recibio_nombre ? `recibió: ${datos.recibio_nombre}` : null)
      : [datos.motivo_clave, datos.motivo_texto].filter(Boolean).join(' · '),
    estado_anterior: vuelta.estado,
    estado_nuevo: estado,
    actor_id: usuario.id,
    ocurrido_en: sello,
    gps: datos.gps ?? null,
    client_uuid: datos.client_uuid ?? null,
  });

  return { vuelta: rows[0] };
}

/**
 * Reprograma a otra fecha. NO mueve la vuelta: cierra la original como
 * 'reprogramada' (sigue visible en su día, con su evidencia y su historial) y
 * crea una hija en la fecha destino con el contador de intento incrementado.
 * Así "3.er intento" es un hecho verificable, no un campo que alguien editó.
 */
export async function reprogramarVuelta(vuelta, datos, usuario) {
  const destino = datos.fecha_destino;
  if (!esFechaValida(destino)) return { error: 'Fecha destino inválida.' };
  if (destino <= vuelta.fecha) return { error: 'La nueva fecha debe ser posterior.' };
  if (!ABIERTOS.includes(vuelta.estado) && vuelta.estado !== 'no_entregada') {
    return { error: `Una vuelta "${vuelta.estado}" ya no se puede reprogramar.` };
  }

  const c = db();

  // Idempotencia: si la cola reenvía, la hija ya existe y la devolvemos.
  if (datos.client_uuid) {
    const { rows } = await c.execute({
      sql: 'SELECT * FROM vueltas WHERE client_uuid = ?',
      args: [datos.client_uuid],
    });
    if (rows[0]) return { vuelta, hija: rows[0], duplicada: true };
  }

  const sello = datos.ocurrido_en ?? new Date().toISOString();

  const { rows: cerrada } = await c.execute({
    sql: `UPDATE vueltas SET estado = 'reprogramada', cerrada_en = ?,
            gps_lat = ?, gps_lng = ?, gps_precision = ?, updated_at = datetime('now')
          WHERE id = ? RETURNING *`,
    args: [sello, datos.gps?.lat ?? null, datos.gps?.lng ?? null,
           datos.gps?.precision ?? null, vuelta.id],
  });

  // La hija hereda todo y arrastra el conteo de intentos.
  const { vuelta: hija } = await crearVuelta({
    client_uuid: datos.client_uuid ?? null,
    fecha: destino,
    origen: vuelta.origen,
    intento: Number(vuelta.intento || 1) + 1,
    vuelta_padre_id: vuelta.id,
    factura_folio: vuelta.factura_folio,
    factura_numero: vuelta.factura_numero,
    cliente_codigo: vuelta.cliente_codigo,
    cliente_nombre: vuelta.cliente_nombre,
    destinatario: vuelta.destinatario,
    contacto: vuelta.contacto,
    telefono: vuelta.telefono,
    direccion: vuelta.direccion,
    notas: vuelta.notas,
    ocurrido_en: sello,
    gps: datos.gps ?? null,
  }, usuario);

  // Las partidas de la factura viajan con la hija.
  await c.execute({
    sql: `INSERT INTO vuelta_partidas (vuelta_id, articulo, descripcion, cantidad, bultos, orden)
          SELECT ?, articulo, descripcion, cantidad, bultos, orden
          FROM vuelta_partidas WHERE vuelta_id = ?`,
    args: [hija.id, vuelta.id],
  });

  await registrarHistorial(c, {
    vuelta_id: vuelta.id,
    evento: 'reprogramada',
    detalle: `a ${destino}${datos.motivo_texto ? ' · ' + datos.motivo_texto : ''}`,
    estado_anterior: vuelta.estado,
    estado_nuevo: 'reprogramada',
    actor_id: usuario.id,
    ocurrido_en: sello,
    gps: datos.gps ?? null,
  });

  return { vuelta: cerrada[0], hija };
}

/** Reordena la ruta del día. Llega el arreglo de ids en el orden deseado. */
export async function reordenar(ids, fecha, usuario) {
  const c = db();
  const soloMias = !esOficina(usuario);
  let n = 0;
  for (const [i, id] of ids.entries()) {
    const r = await c.execute({
      sql: `UPDATE vueltas SET orden = ?, updated_at = datetime('now')
            WHERE id = ? AND fecha = ? ${soloMias ? 'AND chofer_id = ?' : ''}`,
      args: soloMias ? [i, Number(id), fecha, usuario.id] : [i, Number(id), fecha],
    });
    n += r.rowsAffected ?? 0;
  }
  return n;
}
