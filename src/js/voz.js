// Dictado por voz con la Web Speech API (SpeechRecognition).
// Soportado en Safari/iOS 14.5+ y Chrome. Si no está, la UI cae a texto manual.

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export const soportaDictado = () => !!SR;

const MENSAJES_ERROR = {
  'not-allowed': 'No diste permiso al micrófono. Actívalo en Ajustes del navegador.',
  'service-not-allowed': 'El dictado no está disponible. Revisa los permisos del micrófono.',
  'no-speech': 'No se escuchó nada. Intenta de nuevo.',
  'audio-capture': 'No se encontró micrófono.',
  network: 'Sin conexión para transcribir.',
  aborted: '',
};

/**
 * Crea una sesión de dictado.
 * onTexto(final, parcial) se llama en cada resultado.
 */
export function crearDictado({ lang = 'es-MX', onTexto, onError, onFin } = {}) {
  if (!SR) throw new Error('Dictado no soportado');

  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 1;

  let activo = false;
  let finalAcumulado = '';
  let reintentos = 0;

  rec.onresult = (e) => {
    let parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalAcumulado += t;
      else parcial += t;
    }
    onTexto?.(finalAcumulado.trim(), parcial.trim());
  };

  rec.onerror = (e) => {
    // 'aborted' ocurre al detener a propósito: no es un error para el usuario.
    if (e.error === 'aborted') return;
    // 'no-speech' en modo continuo es común; no cortamos la sesión.
    if (e.error === 'no-speech' && activo) return;
    activo = false;
    const msg = MENSAJES_ERROR[e.error] ?? `Error de dictado (${e.error})`;
    if (msg) onError?.(msg);
  };

  rec.onend = () => {
    // Safari corta la sesión sola; si el usuario sigue dictando, la reanudamos.
    if (activo && reintentos < 5) {
      reintentos += 1;
      try { rec.start(); return; } catch { /* ya arrancado */ }
    }
    activo = false;
    onFin?.(finalAcumulado.trim());
  };

  return {
    iniciar() {
      finalAcumulado = '';
      reintentos = 0;
      activo = true;
      try { rec.start(); } catch (e) { activo = false; onError?.('No se pudo iniciar el dictado.'); }
    },
    detener() {
      activo = false;
      try { rec.stop(); } catch { /* ignore */ }
    },
    get activo() { return activo; },
  };
}

/* ---------------- Interpretación del dictado ----------------
   Deduce prioridad y fecha compromiso de lo que se dijo.
   Sólo devuelve un campo cuando la señal es inequívoca. */

const DIAS = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3,
  jueves: 4, viernes: 5, sabado: 6, sábado: 6,
};

const iso = (d) => {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0); // evita saltos por zona horaria
  return x.toISOString().slice(0, 10);
};

export function interpretar(texto, hoy = new Date()) {
  const t = ` ${texto.toLowerCase()} `;
  const res = {};

  // Prioridad: sólo si se dice explícitamente o con "urgente".
  if (/\burgent[ea]\b/.test(t)) res.prioridad = 'Alta';
  else {
    const m = t.match(/\bprioridad\s+(alta|media|baja)\b/);
    if (m) res.prioridad = m[1][0].toUpperCase() + m[1].slice(1);
  }

  // Fecha compromiso
  const base = new Date(hoy);
  base.setHours(12, 0, 0, 0);

  if (/\bpasado\s+ma[ñn]ana\b/.test(t)) {
    res.fecha_compromiso = iso(base.getTime() + 2 * 86400000);
  } else if (/\bma[ñn]ana\b/.test(t)) {
    res.fecha_compromiso = iso(base.getTime() + 86400000);
  } else if (/\bhoy\b/.test(t)) {
    res.fecha_compromiso = iso(base);
  } else {
    const enDias = t.match(/\ben\s+(\d{1,2})\s+d[ií]as?\b/);
    if (enDias) {
      res.fecha_compromiso = iso(base.getTime() + Number(enDias[1]) * 86400000);
    } else {
      const dia = t.match(/\b(?:el\s+|para\s+el\s+)?(domingo|lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado)\b/);
      if (dia) {
        const objetivo = DIAS[dia[1]];
        // Próxima ocurrencia de ese día (si es hoy, la semana que viene).
        let delta = (objetivo - base.getDay() + 7) % 7;
        if (delta === 0) delta = 7;
        res.fecha_compromiso = iso(base.getTime() + delta * 86400000);
      }
    }
  }

  return res;
}

// Resumen legible de lo detectado, para mostrarlo al usuario.
export function resumenInterpretacion(det) {
  const partes = [];
  if (det.prioridad) partes.push(`prioridad ${det.prioridad}`);
  if (det.fecha_compromiso) partes.push(`vence ${det.fecha_compromiso}`);
  return partes.join(' · ');
}
