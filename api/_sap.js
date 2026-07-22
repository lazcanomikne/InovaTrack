// Consulta de facturas en SAP a partir del folio del código de barras.
//
// ─────────────────────────────────────────────────────────────────────────
// FASE 1: STUB. Devuelve datos simulados.
//
// Por qué: el SAP Business One de Inovatech vive en una IP privada de la red
// local (172.28.x.x:1433). Una función serverless de Vercel NO puede alcanzarla:
// no es enrutable desde internet. Conectar de verdad exige una de estas dos:
//
//   a) Un puente en la red local que lea SAP y empuje las facturas del día a
//      la base de la app (con X-Service-Token, igual que el portal de escritorio).
//      Entonces `buscarFactura` consulta la tabla local en vez de SAP. ← recomendado
//   b) Un túnel HTTPS (Cloudflare Tunnel) a un endpoint de solo lectura sobre
//      SAP, y aquí se haría un fetch a ese endpoint.
//
// Cuando se decida, se reemplaza SOLO el cuerpo de `buscarFactura`. El resto
// de la app no cambia: ya trabaja contra este contrato.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Contrato que el resto de la app espera:
 *
 *   {
 *     factura_numero, cliente_codigo, cliente_nombre, destinatario,
 *     contacto, telefono, direccion,
 *     partidas: [{ articulo, descripcion, cantidad, bultos }]
 *   }
 *
 * Devuelve null si el folio no existe (la app ofrecerá captura manual).
 */

const CLIENTES_DEMO = [
  {
    cliente_codigo: 'C-1001', cliente_nombre: 'Abarrotes La Central',
    destinatario: 'Sucursal Matriz', contacto: 'Rosa Medina', telefono: '8112345678',
    direccion: 'Av. Colón 1520, Centro, Monterrey, N.L.',
  },
  {
    cliente_codigo: 'C-1002', cliente_nombre: 'Ferretería El Tornillo',
    destinatario: 'Bodega Norte', contacto: 'Miguel Ángel Ruiz', telefono: '8187654321',
    direccion: 'Carr. Miguel Alemán km 12, Apodaca, N.L.',
  },
  {
    cliente_codigo: 'C-1003', cliente_nombre: 'Comercializadora del Valle',
    destinatario: 'Almacén San Nicolás', contacto: 'Laura Treviño', telefono: '8199887766',
    direccion: 'Av. Universidad 300, San Nicolás de los Garza, N.L.',
  },
  {
    cliente_codigo: 'C-1004', cliente_nombre: 'Distribuidora Peña',
    destinatario: 'Tienda Guadalupe', contacto: 'Jorge Peña', telefono: '8155443322',
    direccion: 'Calle Pablo Livas 890, Guadalupe, N.L.',
  },
];

const ARTICULOS_DEMO = [
  { articulo: 'ART-100', descripcion: 'Caja de tornillos 1/4" (100 pz)' },
  { articulo: 'ART-215', descripcion: 'Rollo de cable calibre 12' },
  { articulo: 'ART-330', descripcion: 'Cubeta de pintura vinílica 19 L' },
  { articulo: 'ART-412', descripcion: 'Juego de brocas para concreto' },
  { articulo: 'ART-587', descripcion: 'Bulto de cemento gris 50 kg' },
];

/** Hash estable: el mismo folio devuelve siempre la misma factura simulada. */
function semilla(texto) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h;
}

export async function buscarFactura(folio) {
  const f = String(folio ?? '').trim();
  if (!f) return null;

  // Convención del stub para poder probar el camino de error desde la app:
  // cualquier folio que empiece con "0" se comporta como "no encontrada".
  if (f.startsWith('0')) return null;

  const s = semilla(f);
  const cliente = CLIENTES_DEMO[s % CLIENTES_DEMO.length];
  const nPartidas = (s % 4) + 1;

  const partidas = Array.from({ length: nPartidas }, (_, i) => {
    const a = ARTICULOS_DEMO[(s + i * 7) % ARTICULOS_DEMO.length];
    return {
      articulo: a.articulo,
      descripcion: a.descripcion,
      cantidad: ((s + i * 13) % 9) + 1,
      bultos: ((s + i * 5) % 3) + 1,
    };
  });

  return {
    factura_numero: `F-${f}`,
    ...cliente,
    partidas,
    _stub: true, // la app lo muestra como "datos de prueba"
  };
}

/** Bandera para que la UI pueda avisar que aún no hay SAP real conectado. */
export const SAP_ES_STUB = true;
