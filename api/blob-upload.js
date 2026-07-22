// Genera el token para que el navegador suba el archivo DIRECTO a Vercel Blob
// (evita el límite de 4.5MB del cuerpo de las funciones). Aquí sólo autorizamos.
//
// Hoy exige únicamente que haya sesión válida. Cuando un módulo adjunte
// archivos a un registro propio, añade aquí la comprobación de que ese usuario
// puede escribir en ese registro (lee `clientPayload` y valida contra la BD),
// para que nadie suba archivos colgando de algo que no le pertenece.
import { handleUpload } from '@vercel/blob/client';
import { sendError } from './_db.js';
import { sesionDe } from './_auth.js';

const TIPOS = [
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/gif',
  'application/pdf',
];

export default async function handler(req, res) {
  try {
    const jsonResponse = await handleUpload({
      token: process.env.BLOB_READ_WRITE_TOKEN, // explícito: evita el modo OIDC
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // La cookie de sesión viaja en la petición (mismo origen).
        const sesion = await sesionDe(req);
        if (!sesion) throw new Error('No autenticado');

        const extra = clientPayload ? JSON.parse(clientPayload) : {};

        return {
          allowedContentTypes: TIPOS,
          maximumSizeInBytes: 15 * 1024 * 1024, // 15 MB
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ ...extra, usuario_id: sesion.id }),
        };
      },
      // El metadato se registra desde el cliente tras subir (funciona en local
      // y en prod); aquí no hace falta el webhook onUploadCompleted.
      onUploadCompleted: async () => {},
    });
    return res.status(200).json(jsonResponse);
  } catch (e) {
    return sendError(res, e.message || 'No se pudo autorizar la subida', 400);
  }
}
