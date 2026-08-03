import { reactive } from 'vue';

// Estado compartido entre pantallas.
export const store = reactive({
  // Sesión. `usuario` sale del servidor (cookie HttpOnly), nunca se inventa aquí.
  usuario: null,
  autenticado: false,
  comprobandoSesion: true,

  // Catálogo de usuarios (para asignar / elegir personas en los módulos).
  usuarios: [],

  // Motivos de no entrega (Módulo 5). Se cargan una vez al abrir la app y se
  // quedan en memoria: si no, un chofer sin señal no podría ni abrir el
  // diálogo de "no entregada" la primera vez.
  motivos: [],

  // Contador que las pantallas observan para recargar datos.
  tick: 0,

  // Cola offline (Módulo 7): lo actualiza cola.js, lo lee el badge global.
  pendientesSync: 0,
  sinConexion: typeof navigator !== 'undefined' ? !navigator.onLine : false,

  // Refleja el día que se está viendo en Mis vueltas: la pastilla de
  // navegación lo usa para atenuar "Nueva" en un día pasado (sólo consulta).
  soloLectura: false,
});

export function refrescar() {
  store.tick += 1;
}

export function setUsuarios(lista) {
  store.usuarios = lista;
}

export function setMotivos(lista) {
  store.motivos = lista;
}

export function setSesion(usuario) {
  store.usuario = usuario;
  store.autenticado = !!usuario;
}

/** Limpia el estado local. La cookie la borra el servidor en /api/auth/salir. */
export function limpiarSesion() {
  store.usuario = null;
  store.autenticado = false;
  store.usuarios = [];
  cachearSesion(null);
}

/* Recordamos el último correo para que el chofer no lo teclee cada vez.
   Es sólo una comodidad: sin el código que llega al correo no da acceso a nada. */
const CLAVE_EMAIL = 'inovatrack_ultimo_email';
export const ultimoEmail = () => {
  try { return localStorage.getItem(CLAVE_EMAIL) || ''; } catch { return ''; }
};
export const recordarEmail = (email) => {
  try { localStorage.setItem(CLAVE_EMAIL, email); } catch { /* modo privado */ }
};

/**
 * Última sesión válida, para abrir la app sin red. La cookie HttpOnly sigue
 * siendo la que autoriza de verdad: esto sólo evita expulsar al login a un
 * chofer sin señal cuando /api/auth/yo no pudo ni intentarse (Módulo 7). Si el
 * servidor sí responde y dice 401, la sesión se cierra igual.
 */
const CLAVE_SESION = 'inovatrack_ultima_sesion';
export const sesionCacheada = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); } catch { return null; }
};
export const cachearSesion = (usuario) => {
  try {
    if (usuario) localStorage.setItem(CLAVE_SESION, JSON.stringify(usuario));
    else localStorage.removeItem(CLAVE_SESION);
  } catch { /* modo privado */ }
};
