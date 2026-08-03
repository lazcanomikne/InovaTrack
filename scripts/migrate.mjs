// Runner de migraciones versionado para Turso (libSQL).
//
//   npm run db:migrate                    → aplica las pendientes (no destructivas)
//   npm run db:migrate:reset              → además permite aplicar las destructivas (DROP)
//   npm run db:migrate -- --baseline <n>  → marca como aplicadas las migraciones
//                                           hasta <n> (incluida) SIN ejecutarlas
//
// `--baseline` sirve para adoptar una base que ya tenía el esquema aplicado a
// mano antes de que existiera este runner: registra el historial sin volver a
// correr los DROP/CREATE, para que las pendientes reales se apliquen normal.
//
// Cada archivo de migrations/*.sql se aplica UNA sola vez: al terminar se
// registra por nombre en `schema_migrations`, y correr el runner de nuevo es
// inofensivo (sólo aplica lo nuevo). Un archivo que contenga el marcador
// `-- migrate:destructivo` en su cabecera (como 0001_init.sql y
// 0002_vueltas.sql, que hacen DROP TABLE) sólo se aplica con --reset: así una
// base con datos reales no se puede reinicializar por accidente.
//
// Requiere TURSO_DATABASE_URL y TURSO_AUTH_TOKEN (en .env o el entorno).
import { createClient } from '@libsql/client';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR_MIGRACIONES = join(__dirname, '..', 'migrations');
const MARCADOR_DESTRUCTIVO = '-- migrate:destructivo';

const reset = process.argv.includes('--reset');
const iBase = process.argv.indexOf('--baseline');
const baselineHasta = iBase >= 0 ? process.argv[iBase + 1] : null;

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error('✗ Falta TURSO_DATABASE_URL (ponlo en .env o expórtalo).');
  process.exit(1);
}

const client = createClient({ url, authToken });

await client.execute(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    nombre TEXT PRIMARY KEY,
    aplicada_en TEXT
  )
`);

const { rows: aplicadas } = await client.execute('SELECT nombre FROM schema_migrations');
const yaAplicadas = new Set(aplicadas.map((r) => r.nombre));

const archivos = readdirSync(DIR_MIGRACIONES).filter((f) => f.endsWith('.sql')).sort();

// Baseline: registra sin ejecutar todo lo que sea <= al archivo dado.
if (baselineHasta) {
  if (!archivos.includes(baselineHasta)) {
    console.error(`✗ No existe la migración "${baselineHasta}".`);
    process.exit(1);
  }
  const marcar = archivos.filter((f) => f <= baselineHasta && !yaAplicadas.has(f));
  if (!marcar.length) {
    console.log('✓ Nada que marcar: ya estaban registradas.');
    process.exit(0);
  }
  for (const f of marcar) {
    await client.execute({
      sql: "INSERT INTO schema_migrations (nombre, aplicada_en) VALUES (?, datetime('now'))",
      args: [f],
    });
    console.log(`= ${f} marcada como aplicada (sin ejecutar).`);
  }
  console.log('✓ Baseline listo. Corre `npm run db:migrate` para aplicar lo pendiente.');
  process.exit(0);
}

const pendientes = archivos.filter((f) => !yaAplicadas.has(f));

if (!pendientes.length) {
  console.log('✓ No hay migraciones pendientes.');
  process.exit(0);
}

for (const archivo of pendientes) {
  const sql = readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8');
  const esDestructiva = sql.includes(MARCADOR_DESTRUCTIVO);

  if (esDestructiva && !reset) {
    console.error(
      `✗ ${archivo} es destructiva (borra tablas existentes) y no se aplicó.\n` +
      '  Vuelve a correr con --reset si de verdad quieres reinicializar la base ' +
      '(perderás los datos de las tablas que toca).'
    );
    process.exit(1);
  }

  process.stdout.write(`→ Aplicando ${archivo}${esDestructiva ? ' (destructiva)' : ''}… `);

  // Cada migración se aplica en su propia transacción: si falla a la mitad,
  // no queda un esquema a medias ni se registra como aplicada.
  const tx = await client.transaction('write');
  try {
    await tx.executeMultiple(sql);
    await tx.execute({
      sql: "INSERT INTO schema_migrations (nombre, aplicada_en) VALUES (?, datetime('now'))",
      args: [archivo],
    });
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    console.log('✗');
    throw e;
  } finally {
    tx.close();
  }
  console.log('OK');
}

console.log('✓ Listo.');
