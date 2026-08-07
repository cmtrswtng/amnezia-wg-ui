<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      @click.self="$emit('close')"
    >
      <div
        class="w-full p-6 rounded-xl bg-[#343638] border border-white/[0.08] shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
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
