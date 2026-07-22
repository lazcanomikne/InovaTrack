-- INOVATRACK · Módulo de vueltas (reparto)
--
-- Decisiones de diseño que conviene tener presentes:
--
-- 1. IDEMPOTENCIA. Todo lo que el teléfono puede crear estando sin señal lleva
--    `client_uuid` UNIQUE, generado en el dispositivo. La cola offline puede
--    reintentar el mismo envío N veces sin duplicar nada (el servidor hace
--    upsert por ese uuid). Sin esto, un reintento tras un timeout crea vueltas
--    o evidencias repetidas.
--
-- 2. HORA REAL vs HORA DE SERVIDOR. `ocurrido_en` es el momento que marcó el
--    dispositivo cuando el chofer hizo la acción; `created_at` es cuando llegó
--    al servidor. Pueden diferir horas si venía sin señal. Los reportes y la
--    evidencia legal usan `ocurrido_en`.
--
-- 3. NADA SE BORRA. Reprogramar no mueve la vuelta: cierra la del día original
--    como 'reprogramada' y crea una hija en la fecha destino, encadenada por
--    `vuelta_padre_id`. Así el historial queda íntegro y el contador de
--    intentos es real.
--
-- 4. MULTI-CHOFER DESDE FASE 1. `chofer_id` en cada vuelta y actor en cada
--    movimiento del historial: el panel de oficina (fase 2) no requiere migrar
--    datos, sólo leerlos.

DROP TABLE IF EXISTS vuelta_historial;
DROP TABLE IF EXISTS vuelta_evidencias;
DROP TABLE IF EXISTS vuelta_partidas;
DROP TABLE IF EXISTS vueltas;
DROP TABLE IF EXISTS motivos_no_entrega;

/* ------------------------------------------------------------------ */
/* Perfil de chofer: se añade sobre `usuarios` (ver 0001_init.sql).     */
/* Login por usuario+contraseña; el correo queda opcional.              */
/* ------------------------------------------------------------------ */
ALTER TABLE usuarios ADD COLUMN usuario TEXT;          -- nombre de acceso (único)
ALTER TABLE usuarios ADD COLUMN password_hash TEXT;    -- scrypt: sal:hash
ALTER TABLE usuarios ADD COLUMN vehiculo TEXT;
ALTER TABLE usuarios ADD COLUMN ruta TEXT;
ALTER TABLE usuarios ADD COLUMN activo INTEGER DEFAULT 1;

CREATE UNIQUE INDEX idx_usuarios_usuario ON usuarios(usuario) WHERE usuario IS NOT NULL;

/* ------------------------------------------------------------------ */
/* Catálogo de motivos de no entrega (administrable en fase 2).         */
/* ------------------------------------------------------------------ */
CREATE TABLE motivos_no_entrega (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT NOT NULL UNIQUE,
  texto TEXT NOT NULL,
  pide_texto INTEGER DEFAULT 0,   -- 1 = exige detalle libre ("otro")
  orden INTEGER DEFAULT 0,
  activo INTEGER DEFAULT 1
);

INSERT INTO motivos_no_entrega (clave, texto, pide_texto, orden) VALUES
  ('cerrado',     'Cliente cerrado',              0, 1),
  ('sin_quien',   'No había quien recibiera',     0, 2),
  ('direccion',   'Dirección incorrecta',         0, 3),
  ('rechazo',     'Cliente rechazó la mercancía', 0, 4),
  ('otro',        'Otro',                         1, 5);

/* ------------------------------------------------------------------ */
/* Vueltas                                                             */
/* ------------------------------------------------------------------ */
CREATE TABLE vueltas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_uuid TEXT UNIQUE,               -- idempotencia (ver nota 1)

  chofer_id INTEGER NOT NULL REFERENCES usuarios(id),
  fecha TEXT NOT NULL,                   -- 'YYYY-MM-DD': el día en que toca
  orden INTEGER DEFAULT 0,               -- prioridad dentro del día (arrastre)

  origen TEXT NOT NULL DEFAULT 'factura',-- factura | manual
  estado TEXT NOT NULL DEFAULT 'pendiente',
                                         -- pendiente | entregada | no_entregada
                                         -- | reprogramada | revision

  -- Cadena de reintentos
  intento INTEGER DEFAULT 1,
  vuelta_padre_id INTEGER REFERENCES vueltas(id),

  -- Datos de la factura (de SAP) o capturados a mano
  factura_folio TEXT,                    -- lo que trae el código de barras
  factura_numero TEXT,
  cliente_codigo TEXT,
  cliente_nombre TEXT,
  destinatario TEXT,
  contacto TEXT,
  telefono TEXT,
  direccion TEXT,
  notas TEXT,

  -- Cierre: no entregada
  motivo_clave TEXT REFERENCES motivos_no_entrega(clave),
  motivo_texto TEXT,

  -- Cierre: entregada
  recibio_nombre TEXT,

  -- Sello del cierre (ver nota 2). GPS del momento de la acción.
  cerrada_en TEXT,                       -- ocurrido_en de la transición final
  gps_lat REAL,
  gps_lng REAL,
  gps_precision REAL,

  -- Conflictos de sincronización (ej. factura reasignada mientras iba offline)
  conflicto TEXT,

  creado_por INTEGER REFERENCES usuarios(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Una misma factura no puede estar viva dos veces (evita el doble escaneo).
-- Sólo aplica a vueltas abiertas: si se reprograma, la vieja queda cerrada.
CREATE UNIQUE INDEX idx_vueltas_factura_viva
  ON vueltas(factura_folio)
  WHERE factura_folio IS NOT NULL AND estado = 'pendiente';

CREATE INDEX idx_vueltas_chofer_fecha ON vueltas(chofer_id, fecha);
CREATE INDEX idx_vueltas_fecha ON vueltas(fecha);
CREATE INDEX idx_vueltas_estado ON vueltas(estado);
CREATE INDEX idx_vueltas_padre ON vueltas(vuelta_padre_id);

/* ------------------------------------------------------------------ */
/* Partidas de la factura (artículos que se entregan)                  */
/* ------------------------------------------------------------------ */
CREATE TABLE vuelta_partidas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vuelta_id INTEGER NOT NULL REFERENCES vueltas(id) ON DELETE CASCADE,
  articulo TEXT,
  descripcion TEXT,
  cantidad REAL,
  bultos REAL,
  orden INTEGER DEFAULT 0
);

CREATE INDEX idx_partidas_vuelta ON vuelta_partidas(vuelta_id);

/* ------------------------------------------------------------------ */
/* Evidencias: fotos y firma                                           */
/* ------------------------------------------------------------------ */
CREATE TABLE vuelta_evidencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_uuid TEXT UNIQUE,               -- idempotencia (ver nota 1)
  vuelta_id INTEGER NOT NULL REFERENCES vueltas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,                    -- foto | firma
  url TEXT NOT NULL,                     -- Vercel Blob
  ocurrido_en TEXT,                      -- cuándo se tomó (reloj del teléfono)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_evid_vuelta ON vuelta_evidencias(vuelta_id);

/* ------------------------------------------------------------------ */
/* Historial: toda transición deja rastro (quién, cuándo, dónde, qué)  */
/* ------------------------------------------------------------------ */
CREATE TABLE vuelta_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_uuid TEXT UNIQUE,               -- idempotencia (ver nota 1)
  vuelta_id INTEGER NOT NULL REFERENCES vueltas(id) ON DELETE CASCADE,

  evento TEXT NOT NULL,                  -- creada | reordenada | editada
                                         -- | entregada | no_entregada
                                         -- | reprogramada | conflicto
  detalle TEXT,
  estado_anterior TEXT,
  estado_nuevo TEXT,

  actor_id INTEGER REFERENCES usuarios(id),
  ocurrido_en TEXT,                      -- reloj del dispositivo (ver nota 2)
  gps_lat REAL,
  gps_lng REAL,
  gps_precision REAL,

  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_hist_vuelta ON vuelta_historial(vuelta_id);
CREATE INDEX idx_hist_actor ON vuelta_historial(actor_id);
