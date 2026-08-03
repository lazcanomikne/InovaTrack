import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');
// Build id único por compilación (UTC), para comprobar que la app actualizó.
const buildId = new Date().toISOString().replace('T', ' ').slice(0, 16);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    vue(),
    VitePWA({
      // 'prompt' (no 'autoUpdate'): el service worker nuevo se queda
      // esperando (SW.waiting) hasta que la app decide activarlo a propósito
      // (src/js/actualizacion.js, botón "Actualizar app" en Perfil). Con
      // 'autoUpdate' el SW se activaba solo y no había forma de avisarle al
      // chofer ni de distinguir "ya estás al día" de "se acaba de actualizar".
      // injectRegister:false porque el registro lo hacemos a mano con
      // virtual:pwa-register (registerSW) para poder pedirle updateServiceWorker()
      // bajo demanda en vez del script automático.
      registerType: 'prompt',
      injectRegister: false,
      workbox: {
        cleanupOutdatedCaches: true,
        // clientsClaim sin skipWaiting: al activar el SW nuevo (a propósito)
        // toma control de las pestañas abiertas de inmediato, pero nunca lo
        // hace por su cuenta mientras está sólo "esperando".
        clientsClaim: true,
        // Inyecta los handlers de push (notificaciones nativas) en el SW.
        importScripts: ['/push-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // El API nunca se cachea de forma agresiva: siempre red primero.
        // /api/auth queda FUERA de la caché: una respuesta de sesión guardada
        // dejaría al usuario "dentro" (o "fuera") sin que sea cierto.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'inovatrack-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
            },
          },
        ],
      },
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'InovaTrack',
        short_name: 'InovaTrack',
        description: 'Delegación y seguimiento de pendientes',
        lang: 'es',
        theme_color: '#5b5bd6',
        background_color: '#f2f1fb',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // OJO al probar el flujo de actualización (src/js/actualizacion.js):
      // en `npm run dev`, virtual:pwa-register es un stub que no registra
      // nada ni dispara eventos (ver node_modules/vite-plugin-pwa/dist/client/dev/register.js).
      // Para probar "Actualizar app" de verdad hace falta `npm run build`
      // + `npm run preview` (dos veces, para simular una versión nueva).
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    // En dev, si corres `vercel dev` (puerto 3000) el front hace proxy del API.
    // Si no, las pantallas usan datos demo automáticamente.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2019',
    outDir: 'dist',
  },
});
