<template>
  <header class="sticky top-0 z-30 flex items-center gap-3 -mx-4 px-4 py-3 bg-[#2a2b2d]/85 backdrop-blur-[8px] border-b border-white/[0.06]">
    <h1 class="text-sm font-semibold text-zinc-50 mr-auto">AmneziaWG Easy</h1>

    <select
      class="glass-input !py-1.5 text-xs"
      :value="locale"
      @change="changeLocale($event.target.value)"
    >
      <option v-for="l in availableLocales" :key="l" :value="l">{{ l }}</option>
    </select>

    <button class="glass-button" :title="$t('backup')" @click="$emit('backup')">
      ⭳ {{ $t('backup') }}
    </button>
    <label class="glass-button cursor-pointer" :title="$t('restore')">
      ⭱ {{ $t('restore') }}
      <input type="file" accept=".json,application/json" class="hidden" @change="onRestoreFile" />
    </label>
    <button v-if="requiresPassword" class="glass-button" @click="$emit('logout')">{{ $t('logout') }}</button>
  </header>
</template>

<script setup>
import { useI18n } from 'vue-i18n';

import { useSession } from '../composables/useSession';

const emit = defineEmits(['backup', 'restore', 'logout']);
const { locale, availableLocales } = useI18n();
const { requiresPassword } = useSession();

function changeLocale(l) {
  locale.value = l;
  localStorage.setItem('lang', l);
}

function onRestoreFile(event) {
  const file = event.target.files?.[0];
  if (file) emit('restore', file);
  event.target.value = '';
}
</script>
