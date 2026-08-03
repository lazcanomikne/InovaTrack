// Pruebas de la lógica pura de _vueltas.js: la máquina de estados y las
// reglas de fecha que deciden si una vuelta se puede tocar. No tocan la BD
// (transicionValida, puedeEditar, sumarDias, esFechaValida, contar, hoyMx no
// la usan): sólo hoyMx() depende del reloj, por eso se mockea con fake timers.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  transicionValida, puedeEditar, sumarDias, esFechaValida, contar, hoyMx,
} from './_vueltas.js';

describe('sumarDias', () => {
  it('suma días dentro del mismo mes', () => {
    expect(sumarDias('2026-01-01', 1)).toBe('2026-01-02');
  });

  it('resta días cruzando de mes', () => {
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('respeta años bisiestos', () => {
    expect(sumarDias('2024-02-28', 1)).toBe('2024-02-29'); // 2024 es bisiesto
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01'); // 2026 no lo es
  });

  it('con 0 días devuelve la misma fecha', () => {
    expect(sumarDias('2026-06-15', 0)).toBe('2026-06-15');
  });
});

describe('esFechaValida', () => {
  it('acepta el formato YYYY-MM-DD', () => {
    expect(esFechaValida('2026-01-01')).toBe(true);
  });

  it('rechaza formatos sin ceros de relleno', () => {
    expect(esFechaValida('2026-1-1')).toBe(false);
  });

  it('rechaza vacío, null y undefined', () => {
    expect(esFechaValida('')).toBe(false);
    expect(esFechaValida(null)).toBe(false);
    expect(esFechaValida(undefined)).toBe(false);
  });

  it('sólo valida el formato, no el calendario real', () => {
    // Documenta el comportamiento actual: es una validación de forma (regex),
    // no de fecha real. Un mes/día fuera de rango no se detecta aquí.
    expect(esFechaValida('2026-13-40')).toBe(true);
  });
});

describe('contar', () => {
  it('clasifica cada estado en su contador', () => {
    const vueltas = [
      { estado: 'pendiente' }, { estado: 'pendiente' },
      { estado: 'revision' },
      { estado: 'entregada' },
      { estado: 'no_entregada' },
      { estado: 'reprogramada' },
    ];
    expect(contar(vueltas)).toEqual({
      total: 6, pendientes: 3, entregadas: 1, no_entregadas: 1, reprogramadas: 1,
    });
  });

  it('con una lista vacía, todo en cero', () => {
    expect(contar([])).toEqual({
      total: 0, pendientes: 0, entregadas: 0, no_entregadas: 0, reprogramadas: 0,
    });
  });

  it('revision cuenta como pendiente, no aparte', () => {
    expect(contar([{ estado: 'revision' }]).pendientes).toBe(1);
  });
});

describe('transicionValida', () => {
  it('permite las transiciones de cierre desde un estado abierto', () => {
    for (const hacia of ['entregada', 'no_entregada', 'reprogramada', 'revision']) {
      expect(transicionValida('pendiente', hacia)).toBe(true);
      expect(transicionValida('revision', hacia)).toBe(true);
    }
  });

  it('el reenvío de la cola es idempotente: mismo estado a sí mismo siempre vale', () => {
    for (const estado of ['pendiente', 'entregada', 'no_entregada', 'reprogramada', 'revision']) {
      expect(transicionValida(estado, estado)).toBe(true);
    }
  });

  it('una vuelta cerrada no se reabre ni cambia a otro estado cerrado', () => {
    expect(transicionValida('entregada', 'no_entregada')).toBe(false);
    expect(transicionValida('entregada', 'pendiente')).toBe(false);
    expect(transicionValida('no_entregada', 'reprogramada')).toBe(false);
    expect(transicionValida('reprogramada', 'entregada')).toBe(false);
  });

  it('rechaza un estado destino que no existe', () => {
    expect(transicionValida('pendiente', 'estado_inventado')).toBe(false);
  });
});

describe('hoyMx', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('usa el calendario de Ciudad de México, no el de UTC', () => {
    // 04:00 UTC del día 16 son las 22:00 del día 15 en Ciudad de México
    // (UTC-6): "hoy" para el chofer sigue siendo el 15.
    vi.setSystemTime(new Date('2026-01-16T04:00:00Z'));
    expect(hoyMx()).toBe('2026-01-15');
  });

  it('a media tarde en México, coincide con la fecha UTC', () => {
    vi.setSystemTime(new Date('2026-06-10T18:00:00Z')); // 12:00 o 13:00 en México
    expect(hoyMx()).toBe('2026-06-10');
  });
});

describe('puedeEditar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mediodía en México (evita quedar pegado a la medianoche por el TZ).
    vi.setSystemTime(new Date('2026-01-15T18:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('una vuelta de hoy siempre se puede editar', () => {
    expect(puedeEditar({ fecha: '2026-01-15' })).toBe(true);
  });

  it('una vuelta futura se puede preparar de antemano', () => {
    expect(puedeEditar({ fecha: '2026-01-16' })).toBe(true);
  });

  it('un día pasado es de sólo lectura fuera de la cola', () => {
    expect(puedeEditar({ fecha: '2026-01-14' })).toBe(false);
    expect(puedeEditar({ fecha: '2026-01-14' }, { desdeCola: false })).toBe(false);
  });

  it('desde la cola offline, el día anterior sí se admite (cierre sellado tarde)', () => {
    expect(puedeEditar({ fecha: '2026-01-14' }, { desdeCola: true })).toBe(true);
  });

  it('desde la cola offline, dos días atrás ya no se admite', () => {
    expect(puedeEditar({ fecha: '2026-01-13' }, { desdeCola: true })).toBe(false);
  });
});
