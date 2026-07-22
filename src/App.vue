<template>
  <f7-app v-bind="f7params">
    <!-- Mientras preguntamos al servidor si hay sesión, no parpadeamos el login -->
    <div v-if="store.comprobandoSesion" class="arranque">
      <f7-preloader size="32" />
    </div>

    <LoginPage v-else-if="!store.autenticado" />

    <template v-else>
      <!-- Una <f7-view> por tab. Al agregar un módulo: añade aquí su view y
           su entrada en `tabs` (abajo), con la misma convención id="view-<id>". -->
      <f7-views tabs class="safe-areas">
        <f7-view id="view-vueltas" main tab tab-active url="/" />
        <f7-view id="view-perfil" tab url="/perfil/" />
      </f7-views>

      <!-- Pastilla flotante (glass) — en <body> para que quede sobre todo.
           Se oculta cuando hay un modal abierto (diálogo, sheet, picker…) para
           que nunca tape un selector. -->
      <Teleport to="body">
        <nav class="floating-nav" v-show="!modalAbierto">
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            class="fnav-item"
            :class="{ active: active === t.id, create: t.id === 'captura' }"
            @click="show(t.id)"
          >
            <i class="f7-icons">{{ t.icon }}</i>
            <span>{{ t.label }}</span>
          </button>
        </nav>
      </Teleport>
    </template>
  </f7-app>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { f7, f7ready } from 'framework7-vue';
import routes from '@/js/routes.js';
import { api } from '@/js/api.js';
import { store, setSesion } from '@/js/store.js';
import { sincronizar as sincronizarPush } from '@/js/push.js';
import LoginPage from '@/pages/LoginPage.vue';

const f7params = reactive({
  name: 'InovaTrack',
  theme: 'ios',
  darkMode: false,
  colors: { primary: '#5b5bd6' },
  routes,
  view: { iosDynamicNavbar: true, pushState: false },
  touch: { tapHold: true },
});

// Ítems de la pila. Al agregar un módulo, añade aquí su entrada (y su
// <f7-view id="view-<id>"> arriba). Si hay un ítem de "crear", ponle
// id 'captura' o añade la clase `create` para el botón en gradiente.
const tabs = [
  { id: 'vueltas', label: 'Mis vueltas', icon: 'square_list_fill' },
  { id: 'perfil', label: 'Perfil', icon: 'person_fill' },
];

const active = ref('vueltas');

// La pila se esconde mientras haya un modal abierto (evita que tape selectores).
// Contamos aperturas y cierres; ignoramos toasts y notificaciones (son
// efímeros y no bloquean la interacción).
const modalesAbiertos = ref(0);
const modalAbierto = computed(() => modalesAbiertos.value > 0);
function modalRelevante(m) {
  const el = m?.el;
  if (!el) return true;
  return !el.classList.contains('toast') && !el.classList.contains('notification');
}

function show(id) {
  f7.tab.show(`#view-${id}`);
}

// Mantiene el resaltado de la pastilla sincronizado, incluso cuando otra
// pantalla cambia de tab por código.
onMounted(async () => {
  f7ready(() => {
    f7.on('tabShow', (tabEl) => {
      const id = tabEl?.id?.replace('view-', '');
      if (id) active.value = id;
    });

    // Oculta/muestra la pila con cualquier modal (diálogo, sheet, picker, popup…).
    f7.on('modalOpen', (m) => { if (modalRelevante(m)) modalesAbiertos.value++; });
    f7.on('modalClose', (m) => {
      if (modalRelevante(m)) modalesAbiertos.value = Math.max(0, modalesAbiertos.value - 1);
    });
  });

  // ¿Hay cookie de sesión válida?
  try {
    const { usuario } = await api.auth.yo();
    setSesion(usuario);
    // Si este dispositivo ya tiene notificaciones activas, lo (re)registra para
    // el usuario actual — así al cambiar de teléfono sigue recibiendo push.
    sincronizarPush();
  } catch {
    setSesion(null); // 401: se muestra el login
  } finally {
    store.comprobandoSesion = false;
  }
});
</script>

<style scoped>
.arranque {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
