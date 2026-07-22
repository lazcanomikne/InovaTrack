// Sesión y códigos de acceso.
// La sesión es un JWT firmado que viaja en una cookie HttpOnly (el JS del
// navegador nunca la lee). Los códigos se guardan hasheados, nunca en claro.
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'node:crypto';
import { db } from './_db.js';

const COOKIE = 'inova_sesion';
const DIAS = 30;
const MAX_INTENTOS = 5;
const VIGENCIA_MIN = 10;

const llave = () => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('Falta AUTH_SECRET');
  return new TextEncoder().encode(s);
};

const enVercel = () => !!process.env.VERCEL;

/* ----------------------------- Sesión ----------------------------- */

export async function firmarSesion(u) {
  return new SignJWT({ email: u.email, nombre: u.nombre, rol: u.rol })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(u.id))
    .setIssuedAt()
    .setExpirationTime(`${DIAS}d`)
    .sign(llave());
}

function leerCookie(req, nombre) {
  const raw = req.headers?.cookie || '';
  for (const parte of raw.split(';')) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    if (parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1));
  }
  return null;
}

export async function sesionDe(req) {
  // Vía de servicio (server-to-server, p. ej. el portal desktop de Inovatech): un
  // backend de confianza manda X-Service-Token + X-Actor-Email y actúa como ese
  // usuario. Inerte mientras SERVICE_TOKEN no esté configurado (no afecta el login).
  const svc = req.headers?.['x-service-token'];
  if (svc && process.env.SERVICE_TOKEN && igualesEnTiempoConstante(String(svc), String(process.env.SERVICE_TOKEN))) {
    const email = String(req.headers?.['x-actor-email'] || '').trim();
    if (!email) return null;
    const u = await usuarioPorEmail(email);
    return u ? { id: Number(u.id), email: u.email, nombre: u.nombre, rol: u.rol } : null;
  }

  const token = leerCookie(req, COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, llave());
    return { id: Number(payload.sub), email: payload.email, nombre: payload.nombre, rol: payload.rol };
  } catch {
    return null; // firma inválida o expirada
  }
}

const atributosCookie = () => {
  const p = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (enVercel()) p.push('Secure'); // en local (http://localhost) Secure impediría guardarla
  return p;
};

export const cookieSesion = (token) =>
  [`${COOKIE}=${token}`, ...atributosCookie(), `Max-Age=${DIAS * 24 * 3600}`].join('; ');

export const cookieBorrar = () => [`${COOKIE}=`, ...atributosCookie(), 'Max-Age=0'].join('; ');

/** Guard para endpoints protegidos. Devuelve el usuario o null (ya respondió 401). */
export async function requiereSesion(req, res) {
  const u = await sesionDe(req);
  if (!u) {
    res.status(401).json({ error: 'No autenticado' });
    return null;
  }
  return u;
}

/* --------------------------- Códigos OTP --------------------------- */

export const generarCodigo = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// HMAC con el secreto del servidor: aunque se filtre la BD, los códigos no se pueden revertir.
export const hashCodigo = (email, codigo) =>
  crypto.createHmac('sha256', process.env.AUTH_SECRET).update(`${email.toLowerCase()}:${codigo}`).digest('hex');

const igualesEnTiempoConstante = (a, b) => {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

export async function usuarioPorEmail(email) {
  const { rows } = await db().execute({
    sql: `SELECT id, nombre, email, rol, COALESCE(activo, 1) AS activo
          FROM usuarios WHERE lower(email) = lower(?)`,
    args: [email.trim()],
  });
  return rows[0] ?? null;
}

/** ¿Se puede pedir otro código? Evita abuso del envío de correo. */
export async function limiteEnvios(email) {
  const c = db();
  const reciente = await c.execute({
    sql: `SELECT COUNT(*) AS n FROM codigos_acceso
          WHERE lower(email) = lower(?) AND created_at > datetime('now','-60 seconds')`,
    args: [email],
  });
  if (Number(reciente.rows[0].n) > 0) return 'Espera un minuto antes de pedir otro código.';

  const ventana = await c.execute({
    sql: `SELECT COUNT(*) AS n FROM codigos_acceso
          WHERE lower(email) = lower(?) AND created_at > datetime('now','-15 minutes')`,
    args: [email],
  });
  if (Number(ventana.rows[0].n) >= 3) return 'Demasiados intentos. Intenta de nuevo en 15 minutos.';

  return null;
}

export async function guardarCodigo(email, codigo) {
  await db().execute({
    sql: `INSERT INTO codigos_acceso (email, codigo_hash, expira_en)
          VALUES (?, ?, datetime('now', '+${VIGENCIA_MIN} minutes'))`,
    args: [email.toLowerCase(), hashCodigo(email, codigo)],
  });
}

/**
 * Valida el código. Devuelve { ok: true, usuario } o { ok: false, error }.
 * Consume intentos y marca el código como usado al acertar.
 */
export async function validarCodigo(email, codigo) {
  const c = db();
  const { rows } = await c.execute({
    sql: `SELECT * FROM codigos_acceso
          WHERE lower(email) = lower(?) AND usado = 0 AND expira_en > datetime('now')
          ORDER BY id DESC LIMIT 1`,
    args: [email],
  });
  const fila = rows[0];
  if (!fila) return { ok: false, error: 'El código expiró o no existe. Pide uno nuevo.' };

  if (Number(fila.intentos) >= MAX_INTENTOS) {
    await c.execute({ sql: 'UPDATE codigos_acceso SET usado = 1 WHERE id = ?', args: [fila.id] });
    return { ok: false, error: 'Demasiados intentos fallidos. Pide un código nuevo.' };
  }

  if (!igualesEnTiempoConstante(String(fila.codigo_hash), hashCodigo(email, String(codigo)))) {
    await c.execute({ sql: 'UPDATE codigos_acceso SET intentos = intentos + 1 WHERE id = ?', args: [fila.id] });
    const restantes = MAX_INTENTOS - (Number(fila.intentos) + 1);
    return { ok: false, error: `Código incorrecto. Te quedan ${Math.max(restantes, 0)} intentos.` };
  }

  // Acertó: invalida éste y cualquier otro pendiente del mismo correo.
  await c.execute({ sql: 'UPDATE codigos_acceso SET usado = 1 WHERE lower(email) = lower(?)', args: [email] });

  // usuario puede ser null: registro abierto lo creará tras capturar el nombre.
  const usuario = await usuarioPorEmail(email);
  return { ok: true, usuario: usuario ?? null };
}

/* --- Token corto de registro: prueba que el correo fue verificado ---
   Se emite cuando entra un correo nuevo; el paso "registrar" lo canjea. */
export async function firmarRegistro(email) {
  return new SignJWT({ email: email.toLowerCase(), typ: 'registro' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(llave());
}

export async function emailDeRegistro(token) {
  try {
    const { payload } = await jwtVerify(token, llave());
    return payload.typ === 'registro' ? payload.email : null;
  } catch {
    return null;
  }
}

/** Crea (o recupera) un colaborador con ese correo. */
export async function crearColaborador(email, nombre) {
  const existente = await usuarioPorEmail(email);
  if (existente) return existente;
  const { rows } = await db().execute({
    sql: `INSERT INTO usuarios (nombre, email, rol) VALUES (?, ?, 'colaborador')
          RETURNING id, nombre, email, rol`,
    args: [nombre.trim(), email.toLowerCase()],
  });
  return rows[0];
}

/** Limpieza de códigos viejos (se llama de paso, sin costo real). */
export async function limpiarCodigos() {
  await db().execute("DELETE FROM codigos_acceso WHERE created_at < datetime('now','-1 day')");
}
