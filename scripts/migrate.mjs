// Aplica migraciones a Turso (libSQL).
//
//   npm run db:migrate                → esquema base (0001)   ⚠️ hace DROP TABLE
//   npm run db:seed                   → 0001 + datos ejemplo (0002)  ⚠️ destructivo
//   node scripts/migrate.mjs 0003_auth.sql   → aplica sólo ese archivo (no destructivo)
//
// Requiere TURSO_DATABASE_URL y TURSO_AUTH_TOKEN (en .env o el entorno).
import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
// (sin datos de ejemplo por ahora)
const explicitos = args.filter((a) => !a.startsWith('--'));

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('✗ Falta TURSO_DATABASE_URL (ponlo en .env o expórtalo).');
  process.exit(1);
}

// Si se pasan archivos, se aplican esos. Si no, el comportamiento clásico.
const archivos = explicitos.length ? explicitos : ['0001_init.sql'];

if (!explicitos.length) {
  console.log('⚠️  0001_init.sql hace DROP TABLE: se borrarán los datos existentes.');
}

const client = createClient({ url, authToken });

for (const archivo of archivos) {
  const sql = readFileSync(join(__dirname, '..', 'migrations', archivo), 'utf8');
  process.stdout.write(`→ Aplicando ${archivo}… `);
  await client.executeMultiple(sql);
  console.log('OK');
}

console.log('✓ Listo.');
