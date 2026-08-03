import { createApp } from 'vue';

// Framework7
import Framework7 from 'framework7/lite-bundle';
import Framework7Vue, { registerComponents } from 'framework7-vue/bundle';

// Estilos Framework7 (core + tema)
import 'framework7/css/bundle';
// Iconos Framework7
import 'framework7-icons/css/framework7-icons.css';

// Estilos propios (incluye capa liquid glass)
import './css/app.css';

import App from './App.vue';
import { iniciarTema } from './js/tema.js';
import { iniciarActualizaciones } from './js/actualizacion.js';

// Aplica el tema de color guardado antes de montar (evita parpadeo).
iniciarTema();

// Registra el service worker "a mano" (ver vite.config.js: injectRegister
// false + registerType 'prompt') para controlar cuándo se activa una
// versión nueva en vez de que lo haga sola.
iniciarActualizaciones();

// Inicializa el plugin de Framework7 para Vue
Framework7.use(Framework7Vue);

const app = createApp(App);

// Registra todos los componentes de Framework7 (f7-page, f7-navbar, etc.)
registerComponents(app);

app.mount('#app');
