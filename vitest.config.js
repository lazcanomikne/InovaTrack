import { defineConfig } from 'vitest/config';

// Config aparte de vite.config.js: las pruebas son de lógica de servidor
// (Node), no necesitan el plugin de Vue ni el de PWA.
export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['node_modules/**', 'dist/**', 'dev-dist/**'],
  },
});
