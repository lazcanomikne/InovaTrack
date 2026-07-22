// Router de autenticación: /api/auth/*
// Se agrupa en una sola función serverless (Vercel Hobby limita el total).
//
//   POST /api/auth/login              { usuario, password }   ← choferes
//   POST /api/auth/solicitar-codigo   { email }
//   POST /api/auth/verificar-codigo   { email, codigo }
//   GET  /api/auth/yo
//   POST /api/auth/salir
//   POST /api/auth/passkey/registro/opciones      (requiere sesión)
//   POST /api/auth/passkey/registro/verificar     (requiere sesión)
//   POST /api/auth/passkey/login/opciones         { email }
//   POST /api/auth/passkey/login/verificar        { email, respuesta }
//   GET  /api/auth/passkey/mias                   (requiere sesión)
//   POST /api/auth/passkey/eliminar               (requiere sesión) { id }
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers';

import { db, sendJson, sendError, readBody } from '../_db.js';
import {
  firmarSesion, sesionDe, requiereSesion, cookieSesion, cookieBorrar,
  generarCodigo, guardarCodigo, validarCodigo, usuarioPorEmail, limiteEnvios, limpiarCodigos,
  firmarRegistro, emailDeRegistro, crearColaborador,
} from '../_auth.js';
import { enviarCodigo } from '../_mail.js';
import { verificarPassword } from '../_password.js';

// Contexto WebAuthn. Se deriva del propio request para no depender de que
// las variables estén perfectas; las env var, si existen, tienen prioridad.
function webauthn(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https');
  return {
    rpID: process.env.WEBAUTHN_RP_ID || host.split(':')[0],
    origin: process.env.WEBAUTHN_ORIGIN || `${proto}://${host}`,
    rpName: process.env.WEBAUTHN_RP_NAME || 'InovaTrack',
  };
}

const nombreDispositivo = (req) => {
  const ua = req.headers['user-agent'] || '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'Dispositivo';
};

/* ------------------------- retos WebAuthn ------------------------- */

async function guardarReto(email, challenge, tipo) {
  const c = db();
  await c.execute({ sql: 'DELETE FROM retos_webauthn WHERE lower(email) = lower(?) AND tipo = ?', args: [email, tipo] });
  await c.execute({
    sql: `INSERT INTO retos_webauthn (email, challenge, tipo, expira_en)
          VALUES (?, ?, ?, datetime('now','+5 minutes'))`,
    args: [email.toLowerCase(), challenge, tipo],
  });
}

async function tomarReto(email, tipo) {
  const c = db();
  const { rows } = await c.execute({
    sql: `SELECT * FROM retos_webauthn
          WHERE lower(email) = lower(?) AND tipo = ? AND expira_en > datetime('now')
          ORDER BY id DESC LIMIT 1`,
    args: [email, tipo],
  });
  if (!rows[0]) return null;
  await c.execute({ sql: 'DELETE FROM retos_webauthn WHERE id = ?', args: [rows[0].id] }); // un solo uso
  return rows[0].challenge;
}

const credencialesDe = async (usuarioId) =>
  (await db().execute({ sql: 'SELECT * FROM credenciales WHERE usuario_id = ?', args: [usuarioId] })).rows;

const transportsDe = (c) => (c.transports ? String(c.transports).split(',') : undefined);

/* ------------------------------ handler ------------------------------ */

export default async function handler(req, res) {
  // La ruta se deriva de la URL: `req.query.ruta` no se rellena de forma
  // consistente entre `vercel dev` y producción para catch-alls en /api.
  const ruta = new URL(req.url, 'http://local')
    .pathname
    .replace(/^\/api\/auth\/?/, '')
    .replace(/\/+$/, '');

  const wa = webauthn(req);

  try {
    switch (`${req.method} ${ruta}`) {
      /* ---------- Usuario + contraseña (choferes) ---------- */

      case 'POST login': {
        const { usuario, password } = readBody(req);
        if (!usuario || !password) return sendError(res, 'Escribe tu usuario y contraseña');

        const login = String(usuario).trim().toLowerCase();

        // Freno a la fuerza bruta: 10 intentos fallidos en 15 min por usuario.
        const fallidos = await db().execute({
          sql: `SELECT COUNT(*) AS n FROM codigos_acceso
                WHERE email = ? AND usado = 0 AND created_at > datetime('now','-15 minutes')`,
          args: [`login:${login}`],
        });
        if (Number(fallidos.rows[0].n) >= 10) {
          return sendError(res, 'Demasiados intentos. Espera 15 minutos.', 429);
        }

        const { rows } = await db().execute({
          sql: `SELECT id, nombre, email, rol, usuario, password_hash, activo
                FROM usuarios WHERE lower(usuario) = ?`,
          args: [login],
        });
        const u = rows[0];

        // Verificamos SIEMPRE, aunque el usuario no exista, para que el tiempo
        // de respuesta no delate qué usuarios están dados de alta.
        const ok = await verificarPassword(password, u?.password_hash ?? '');

        if (!u || !ok || Number(u.activo) === 0) {
          // Deja rastro del intento fallido (alimenta el contador de arriba).
          await db().execute({
            sql: `INSERT INTO codigos_acceso (email, codigo_hash, expira_en)
                  VALUES (?, 'login-fallido', datetime('now','+15 minutes'))`,
            args: [`login:${login}`],
          });
          return sendError(res, 'Usuario o contraseña incorrectos', 401);
        }

        // Al entrar bien, se limpian los intentos fallidos previos.
        await db().execute({
          sql: 'UPDATE codigos_acceso SET usado = 1 WHERE email = ?',
          args: [`login:${login}`],
        });

        const token = await firmarSesion(u);
        res.setHeader('Set-Cookie', cookieSesion(token));
        return sendJson(res, {
          usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, usuario: u.usuario },
        });
      }

      /* ---------- Código por correo ---------- */

      case 'POST solicitar-codigo': {
        const { email } = readBody(req);
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) return sendError(res, 'Correo inválido');

        // Registro CERRADO: sólo entra quien la oficina dio de alta. Una app de
        // flotilla no puede permitir que cualquiera se auto-registre y aparezca
        // como chofer. Altas con: scripts/chofer.mjs crear <correo> "<Nombre>"
        const usuario = await usuarioPorEmail(email);
        if (!usuario || Number(usuario.activo) === 0) {
          return sendError(res, 'Ese correo no está dado de alta. Solicítalo en la oficina.', 403);
        }

        const limite = await limiteEnvios(email);
        if (limite) return sendError(res, limite, 429);

        const codigo = generarCodigo();
        await guardarCodigo(email, codigo);
        await enviarCodigo(email.trim(), codigo, usuario.nombre?.split(' ')[0]);
        limpiarCodigos().catch(() => {});
        return sendJson(res, { ok: true });
      }

      case 'POST verificar-codigo': {
        const { email, codigo } = readBody(req);
        if (!email || !codigo) return sendError(res, 'Faltan datos');

        const r = await validarCodigo(email, String(codigo).trim());
        if (!r.ok) return sendError(res, r.error, 401);

        // Sin auto-registro: si el código es válido pero la cuenta no existe
        // (o la dieron de baja entre la solicitud y la verificación), no pasa.
        if (!r.usuario) {
          return sendError(res, 'Ese correo no está dado de alta. Solicítalo en la oficina.', 403);
        }

        res.setHeader('Set-Cookie', cookieSesion(await firmarSesion(r.usuario)));
        return sendJson(res, { usuario: r.usuario });
      }

      case 'GET yo': {
        const u = await sesionDe(req);
        if (!u) return sendError(res, 'No autenticado', 401);
        // Los datos de operación se leen frescos: la oficina puede cambiar el
        // vehículo o la ruta sin que el chofer tenga que volver a entrar.
        const { rows } = await db().execute({
          sql: 'SELECT avatar, usuario, vehiculo, ruta, activo FROM usuarios WHERE id = ?',
          args: [u.id],
        });
        const d = rows[0];
        // Si lo dieron de baja mientras tenía sesión abierta, se corta aquí.
        if (!d || Number(d.activo) === 0) {
          res.setHeader('Set-Cookie', cookieBorrar());
          return sendError(res, 'Tu cuenta está dada de baja', 401);
        }
        return sendJson(res, {
          usuario: {
            ...u,
            avatar: d.avatar ?? null,
            usuario: d.usuario ?? null,
            vehiculo: d.vehiculo ?? null,
            ruta: d.ruta ?? null,
          },
        });
      }

      case 'POST salir': {
        res.setHeader('Set-Cookie', cookieBorrar());
        return sendJson(res, { ok: true });
      }

      /* ---------- Passkeys (Face ID) ---------- */

      case 'POST passkey/registro/opciones': {
        const u = await requiereSesion(req, res);
        if (!u) return;
        const existentes = await credencialesDe(u.id);
        const opciones = await generateRegistrationOptions({
          rpName: wa.rpName,
          rpID: wa.rpID,
          userID: isoUint8Array.fromUTF8String(String(u.id)),
          userName: u.email,
          userDisplayName: u.nombre,
          attestationType: 'none',
          excludeCredentials: existentes.map((c) => ({ id: c.credential_id, transports: transportsDe(c) })),
          authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred',
            authenticatorAttachment: 'platform', // Face ID / Touch ID del propio dispositivo
          },
        });
        await guardarReto(u.email, opciones.challenge, 'registro');
        return sendJson(res, opciones);
      }

      case 'POST passkey/registro/verificar': {
        const u = await requiereSesion(req, res);
        if (!u) return;
        const { respuesta } = readBody(req);
        const challenge = await tomarReto(u.email, 'registro');
        if (!challenge) return sendError(res, 'El registro expiró. Inténtalo de nuevo.', 400);

        const v = await verifyRegistrationResponse({
          response: respuesta,
          expectedChallenge: challenge,
          expectedOrigin: wa.origin,
          expectedRPID: wa.rpID,
          requireUserVerification: false,
        });
        if (!v.verified || !v.registrationInfo) return sendError(res, 'No se pudo verificar la passkey', 400);

        const { credential } = v.registrationInfo;
        await db().execute({
          sql: `INSERT INTO credenciales (usuario_id, credential_id, public_key, counter, transports, dispositivo)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            u.id,
            credential.id,
            isoBase64URL.fromBuffer(credential.publicKey),
            credential.counter ?? 0,
            credential.transports?.join(',') ?? null,
            nombreDispositivo(req),
          ],
        });
        return sendJson(res, { ok: true, dispositivo: nombreDispositivo(req) });
      }

      case 'POST passkey/login/opciones': {
        const { email } = readBody(req);
        if (!email) return sendError(res, 'Falta el correo');
        const usuario = await usuarioPorEmail(email);
        if (!usuario) return sendError(res, 'No hay passkeys para este correo', 404);

        const creds = await credencialesDe(usuario.id);
        if (!creds.length) return sendError(res, 'No hay passkeys para este correo', 404);

        const opciones = await generateAuthenticationOptions({
          rpID: wa.rpID,
          userVerification: 'preferred',
          allowCredentials: creds.map((c) => ({ id: c.credential_id, transports: transportsDe(c) })),
        });
        await guardarReto(usuario.email, opciones.challenge, 'login');
        return sendJson(res, opciones);
      }

      case 'POST passkey/login/verificar': {
        const { email, respuesta } = readBody(req);
        if (!email || !respuesta) return sendError(res, 'Faltan datos');

        const usuario = await usuarioPorEmail(email);
        if (!usuario) return sendError(res, 'No autorizado', 401);

        const challenge = await tomarReto(usuario.email, 'login');
        if (!challenge) return sendError(res, 'El intento expiró. Vuelve a empezar.', 400);

        const creds = await credencialesDe(usuario.id);
        const cred = creds.find((c) => c.credential_id === respuesta.id);
        if (!cred) return sendError(res, 'Passkey desconocida', 401);

        const v = await verifyAuthenticationResponse({
          response: respuesta,
          expectedChallenge: challenge,
          expectedOrigin: wa.origin,
          expectedRPID: wa.rpID,
          requireUserVerification: false,
          credential: {
            id: cred.credential_id,
            publicKey: isoBase64URL.toBuffer(String(cred.public_key)),
            counter: Number(cred.counter),
            transports: transportsDe(cred),
          },
        });
        if (!v.verified) return sendError(res, 'No se pudo verificar', 401);

        await db().execute({
          sql: `UPDATE credenciales SET counter = ?, last_used_at = datetime('now') WHERE id = ?`,
          args: [v.authenticationInfo.newCounter, cred.id],
        });

        res.setHeader('Set-Cookie', cookieSesion(await firmarSesion(usuario)));
        return sendJson(res, { usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } });
      }

      case 'GET passkey/mias': {
        const u = await requiereSesion(req, res);
        if (!u) return;
        const creds = await credencialesDe(u.id);
        return sendJson(res, creds.map((c) => ({
          id: c.id, dispositivo: c.dispositivo, created_at: c.created_at, last_used_at: c.last_used_at,
        })));
      }

      case 'POST passkey/eliminar': {
        const u = await requiereSesion(req, res);
        if (!u) return;
        const { id } = readBody(req);
        await db().execute({ sql: 'DELETE FROM credenciales WHERE id = ? AND usuario_id = ?', args: [id, u.id] });
        return sendJson(res, { ok: true });
      }

      default:
        return sendError(res, `Ruta no encontrada: ${req.method} /api/auth/${ruta}`, 404);
    }
  } catch (e) {
    console.error('[auth]', ruta, e);
    return sendError(res, 'Error interno', 500);
  }
}
