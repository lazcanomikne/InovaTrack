import VueltasPage from '@/pages/VueltasPage.vue';
import VueltaDetallePage from '@/pages/VueltaDetallePage.vue';
import PerfilPage from '@/pages/PerfilPage.vue';
import AdminPage from '@/pages/AdminPage.vue';
import NotFoundPage from '@/pages/NotFoundPage.vue';

const routes = [
  { path: '/', component: VueltasPage },
  { path: '/vueltas/', component: VueltasPage },
  { path: '/vueltas/:id/', component: VueltaDetallePage },
  { path: '/perfil/', component: PerfilPage },
  { path: '/admin/', component: AdminPage },
  { path: '(.*)', component: NotFoundPage },
];

export default routes;
