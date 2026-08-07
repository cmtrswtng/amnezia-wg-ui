<template>
  <header class="sticky top-0 z-30 flex items-center gap-3 -mx-4 px-4 py-3 border-b border-white/[0.06] backdrop-blur">
    <h1 class="text-sm font-semibold text-zinc-50 mr-auto">AmneziaWG UI</h1>

    <select
      class="glass-input !py-1.5 text-xs max-w-[4.5rem]"
      :value="locale"
      @change="changeLocale($event.target.value)"
    >
      <option v-for="l in availableLocales" :key="l" :value="l">{{ l }}</option>
    </select>

    <button class="glass-button" :title="$t('backup')" @click="$emit('backup')">
      ⭳ <span class="hidden sm:inline">{{ $t('backup') }}</span>
    </button>
    <label class="glass-button cursor-pointer" :title="$t('restore')">
      ⭱ <span class="hidden sm:inline">{{ $t('restore') }}</span>
      <input type="file" accept=".json,application/json" class="hidden" @change="onRestoreFile" />
    </label>
    <button class="glass-button" :title="$t('auditLog')" @click="$emit('audit')">
      ▤ <span class="hidden sm:inline">{{ $t('auditLog') }}</span>
    </button>
    <button v-if="requiresPassword" class="glass-button" :title="$t('logout')" @click="$emit('logout')">
      ⎋ <span class="hidden sm:inline">{{ $t('logout') }}</span>
    </button>
  </header>
</template>

<script setup>
import { useI18n } from 'vue-i18n';

import { useSession } from '../composables/useSession';

const emit = defineEmits(['backup', 'restore', 'audit', 'logout']);
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
