// Vueltas: listado del día, carga del calendario, escaneo y alta.
//
//   GET  /api/vueltas?fecha=YYYY-MM-DD        → vueltas del día + contadores
//   GET  /api/vueltas?desde=...&hasta=...     → carga por día (barra de calendario)
//   GET  /api/vueltas?folio=XXX               → consulta SAP + validaciones de escaneo
//   POST /api/vueltas                         → alta (escaneada o manual)
//   PATCH /api/vueltas  { fecha, ids: [] }    → reordenar la ruta del día
import { db, sendJson, sendError, readBody } from '../_db.js';
import { requiereSesion } from '../_auth.js';
import {
  hoyMx, esFechaValida, sumarDias, vueltasDelDia, contar, cargaPorDia,
  crearVuelta, reordenar, esOficina,
} from '../_vueltas.js';
import { buscarFactura, SAP_ES_STUB } from '../_sap.js';

export default async function handler(req, res) {
  const sesion = await requiereSesion(req, res);
  if (!sesion) return;
  const client = db();

  /* ------------------------------- GET ------------------------------- */
  if (req.method === 'GET') {
    const { fecha, desde, hasta, folio } = req.query ?? {};

    // ── Escaneo: resolver folio y validar antes de crear nada ──
    if (folio) {
      const f = String(folio).trim();

      // ¿Ya está en la ruta de alguien? (Módulo 2: validaciones al escanear)
      const { rows } = await client.execute({
        sql: `SELECT v.id, v.fecha, v.estado, v.chofer_id, u.nombre AS chofer
              FROM vueltas v LEFT JOIN usuarios u ON u.id = v.chofer_id
              WHERE v.factura_folio = ?
              ORDER BY v.id DESC LIMIT 1`,
        args: [f],
      });
      const previa = rows[0];

      if (previa) {
        const mia = Number(previa.chofer_id) === Number(sesion.id);
        if (previa.estado === 'entregada') {
          return sendJson(res, {
            ok: false, motivo: 'entregada',
            mensaje: `Esa factura ya fue entregada el ${previa.fecha}.`,
            vuelta_id: previa.id,
          });
        }
        if (['pendiente', 'revision'].includes(previa.estado)) {
          return sendJson(res, {
            ok: false,
            motivo: mia ? 'ya_en_mi_ruta' : 'otro_chofer',
            mensaje: mia
              ? `Ya está en tu ruta del ${previa.fecha}.`
              : `Ya está asignada a ${previa.chofer ?? 'otro chofer'} (${previa.fecha}).`,
            vuelta_id: previa.id,
          });
        }
        // no_entregada o reprogramada: se permite volver a escanear.
      }

      const factura = await buscarFactura(f);
      if (!factura) {
        return sendJson(res, {
          ok: false, motivo: 'no_encontrada',
          mensaje: 'No se encontró esa factura. Puedes capturarla como vuelta manual.',
        });
      }
      return sendJson(res, { ok: true, factura, sap_stub: SAP_ES_STUB });
    }

    // ── Carga por día para la barra de calendario ──
    if (desde && hasta) {
      if (!esFechaValida(desde) || !esFechaValida(hasta)) return sendError(res, 'Fechas inválidas');
      return sendJson(res, { carga: await cargaPorDia(sesion, desde, hasta) });
    }

    // ── Vueltas de un día ──
    const dia = esFechaValida(fecha) ? fecha : hoyMx();
    const vueltas = await vueltasDelDia(sesion, dia);
    return sendJson(res, {
      fecha: dia,
      hoy: hoyMx(),
      solo_lectura: dia < hoyMx(),   // días pasados: consulta (Módulo 6)
      vueltas,
      contadores: contar(vueltas),
    });
  }

  /* ------------------------------- POST ------------------------------ */
  if (req.method === 'POST') {
    const b = readBody(req);

    // Manual exige al menos cliente o descripción (Módulo 3).
    if (b.origen === 'manual' && !String(b.cliente_nombre ?? '').trim()) {
      return sendError(res, 'Escribe el cliente o una descripción.');
    }

    // IDEMPOTENCIA PRIMERO. Si este client_uuid ya se aplicó, es un reenvío de
    // la cola (se perdió la respuesta, no la petición): hay que devolver la
    // vuelta existente. Si se validara antes el duplicado de factura, el
    // reintento chocaría contra su propia vuelta y daría 409 en vez de éxito.
    if (b.client_uuid) {
      const { rows } = await client.execute({
        sql: 'SELECT * FROM vueltas WHERE client_uuid = ?',
        args: [b.client_uuid],
      });
      if (rows[0]) return sendJson(res, { vuelta: rows[0], duplicada: true });
    }

    // Escaneada: no permitir duplicar una factura viva.
    if (b.factura_folio) {
      const { rows } = await client.execute({
        sql: `SELECT id, chofer_id, fecha FROM vueltas
              WHERE factura_folio = ? AND estado IN ('pendiente','revision')
              LIMIT 1`,
        args: [String(b.factura_folio).trim()],
      });
      if (rows[0]) {
        const mia = Number(rows[0].chofer_id) === Number(sesion.id);
        return sendError(
          res,
          mia ? `Esa factura ya está en tu ruta del ${rows[0].fecha}.`
              : 'Esa factura ya está asignada a otro chofer.',
          409
        );
      }
    }

    const { vuelta, duplicada } = await crearVuelta(b, sesion);
    return sendJson(res, { vuelta, duplicada }, duplicada ? 200 : 201);
  }

  /* ------------------------------ PATCH ------------------------------ */
  // Reordenar la ruta del día (arrastre). Persiste el orden (Módulo 4).
  if (req.method === 'PATCH') {
    const { fecha, ids } = readBody(req);
    if (!esFechaValida(fecha)) return sendError(res, 'Fecha inválida');
    if (!Array.isArray(ids) || !ids.length) return sendError(res, 'Falta el orden');
    if (fecha < hoyMx() && !esOficina(sesion)) {
      return sendError(res, 'Los días pasados son solo de consulta.', 403);
    }
    const n = await reordenar(ids, fecha, sesion);
    return sendJson(res, { ok: true, actualizadas: n });
  }

  res.setHeader('Allow', 'GET, POST, PATCH');
  return sendError(res, 'Método no permitido', 405);
}
