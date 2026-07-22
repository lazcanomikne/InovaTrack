// Envío de correo por SMTP (servidor propio de INOVATECH).
// Las credenciales viven sólo en variables de entorno.
import nodemailer from 'nodemailer';
import { LOGO_BASE64 } from './_logo.js';

let transporte;

// Cabecera de marca compartida (con el logo incrustado vía CID: se ve siempre,
// aunque el cliente bloquee imágenes externas).
const CABECERA = `
  <tr><td style="background:linear-gradient(135deg,#5b5bd6,#7c6cf0);padding:18px 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:12px;vertical-align:middle;">
        <img src="cid:logo-inovatrack" width="46" height="46" alt="InovaTrack" style="display:block;border-radius:12px;" />
      </td>
      <td style="vertical-align:middle;">
        <div style="color:#fff;font-size:19px;font-weight:800;letter-spacing:-.02em;">InovaTrack</div>
        <div style="color:rgba(255,255,255,.78);font-size:12px;margin-top:2px;">Tu operación, bajo control.</div>
      </td>
    </tr></table>
  </td></tr>`;

// Adjunto del logo para el sendMail (referenciado por el cid de la cabecera).
const ADJUNTO_LOGO = {
  filename: 'inovatrack.png',
  content: Buffer.from(LOGO_BASE64, 'base64'),
  cid: 'logo-inovatrack',
  contentType: 'image/png',
};

function tx() {
  if (!transporte) {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) throw new Error('Falta configuración SMTP');
    transporte = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 465),
      secure: String(SMTP_SECURE ?? 'true') === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      // En serverless conviene no dejar sockets colgando.
      pool: false,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporte;
}

const plantilla = (codigo, nombre) => `
<!doctype html>
<html lang="es"><body style="margin:0;background:#f2f1fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:440px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 6px 24px rgba(17,12,46,.10);">
        ${CABECERA}
        <tr><td style="padding:28px 24px;">
          <p style="margin:0 0 6px;font-size:16px;color:#15102b;">Hola${nombre ? ' ' + nombre : ''},</p>
          <p style="margin:0 0 22px;font-size:14px;color:#5b5768;line-height:1.5;">Tu código para entrar a InovaTrack:</p>
          <div style="text-align:center;margin:0 0 22px;">
            <div style="display:inline-block;background:#f2f1fb;border:1px solid #e2def5;border-radius:14px;padding:16px 26px;font-size:34px;font-weight:800;letter-spacing:10px;color:#5b5bd6;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${codigo}</div>
          </div>
          <p style="margin:0 0 8px;font-size:13px;color:#5b5768;line-height:1.5;">Vence en <strong>10 minutos</strong> y sólo sirve una vez.</p>
          <p style="margin:0;font-size:13px;color:#8a8699;line-height:1.5;">Si no fuiste tú, ignora este correo. Nadie puede entrar sin este código.</p>
        </td></tr>
        <tr><td style="padding:14px 24px 22px;border-top:1px solid #f0eef8;">
          <p style="margin:0;font-size:11px;color:#a5a1b5;">Este es un correo automático, no respondas a esta dirección.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

// URL pública de la app (usada en los correos).
const APP_URL = 'https://inovatrack.mikne.com.mx';

export async function enviarCodigo(email, codigo, nombre) {
  // La marca es InovaTrack; la dirección real sigue siendo la del buzón SMTP.
  const from = `InovaTrack <${process.env.SMTP_USER}>`;
  await tx().sendMail({
    from,
    to: email,
    subject: `${codigo} es tu código de acceso · InovaTrack`,
    text: `Tu código para entrar a InovaTrack es ${codigo}. Vence en 10 minutos y sólo sirve una vez. Si no fuiste tú, ignora este correo.`,
    html: plantilla(codigo, nombre),
    attachments: [ADJUNTO_LOGO],
  });
}

// Aviso libre: un usuario le manda un mensaje a otro (desde el asistente).
export async function enviarAviso(destinatario, { de, mensaje }) {
  const from = `InovaTrack <${process.env.SMTP_USER}>`;
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const quien = esc(de || 'Tu equipo');
  const cuerpo = esc(mensaje);
  const html = `
<html lang="es"><body style="margin:0;background:#f2f1fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f1fb;padding:24px 0;"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 6px 24px rgba(17,12,46,.10);">
      ${CABECERA}
      <tr><td style="padding:24px;">
        <p style="margin:0 0 6px;font-size:13px;color:#8a8699;">Mensaje de ${quien}</p>
        <div style="font-size:16px;color:#1f1a33;line-height:1.55;white-space:pre-wrap;">${cuerpo}</div>
        <a href="${APP_URL}" style="display:block;text-align:center;margin-top:22px;background:linear-gradient(135deg,#5b5bd6,#7c6cf0);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px;border-radius:14px;">Abrir InovaTrack</a>
      </td></tr>
      <tr><td style="padding:0 24px 22px;">
        <p style="margin:0;font-size:12px;color:#a5a1b5;">Recibiste este aviso desde InovaTrack. Correo automático, no respondas a esta dirección.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  await tx().sendMail({
    from,
    to: destinatario,
    subject: `📣 ${de || 'Tu equipo'} te envió un aviso · InovaTrack`,
    text: `${de || 'Tu equipo'} te envía un aviso desde InovaTrack:\n\n${mensaje}\n\nAbre InovaTrack en ${APP_URL}`,
    html,
    attachments: [ADJUNTO_LOGO],
  });
}

// Comprueba conexión + autenticación sin enviar nada.
export async function verificarSmtp() {
  await tx().verify();
  return true;
}
