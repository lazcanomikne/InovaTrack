// Captura de evidencias: fotos y firma.
//
// Las fotos se COMPRIMEN antes de salir del teléfono (Módulo 7): un iPhone
// entrega 3-5 MB por foto y el chofer trabaja con datos móviles. Bajarlas a
// ~1280px y JPEG 0.7 las deja en 150-350 KB sin perder legibilidad de una
// factura sellada ni de una fachada.
import { upload } from '@vercel/blob/client';
import { api } from './api.js';

const MAX_LADO = 1280;
const CALIDAD = 0.7;

/** Comprime un File de imagen y devuelve un Blob JPEG. */
export function comprimirFoto(file, maxLado = MAX_LADO, calidad = CALIDAD) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const w = Math.round(img.width * escala);
      const h = Math.round(img.height * escala);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto'))),
        'image/jpeg',
        calidad
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

/** Convierte el canvas de la firma en un PNG (fondo transparente). */
export function firmaABlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Firma vacía'))), 'image/png');
  });
}

/**
 * Sube un blob a Vercel Blob (sin registrarlo todavía). Requiere conexión.
 * La cola offline (cola.js) reutiliza esta función al sincronizar: sube el
 * blob que guardó en IndexedDB y sólo entonces manda la operación 'evidencia'
 * a /api/sync con la url ya resuelta.
 */
export async function subirBlobEvidencia(vueltaId, blob, nombre) {
  const archivo = new File([blob], nombre, { type: blob.type });
  const subido = await upload(nombre, archivo, {
    access: 'public',
    handleUploadUrl: '/api/blob-upload',
    clientPayload: JSON.stringify({ vuelta_id: vueltaId }),
  });
  return subido.url;
}

/** Sube un blob y registra la evidencia en la vuelta en un solo paso (con señal). */
export async function subirEvidencia(vueltaId, blob, { tipo, nombre, ocurrido_en }) {
  const url = await subirBlobEvidencia(vueltaId, blob, nombre);
  return api.vueltas.evidencia(vueltaId, {
    tipo,
    url,
    ocurrido_en: ocurrido_en ?? new Date().toISOString(),
    client_uuid: crypto.randomUUID(),
  });
}

export const nombreFoto = (vueltaId) => `vuelta-${vueltaId}-${Date.now()}.jpg`;
export const nombreFirma = (vueltaId) => `firma-${vueltaId}-${Date.now()}.png`;

/** Tamaño legible, para mostrar cuánto pesó la foto ya comprimida. */
export function pesoLegible(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
