<template>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="glass p-4">
      <div class="text-xl font-semibold text-zinc-50">{{ total }}</div>
      <div class="text-[11px] uppercase tracking-wider text-zinc-500 mt-1">{{ $t('totalClients') }}</div>
    </div>
    <div class="glass p-4">
      <div class="text-xl font-semibold text-zinc-50">{{ active }}</div>
      <div class="text-[11px] uppercase tracking-wider text-zinc-500 mt-1">{{ $t('activeClients') }}</div>
    </div>
    <div class="glass p-4">
      <div class="text-xl font-semibold" :class="expired ? 'text-red-400' : 'text-zinc-50'">{{ expired }}</div>
      <div class="text-[11px] uppercase tracking-wider text-zinc-500 mt-1">{{ $t('expiredClients') }}</div>
    </div>
    <div class="glass p-4">
      <div class="text-sm font-medium text-zinc-50">↓ {{ formatBytes(totalRx) }}</div>
      <div class="text-sm font-medium text-zinc-50">↑ {{ formatBytes(totalTx) }}</div>
      <div class="text-[11px] uppercase tracking-wider text-zinc-500 mt-1">{{ $t('traffic') }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

import { formatBytes } from '../utils/format';

const props = defineProps({
  clients: { type: Array, default: null },
});

const list = computed(() => props.clients ?? []);
const total = computed(() => list.value.length);
const active = computed(() => list.value.filter((c) => c.enabled && !c.isExpired).length);
const expired = computed(() => list.value.filter((c) => c.isExpired).length);
const totalRx = computed(() => list.value.reduce((sum, c) => sum + (c.transferRx || 0), 0));
const totalTx = computed(() => list.value.reduce((sum, c) => sum + (c.transferTx || 0), 0));
</script>
