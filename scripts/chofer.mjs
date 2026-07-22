// Alta y administración de choferes desde la terminal.
// (En fase 2 esto vivirá en el panel de oficina.)
//
//   node --env-file-if-exists=.env scripts/chofer.mjs crear <usuario> "<Nombre>" <contraseña> [vehiculo] [ruta]
//   node --env-file-if-exists=.env scripts/chofer.mjs clave <usuario> <contraseña-nueva>
//   node --env-file-if-exists=.env scripts/chofer.mjs baja  <usuario>
//   node --env-file-if-exists=.env scripts/chofer.mjs alta  <usuario>
//   node --env-file-if-exists=.env scripts/chofer.mjs lista
import { createClient } from '@libsql/client';
import { hashPassword } from '../api/_password.js';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error('✗ Falta TURSO_DATABASE_URL (ponlo en .env).');
  process.exit(1);
}
const db = createClient({ url, authToken });

const [accion, ...args] = process.argv.slice(2);

const norm = (s) => String(s ?? '').trim().toLowerCase();

async function buscar(usuario) {
  const { rows } = await db.execute({
    sql: 'SELECT id, nombre, usuario, rol, activo FROM usuarios WHERE lower(usuario) = ?',
    args: [norm(usuario)],
  });
  return rows[0] ?? null;
}

switch (accion) {
  case 'crear': {
    const [usuario, nombre, password, vehiculo, ruta] = args;
    if (!usuario || !nombre || !password) {
      console.error('Uso: chofer.mjs crear <usuario> "<Nombre>" <contraseña> [vehiculo] [ruta]');
      process.exit(1);
    }
    if (await buscar(usuario)) {
      console.error(`✗ Ya existe el usuario "${norm(usuario)}".`);
      process.exit(1);
    }
    const hash = await hashPassword(password);
    const { rows } = await db.execute({
      sql: `INSERT INTO usuarios (nombre, usuario, password_hash, rol, vehiculo, ruta, activo)
            VALUES (?, ?, ?, 'chofer', ?, ?, 1)
            RETURNING id, nombre, usuario, rol`,
      args: [nombre.trim(), norm(usuario), hash, vehiculo ?? null, ruta ?? null],
    });
    console.log('✓ Chofer creado:', rows[0]);
    break;
  }

  case 'clave': {
    const [usuario, password] = args;
    if (!usuario || !password) {
      console.error('Uso: chofer.mjs clave <usuario> <contraseña-nueva>');
      process.exit(1);
    }
    const u = await buscar(usuario);
    if (!u) { console.error('✗ No existe ese usuario.'); process.exit(1); }
    await db.execute({
      sql: 'UPDATE usuarios SET password_hash = ? WHERE id = ?',
      args: [await hashPassword(password), u.id],
    });
    console.log(`✓ Contraseña actualizada para "${u.usuario}".`);
    break;
  }

  case 'baja':
  case 'alta': {
    const [usuario] = args;
    const u = await buscar(usuario);
    if (!u) { console.error('✗ No existe ese usuario.'); process.exit(1); }
    const activo = accion === 'alta' ? 1 : 0;
    await db.execute({ sql: 'UPDATE usuarios SET activo = ? WHERE id = ?', args: [activo, u.id] });
    console.log(`✓ "${u.usuario}" quedó ${activo ? 'activo' : 'dado de baja'}.`);
    break;
  }

  case 'lista': {
    const { rows } = await db.execute(
      `SELECT id, usuario, nombre, rol, vehiculo, ruta, activo FROM usuarios ORDER BY id`
    );
    if (!rows.length) { console.log('(sin usuarios)'); break; }
    for (const r of rows) {
      console.log(
        `#${r.id}`.padEnd(5),
        String(r.usuario ?? '—').padEnd(14),
        String(r.nombre).padEnd(24),
        String(r.rol).padEnd(12),
        r.activo ? 'activo' : 'baja',
        r.vehiculo ? `· ${r.vehiculo}` : ''
      );
    }
    break;
  }

  default:
    console.log(`Acciones: crear | clave | baja | alta | lista

  node --env-file-if-exists=.env scripts/chofer.mjs crear juan "Juan Pérez" Clave123 "Nissan NP300" "Centro"
  node --env-file-if-exists=.env scripts/chofer.mjs lista`);
}
