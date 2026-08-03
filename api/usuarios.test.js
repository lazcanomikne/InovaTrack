import { describe, it, expect, beforeEach, vi } from 'vitest';

// El handler real habla con Turso y con la cookie de sesión: se sustituyen las
// dos puertas para poder ejercitar SU lógica (permisos, normalización y los
// candados anti-bloqueo), que es lo que aquí importa.
const ejecutar = vi.fn();
let sesionActual = null;

vi.mock('./_db.js', () => ({
  db: () => ({ execute: ejecutar }),
  sendJson: (res, data, status = 200) => { res.status = status; res.body = data; return res; },
  sendError: (res, error, status = 400) => { res.status = status; res.body = { error }; return res; },
  readBody: (req) => req.body ?? {},
}));
vi.mock('./_auth.js', () => ({
  requiereSesion: async (req, res) => {
    if (!sesionActual) { res.status = 401; res.body = { error: 'No autenticado' }; return null; }
    return sesionActual;
  },
}));

const { default: handler } = await import('./usuarios.js');

const ADMIN = { id: 1, nombre: 'Leo', rol: 'direccion' };
const CHOFER = { id: 7, nombre: 'Juan', rol: 'chofer' };

function correr(metodo, body, sesion) {
  sesionActual = sesion;
  const res = { status: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; } };
  return handler({ method: metodo, body }, res).then(() => res);
}

// Por defecto: ninguna consulta devuelve filas (sin duplicados de correo).
beforeEach(() => {
  ejecutar.mockReset();
  ejecutar.mockResolvedValue({ rows: [] });
});

describe('POST /api/usuarios (alta)', () => {
  it('un chofer no puede dar de alta', async () => {
    const res = await correr('POST', { nombre: 'X', email: 'x@y.com' }, CHOFER);
    expect(res.status).toBe(403);
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it('normaliza el correo a minúsculas', async () => {
    ejecutar
      .mockResolvedValueOnce({ rows: [] })                       // no hay duplicado
      .mockResolvedValueOnce({ rows: [{ id: 9, rol: 'chofer' }] }); // INSERT ... RETURNING
    const res = await correr('POST', { nombre: ' Ana ', email: 'ANA@Empresa.COM' }, ADMIN);
    expect(res.status).toBe(201);
    const insert = ejecutar.mock.calls[1][0];
    expect(insert.args[0]).toBe('Ana');              // nombre recortado
    expect(insert.args[1]).toBe('ana@empresa.com');  // correo normalizado
  });

  it('rechaza un correo ya usado, aunque cambie de mayúsculas', async () => {
    ejecutar.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    const res = await correr('POST', { nombre: 'Ana', email: 'ANA@empresa.com' }, ADMIN);
    expect(res.status).toBe(409);
  });

  it('rechaza un rol inventado', async () => {
    const res = await correr('POST', { nombre: 'Ana', email: 'a@b.com', rol: 'jefe' }, ADMIN);
    expect(res.status).toBe(400);
  });

  it('rechaza un correo mal formado', async () => {
    const res = await correr('POST', { nombre: 'Ana', email: 'sin-arroba' }, ADMIN);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/usuarios (administración)', () => {
  it('un chofer no puede editar a otro', async () => {
    const res = await correr('PATCH', { id: 99, rol: 'direccion' }, CHOFER);
    expect(res.status).toBe(403);
  });

  it('un chofer sí puede cambiar su propia foto', async () => {
    ejecutar.mockResolvedValue({ rows: [{ id: 7 }] });
    const res = await correr('PATCH', { avatar: 'data:image/jpeg;base64,AAA' }, CHOFER);
    expect(res.status).toBe(200);
    expect(ejecutar.mock.calls[0][0].sql).toContain('avatar = ?');
  });

  // Los dos candados que evitan quedarse sin ningún administrador.
  it('un administrador no puede degradarse a sí mismo', async () => {
    const res = await correr('PATCH', { id: 1, rol: 'chofer' }, ADMIN);
    expect(res.status).toBe(409);
  });

  it('un administrador no puede darse de baja a sí mismo', async () => {
    const res = await correr('PATCH', { id: 1, activo: 0 }, ADMIN);
    expect(res.status).toBe(409);
  });

  it('sí puede degradar a otro', async () => {
    ejecutar.mockResolvedValue({ rows: [{ id: 2 }] });
    const res = await correr('PATCH', { id: 2, rol: 'chofer' }, ADMIN);
    expect(res.status).toBe(200);
  });

  it('un chofer no puede colarse un rol en su propio PATCH', async () => {
    ejecutar.mockResolvedValue({ rows: [{ id: 7 }] });
    // Sin `id` es "mi perfil": los campos de administración se ignoran y sólo
    // queda el avatar. Sin avatar, no hay nada que actualizar.
    const res = await correr('PATCH', { rol: 'direccion' }, CHOFER);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Nada que actualizar');
  });
});

describe('GET /api/usuarios', () => {
  it('al chofer sólo le da los activos y sin datos de administración', async () => {
    await correr('GET', null, CHOFER);
    const sql = ejecutar.mock.calls[0][0];
    expect(sql).toContain('activo = 1');
    expect(sql).not.toContain('vehiculo');
  });

  it('al administrador le da el estado completo', async () => {
    await correr('GET', null, ADMIN);
    const sql = ejecutar.mock.calls[0][0];
    expect(sql).toContain('vehiculo');
    expect(sql).toContain('activo');
  });
});

describe('métodos no soportados', () => {
  it('DELETE ya no devuelve la lista: responde 405', async () => {
    const res = await correr('DELETE', null, ADMIN);
    expect(res.status).toBe(405);
    expect(res.headers.Allow).toBe('GET, POST, PATCH');
  });
});
