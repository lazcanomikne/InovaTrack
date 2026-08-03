import { db, sendJson, sendError, readBody } from './_db.js';
import { requiereSesion } from './_auth.js';
import { esOficina } from './_vueltas.js';

// /api/usuarios
//   GET    → lista de usuarios. Oficina/dirección ven además los campos de
//            administración (usuario, vehículo, ruta, activo).
//   POST   → alta de usuario. Sólo oficina/dirección.
//   PATCH  → sin `id`: el PROPIO perfil (por ahora, su foto).
//            con `id`: administración de OTRO usuario. Sólo oficina/dirección.
//
// El alta no fija contraseña a propósito: el acceso es por código al correo
// (ver api/auth/[...ruta].js), así que basta con el email para que entre.

const ROLES = ['chofer', 'oficina', 'direccion'];
// Campos que la administración puede tocar de otro usuario. `avatar` no está:
// la foto es cosa de cada quien.
const EDITABLES = ['nombre', 'email', 'rol', 'vehiculo', 'ruta', 'activo'];

const norm = (e) => String(e || '').trim().toLowerCase();
const esEmail = (e) => /^\S+@\S+\.\S+$/.test(e);

export default async function handler(req, res) {
  const sesion = await requiereSesion(req, res);
  if (!sesion) return;

  const client = db();
  const admin = esOficina(sesion);

  /* ------------------------------- Alta ------------------------------- */
  if (req.method === 'POST') {
    if (!admin) return sendError(res, 'No tienes permiso para dar de alta usuarios.', 403);
    const b = readBody(req);
    const nombre = String(b.nombre || '').trim();
    const email = norm(b.email);
    const rol = b.rol || 'chofer';

    if (!nombre) return sendError(res, 'El nombre es obligatorio.');
    if (!esEmail(email)) return sendError(res, 'El correo no es válido.');
    if (!ROLES.includes(rol)) return sendError(res, 'Rol desconocido.');

    // El índice UNIQUE de email es sensible a mayúsculas, pero el login busca
    // con lower(): dos filas que sólo difieran en mayúsculas romperían el
    // acceso, así que el duplicado se descarta comparando en minúsculas.
    const ya = await client.execute({
      sql: 'SELECT id FROM usuarios WHERE lower(email) = ?',
      args: [email],
    });
    if (ya.rows.length) return sendError(res, 'Ya existe un usuario con ese correo.', 409);

    const { rows } = await client.execute({
      sql: `INSERT INTO usuarios (nombre, email, rol, vehiculo, ruta, activo)
            VALUES (?, ?, ?, ?, ?, 1)
            RETURNING id, nombre, email, rol, avatar, usuario, vehiculo, ruta, activo`,
      args: [nombre, email, rol, b.vehiculo?.trim() || null, b.ruta?.trim() || null],
    });
    return sendJson(res, rows[0], 201);
  }

  /* ---------------------------- Modificación --------------------------- */
  if (req.method === 'PATCH') {
    const b = readBody(req);
    const objetivo = b.id === undefined ? sesion.id : Number(b.id);
    const propio = Number(objetivo) === Number(sesion.id);

    // Editar a otro es administración; editarse a uno mismo por esta vía sigue
    // siendo sólo la foto (abajo), como antes.
    if (!propio && !admin) return sendError(res, 'No tienes permiso para editar a otros usuarios.', 403);

    const campos = [];
    const args = [];

    if (b.avatar !== undefined && propio) {
      // La foto va como data URL (imagen reducida en el cliente). Tope de tamaño.
      if (b.avatar && String(b.avatar).length > 400000) return sendError(res, 'La imagen es muy grande', 413);
      campos.push('avatar = ?');
      args.push(b.avatar || null);
    }

    if (admin && b.id !== undefined) {
      for (const c of EDITABLES) {
        if (b[c] === undefined) continue;

        if (c === 'rol') {
          if (!ROLES.includes(b.rol)) return sendError(res, 'Rol desconocido.');
          // Sin esto, un administrador puede quitarse a sí mismo el permiso y
          // dejar el sistema sin nadie que pueda devolvérselo.
          if (propio && b.rol === 'chofer') {
            return sendError(res, 'No puedes quitarte a ti mismo el rol de administrador.', 409);
          }
        }
        if (c === 'activo') {
          if (propio && Number(b.activo) === 0) {
            return sendError(res, 'No puedes darte de baja a ti mismo.', 409);
          }
          campos.push('activo = ?');
          args.push(Number(b.activo) ? 1 : 0);
          continue;
        }
        if (c === 'email') {
          const email = norm(b.email);
          if (!esEmail(email)) return sendError(res, 'El correo no es válido.');
          const ya = await client.execute({
            sql: 'SELECT id FROM usuarios WHERE lower(email) = ? AND id <> ?',
            args: [email, objetivo],
          });
          if (ya.rows.length) return sendError(res, 'Ya existe un usuario con ese correo.', 409);
          campos.push('email = ?');
          args.push(email);
          continue;
        }
        campos.push(`${c} = ?`);
        args.push(typeof b[c] === 'string' ? b[c].trim() || null : b[c]);
      }
    }

    if (!campos.length) return sendError(res, 'Nada que actualizar');
    args.push(objetivo);
    await client.execute({ sql: `UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, args });
    const { rows } = await client.execute({
      sql: 'SELECT id, nombre, email, rol, avatar, usuario, vehiculo, ruta, activo FROM usuarios WHERE id = ?',
      args: [objetivo],
    });
    return sendJson(res, rows[0]);
  }

  /* ------------------------------- Lista ------------------------------- */
  if (req.method === 'GET') {
    // Un chofer sólo necesita a quién mencionar; la administración necesita
    // el estado completo para poder operar sobre él.
    const { rows } = admin
      ? await client.execute(
        'SELECT id, nombre, email, rol, avatar, usuario, vehiculo, ruta, activo FROM usuarios ORDER BY activo DESC, nombre'
      )
      : await client.execute('SELECT id, nombre, email, rol, avatar FROM usuarios WHERE activo = 1 ORDER BY nombre');
    return sendJson(res, rows);
  }

  // Antes cualquier método desconocido caía en el GET y devolvía la lista.
  res.setHeader('Allow', 'GET, POST, PATCH');
  return sendError(res, 'Método no permitido', 405);
}
