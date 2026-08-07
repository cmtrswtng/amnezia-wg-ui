<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      @click.self="$emit('close')"
    >
      <div class="glass w-full p-6 shadow-2xl" :class="maxWidth">
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
