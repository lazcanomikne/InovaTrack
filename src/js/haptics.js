// Vibración táctil para confirmar acciones rápidas (cambio de día, toques).
//
// `navigator.vibrate()` NO funciona en iOS Safari. Ahí usamos el truco del
// checkbox `switch` (Safari 18+): un <input type="checkbox" switch"> nativo
// dispara el motor háptico del sistema al cambiar de estado, y ese cambio se
// puede provocar con `label.click()` (nunca `input.click()`) dentro de un
// gesto del usuario. En Android/Chrome cae a `vibrate()`; si no hay nada
// disponible, no hace nada.

let par = null; // singleton perezoso: { input, label }

function soportaSwitchIOS() {
  if (typeof document === 'undefined') return false;
  try {
    // Detección por existencia real de la propiedad, no por user-agent.
    return 'switch' in document.createElement('input');
  } catch {
    return false;
  }
}

function ocultarFueraDePantalla(el) {
  // Fuera de pantalla por posición, NUNCA display:none ni visibility:hidden:
  // en iOS eso puede cancelar el efecto háptico del interruptor.
  Object.assign(el.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    margin: '0',
    padding: '0',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '-1',
  });
  el.setAttribute('aria-hidden', 'true');
}

function obtenerParIOS() {
  if (par) return par;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.id = 'inovatrack-haptic-switch';
  input.tabIndex = -1;
  ocultarFueraDePantalla(input);

  const label = document.createElement('label');
  label.htmlFor = input.id;
  ocultarFueraDePantalla(label);

  document.body.appendChild(input);
  document.body.appendChild(label);
  par = { input, label };
  return par;
}

function dispararIOS() {
  const { input, label } = obtenerParIOS();
  // Debe ejecutarse de forma síncrona dentro del gesto del usuario.
  label.click();
  // Se deja listo para la próxima vez sin volver a disparar el hápico
  // (asignar la propiedad directamente no emite eventos de usuario).
  input.checked = false;
}

function vibrar(patron) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(patron);
    return true;
  }
  return false;
}

/** Toque corto: cambio de día confirmado, selección puntual. */
export function tap() {
  try {
    if (soportaSwitchIOS()) { dispararIOS(); return; }
    vibrar(10);
  } catch { /* la háptica es sólo un plus: nunca debe romper la navegación */ }
}

/** Alias semántico de tap(), para selecciones puntuales (chip, tab, etc.). */
export const seleccion = tap;

/** Confirmación de una acción completada (entrega, sincronización). */
export function exito() {
  try {
    if (soportaSwitchIOS()) { dispararIOS(); return; }
    vibrar([12, 40, 12]);
  } catch { /* la háptica es sólo un plus: nunca debe romper la navegación */ }
}
