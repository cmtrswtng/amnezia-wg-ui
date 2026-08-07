<template>
  <div class="min-h-screen">
    <LoginView v-if="authenticated === false" />
    <div v-else-if="authenticated === true" class="mx-auto max-w-6xl p-4 flex flex-col gap-4">
      <AppHeader @backup="onBackup" @restore="onRestore" @logout="onLogout" />
      <!-- Task 7–9: toolbar + stats + client list -->
      <div class="glass p-6 text-sm text-zinc-400">Loading clients…</div>
    </div>
    <Toasts />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';

import { api } from './api/client';
import AppHeader from './components/AppHeader.vue';
import LoginView from './components/LoginView.vue';
import Toasts from './components/Toasts.vue';
import { useClients } from './composables/useClients';
import { useSession } from './composables/useSession';
import { useSettings } from './composables/useSettings';
import { useToasts } from './composables/useToasts';

const { authenticated, init, logout, onUnauthorized } = useSession();
const { load: loadSettings } = useSettings();
const { refresh, startPolling, stopPolling } = useClients();
const toasts = useToasts();
const { locale, availableLocales } = useI18n();

async function boot() {
  try {
    await init();
    if (authenticated.value) {
      await Promise.all([loadSettings(), refresh()]);
      startPolling();
    }
  } catch (err) {
    toasts.error(err.message);
  }
}

// Server-side LANG overrides localStorage (same behavior as the legacy UI)
async function syncServerLocale() {
  try {
    const lang = await api.getLang();
    if (lang !== localStorage.getItem('lang') && availableLocales.value.includes(lang)) {
      localStorage.setItem('lang', lang);
      locale.value = lang;
    }
  } catch {
    // keep current locale
  }
}

function onBackup() {
  api.backup()
    .then((config) => {
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wg0.json';
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch((err) => toasts.error(err.message));
}

function onRestore(file) {
  file.text()
    .then((content) => api.restore(content))
    .then(() => refresh())
    .catch((err) => toasts.error(err.message));
}

function onLogout() {
  stopPolling();
  logout();
}

onMounted(() => {
  window.addEventListener('api:unauthorized', onUnauthorized);
  boot();
  syncServerLocale();
});

onUnmounted(() => {
  window.removeEventListener('api:unauthorized', onUnauthorized);
  stopPolling();
});
</script>
