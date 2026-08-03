// Pruebas de colorEstatus (la única lógica pura de _db.js: el resto son
// helpers que hablan con Turso). Se pasan objetos Date ya construidos en hora
// local en vez de strings 'YYYY-MM-DD', para que la prueba no dependa de la
// zona horaria de quien la corre (un string ISO sin hora se interpreta en
// UTC, y podría "correrse" un día al compararlo en hora local).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { colorEstatus } from './_db.js';

describe('colorEstatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0)); // 15 de enero, mediodía local
  });
  afterEach(() => vi.useRealTimers());

  it('concluido y aprobado siempre son "concluido", sin mirar la fecha', () => {
    expect(colorEstatus({ estatus: 'concluido' })).toBe('concluido');
    expect(colorEstatus({ estatus: 'aprobado', fecha_compromiso: new Date(2020, 0, 1) })).toBe('concluido');
  });

  it('en_espera es "espera"', () => {
    expect(colorEstatus({ estatus: 'en_espera' })).toBe('espera');
  });

  it('sin fecha de compromiso, es "tiempo"', () => {
    expect(colorEstatus({ estatus: 'pendiente', fecha_compromiso: null })).toBe('tiempo');
  });

  it('con la fecha ya pasada, es "vencido"', () => {
    const ayer = new Date(2026, 0, 14);
    expect(colorEstatus({ estatus: 'pendiente', fecha_compromiso: ayer })).toBe('vencido');
  });

  it('con la fecha de hoy, es "hoy"', () => {
    const hoy = new Date(2026, 0, 15);
    expect(colorEstatus({ estatus: 'pendiente', fecha_compromiso: hoy })).toBe('hoy');
  });

  it('con la fecha de mañana, es "manana"', () => {
    const manana = new Date(2026, 0, 16);
    expect(colorEstatus({ estatus: 'pendiente', fecha_compromiso: manana })).toBe('manana');
  });

  it('con la fecha más adelante, es "tiempo"', () => {
    const enCincoDias = new Date(2026, 0, 20);
    expect(colorEstatus({ estatus: 'pendiente', fecha_compromiso: enCincoDias })).toBe('tiempo');
  });
});
