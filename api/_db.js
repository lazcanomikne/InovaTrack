// Cliente Turso (libSQL) compartido por todas las funciones de Vercel.
// Variables de entorno en Vercel:
//   TURSO_DATABASE_URL   (libsql://...)
//   TURSO_AUTH_TOKEN
import { createClient } from '@libsql/client';

let client;

export function db() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url) throw new Error('Falta TURSO_DATABASE_URL');
    client = createClient({ url, authToken });
  }
  return client;
}

// Helpers de respuesta
export const sendJson = (res, data, status = 200) => res.status(status).json(data);
export const sendError = (res, message, status = 400) => res.status(status).json({ error: message });

// Calcula el color del semáforo a partir de estatus + fecha
export function colorEstatus(p) {
  if (['concluido', 'aprobado'].includes(p.estatus)) return 'concluido';
  if (p.estatus === 'en_espera') return 'espera';
  if (!p.fecha_compromiso) return 'tiempo';
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(p.fecha_compromiso); f.setHours(0, 0, 0, 0);
  const d = Math.round((f - hoy) / 86400000);
  if (d < 0) return 'vencido';
  if (d === 0) return 'hoy';
  if (d === 1) return 'manana';
  return 'tiempo';
}

// Nombre de un usuario por id (para escribir historial legible). null si no existe.
export async function nombreUsuario(client, id) {
  if (!id) return null;
  const { rows } = await client.execute({ sql: 'SELECT nombre FROM usuarios WHERE id = ?', args: [id] });
  return rows[0]?.nombre ?? null;
}

// Parseo defensivo del body (Vercel ya lo parsea si es JSON, pero por si acaso)
export function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}
