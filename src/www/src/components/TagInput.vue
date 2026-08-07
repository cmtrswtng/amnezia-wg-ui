<template>
  <div>
    <div class="glass-input flex flex-wrap items-center gap-1.5 cursor-text" @click="inputEl?.focus()">
      <span
        v-for="(tag, index) in modelValue"
        :key="tag"
        class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-200"
      >
        {{ tag }}
        <button type="button" class="hover:text-white" @click.stop="remove(index)">×</button>
      </span>
      <input
        ref="inputEl"
        v-model="draft"
        type="text"
        class="bg-transparent outline-none flex-1 min-w-[6rem] text-sm py-0.5"
        :placeholder="$t('addTag')"
        @keydown.enter.prevent="addDraft"
        @keydown.,.prevent="addDraft"
        @keydown.backspace="onBackspace"
      />
    </div>
    <div v-if="filteredSuggestions.length" class="flex flex-wrap gap-1.5 mt-1.5">
      <button
        v-for="suggestion in filteredSuggestions"
        :key="suggestion"
        type="button"
        class="text-xs px-2 py-0.5 rounded-full border border-white/10 text-zinc-400 hover:text-zinc-100 hover:bg-white/10"
        @click="add(suggestion)"
      >+ {{ suggestion }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const modelValue = defineModel({ type: Array, default: () => [] });

const props = defineProps({
  suggestions: { type: Array, default: () => [] },
});

const draft = ref('');
const inputEl = ref(null);

const filteredSuggestions = computed(() => {
  const q = draft.value.trim().toLowerCase();
  return props.suggestions
    .filter((s) => !modelValue.value.includes(s))
    .filter((s) => !q || s.toLowerCase().includes(q))
    .slice(0, 8);
});

function add(tag) {
  const value = tag.trim();
  if (!value) return;
  if (modelValue.value.length >= 10) return;
  if (!modelValue.value.includes(value)) {
    modelValue.value = [...modelValue.value, value];
  }
  draft.value = '';
}

function addDraft() {
  add(draft.value);
}

function remove(index) {
  modelValue.value = modelValue.value.filter((_, i) => i !== index);
}

function onBackspace() {
  if (!draft.value && modelValue.value.length) {
    remove(modelValue.value.length - 1);
  }
}
</script>
