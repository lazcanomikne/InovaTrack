// /api/push
//   GET    -> { publicKey }           (para suscribirse desde el navegador)
//   POST   { subscription, dispositivo } -> guarda la suscripción del usuario
//   DELETE { endpoint }               -> elimina esa suscripción
import { db, sendJson, sendError, readBody } from './_db.js';
import { requiereSesion } from './_auth.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // La llave pública no es secreta.
    return sendJson(res, { publicKey: process.env.VAPID_PUBLIC_KEY || null });
  }

  const sesion = await requiereSesion(req, res);
  if (!sesion) return;
  const client = db();

  if (req.method === 'POST') {
    const b = readBody(req);
    const s = b.subscription;
    if (!s || !s.endpoint || !s.keys?.p256dh || !s.keys?.auth) return sendError(res, 'Suscripción inválida');
    // upsert por endpoint (si el mismo dispositivo re-suscribe, actualiza al usuario actual)
    await client.execute({
      sql: `INSERT INTO push_subs (usuario_id, endpoint, p256dh, auth, dispositivo)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(endpoint) DO UPDATE SET
              usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      args: [sesion.id, s.endpoint, s.keys.p256dh, s.keys.auth, b.dispositivo ?? null],
    });
    return sendJson(res, { ok: true });
  }

  if (req.method === 'DELETE') {
    const b = readBody(req);
    if (b.endpoint) {
      await client.execute({ sql: 'DELETE FROM push_subs WHERE endpoint = ? AND usuario_id = ?', args: [b.endpoint, sesion.id] });
    }
    return sendJson(res, { ok: true });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return sendError(res, 'Método no permitido', 405);
}
