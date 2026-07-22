// Lógica de presentación de las vueltas: estados, fechas y textos.
// Las REGLAS viven en el servidor (api/_vueltas.js); aquí sólo se pinta.

export const ESTADOS = {
  pendiente:    { texto: 'Pendiente',    color: '#5b5bd6', icono: 'circle' },
  revision:     { texto: 'En revisión',  color: '#ff9f0a', icono: 'exclamationmark_triangle_fill' },
  entregada:    { texto: 'Entregada',    color: '#30d158', icono: 'checkmark_circle_fill' },
  no_entregada: { texto: 'No entregada', color: '#ff453a', icono: 'xmark_circle_fill' },
  reprogramada: { texto: 'Reprogramada', color: '#8e8e93', icono: 'arrow_uturn_right_circle_fill' },
};

export const estadoInfo = (e) => ESTADOS[e] ?? ESTADOS.pendiente;
export const estaAbierta = (v) => v.estado === 'pendiente' || v.estado === 'revision';

/** 3 o más intentos = crítica (Módulo 5). */
export const esCritica = (v) => Number(v.intento || 1) >= 3;

/* ------------------------------- Fechas ------------------------------- */
// Todo se maneja como 'YYYY-MM-DD' en hora de México, igual que el servidor.
const TZ = 'America/Mexico_City';

export function hoy() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d) + dias * 86400000).toISOString().slice(0, 10);
}

/** Diferencia en días entre dos fechas 'YYYY-MM-DD'. */
export function difDias(desde, hasta) {
  const p = (f) => { const [a, m, d] = f.split('-').map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((p(hasta) - p(desde)) / 86400000);
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Partes de una fecha para la barra de días: { dia: '05', semana: 'mar' } */
export function partesFecha(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return {
    dia: String(d).padStart(2, '0'),
    semana: DIAS[dt.getUTCDay()],
    mes: MESES[m - 1],
    anio: a,
  };
}

/** "Hoy", "Mañana", "Ayer" o "mar 05 de jul". */
export function etiquetaFecha(fecha, base = hoy()) {
  const d = difDias(base, fecha);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d === -1) return 'Ayer';
  const p = partesFecha(fecha);
  return `${p.semana} ${p.dia} de ${p.mes}`;
}

/** Hora corta a partir de un ISO (usa el sello del dispositivo). */
export function horaCorta(iso) {
  if (!iso) return '';
  const dt = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(dt);
}

/* ------------------------------- Textos ------------------------------- */
/** Título de la tarjeta: lo más útil para reconocer al cliente de un vistazo. */
export const tituloVuelta = (v) =>
  v.cliente_nombre || v.destinatario || v.factura_numero || 'Sin cliente';

/** Dirección recortada para la tarjeta. */
export function direccionCorta(dir, max = 48) {
  if (!dir) return 'Sin dirección';
  const d = String(dir).trim();
  return d.length > max ? d.slice(0, max - 1) + '…' : d;
}

/* --------------------------- Enlaces externos ------------------------- */
export const soloDigitos = (tel) => String(tel ?? '').replace(/\D/g, '');

export function enlaceLlamada(tel) {
  const t = soloDigitos(tel);
  return t ? `tel:${t}` : null;
}

export function enlaceWhatsApp(tel) {
  let t = soloDigitos(tel);
  if (!t) return null;
  if (t.length === 10) t = '52' + t;      // México sin lada de país
  return `https://wa.me/${t}`;
}

/** Mapas: en iPhone abre Apple Maps / Google Maps según lo que tenga. */
export function enlaceMapa(direccion) {
  if (!direccion) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
}

/* ------------------------------- Búsqueda ----------------------------- */
const normalizar = (s) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Busca el texto en cualquier campo relevante de la vuelta (Módulo 8). */
export function coincide(v, texto) {
  const q = normalizar(texto).trim();
  if (!q) return true;
  const campos = [
    v.cliente_nombre, v.destinatario, v.direccion, v.contacto, v.telefono,
    v.factura_folio, v.factura_numero, v.notas, v.cliente_codigo,
  ];
  return campos.some((c) => normalizar(c).includes(q));
}
