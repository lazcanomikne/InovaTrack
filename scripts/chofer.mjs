// Alta y administración de choferes desde la terminal.
// (En fase 2 esto vivirá en el panel de oficina.)
//
// El acceso es por código de 6 dígitos al correo, así que el correo es el
// identificador. El registro está CERRADO: sólo entra quien esté dado de alta
// aquí; nadie puede auto-registrarse desde la app.
//
//   node --env-file-if-exists=.env scripts/chofer.mjs crear <correo> "<Nombre>" [vehiculo] [ruta]
//   node --env-file-if-exists=.env scripts/chofer.mjs editar <correo> [vehiculo] [ruta]
//   node --env-file-if-exists=.env scripts/chofer.mjs baja  <correo>
//   node --env-file-if-exists=.env scripts/chofer.mjs alta  <correo>
//   node --env-file-if-exists=.env scripts/chofer.mjs lista
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error('✗ Falta TURSO_DATABASE_URL (ponlo en .env).');
  process.exit(1);
}
const db = createClient({ url, authToken });

const [accion, ...args] = process.argv.slice(2);
const norm = (s) => String(s ?? '').trim().toLowerCase();
const esCorreo = (s) => /^\S+@\S+\.\S+$/.test(String(s ?? '').trim());

async function buscar(email) {
  const { rows } = await db.execute({
    sql: 'SELECT id, nombre, email, rol, vehiculo, ruta, activo FROM usuarios WHERE lower(email) = ?',
    args: [norm(email)],
  });
  return rows[0] ?? null;
}

switch (accion) {
  case 'crear': {
    const [email, nombre, vehiculo, ruta] = args;
    if (!esCorreo(email) || !nombre) {
      console.error('Uso: chofer.mjs crear <correo> "<Nombre>" [vehiculo] [ruta]');
      process.exit(1);
    }
    if (await buscar(email)) {
      console.error(`✗ Ya existe un usuario con el correo "${norm(email)}".`);
      process.exit(1);
    }
    const { rows } = await db.execute({
      sql: `INSERT INTO usuarios (nombre, email, rol, vehiculo, ruta, activo)
            VALUES (?, ?, 'chofer', ?, ?, 1)
            RETURNING id, nombre, email, rol`,
      args: [nombre.trim(), norm(email), vehiculo ?? null, ruta ?? null],
    });
    console.log('✓ Chofer creado:', rows[0]);
    console.log('  Ya puede entrar a la app con ese correo (recibirá un código de 6 dígitos).');
    break;
  }

  case 'editar': {
    const [email, vehiculo, ruta] = args;
    const u = await buscar(email);
    if (!u) { console.error('✗ No existe ese correo.'); process.exit(1); }
    await db.execute({
      sql: 'UPDATE usuarios SET vehiculo = ?, ruta = ? WHERE id = ?',
      args: [vehiculo ?? u.vehiculo ?? null, ruta ?? u.ruta ?? null, u.id],
    });
    console.log(`✓ Datos actualizados para "${u.email}".`);
    break;
  }

  case 'baja':
  case 'alta': {
    const [email] = args;
    const u = await buscar(email);
    if (!u) { console.error('✗ No existe ese correo.'); process.exit(1); }
    const activo = accion === 'alta' ? 1 : 0;
    await db.execute({ sql: 'UPDATE usuarios SET activo = ? WHERE id = ?', args: [activo, u.id] });
    console.log(`✓ "${u.email}" quedó ${activo ? 'activo' : 'dado de baja'}.`);
    break;
  }

  case 'lista': {
    const { rows } = await db.execute(
      'SELECT id, email, nombre, rol, vehiculo, ruta, activo FROM usuarios ORDER BY id'
    );
    if (!rows.length) { console.log('(sin usuarios)'); break; }
    for (const r of rows) {
      console.log(
        `#${r.id}`.padEnd(5),
        String(r.email ?? '—').padEnd(34),
        String(r.nombre).padEnd(22),
        String(r.rol).padEnd(10),
        r.activo ? 'activo' : 'baja',
        r.vehiculo ? `· ${r.vehiculo}` : ''
      );
    }
    break;
  }

  default:
    console.log(`Acciones: crear | editar | baja | alta | lista

  node --env-file-if-exists=.env scripts/chofer.mjs crear juan@inovatech.com.mx "Juan Pérez" "Nissan NP300" "Centro"
  node --env-file-if-exists=.env scripts/chofer.mjs lista`);
}
