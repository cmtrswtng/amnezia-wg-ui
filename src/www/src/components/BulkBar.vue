<template>
  <div class="glass px-4 py-3 flex flex-wrap items-center gap-2 fixed sm:static bottom-0 inset-x-0 z-30 sm:z-auto border-t sm:border-t-0 border-white/10 backdrop-blur">
    <span class="text-xs text-zinc-400">{{ $t('selected') }}: {{ count }}</span>

    <button class="glass-button text-xs" @click="$emit('extend', 7)">{{ $t('preset7d') }}</button>
    <button class="glass-button text-xs" @click="$emit('extend', 30)">{{ $t('preset30d') }}</button>

    <span class="inline-flex items-center gap-1">
      <input
        v-model="tagDraft"
        type="text"
        class="glass-input !py-1.5 text-xs w-28"
        :placeholder="$t('bulkAddTag')"
        @keydown.enter.prevent="addTag"
      />
    </span>

    <span v-if="removableTags.length" class="relative">
      <select class="glass-input !py-1.5 text-xs" @change="removeTag($event)">
        <option value="">{{ $t('bulkRemoveTag') }}</option>
        <option v-for="tag in removableTags" :key="tag" :value="tag">{{ tag }}</option>
      </select>
    </span>

    <button class="glass-button text-xs" @click="$emit('enable')">{{ $t('bulkEnable') }}</button>
    <button class="glass-button text-xs" @click="$emit('disable')">{{ $t('bulkDisable') }}</button>
    <button class="glass-button text-xs" @click="$emit('resetQuota')">{{ $t('bulkResetQuota') }}</button>
    <button class="glass-button text-xs !border-red-400/30 text-red-300" @click="$emit('delete')">
      {{ $t('bulkDelete') }}
    </button>
    <button class="glass-button text-xs ml-auto" @click="$emit('clear')">×</button>
  </div>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  count: { type: Number, required: true },
  removableTags: { type: Array, default: () => [] },
});

const emit = defineEmits(['extend', 'addTag', 'removeTag', 'enable', 'disable', 'resetQuota', 'delete', 'clear']);

const tagDraft = ref('');

function addTag() {
  const tag = tagDraft.value.trim();
  if (!tag) return;
  emit('addTag', tag);
  tagDraft.value = '';
}

function removeTag(event) {
  const tag = event.target.value;
  if (tag) emit('removeTag', tag);
  event.target.value = '';
}
</script>
