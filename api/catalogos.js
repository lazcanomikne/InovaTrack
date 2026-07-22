// Catálogos que la app descarga y guarda localmente para operar sin señal.
//
//   GET /api/catalogos  → { motivos, choferes?, config }
import { db, sendJson, sendError } from './_db.js';
import { requiereSesion } from './_auth.js';
import { esOficina } from './_vueltas.js';
import { SAP_ES_STUB } from './_sap.js';

export default async function handler(req, res) {
  const sesion = await requiereSesion(req, res);
  if (!sesion) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 'Método no permitido', 405);
  }

  const client = db();

  const { rows: motivos } = await client.execute(
    'SELECT clave, texto, pide_texto, orden FROM motivos_no_entrega WHERE activo = 1 ORDER BY orden'
  );

  // La oficina necesita la lista de choferes para reasignar (fase 2).
  let choferes = [];
  if (esOficina(sesion)) {
    const r = await client.execute(
      "SELECT id, nombre, vehiculo, ruta FROM usuarios WHERE rol = 'chofer' AND activo = 1 ORDER BY nombre"
    );
    choferes = r.rows;
  }

  return sendJson(res, {
    motivos,
    choferes,
    config: {
      // Evidencia configurable por instalación (Módulo 5). Hoy opcional.
      evidencia_obligatoria: false,
      firma_obligatoria: false,
      sap_stub: SAP_ES_STUB,
    },
  });
}
