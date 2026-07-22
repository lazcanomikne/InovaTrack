<template>
  <div class="login-pantalla">
    <div class="login-caja glass-strong">
      <img src="/icons/icon-192.png" alt="" class="login-logo" />
      <h1 class="login-titulo">InovaTrack</h1>
      <p class="login-sub">Tu operación, bajo control.</p>

      <!-- Paso 1: correo -->
      <template v-if="paso === 'email'">
        <div class="campo">
          <label>Correo electrónico</label>
          <input
            ref="inputEmail"
            type="email"
            inputmode="email"
            autocomplete="username webauthn"
            autocapitalize="none"
            spellcheck="false"
            v-model="email"
            placeholder="tu@empresa.com"
            @keyup.enter="pedirCodigo"
          />
        </div>

        <f7-button large fill :disabled="!emailValido || cargando" @click="pedirCodigo">
          {{ cargando ? 'Enviando…' : 'Enviar código' }}
        </f7-button>

        <template v-if="mostrarFaceId">
          <div class="separador"><span>o</span></div>
          <f7-button large class="glass-btn" :disabled="cargando" @click="entrarFaceId">
            <i class="f7-icons faceid-icono">faceid</i> Entrar con Face ID
          </f7-button>
        </template>

        <p class="login-nota">
          Te enviaremos un código de 6 dígitos. Si es tu primera vez, crearás tu cuenta.
        </p>
      </template>

      <!-- Paso 2: código -->
      <template v-else-if="paso === 'codigo'">
        <p class="login-enviado">
          Enviamos un código a<br /><strong>{{ email }}</strong>
        </p>

        <div class="campo">
          <label>Código de 6 dígitos</label>
          <input
            ref="inputCodigo"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            v-model="codigo"
            placeholder="000000"
            class="input-codigo"
            @input="soloDigitos"
            @keyup.enter="verificar"
          />
        </div>

        <f7-button large fill :disabled="codigo.length !== 6 || cargando" @click="verificar">
          {{ cargando ? 'Verificando…' : 'Entrar' }}
        </f7-button>

        <div class="acciones-secundarias">
          <a class="link" @click="volver">Cambiar correo</a>
          <a class="link" :class="{ disabled: segundos > 0 }" @click="reenviar">
            {{ segundos > 0 ? `Reenviar en ${segundos}s` : 'Reenviar código' }}
          </a>
        </div>
      </template>

      <!-- Paso 3: nombre (solo cuentas nuevas) -->
      <template v-else>
        <p class="login-enviado">¡Correo verificado! 🎉<br />¿Cómo te llamas?</p>
        <div class="campo">
          <label>Nombre completo</label>
          <input
            ref="inputNombre"
            type="text"
            autocapitalize="words"
            autocomplete="name"
            v-model="nombre"
            placeholder="Tu nombre"
            @keyup.enter="registrar"
          />
        </div>
        <f7-button large fill :disabled="nombre.trim().length < 2 || cargando" @click="registrar">
          {{ cargando ? 'Creando cuenta…' : 'Crear cuenta y entrar' }}
        </f7-button>
      </template>

      <div v-if="error" class="login-error">
        <i class="f7-icons">exclamationmark_circle_fill</i><span>{{ error }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { api } from '@/js/api.js';
import { setSesion, ultimoEmail, recordarEmail } from '@/js/store.js';
import { tieneFaceId, entrarConPasskey } from '@/js/passkey.js';

const paso = ref('email');
const email = ref(ultimoEmail());
const codigo = ref('');
const nombre = ref('');
const tokenRegistro = ref('');
const cargando = ref(false);
const error = ref('');
const segundos = ref(0);
const hayFaceId = ref(false);
const inputEmail = ref(null);
const inputCodigo = ref(null);
const inputNombre = ref(null);
let cronometro = null;

const emailValido = computed(() => /^\S+@\S+\.\S+$/.test(email.value.trim()));
// Ofrecemos Face ID sólo si el dispositivo lo tiene y ya hemos visto este correo.
const mostrarFaceId = computed(() => hayFaceId.value && !!ultimoEmail());

function soloDigitos() {
  codigo.value = codigo.value.replace(/\D/g, '').slice(0, 6);
}

function arrancarCuenta() {
  segundos.value = 60;
  clearInterval(cronometro);
  cronometro = setInterval(() => {
    segundos.value -= 1;
    if (segundos.value <= 0) clearInterval(cronometro);
  }, 1000);
}

async function pedirCodigo() {
  if (!emailValido.value || cargando.value) return;
  cargando.value = true;
  error.value = '';
  try {
    await api.auth.solicitarCodigo(email.value.trim());
    recordarEmail(email.value.trim());
    paso.value = 'codigo';
    arrancarCuenta();
    await nextTick();
    inputCodigo.value?.focus();
  } catch (e) {
    error.value = e.message;
  } finally {
    cargando.value = false;
  }
}

async function reenviar() {
  if (segundos.value > 0) return;
  codigo.value = '';
  await pedirCodigo();
}

async function verificar() {
  if (codigo.value.length !== 6 || cargando.value) return;
  cargando.value = true;
  error.value = '';
  try {
    const r = await api.auth.verificarCodigo(email.value.trim(), codigo.value);
    if (r.registro) {
      // Correo nuevo: pasamos a capturar el nombre.
      tokenRegistro.value = r.token;
      paso.value = 'nombre';
      await nextTick();
      inputNombre.value?.focus();
    } else {
      setSesion(r.usuario);
    }
  } catch (e) {
    error.value = e.message;
    codigo.value = '';
  } finally {
    cargando.value = false;
  }
}

async function registrar() {
  if (nombre.value.trim().length < 2 || cargando.value) return;
  cargando.value = true;
  error.value = '';
  try {
    const { usuario } = await api.auth.registrar(tokenRegistro.value, nombre.value.trim());
    setSesion(usuario);
  } catch (e) {
    error.value = e.message;
  } finally {
    cargando.value = false;
  }
}

async function entrarFaceId() {
  cargando.value = true;
  error.value = '';
  try {
    const usuario = await entrarConPasskey(ultimoEmail());
    setSesion(usuario);
  } catch (e) {
    // 404 = no hay passkey registrada para ese correo en el servidor.
    error.value = e.status === 404
      ? 'Este correo no tiene Face ID activado. Entra con el código y actívalo en Perfil.'
      : e.message;
  } finally {
    cargando.value = false;
  }
}

function volver() {
  paso.value = 'email';
  codigo.value = '';
  error.value = '';
  clearInterval(cronometro);
  segundos.value = 0;
}

onMounted(async () => {
  hayFaceId.value = await tieneFaceId();
  await nextTick();
  if (!email.value) inputEmail.value?.focus();
});
onUnmounted(() => clearInterval(cronometro));
</script>

<style scoped>
.login-pantalla {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom));
}
.login-caja {
  width: 100%;
  max-width: 380px;
  border-radius: 26px;
  padding: 30px 24px 26px;
  text-align: center;
}
.login-logo { width: 68px; height: 68px; border-radius: 18px; margin-bottom: 14px; }
.login-titulo { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
.login-sub { margin: 4px 0 24px; font-size: 13px; opacity: 0.6; }

.campo { text-align: left; margin-bottom: 16px; }
.campo label { display: block; font-size: 12px; font-weight: 600; opacity: 0.6; margin-bottom: 6px; }
.campo input {
  width: 100%; box-sizing: border-box; height: 48px; padding: 0 14px;
  border-radius: 14px; border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.7); font-size: 16px; color: inherit;
}
.campo input:focus { outline: 2px solid var(--inova-primary); outline-offset: -1px; }
.input-codigo {
  text-align: center; font-size: 26px !important; font-weight: 700;
  letter-spacing: 12px; text-indent: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.separador { display: flex; align-items: center; gap: 12px; margin: 16px 0; opacity: 0.4; font-size: 12px; }
.separador::before, .separador::after { content: ''; flex: 1; height: 1px; background: currentColor; }

.faceid-icono { font-size: 20px; margin-right: 8px; }
.login-enviado { font-size: 14px; opacity: 0.75; margin: 0 0 20px; line-height: 1.5; }
.login-nota { font-size: 12px; opacity: 0.5; margin: 18px 0 0; line-height: 1.4; }

.acciones-secundarias { display: flex; justify-content: space-between; margin-top: 16px; font-size: 14px; }
.acciones-secundarias .disabled { opacity: 0.4; pointer-events: none; }

.login-error {
  margin-top: 16px; display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--st-vencido); text-align: left;
}
.login-error i { font-size: 18px; flex-shrink: 0; }
</style>
