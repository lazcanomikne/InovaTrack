// Detalle y ciclo de vida de una vuelta.
//
//   GET   /api/vueltas/:id                    → detalle completo
//   PATCH /api/vueltas/:id                    → editar campos (solo si está abierta)
//   POST  /api/vueltas/:id  { accion: ... }   → transiciones y evidencias
//
// Acciones del POST:
//   entregar     { recibio_nombre?, ocurrido_en?, gps? }
//   no_entregar  { motivo_clave, motivo_texto?, ocurrido_en?, gps? }
//   reprogramar  { fecha_destino, motivo_texto?, ocurrido_en?, gps?, client_uuid? }
//   evidencia    { tipo: 'foto'|'firma', url, ocurrido_en?, client_uuid? }
import { db, sendJson, sendError, readBody } from '../_db.js';
import { requiereSesion } from '../_auth.js';
import {
  vueltaDe, detalleVuelta, puedeEditar, cerrarVuelta, reprogramarVuelta,
  registrarHistorial, ABIERTOS,
} from '../_vueltas.js';

// Campos que el chofer puede corregir mientras la vuelta siga abierta (Módulo 5).
const EDITABLES = ['cliente_nombre', 'destinatario', 'contacto', 'telefono', 'direccion', 'notas'];

export default async function handler(req, res) {
  const sesion = await requiereSesion(req, res);
  if (!sesion) return;

  const id = Number(req.query?.id);
  if (!Number.isFinite(id)) return sendError(res, 'Id inválido');

  const client = db();

  /* ------------------------------- GET ------------------------------- */
  if (req.method === 'GET') {
    const v = await detalleVuelta(id, sesion);
    if (!v) return sendError(res, 'No encontrada', 404);
    return sendJson(res, v);
  }

  const vuelta = await vueltaDe(id, sesion);
  if (!vuelta) return sendError(res, 'No encontrada', 404);

  /* ------------------------------ PATCH ------------------------------ */
  if (req.method === 'PATCH') {
    const b = readBody(req);
    if (!ABIERTOS.includes(vuelta.estado)) {
      return sendError(res, 'Una vuelta ya cerrada no se edita.', 409);
    }
    if (!puedeEditar(vuelta, { desdeCola: !!b.desde_cola })) {
      return sendError(res, 'Los días pasados son solo de consulta.', 403);
    }

    const campos = EDITABLES.filter((c) => c in b);
    if (!campos.length) return sendError(res, 'Nada que actualizar');

    const { rows } = await client.execute({
      sql: `UPDATE vueltas SET ${campos.map((c) => `${c} = ?`).join(', ')},
              updated_at = datetime('now')
            WHERE id = ? RETURNING *`,
      args: [...campos.map((c) => b[c] ?? null), id],
    });

    await registrarHistorial(client, {
      vuelta_id: id,
      evento: 'editada',
      detalle: `campos: ${campos.join(', ')}`,
      actor_id: sesion.id,
      ocurrido_en: b.ocurrido_en ?? null,
      gps: b.gps ?? null,
      client_uuid: b.client_uuid ?? null,
    });

    return sendJson(res, { vuelta: rows[0] });
  }

  /* ------------------------------- POST ------------------------------ */
  if (req.method === 'POST') {
    const b = readBody(req);
    const accion = String(b.accion ?? '');

    if (!puedeEditar(vuelta, { desdeCola: !!b.desde_cola })) {
      return sendError(res, 'Los días pasados son solo de consulta.', 403);
    }

    if (accion === 'entregar' || accion === 'no_entregar') {
      const r = await cerrarVuelta(vuelta, {
        ...b,
        estado: accion === 'entregar' ? 'entregada' : 'no_entregada',
      }, sesion);
      if (r.error) return sendError(res, r.error, 409);
      return sendJson(res, { vuelta: r.vuelta, sin_cambio: !!r.sinCambio });
    }

    if (accion === 'reprogramar') {
      const r = await reprogramarVuelta(vuelta, b, sesion);
      if (r.error) return sendError(res, r.error, 409);
      return sendJson(res, { vuelta: r.vuelta, hija: r.hija, duplicada: !!r.duplicada });
    }

    if (accion === 'evidencia') {
      if (!b.url || !['foto', 'firma'].includes(b.tipo)) {
        return sendError(res, 'Evidencia inválida');
      }
      // ON CONFLICT: si la cola reenvía la misma foto, no se duplica.
      await client.execute({
        sql: `INSERT INTO vuelta_evidencias (client_uuid, vuelta_id, tipo, url, ocurrido_en)
              VALUES (?,?,?,?,?)
              ON CONFLICT(client_uuid) DO NOTHING`,
        args: [b.client_uuid ?? null, id, b.tipo, b.url, b.ocurrido_en ?? new Date().toISOString()],
      });
      const { rows } = await client.execute({
        sql: 'SELECT * FROM vuelta_evidencias WHERE vuelta_id = ? ORDER BY id',
        args: [id],
      });
      return sendJson(res, { evidencias: rows }, 201);
    }

    return sendError(res, `Acción desconocida: ${accion}`);
  }

  res.setHeader('Allow', 'GET, PATCH, POST');
  return sendError(res, 'Método no permitido', 405);
}
