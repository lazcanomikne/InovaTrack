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
      // autoUpdate: el nuevo service worker toma control y refresca la app
      // sin que el usuario tenga que reinstalar la PWA desde cero.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
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
