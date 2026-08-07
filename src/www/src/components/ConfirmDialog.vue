<template>
  <BaseModal @close="$emit('cancel')">
    <h2 class="text-lg font-semibold text-zinc-100 mb-2">{{ title }}</h2>
    <p class="text-sm text-zinc-400 mb-6 break-all">{{ message }}</p>
    <div class="flex justify-end gap-2">
      <button class="glass-button" @click="$emit('cancel')">{{ $t('cancel') }}</button>
      <button
        class="glass-button !border-red-400/40 text-red-200 hover:!bg-red-500/15"
        @click="$emit('confirm')"
      >{{ $t('confirm') }}</button>
    </div>
  </BaseModal>
</template>

<script setup>
import BaseModal from './ui/BaseModal.vue';

defineProps({
  title: { type: String, required: true },
  message: { type: String, default: '' },
});

defineEmits(['confirm', 'cancel']);
</script>
