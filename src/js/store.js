import { reactive } from 'vue';

// Estado compartido entre pantallas.
export const store = reactive({
  // Sesión. `usuario` sale del servidor (cookie HttpOnly), nunca se inventa aquí.
  usuario: null,
  autenticado: false,
  comprobandoSesion: true,

  // Catálogo de usuarios (para asignar / elegir personas en los módulos).
  usuarios: [],

  // Contador que las pantallas observan para recargar datos.
  tick: 0,
});

export function refrescar() {
  store.tick += 1;
}

export function setUsuarios(lista) {
  store.usuarios = lista;
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
}

/* Recordamos el último correo para ofrecer Face ID directo la próxima vez.
   Es sólo una comodidad: no da acceso a nada por sí solo. */
const CLAVE_EMAIL = 'inovatrack_ultimo_email';
export const ultimoEmail = () => {
  try { return localStorage.getItem(CLAVE_EMAIL) || ''; } catch { return ''; }
};
export const recordarEmail = (email) => {
  try { localStorage.setItem(CLAVE_EMAIL, email); } catch { /* modo privado */ }
};
