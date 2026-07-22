// Contraseñas de chofer. Usamos scrypt del núcleo de Node: es un KDF lento por
// diseño (resistente a fuerza bruta) y no añade dependencias al proyecto.
//
// Formato guardado:  scrypt$N$r$p$<sal_hex>$<hash_hex>
// Guardar los parámetros junto al hash permite subirlos en el futuro sin
// invalidar las contraseñas ya existentes.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

const N = 16384; // coste CPU/memoria
const r = 8;
const p = 1;
const LARGO = 32;
const SAL = 16;

export async function hashPassword(plano) {
  if (typeof plano !== 'string' || plano.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }
  const sal = crypto.randomBytes(SAL);
  const hash = await scrypt(plano.normalize('NFKC'), sal, LARGO, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${sal.toString('hex')}$${hash.toString('hex')}`;
}

/** Compara en tiempo constante. Nunca lanza: devuelve false ante cualquier problema. */
export async function verificarPassword(plano, guardado) {
  try {
    if (!plano || !guardado) return false;
    const partes = String(guardado).split('$');
    if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

    const [, sN, sr, sp, salHex, hashHex] = partes;
    const sal = Buffer.from(salHex, 'hex');
    const esperado = Buffer.from(hashHex, 'hex');

    const calculado = await scrypt(String(plano).normalize('NFKC'), sal, esperado.length, {
      N: Number(sN),
      r: Number(sr),
      p: Number(sp),
      // scrypt de Node limita la memoria por defecto; con N=16384 hace falta subirla.
      maxmem: 256 * 1024 * 1024,
    });

    return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}
