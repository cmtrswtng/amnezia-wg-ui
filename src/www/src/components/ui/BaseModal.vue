<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60"
      @click.self="$emit('close')"
    >
      <div
        class="modal-panel w-full p-6 glass-floating border border-white/[0.08] shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
        :class="maxWidth"
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  maxWidth: { type: String, default: 'max-w-md' },
});

defineEmits(['close']);
</script>
