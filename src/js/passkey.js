// Passkeys (WebAuthn). En iPhone se desbloquean con Face ID.
// La llave privada nunca sale del Secure Enclave; el servidor sólo ve la pública.
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';
import { api } from './api.js';

export const soportaPasskeys = () => browserSupportsWebAuthn();

/** ¿El dispositivo tiene autenticador propio (Face ID / Touch ID / Windows Hello)? */
export async function tieneFaceId() {
  if (!browserSupportsWebAuthn()) return false;
  try { return await platformAuthenticatorIsAvailable(); } catch { return false; }
}

// Traduce los errores del navegador a algo que una persona entienda.
function mensajeError(e) {
  const nombre = e?.name || '';
  if (nombre === 'NotAllowedError') return 'Se canceló o expiró la autenticación.';
  if (nombre === 'InvalidStateError') return 'Este dispositivo ya está registrado.';
  if (nombre === 'AbortError') return 'Se canceló la operación.';
  if (nombre === 'SecurityError') return 'El dominio no permite passkeys aquí.';
  return e?.message || 'No se pudo completar.';
}

/** Registra una passkey en ESTE dispositivo. Requiere sesión iniciada. */
export async function registrarPasskey() {
  const opciones = await api.auth.passkey.opcionesRegistro();
  let respuesta;
  try {
    respuesta = await startRegistration({ optionsJSON: opciones });
  } catch (e) {
    throw new Error(mensajeError(e));
  }
  return api.auth.passkey.verificarRegistro(respuesta);
}

/** Inicia sesión con Face ID. Devuelve el usuario. */
export async function entrarConPasskey(email) {
  const opciones = await api.auth.passkey.opcionesLogin(email);
  let respuesta;
  try {
    respuesta = await startAuthentication({ optionsJSON: opciones });
  } catch (e) {
    throw new Error(mensajeError(e));
  }
  const { usuario } = await api.auth.passkey.verificarLogin(email, respuesta);
  return usuario;
}
