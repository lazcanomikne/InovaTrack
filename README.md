# InovaTrack

PWA con la misma base técnica que InovaOS, pero con **módulos propios** y **base de datos nueva**.

Lo que ya viene montado (infraestructura lista para usar):

- **Sesión** passwordless: código de 6 dígitos por correo (OTP) + **passkeys / Face ID**.
- **Perfil**: foto, temáticas y paletas de color, activar/desactivar notificaciones.
- **Notificaciones push** nativas (VAPID) y **correo** (SMTP).
- **Subida de archivos** directa a Vercel Blob.
- **Look & feel** liquid glass, fondo aurora temable, pastilla de navegación flotante,
  edge-to-edge en iPhone (safe areas, franja del notch tintada), modo oscuro.
- **PWA** instalable con auto-actualización (no hay que reinstalar el icono).

Los módulos de InovaOS (pendientes, checklist, evidencias, tablero, métricas, IA)
**no** están: esta base queda libre para los módulos nuevos.

---

## Arrancar

```bash
npm install
cp .env.example .env      # y rellena los valores (ver abajo)
npm run db:migrate        # crea el esquema base  ⚠️ hace DROP TABLE
npm run dev               # Vite en http://localhost:5173
```

Para probar el API en local (funciones serverless) en otra terminal:

```bash
npx vercel dev            # puerto 3000; Vite le hace proxy automáticamente
```

## Variables de entorno

Están documentadas en [`.env.example`](.env.example). Lo mínimo para levantar:

| Variable | Para qué |
|---|---|
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Base de datos (**crea una nueva**, no reuses la de InovaOS) |
| `AUTH_SECRET` | Firma de sesión y de los códigos OTP (`openssl rand -base64 32`) |
| `SMTP_*` | Envío del código de acceso por correo |
| `VAPID_*` | Notificaciones push (`npx web-push generate-vapid-keys`) |
| `BLOB_READ_WRITE_TOKEN` | Adjuntar archivos |
| `WEBAUTHN_*` | Passkeys / Face ID |

## Estructura

```
├─ api/                    # funciones serverless (backend)
│  ├─ _db.js _auth.js _mail.js _push.js _logo.js
│  ├─ auth/[...ruta].js    # OTP + passkeys
│  ├─ usuarios.js  push.js  blob-upload.js
│  └─ <modulo>/            # ← aquí van los endpoints de cada módulo nuevo
├─ migrations/
│  └─ 0001_init.sql        # usuarios, OTP, passkeys, push_subs
│                          # ← 0002_<modulo>.sql para las tablas de cada módulo
├─ src/
│  ├─ App.vue              # shell: tabs + pastilla flotante
│  ├─ pages/               # InicioPage, PerfilPage, LoginPage, NotFoundPage
│  ├─ js/                  # api, store, routes, tema, push, passkey, celebracion, voz
│  └─ css/app.css          # liquid glass + temas + safe areas
└─ vite.config.js          # Vue + PWA + proxy /api → :3000
```

## Cómo agregar un módulo

1. **Migración**: `migrations/0002_<modulo>.sql` con sus tablas → `node scripts/migrate.mjs 0002_<modulo>.sql`
2. **Backend**: `api/<modulo>/index.js` (lista + alta) y `api/<modulo>/[id].js` (detalle, editar, borrar).
   Protege cada endpoint con `requiereSesion(req, res)`.
3. **Cliente**: agrega el bloque del módulo en `src/js/api.js`.
4. **Pantallas**: crea las `.vue` en `src/pages/` y regístralas en `src/js/routes.js`.
5. **Navegación**: añade la `<f7-view id="view-<id>">` y su entrada en `tabs` dentro de `src/App.vue`.

> Nota: el plan Hobby de Vercel permite **12 funciones serverless**. Si te acercas al
> límite, agrupa endpoints en un solo archivo y distingue por query param
> (así se hizo el checklist en InovaOS).

## Deploy

Vercel. Este proyecto **no** está vinculado todavía: corre `npx vercel link` y crea un
proyecto **nuevo** (no reutilices el de InovaOS). Después, push a `main` = deploy.
