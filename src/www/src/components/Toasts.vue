<template>
  <TransitionGroup name="toast" tag="div" class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="glass-floating border border-white/[0.08] shadow-[0_16px_48px_rgba(0,0,0,0.5)] px-4 py-3 text-sm text-zinc-200 flex items-center gap-2.5"
    >
      <span
        class="w-1.5 h-1.5 rounded-full shrink-0"
        :class="toast.type === 'error' ? 'bg-red-400' : 'bg-emerald-400'"
      />
      {{ toast.message }}
    </div>
  </TransitionGroup>
</template>

<script setup>
import { useToasts } from '../composables/useToasts';

const { toasts } = useToasts();
</script>
