<template>
  <BaseModal max-width="max-w-2xl" @close="$emit('close')">
    <h2 class="text-sm font-semibold text-zinc-100 mb-3">{{ $t('auditLog') }}</h2>
    <input v-model="filter" type="search" class="glass-input w-full mb-3" :placeholder="$t('auditFilter')" />

    <div v-if="entries === null" class="text-xs text-zinc-500">Loading…</div>
    <div v-else-if="filtered.length === 0" class="text-xs text-zinc-600">{{ $t('noData') }}</div>
    <div v-else class="max-h-96 overflow-y-auto flex flex-col">
      <div v-for="(entry, i) in filtered" :key="i" class="flex items-baseline gap-2 py-1 text-xs border-b border-white/[0.04] last:border-0">
        <span class="text-zinc-600 shrink-0 font-mono">{{ formatDateTime(entry.ts) }}</span>
        <span
          class="shrink-0 px-1.5 py-px text-[0.65rem]"
          :class="entry.actor === 'system' ? 'bg-white/[0.06] text-zinc-400' : 'bg-sky-400/10 text-sky-300'"
        >{{ $t(`auditActor_${entry.actor}`) }}</span>
        <span class="text-zinc-300">{{ $t(`auditAction_${entry.action.replaceAll('.', '_')}`) }}</span>
        <span v-if="entry.clientName" class="text-zinc-500 truncate">{{ entry.clientName }}</span>
        <span v-if="entry.details" class="text-zinc-600 truncate font-mono">{{ formatDetails(entry.details) }}</span>
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';

import { api } from '../api/client';
import { formatDateTime } from '../utils/format';
import BaseModal from './ui/BaseModal.vue';

defineEmits(['close']);

const entries = ref(null);
const filter = ref('');

onMounted(async () => {
  entries.value = await api.getAudit().catch(() => []);
});

const filtered = computed(() => {
  const list = entries.value ?? [];
  const q = filter.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((e) => (e.clientName ?? '').toLowerCase().includes(q)
    || e.action.toLowerCase().includes(q));
});

function formatDetails(details) {
  if (details == null) return '';
  if (typeof details === 'string') return details;
  return JSON.stringify(details);
}
</script>
