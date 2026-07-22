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

/* Recordamos el último usuario para que el chofer no lo teclee cada vez.
   Es sólo una comodidad: sin la contraseña no da acceso a nada. */
const CLAVE_USUARIO = 'inovatrack_ultimo_usuario';
export const ultimoUsuario = () => {
  try { return localStorage.getItem(CLAVE_USUARIO) || ''; } catch { return ''; }
};
export const recordarUsuario = (usuario) => {
  try { localStorage.setItem(CLAVE_USUARIO, usuario); } catch { /* modo privado */ }
};
