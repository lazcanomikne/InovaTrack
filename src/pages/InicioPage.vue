<template>
  <f7-page name="inicio">
    <div class="inicio-wrap">
      <h1 class="saludo">Hola, {{ nombreCorto }}</h1>

      <div class="glass tarjeta-vacia">
        <i class="f7-icons">square_stack_3d_up</i>
        <div>
          <div class="tv-titulo">InovaTrack listo</div>
          <div class="tv-sub">
            La base está montada (sesión, temas, notificaciones y perfil).
            Aquí van los módulos nuevos.
          </div>
        </div>
      </div>
    </div>
  </f7-page>
</template>

<script setup>
import { computed } from 'vue';
import { store } from '@/js/store.js';

const nombreCorto = computed(() => (store.usuario?.nombre || '').split(' ')[0] || '');
</script>

<style scoped>
.inicio-wrap {
  padding: 16px;
}
.saludo {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 8px 0 22px;
}
.tarjeta-vacia {
  border-radius: 18px;
  padding: 18px;
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.tarjeta-vacia i {
  font-size: 26px;
  color: var(--inova-primary);
  flex-shrink: 0;
}
.tv-titulo {
  font-weight: 700;
  font-size: 16px;
  margin-bottom: 4px;
}
.tv-sub {
  font-size: 14px;
  opacity: 0.6;
  line-height: 1.4;
}
</style>
