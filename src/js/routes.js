import InicioPage from '@/pages/InicioPage.vue';
import PerfilPage from '@/pages/PerfilPage.vue';
import NotFoundPage from '@/pages/NotFoundPage.vue';

// Rutas de InovaTrack. Aquí se van agregando los módulos nuevos, p. ej.:
//   { path: '/modulo/', component: ModuloPage },
//   { path: '/modulo/:id/', component: ModuloDetallePage },
const routes = [
  { path: '/', component: InicioPage },
  { path: '/perfil/', component: PerfilPage },
  { path: '(.*)', component: NotFoundPage },
];

export default routes;
