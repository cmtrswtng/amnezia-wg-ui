<template>
  <div class="glass glass-hoverable p-4 flex flex-col gap-3">
    <div class="flex items-start gap-3">
      <input
        type="checkbox"
        class="mt-1 shrink-0 accent-[#38bdf8]"
        :checked="selected"
        @change="$emit('toggleSelect', client)"
      />
      <img v-if="avatar" :src="avatar" class="w-10 h-10 rounded-full shrink-0" alt="" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :class="statusDotClass"
          />
          <span class="font-medium text-zinc-100 truncate">{{ client.name }}</span>
          <span v-if="client.quotaExceeded" class="text-xs text-red-400 shrink-0">{{ $t('statusQuota') }}</span>
        </div>
        <div class="text-xs text-zinc-500 font-mono">{{ client.address }}</div>
        <div v-if="client.tags?.length" class="flex flex-wrap gap-1 mt-1.5">
          <span
            v-for="tag in client.tags"
            :key="tag"
            class="tag-chip text-[11px] px-2 py-0.5 rounded-[3px]"
          >{{ tag }}</span>
        </div>
      </div>
      <label class="shrink-0 inline-flex items-center cursor-pointer" :title="client.enabled ? $t('disableClient') : $t('enableClient')">
        <input type="checkbox" class="sr-only peer" :checked="client.enabled" @change="$emit('toggle', client)" />
        <div class="w-9 h-5 rounded-full bg-white/10 peer-checked:bg-[#0ea5e9]
          relative transition-colors
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

    <div v-if="client.quotaBytes != null" class="flex flex-col gap-1">
      <div class="h-1 bg-white/[0.07] overflow-hidden">
        <div class="h-full transition-all" :class="quotaBarClass" :style="{ width: `${client.quotaUsedPercent}%` }" />
      </div>
      <div class="flex justify-between text-xs" :class="client.quotaExceeded ? 'text-red-400' : 'text-zinc-500'">
        <span>{{ formatBytes(client.quotaUsedBytes) }} / {{ formatBytes(client.quotaBytes) }}</span>
        <span v-if="client.quotaCycleEndsAt">{{ $t('quotaUntil') }} {{ formatDate(client.quotaCycleEndsAt) }}</span>
      </div>
    </div>

    <div v-if="chartTypeClass" class="grid grid-cols-2 gap-2">
      <TrafficChart :data="client.transferRxHistory" :chart-type="chartTypeClass" color="rgba(56,189,248,0.5)" />
      <TrafficChart :data="client.transferTxHistory" :chart-type="chartTypeClass" color="rgba(148,163,184,0.5)" />
    </div>

    <div class="flex flex-wrap gap-2 border-t border-white/[0.06] pt-3 mt-1">
      <button class="glass-button text-xs px-2.5 py-1.5" @click="$emit('showQr', client)">{{ $t('showQR') }}</button>
      <a class="glass-button text-xs px-2.5 py-1.5" :href="configurationUrl" download>{{ $t('downloadConfig') }}</a>
      <button v-if="oneTimeLinks" class="glass-button text-xs px-2.5 py-1.5" @click="$emit('oneTimeLink', client)">
        {{ $t('oneTimeLinkShort') }}
      </button>
      <button v-if="client.quotaBytes != null" class="glass-button text-xs px-2.5 py-1.5" @click="$emit('resetQuota', client)">
        {{ $t('quotaReset') }}
      </button>
      <button class="glass-button text-xs px-2.5 py-1.5 ml-auto" @click="$emit('edit', client)">{{ $t('editClient') }}</button>
      <button
        class="glass-button text-xs px-2.5 py-1.5 !border-red-400/30 text-red-300 hover:!bg-red-500/10"
        @click="$emit('delete', client)"
      >{{ $t('deleteClient') }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { api } from '../api/client';
import { formatBytes, formatDate, formatDateTime, sha256Hex, timeAgo } from '../utils/format';
import TrafficChart from './TrafficChart.vue';

const props = defineProps({
  client: { type: Object, required: true },
  avatarSettings: { type: Object, default: () => ({ dicebear: null, gravatar: false }) },
  oneTimeLinks: { type: Boolean, default: false },
  chartType: { type: Number, default: 0 },
  selected: { type: Boolean, default: false },
});

defineEmits(['toggle', 'edit', 'delete', 'showQr', 'oneTimeLink', 'resetQuota', 'toggleSelect']);

const { locale } = useI18n();

const CHART_TYPES = [null, 'line', 'area', 'bar'];
const chartTypeClass = computed(() => CHART_TYPES[props.chartType] ?? null);

const configurationUrl = computed(() => api.configurationUrl(props.client.id));

const statusDotClass = computed(() => {
  if (props.client.isExpired) return 'bg-red-400';
  if (props.client.quotaExceeded) return 'bg-red-400';
  if (props.client.enabled) return 'bg-emerald-400';
  return 'bg-zinc-600';
});

const quotaBarClass = computed(() => {
  const percent = props.client.quotaUsedPercent ?? 0;
  if (props.client.quotaExceeded || percent >= 100) return 'bg-red-400';
  if (percent >= 80) return 'bg-amber-400';
  return 'bg-sky-400';
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
