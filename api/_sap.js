// Consulta de facturas en SAP a partir del valor del código de barras.
//
// Se conecta al puente externo de Inovatech (una API sobre SAP Business One),
// leyendo la URL base y la llave de las variables de entorno SAP_API_URL y
// SAP_API_KEY. Si no están configuradas, `buscarFactura` cae a datos de demo
// (`buscarFacturaDemo`) para no romper el desarrollo local. La llave NUNCA se
// guarda en el repo: sólo en el entorno (Vercel / .env).
//
// OJO — DocEntry vs folio: el puente identifica la factura por DocEntry (la
// PK interna del documento en SAP, p. ej. 27322), que NO es el folio impreso
// (DocNum, p. ej. 38223). El código de barras de la factura debe codificar el
// DocEntry para que el escaneo resuelva; si codificara el folio, el puente
// respondería 404.
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

// ── API real (Inovatech) ────────────────────────────────────────────────
// El puente de SAP expone la factura por DocEntry (la PK interna del
// documento, p. ej. 27322), NO por el folio impreso (DocNum, p. ej. 38223).
// El valor que escanea/teclea el chofer se manda tal cual como DocEntry.
// La URL base y la llave viven en variables de entorno: la llave nunca va en
// el repo. Si faltan, se cae al stub para no romper el dev local.
const SAP_API_URL = process.env.SAP_API_URL || '';   // .../api/externa
const SAP_API_KEY = process.env.SAP_API_KEY || '';

/** Bandera para que la UI avise cuando aún no hay SAP real conectado. */
export const SAP_ES_STUB = !(SAP_API_URL && SAP_API_KEY);

// Crystal Reports mete saltos "\r" y espacios dobles en el texto de dirección.
const limpiar = (s) => (s ? String(s).replace(/\s*[\r\n]+\s*/g, ', ').replace(/\s{2,}/g, ' ').replace(/(,\s*)+/g, ', ').replace(/^,\s*|,\s*$/g, '').trim() : null);

// Traduce la respuesta del puente al contrato que ya usa la app.
function mapearFactura(d) {
  const f = d.factura ?? {};
  const c = d.cliente ?? {};
  const ct = d.contacto ?? {};
  const ent = d.direccionEntrega ?? {};
  return {
    // factura_numero muestra el folio humano; el DocEntry queda como referencia.
    factura_numero: String(f.folio ?? f.docEntry ?? ''),
    doc_entry: f.docEntry ?? null,
    cliente_codigo: c.codigo ?? null,
    cliente_nombre: c.nombre ?? null,
    destinatario: null,
    contacto: ct.nombre ?? null,
    telefono: c.telefono || c.celular || ct.telefono || ct.celular || null,
    // La entrega va a la dirección de ENTREGA, no a la fiscal.
    direccion: limpiar(ent.texto) || limpiar([ent.calle, ent.colonia, ent.ciudad, ent.estado].filter(Boolean).join(', ')),
    partidas: (d.articulos ?? []).map((a) => ({
      articulo: a.codigo ?? null,
      descripcion: a.descripcion ?? null,
      cantidad: a.cantidad ?? null,
      bultos: null, // el puente no reporta bultos
    })),
  };
}

export async function buscarFactura(folio) {
  const f = String(folio ?? '').trim();
  if (!f) return null;
  if (SAP_ES_STUB) return buscarFacturaDemo(f);

  try {
    const r = await fetch(`${SAP_API_URL.replace(/\/$/, '')}/factura/${encodeURIComponent(f)}`, {
      headers: { 'X-API-Key': SAP_API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 404) return null;                 // no existe → captura manual
    if (!r.ok) throw new Error(`SAP respondió ${r.status}`);
    const d = await r.json();
    // Una factura cancelada no se entrega: se trata como no encontrada.
    if (d?.factura?.cancelada) return null;
    return mapearFactura(d);
  } catch {
    // Sin alcance al puente (red/timeout): mejor ofrecer captura manual que
    // reventar el escaneo. El chofer sigue trabajando.
    return null;
  }
}

// Stub sólo para dev local sin las variables de entorno. Cualquier folio que
// empiece con "0" simula "no encontrada" para poder probar ese camino.
function buscarFacturaDemo(f) {
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
  return { factura_numero: `F-${f}`, ...cliente, partidas, _stub: true };
}
