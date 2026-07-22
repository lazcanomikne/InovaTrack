import VueltasPage from '@/pages/VueltasPage.vue';
import PerfilPage from '@/pages/PerfilPage.vue';
import NotFoundPage from '@/pages/NotFoundPage.vue';

const routes = [
  { path: '/', component: VueltasPage },
  { path: '/vueltas/', component: VueltasPage },
  { path: '/perfil/', component: PerfilPage },
  { path: '(.*)', component: NotFoundPage },
];

export default routes;
