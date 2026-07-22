// Sincronización de la cola offline (Módulo 7).
//
//   POST /api/sync  { operaciones: [ {...}, ... ] }
//
// El teléfono acumula las acciones del día en su cola local y las manda todas
// juntas al recuperar señal. Tres reglas que sostienen esto:
//
// 1. IDEMPOTENCIA. Cada operación lleva `client_uuid`. Si la respuesta se
//    perdió y el teléfono reintenta, el servidor reconoce el uuid y no duplica.
//    Por eso una operación repetida devuelve "ok", no un error.
//
// 2. NADA DE TODO-O-NADA. Cada operación se resuelve por separado. Que una
//    falle (p. ej. la factura se reasignó a otro chofer) no debe impedir que
//    las otras 19 entregas del día se registren.
//
// 3. CONFLICTOS EXPLÍCITOS. Lo que el servidor rechaza se devuelve con motivo
//    para que la app se lo muestre al chofer y marque la vuelta en revisión,
//    en vez de perder el dato en silencio.
//
// Respuesta:
//   { resultados: [ { client_uuid, ok, estado, vuelta_id?, error? } ], servidor_hora }
import { db, sendJson, sendError, readBody } from './_db.js';
import { requiereSesion } from './_auth.js';
import {
  vueltaDe, crearVuelta, cerrarVuelta, reprogramarVuelta, reordenar,
  registrarHistorial, puedeEditar, ABIERTOS,
} from './_vueltas.js';

const MAX_OPERACIONES = 200;

const EDITABLES = ['cliente_nombre', 'destinatario', 'contacto', 'telefono', 'direccion', 'notas'];

export default async function handler(req, res) {
  const sesion = await requiereSesion(req, res);
  if (!sesion) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendError(res, 'Método no permitido', 405);
  }

  const { operaciones } = readBody(req);
  if (!Array.isArray(operaciones)) return sendError(res, 'Falta el arreglo de operaciones');
  if (operaciones.length > MAX_OPERACIONES) {
    return sendError(res, `Máximo ${MAX_OPERACIONES} operaciones por envío.`, 413);
  }

  const client = db();
  const resultados = [];

  for (const op of operaciones) {
    const uuid = op?.client_uuid ?? null;
    try {
      const r = await aplicar(client, op, sesion);
      resultados.push({ client_uuid: uuid, ok: true, ...r });
    } catch (e) {
      // Un fallo no detiene el resto: se reporta y se sigue.
      resultados.push({
        client_uuid: uuid,
        ok: false,
        conflicto: e.conflicto ?? false,
        error: e.message || 'No se pudo aplicar',
      });
    }
  }

  return sendJson(res, { resultados, servidor_hora: new Date().toISOString() });
}

/** Marca un error como conflicto (la app pondrá la vuelta en revisión). */
function conflicto(mensaje) {
  const e = new Error(mensaje);
  e.conflicto = true;
  return e;
}

async function aplicar(client, op, sesion) {
  const tipo = String(op?.tipo ?? '');

  /* ---- Alta (vuelta manual o escaneada estando ya con señal) ---- */
  if (tipo === 'crear') {
    // Idempotencia ANTES que cualquier validación: si este uuid ya se aplicó,
    // es un reenvío de la cola y debe salir "ok". De lo contrario el reintento
    // chocaría contra la vuelta que él mismo creó y se reportaría como conflicto.
    if (op.client_uuid) {
      const { rows } = await client.execute({
        sql: 'SELECT id FROM vueltas WHERE client_uuid = ?',
        args: [op.client_uuid],
      });
      if (rows[0]) return { estado: 'duplicada', vuelta_id: rows[0].id };
    }

    // Si la factura se la asignaron a otro mientras el chofer iba sin señal,
    // esto es exactamente el conflicto que el Módulo 7 pide notificar.
    if (op.factura_folio) {
      const { rows } = await client.execute({
        sql: `SELECT id, chofer_id FROM vueltas
              WHERE factura_folio = ? AND estado IN ('pendiente','revision') LIMIT 1`,
        args: [String(op.factura_folio).trim()],
      });
      if (rows[0] && Number(rows[0].chofer_id) !== Number(sesion.id)) {
        throw conflicto('Esa factura quedó asignada a otro chofer.');
      }
    }
    const { vuelta, duplicada } = await crearVuelta(op, sesion);
    return { estado: duplicada ? 'duplicada' : 'creada', vuelta_id: vuelta.id };
  }

  /* ---- Reordenar la ruta: opera sobre el DÍA, no sobre una vuelta ---- */
  // Va antes de exigir vuelta_id, precisamente porque no lleva uno.
  if (tipo === 'reordenar') {
    if (!Array.isArray(op.ids) || !op.fecha) throw new Error('Reorden inválido');
    const n = await reordenar(op.ids, op.fecha, sesion);
    return { estado: 'reordenada', actualizadas: n };
  }

  /* ---- Todo lo demás opera sobre una vuelta existente ---- */
  const vueltaId = Number(op?.vuelta_id);
  if (!Number.isFinite(vueltaId)) throw new Error('Falta vuelta_id');

  const vuelta = await vueltaDe(vueltaId, sesion);
  if (!vuelta) throw conflicto('La vuelta ya no está asignada a ti.');

  if (!puedeEditar(vuelta, { desdeCola: true })) {
    throw conflicto('Esa vuelta pertenece a un día ya cerrado.');
  }

  if (tipo === 'entregar' || tipo === 'no_entregar') {
    const r = await cerrarVuelta(vuelta, {
      ...op,
      estado: tipo === 'entregar' ? 'entregada' : 'no_entregada',
    }, sesion);
    if (r.error) throw conflicto(r.error);
    return { estado: r.sinCambio ? 'duplicada' : 'cerrada', vuelta_id: vueltaId };
  }

  if (tipo === 'reprogramar') {
    const r = await reprogramarVuelta(vuelta, op, sesion);
    if (r.error) throw conflicto(r.error);
    return { estado: r.duplicada ? 'duplicada' : 'reprogramada', vuelta_id: vueltaId, hija_id: r.hija?.id };
  }

  if (tipo === 'editar') {
    if (!ABIERTOS.includes(vuelta.estado)) throw conflicto('La vuelta ya está cerrada.');
    const campos = EDITABLES.filter((c) => c in op);
    if (!campos.length) return { estado: 'sin_cambio', vuelta_id: vueltaId };
    await client.execute({
      sql: `UPDATE vueltas SET ${campos.map((c) => `${c} = ?`).join(', ')},
              updated_at = datetime('now') WHERE id = ?`,
      args: [...campos.map((c) => op[c] ?? null), vueltaId],
    });
    await registrarHistorial(client, {
      vuelta_id: vueltaId, evento: 'editada', detalle: `campos: ${campos.join(', ')}`,
      actor_id: sesion.id, ocurrido_en: op.ocurrido_en ?? null, gps: op.gps ?? null,
      client_uuid: op.client_uuid ?? null,
    });
    return { estado: 'editada', vuelta_id: vueltaId };
  }

  if (tipo === 'evidencia') {
    if (!op.url || !['foto', 'firma'].includes(op.tipo_evidencia)) {
      throw new Error('Evidencia inválida');
    }
    await client.execute({
      sql: `INSERT INTO vuelta_evidencias (client_uuid, vuelta_id, tipo, url, ocurrido_en)
            VALUES (?,?,?,?,?)
            ON CONFLICT(client_uuid) DO NOTHING`,
      args: [op.client_uuid ?? null, vueltaId, op.tipo_evidencia, op.url,
             op.ocurrido_en ?? new Date().toISOString()],
    });
    return { estado: 'evidencia', vuelta_id: vueltaId };
  }

  throw new Error(`Operación desconocida: ${tipo}`);
}
