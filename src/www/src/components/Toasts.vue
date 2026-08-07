<template>
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="glass px-4 py-3 text-sm shadow-lg"
      :class="toast.type === 'error' ? 'border-red-400/40 text-red-200' : 'border-emerald-400/40 text-emerald-100'"
    >
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup>
import { useToasts } from '../composables/useToasts';

const { toasts } = useToasts();
</script>
