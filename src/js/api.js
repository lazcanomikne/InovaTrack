// Cliente API contra las funciones de Vercel (/api/*).
// La sesión viaja en una cookie HttpOnly: no hay tokens en JavaScript.
import { limpiarSesion } from './store.js';

const BASE = '/api';

// Un 401 en cualquier endpoint protegido significa que la sesión caducó:
// devolvemos al usuario al login. Los endpoints de /auth se excluyen, porque
// ahí un 401 sólo quiere decir "código incorrecto".
function esFalloDeSesion(path, status) {
  return status === 401 && !path.startsWith('/auth');
}

async function request(path, { method = 'GET', body, headers } = {}) {
  const opts = {
    method,
    headers: { ...headers },
    credentials: 'same-origin', // manda la cookie de sesión
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    if (esFalloDeSesion(path, res.status)) limpiarSesion();
    const err = new Error((data && data.error) || res.statusText || 'Error de red');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  del: (p) => request(p, { method: 'DELETE' }),

  // ── Módulos de InovaTrack ──────────────────────────────────────────────
  // Aquí se agregan los endpoints de cada módulo nuevo, p. ej.:
  //   modulo: {
  //     list: (query = '') => request(`/modulo${query}`),
  //     get: (id) => request(`/modulo/${id}`),
  //     create: (body) => request('/modulo', { method: 'POST', body }),
  //     update: (id, body) => request(`/modulo/${id}`, { method: 'PATCH', body }),
  //     remove: (id) => request(`/modulo/${id}`, { method: 'DELETE' }),
  //   },

  usuarios: {
    list: () => request('/usuarios'),
    actualizar: (body) => request('/usuarios', { method: 'PATCH', body }),
  },
  push: {
    llavePublica: () => request('/push'),
    suscribir: (subscription, dispositivo) => request('/push', { method: 'POST', body: { subscription, dispositivo } }),
    desuscribir: (endpoint) => request('/push', { method: 'DELETE', body: { endpoint } }),
  },
  auth: {
    yo: () => request('/auth/yo'),
    solicitarCodigo: (email) => request('/auth/solicitar-codigo', { method: 'POST', body: { email } }),
    verificarCodigo: (email, codigo) => request('/auth/verificar-codigo', { method: 'POST', body: { email, codigo } }),
    registrar: (token, nombre) => request('/auth/registrar', { method: 'POST', body: { token, nombre } }),
    salir: () => request('/auth/salir', { method: 'POST' }),
    passkey: {
      opcionesRegistro: () => request('/auth/passkey/registro/opciones', { method: 'POST' }),
      verificarRegistro: (respuesta) => request('/auth/passkey/registro/verificar', { method: 'POST', body: { respuesta } }),
      opcionesLogin: (email) => request('/auth/passkey/login/opciones', { method: 'POST', body: { email } }),
      verificarLogin: (email, respuesta) => request('/auth/passkey/login/verificar', { method: 'POST', body: { email, respuesta } }),
      mias: () => request('/auth/passkey/mias'),
      eliminar: (id) => request('/auth/passkey/eliminar', { method: 'POST', body: { id } }),
    },
  },
};
