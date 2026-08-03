import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'public/**'] },

  js.configs.recommended,
  // 'essential' (no 'recommended'/'strongly-recommended'): esas capas son en
  // su mayoría estilo de formato HTML (atributos por línea, self-closing,
  // orden de atributos) que reformatearían casi todas las plantillas ya
  // escritas. 'essential' se queda con lo que de verdad atrapa errores
  // (sintaxis de template inválida, keys duplicadas, side-effects en
  // computed, etc.), que es lo que le corresponde a una primera red de
  // seguridad de lint.
  ...pluginVue.configs['flat/essential'],

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },

  // Backend (funciones serverless) y scripts de Node.
  {
    files: ['api/**/*.js', 'scripts/**/*.mjs', 'scripts/**/*.js', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Pruebas: Node + globals de Vitest (aunque en este repo se importan explícitos).
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Cliente (Vue + JS de navegador).
  {
    files: ['src/**/*.js', 'src/**/*.vue'],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Inyectados por Vite en build time (ver `define` en vite.config.js).
        __APP_VERSION__: 'readonly',
        __BUILD_ID__: 'readonly',
      },
    },
  },

  {
    rules: {
      // El proyecto usa `_` como convención para parámetros/variables no
      // usados a propósito (p. ej. en catch); no marcarlos como error.
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
];
