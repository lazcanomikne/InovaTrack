import { db, sendJson, sendError, readBody } from './_db.js';
import { requiereSesion } from './_auth.js';

// /api/usuarios
//   GET   → lista de usuarios (para elegir responsables, etc.)
//   PATCH → actualiza el perfil del PROPIO usuario (por ahora, su foto).
export default async function handler(req, res) {
  const sesion = await requiereSesion(req, res);
  if (!sesion) return;

  const client = db();

  if (req.method === 'PATCH') {
    const b = readBody(req);
    const campos = [];
    const args = [];
    if (b.avatar !== undefined) {
      // La foto va como data URL (imagen reducida en el cliente). Tope de tamaño.
      if (b.avatar && String(b.avatar).length > 400000) return sendError(res, 'La imagen es muy grande', 413);
      campos.push('avatar = ?');
      args.push(b.avatar || null);
    }
    if (!campos.length) return sendError(res, 'Nada que actualizar');
    args.push(sesion.id);
    await client.execute({ sql: `UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, args });
    const { rows } = await client.execute({ sql: 'SELECT id, nombre, email, rol, avatar FROM usuarios WHERE id = ?', args: [sesion.id] });
    return sendJson(res, rows[0]);
  }

  const { rows } = await client.execute('SELECT id, nombre, email, rol, avatar FROM usuarios ORDER BY nombre');
  return sendJson(res, rows);
}
