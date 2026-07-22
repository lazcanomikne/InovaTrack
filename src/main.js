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

// Aplica el tema de color guardado antes de montar (evita parpadeo).
iniciarTema();

// Inicializa el plugin de Framework7 para Vue
Framework7.use(Framework7Vue);

const app = createApp(App);

// Registra todos los componentes de Framework7 (f7-page, f7-navbar, etc.)
registerComponents(app);

app.mount('#app');
