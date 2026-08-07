<template>
  <section class="glass px-4 py-3">
    <button type="button" class="flex items-center gap-2 w-full text-left" @click="toggle">
      <span class="text-xs uppercase tracking-wider text-zinc-500">{{ $t('dashboard') }}</span>
      <span class="ml-auto text-zinc-500 text-xs">{{ collapsed ? '▸' : '▾' }}</span>
    </button>

    <div v-if="!collapsed" class="grid gap-4 md:grid-cols-3 mt-3">
      <!-- Истекают за 7 дней -->
      <div>
        <div class="text-xs uppercase tracking-wider text-zinc-500 mb-2">
          {{ $t('expiringNext7d') }}<span v-if="expiring.length"> · {{ expiring.length }}</span>
        </div>
        <div v-if="!expiring.length" class="text-xs text-zinc-600">{{ $t('noData') }}</div>
        <div v-for="c in expiring.slice(0, 5)" :key="c.id" class="flex justify-between text-xs py-1">
          <span class="text-zinc-300 truncate">{{ c.name }}</span>
          <span :class="daysLeft(c) < 3 ? 'text-amber-400' : 'text-zinc-500'">{{ formatDate(c.expiredAt) }}</span>
        </div>
        <div v-if="expiring.length > 5" class="text-xs text-zinc-600 pt-1">
          {{ $t('moreClients', { count: expiring.length - 5 }) }}
        </div>
      </div>

      <!-- Новые за 30 дней -->
      <div>
        <div class="text-xs uppercase tracking-wider text-zinc-500 mb-2">
          {{ $t('newClients30d') }}<span v-if="fresh.length"> · {{ fresh.length }}</span>
        </div>
        <div v-if="!fresh.length" class="text-xs text-zinc-600">{{ $t('noData') }}</div>
        <div v-for="c in fresh.slice(0, 5)" :key="c.id" class="flex justify-between text-xs py-1">
          <span class="text-zinc-300 truncate">{{ c.name }}</span>
          <span class="text-zinc-500">{{ formatDate(c.createdAt) }}</span>
        </div>
        <div v-if="fresh.length > 5" class="text-xs text-zinc-600 pt-1">
          {{ $t('moreClients', { count: fresh.length - 5 }) }}
        </div>
      </div>

      <!-- Топ по трафику -->
      <div>
        <div class="text-xs uppercase tracking-wider text-zinc-500 mb-2">{{ $t('topByTraffic') }}</div>
        <div v-if="!topTraffic.length" class="text-xs text-zinc-600">{{ $t('noData') }}</div>
        <div v-for="c in topTraffic" :key="c.id" class="py-1">
          <div class="flex justify-between text-xs">
            <span class="text-zinc-300 truncate">{{ c.name }}</span>
            <span class="text-zinc-500">{{ formatBytes(total(c)) }}</span>
          </div>
          <div class="h-0.5 bg-white/[0.07] mt-1">
            <div class="h-full bg-sky-400" :style="{ width: `${(total(c) / topMax) * 100}%` }" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';

import { formatBytes } from '../utils/format';

const props = defineProps({
  clients: { type: Array, default: null },
});

const DAY = 86400000;
const collapsed = ref(localStorage.getItem('dashboardCollapsed') === '1');

function toggle() {
  collapsed.value = !collapsed.value;
  localStorage.setItem('dashboardCollapsed', collapsed.value ? '1' : '0');
}

const list = computed(() => props.clients ?? []);

const expiring = computed(() => {
  const now = Date.now();
  return list.value
    .filter((c) => c.expiredAt && new Date(c.expiredAt).getTime() > now
      && new Date(c.expiredAt).getTime() <= now + 7 * DAY)
    .sort((a, b) => new Date(a.expiredAt) - new Date(b.expiredAt));
});

const fresh = computed(() => {
  const cutoff = Date.now() - 30 * DAY;
  return list.value
    .filter((c) => c.createdAt && new Date(c.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
});

const total = (c) => (c.transferRx || 0) + (c.transferTx || 0);

const topTraffic = computed(() => [...list.value]
  .filter((c) => total(c) > 0)
  .sort((a, b) => total(b) - total(a))
  .slice(0, 5));

const topMax = computed(() => Math.max(1, ...topTraffic.value.map(total)));

function daysLeft(c) {
  return (new Date(c.expiredAt).getTime() - Date.now()) / DAY;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(value));
}
</script>
