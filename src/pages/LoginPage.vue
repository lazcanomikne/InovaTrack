<template>
  <div class="login-fondo">
    <div class="login-caja">
      <div class="login-marca">
        <div class="login-logo"><i class="f7-icons">cube_box_fill</i></div>
        <h1 class="login-titulo">InovaTrack</h1>
        <p class="login-sub">Reparto y entregas</p>
      </div>

      <form class="login-form" @submit.prevent="entrar">
        <label class="campo">
          <span class="campo-etiqueta">Usuario</span>
          <input
            ref="inputUsuario"
            v-model="usuario"
            type="text"
            inputmode="text"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            autocomplete="username"
            placeholder="tu usuario"
            :disabled="cargando"
          />
        </label>

        <label class="campo">
          <span class="campo-etiqueta">Contraseña</span>
          <div class="campo-clave">
            <input
              v-model="password"
              :type="verClave ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="••••••••"
              :disabled="cargando"
            />
            <button
              type="button"
              class="ojo"
              @click="verClave = !verClave"
              :aria-label="verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            >
              <i class="f7-icons">{{ verClave ? 'eye_slash' : 'eye' }}</i>
            </button>
          </div>
        </label>

        <p v-if="error" class="login-error">{{ error }}</p>

        <button type="submit" class="boton-entrar" :disabled="cargando || !puedeEnviar">
          {{ cargando ? 'Entrando…' : 'Entrar' }}
        </button>
      </form>

      <p class="login-pie">¿Olvidaste tu contraseña? Pídela en la oficina.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { api } from '@/js/api.js';
import { setSesion, ultimoUsuario, recordarUsuario } from '@/js/store.js';

const usuario = ref(ultimoUsuario());
const password = ref('');
const verClave = ref(false);
const cargando = ref(false);
const error = ref('');
const inputUsuario = ref(null);

const puedeEnviar = computed(() => !!usuario.value.trim() && !!password.value);

onMounted(async () => {
  // Si aún no hay usuario recordado, el foco arranca ahí.
  if (!usuario.value) {
    await nextTick();
    inputUsuario.value?.focus();
  }
});

async function entrar() {
  if (!puedeEnviar.value || cargando.value) return;
  cargando.value = true;
  error.value = '';
  try {
    const { usuario: u } = await api.auth.login(usuario.value.trim(), password.value);
    recordarUsuario(usuario.value.trim());
    password.value = '';
    setSesion(u);
  } catch (e) {
    error.value = e.message || 'No se pudo entrar.';
    password.value = '';
  } finally {
    cargando.value = false;
  }
}
</script>

<style scoped>
.login-fondo {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom));
  background-color: var(--aurora-color);
  background-image: var(--aurora-image);
}
.login-caja {
  width: 100%;
  max-width: 380px;
}

.login-marca {
  text-align: center;
  margin-bottom: 30px;
}
.login-logo {
  width: 74px;
  height: 74px;
  margin: 0 auto 14px;
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
  box-shadow: 0 10px 28px rgba(91, 91, 214, 0.4);
}
.login-logo i {
  font-size: 38px;
  color: #fff;
}
.login-titulo {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 0;
}
.login-sub {
  margin: 4px 0 0;
  font-size: 15px;
  opacity: 0.55;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.campo-etiqueta {
  display: block;
  font-size: 13px;
  font-weight: 600;
  opacity: 0.6;
  margin: 0 0 6px 4px;
}
.campo input {
  width: 100%;
  box-sizing: border-box;
  height: 54px;
  padding: 0 16px;
  font-size: 17px;
  border-radius: 15px;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.65);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  color: inherit;
}
.campo input:focus {
  outline: none;
  border-color: var(--inova-primary);
  box-shadow: 0 0 0 3px rgba(var(--f7-theme-color-rgb), 0.18);
}
.campo-clave {
  position: relative;
}
.campo-clave input {
  padding-right: 52px;
}
.ojo {
  position: absolute;
  right: 6px;
  top: 0;
  height: 54px;
  width: 44px;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.45;
  cursor: pointer;
}
.ojo i {
  font-size: 20px;
}

.login-error {
  margin: 0;
  padding: 11px 14px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: rgba(255, 69, 58, 0.9);
}

/* Botón grande: la app se usa de pie, en la calle, con una mano. */
.boton-entrar {
  height: 56px;
  margin-top: 4px;
  border: none;
  border-radius: 16px;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, var(--inova-primary), var(--inova-primary-2));
  box-shadow: 0 8px 22px rgba(91, 91, 214, 0.38);
  cursor: pointer;
  transition: transform 0.12s ease, opacity 0.15s ease;
}
.boton-entrar:active:not(:disabled) {
  transform: scale(0.97);
}
.boton-entrar:disabled {
  opacity: 0.5;
}

.login-pie {
  margin: 22px 0 0;
  text-align: center;
  font-size: 13px;
  opacity: 0.5;
}
</style>
