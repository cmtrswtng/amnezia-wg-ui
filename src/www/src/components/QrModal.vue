<template>
  <BaseModal @close="$emit('close')">
    <h2 class="text-lg font-semibold text-zinc-100 mb-4 text-center break-all">{{ client.name }}</h2>
    <img :src="qrUrl" class="w-full max-w-xs mx-auto bg-white p-2" alt="QR code" />
  </BaseModal>
</template>

<script setup>
import { computed } from 'vue';

import { api } from '../api/client';
import BaseModal from './ui/BaseModal.vue';

const props = defineProps({
  client: { type: Object, required: true },
});

defineEmits(['close']);

const qrUrl = computed(() => api.qrCodeUrl(props.client.id));
</script>
