<template>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="glass p-4 border-t-2 border-t-indigo-400/40">
      <div class="text-2xl font-semibold bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">{{ total }}</div>
      <div class="text-xs text-zinc-400">{{ $t('totalClients') }}</div>
    </div>
    <div class="glass p-4 border-t-2 border-t-emerald-400/40">
      <div class="text-2xl font-semibold text-emerald-400">{{ active }}</div>
      <div class="text-xs text-zinc-400">{{ $t('activeClients') }}</div>
    </div>
    <div class="glass p-4 border-t-2" :class="expired ? 'border-t-red-400/40' : 'border-t-white/10'">
      <div class="text-2xl font-semibold" :class="expired ? 'text-red-400' : 'text-zinc-100'">{{ expired }}</div>
      <div class="text-xs text-zinc-400">{{ $t('expiredClients') }}</div>
    </div>
    <div class="glass p-4">
      <div class="text-sm font-medium text-zinc-100">↓ {{ formatBytes(totalRx) }}</div>
      <div class="text-sm font-medium text-zinc-100">↑ {{ formatBytes(totalTx) }}</div>
      <div class="text-xs text-zinc-400">{{ $t('traffic') }}</div>
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
