// Apariencia de la app en tres dimensiones independientes que se combinan:
//   - TEMÁTICA:  figuras de fondo (perritos, cómputo, mundial, F1, o ninguna).
//   - COLOR:     la paleta de acento y el aurora (Aurora multicolor, varios colores, negro).
//   - APARIENCIA: claro / oscuro / automático (sigue al sistema).
// Las tres son preferencia LOCAL (por dispositivo): se guardan en localStorage y
// se aplican con data-tematica / data-color / la clase .dark en <html>; el CSS
// hace el resto.

export const TEMATICAS = [
  { id: 'ninguna', nombre: 'Sin temática', emoji: '🚫' },
  { id: 'perritos', nombre: 'Perritos', emoji: '🐶' },
  { id: 'computo', nombre: 'Equipo de cómputo', emoji: '💻' },
  { id: 'mundial', nombre: 'Fútbol', emoji: '⚽' },
  { id: 'f1', nombre: 'Fórmula 1', emoji: '🏁' },
];

// c1/c2 = acento; muestra = cómo se pinta el círculo del selector.
export const COLORES = [
  { id: 'aurora', nombre: 'Aurora', c1: '#5b5bd6', muestra: 'conic-gradient(from 210deg, #5b5bd6, #ec4899, #ff9f43, #22c993, #5b5bd6)' },
  { id: 'indigo', nombre: 'Índigo', c1: '#5b5bd6', muestra: 'linear-gradient(135deg,#5b5bd6,#7c6cf0)' },
  { id: 'azul', nombre: 'Azul', c1: '#2563eb', muestra: 'linear-gradient(135deg,#2563eb,#4f8cff)' },
  { id: 'turquesa', nombre: 'Turquesa', c1: '#0891b2', muestra: 'linear-gradient(135deg,#0891b2,#22d3ee)' },
  { id: 'esmeralda', nombre: 'Esmeralda', c1: '#0ea472', muestra: 'linear-gradient(135deg,#0ea472,#22c993)' },
  { id: 'atardecer', nombre: 'Atardecer', c1: '#f2603a', muestra: 'linear-gradient(135deg,#f2603a,#ff9f43)' },
  { id: 'rosa', nombre: 'Rosa', c1: '#ec4899', muestra: 'linear-gradient(135deg,#ec4899,#f472b6)' },
  { id: 'grafito', nombre: 'Negro', c1: '#3f3f46', muestra: 'linear-gradient(135deg,#26262b,#52525b)' },
];

export const APARIENCIAS = [
  { id: 'auto', nombre: 'Automático', emoji: '🌗' },
  { id: 'claro', nombre: 'Claro', emoji: '☀️' },
  { id: 'oscuro', nombre: 'Oscuro', emoji: '🌙' },
];

const K_TEMATICA = 'inovatrack_tematica';
const K_COLOR = 'inovatrack_color';
const K_APARIENCIA = 'inovatrack_apariencia';

export function tematicaActual() {
  const id = localStorage.getItem(K_TEMATICA);
  return TEMATICAS.some((t) => t.id === id) ? id : 'ninguna';
}
export function colorActual() {
  const id = localStorage.getItem(K_COLOR);
  return COLORES.some((c) => c.id === id) ? id : 'aurora';
}

export function aplicarTematica(id) {
  const t = TEMATICAS.find((x) => x.id === id) || TEMATICAS[0];
  document.documentElement.dataset.tematica = t.id;
  localStorage.setItem(K_TEMATICA, t.id);
}
export function aplicarColor(id) {
  const c = COLORES.find((x) => x.id === id) || COLORES[0];
  document.documentElement.dataset.color = c.id;
  localStorage.setItem(K_COLOR, c.id);
  pintarBarraEstado();
}

/* ---------------------------- Apariencia ---------------------------- */
export function aparienciaActual() {
  const id = localStorage.getItem(K_APARIENCIA);
  return APARIENCIAS.some((a) => a.id === id) ? id : 'auto';
}

const consultaOscuro = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** ¿Toca pintar oscuro ahora mismo? Resuelve 'auto' contra el sistema. */
export function esOscuro() {
  const a = aparienciaActual();
  if (a === 'oscuro') return true;
  if (a === 'claro') return false;
  return !!consultaOscuro()?.matches;
}

// La barra de estado del teléfono se tiñe del acento en claro, pero en oscuro
// tiene que igualar al fondo o queda una franja de color sobre la app negra.
function pintarBarraEstado() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const c = COLORES.find((x) => x.id === colorActual()) || COLORES[0];
  meta.setAttribute('content', esOscuro() ? '#0b0b13' : c.c1);
}

// Framework7 también cuelga sus estilos oscuros de .dark, así que la misma
// clase viste sus componentes (navbar, listas, diálogos) y los nuestros.
// `alF7` lo inyecta App.vue para mantener sincronizado su propio darkMode.
let alF7 = null;
export function conectarF7(fn) { alF7 = fn; }

export function aplicarApariencia(id) {
  const a = APARIENCIAS.find((x) => x.id === id) || APARIENCIAS[0];
  localStorage.setItem(K_APARIENCIA, a.id);
  document.documentElement.dataset.apariencia = a.id;
  const oscuro = esOscuro();
  document.documentElement.classList.toggle('dark', oscuro);
  pintarBarraEstado();
  alF7?.(oscuro);
}

export function iniciarTema() {
  aplicarTematica(tematicaActual());
  aplicarApariencia(aparienciaActual());
  aplicarColor(colorActual());
  // En 'auto', seguir al sistema si cambia con la app abierta (anochecer).
  consultaOscuro()?.addEventListener('change', () => {
    if (aparienciaActual() === 'auto') aplicarApariencia('auto');
  });
}
