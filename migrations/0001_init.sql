-- INOVATRACK · Esquema base (Turso / libSQL / SQLite)
--
-- Sólo la infraestructura común: usuarios, acceso por código (OTP), passkeys
-- (WebAuthn) y suscripciones push. Las tablas de cada módulo van en migraciones
-- aparte (0002_<modulo>.sql, etc.) para no volver a tocar este archivo.
--
-- OJO: este script es destructivo (DROP). Sólo para inicializar la base.

DROP TABLE IF EXISTS push_subs;
DROP TABLE IF EXISTS retos_webauthn;
DROP TABLE IF EXISTS credenciales;
DROP TABLE IF EXISTS codigos_acceso;
DROP TABLE IF EXISTS usuarios;

CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE,
  rol TEXT DEFAULT 'colaborador',      -- direccion | jefe | colaborador
  avatar TEXT,                         -- data URL (jpeg reescalado en el cliente)
  created_at TEXT DEFAULT (datetime('now'))
);

-- Códigos de acceso de un solo uso. Se guarda el hash, nunca el código.
CREATE TABLE codigos_acceso (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  codigo_hash TEXT NOT NULL,
  expira_en TEXT NOT NULL,             -- ISO UTC
  intentos INTEGER DEFAULT 0,
  usado INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_codigos_email ON codigos_acceso(email);
CREATE INDEX idx_codigos_created ON codigos_acceso(created_at);

-- Passkeys registradas por dispositivo (llave pública; la privada nunca sale del equipo).
CREATE TABLE credenciales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,            -- base64url
  counter INTEGER DEFAULT 0,
  transports TEXT,
  dispositivo TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT
);
CREATE INDEX idx_cred_usuario ON credenciales(usuario_id);

-- Retos (challenges) temporales de WebAuthn. Se borran al usarse.
CREATE TABLE retos_webauthn (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  challenge TEXT NOT NULL,
  tipo TEXT NOT NULL,                  -- 'registro' | 'login'
  expira_en TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_retos_email ON retos_webauthn(email);

-- Suscripciones a notificaciones push (una por dispositivo/navegador del usuario).
CREATE TABLE push_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  dispositivo TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_push_usuario ON push_subs(usuario_id);
