<template>
  <div class="glass glass-hoverable p-4 flex flex-col gap-3">
    <div class="flex items-start gap-3">
      <img v-if="avatar" :src="avatar" class="w-10 h-10 rounded-full shrink-0" alt="" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full shrink-0 shadow-[0_0_8px_currentColor]"
            :class="statusDotClass"
          />
          <span class="font-medium text-zinc-100 truncate">{{ client.name }}</span>
        </div>
        <div class="text-xs text-zinc-500 font-mono">{{ client.address }}</div>
        <div v-if="client.tags?.length" class="flex flex-wrap gap-1 mt-1.5">
          <span
            v-for="tag in client.tags"
            :key="tag"
            class="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-200"
          >{{ tag }}</span>
        </div>
      </div>
      <label class="shrink-0 inline-flex items-center cursor-pointer" :title="client.enabled ? $t('disableClient') : $t('enableClient')">
        <input type="checkbox" class="sr-only peer" :checked="client.enabled" @change="$emit('toggle', client)" />
        <div class="w-9 h-5 rounded-full bg-white/10 peer-checked:bg-gradient-to-r peer-checked:from-indigo-500
          peer-checked:to-violet-500 relative transition-colors
          after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full
          after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
      </label>
    </div>

    <div v-if="client.expiredAt" class="text-xs" :class="expiryClass">
      {{ client.isExpired ? $t('statusExpired') : $t('expiresOn') }}: {{ formatDateTime(client.expiredAt) }}
    </div>

    <div class="flex items-center justify-between text-xs text-zinc-400">
      <span>↓ {{ formatBytes(client.transferRx) }} · ↑ {{ formatBytes(client.transferTx) }}</span>
      <span v-if="client.latestHandshakeAt">{{ timeAgo(client.latestHandshakeAt, locale) }}</span>
    </div>

    <div v-if="chartTypeClass" class="grid grid-cols-2 gap-2">
      <TrafficChart :data="client.transferRxHistory" :chart-type="chartTypeClass" color="rgba(129,140,248,0.5)" />
      <TrafficChart :data="client.transferTxHistory" :chart-type="chartTypeClass" color="rgba(52,211,153,0.5)" />
    </div>

    <div class="flex flex-wrap gap-2 pt-1">
      <button class="glass-button text-xs" @click="$emit('showQr', client)">{{ $t('showQR') }}</button>
      <a class="glass-button text-xs" :href="configurationUrl" download>{{ $t('downloadConfig') }}</a>
      <button v-if="oneTimeLinks" class="glass-button text-xs" @click="$emit('oneTimeLink', client)">
        {{ $t('oneTimeLinkShort') }}
      </button>
      <button class="glass-button text-xs ml-auto" @click="$emit('edit', client)">{{ $t('editClient') }}</button>
      <button
        class="glass-button text-xs !border-red-400/30 text-red-300 hover:!bg-red-500/10"
        @click="$emit('delete', client)"
      >{{ $t('deleteClient') }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { api } from '../api/client';
import { formatBytes, formatDateTime, sha256Hex, timeAgo } from '../utils/format';
import TrafficChart from './TrafficChart.vue';

const props = defineProps({
  client: { type: Object, required: true },
  avatarSettings: { type: Object, default: () => ({ dicebear: null, gravatar: false }) },
  oneTimeLinks: { type: Boolean, default: false },
  chartType: { type: Number, default: 0 },
});

defineEmits(['toggle', 'edit', 'delete', 'showQr', 'oneTimeLink']);

const { locale } = useI18n();

const CHART_TYPES = [null, 'line', 'area', 'bar'];
const chartTypeClass = computed(() => CHART_TYPES[props.chartType] ?? null);

const configurationUrl = computed(() => api.configurationUrl(props.client.id));

const statusDotClass = computed(() => {
  if (props.client.isExpired) return 'bg-red-400';
  if (props.client.enabled) return 'bg-emerald-400';
  return 'bg-zinc-500';
});

const expiryClass = computed(() => {
  if (props.client.isExpired) return 'text-red-400';
  const msLeft = new Date(props.client.expiredAt).getTime() - Date.now();
  if (msLeft < 3 * 24 * 60 * 60 * 1000) return 'text-amber-400';
  return 'text-zinc-400';
});

const avatar = ref(null);

watch(
  () => [props.client.name, props.avatarSettings],
  async () => {
    avatar.value = null;
    const name = (props.client.name || '').toLowerCase().trim();
    if (!name) return;
    const hash = await sha256Hex(name);
    if (name.includes('@') && name.includes('.') && props.avatarSettings.gravatar) {
      avatar.value = `https://gravatar.com/avatar/${hash}.jpg?d=404`;
    } else if (props.avatarSettings.dicebear) {
      avatar.value = `https://api.dicebear.com/9.x/${props.avatarSettings.dicebear}/svg?seed=${hash}`;
    }
  },
  { immediate: true },
);
</script>
