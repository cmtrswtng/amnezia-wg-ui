<template>
  <div class="glass flex flex-wrap items-center gap-2 px-4 py-3">
    <input
      v-model="search"
      type="search"
      class="glass-input flex-1 min-w-[10rem]"
      :placeholder="$t('search')"
    />

    <select v-model="status" class="glass-input text-xs">
      <option value="all">{{ $t('statusAll') }}</option>
      <option value="active">{{ $t('statusActive') }}</option>
      <option value="disabled">{{ $t('statusDisabled') }}</option>
      <option value="expired">{{ $t('statusExpired') }}</option>
    </select>

    <details v-if="allTags.length" class="relative">
      <summary class="glass-button cursor-pointer list-none select-none text-xs">
        {{ $t('filterByTags') }}<span v-if="tags.length"> ({{ tags.length }})</span>
      </summary>
      <div class="absolute z-20 mt-1 glass p-2 flex flex-col gap-1 min-w-[10rem]">
        <label v-for="tag in allTags" :key="tag" class="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            class="rounded accent-indigo-500"
            :checked="tags.includes(tag)"
            @change="toggleTag(tag)"
          />
          {{ tag }}
        </label>
      </div>
    </details>

    <button
      v-if="sortClients"
      class="glass-button text-xs"
      :title="sortAsc ? 'A→Z' : 'Z→A'"
      @click="sortAsc = !sortAsc"
    >
      {{ sortAsc ? 'A→Z' : 'Z→A' }}
    </button>

    <button class="glass-button-primary ml-auto" @click="$emit('create')">
      + {{ $t('newClient') }}
    </button>
  </div>
</template>

<script setup>
const search = defineModel('search', { type: String, default: '' });
const status = defineModel('status', { type: String, default: 'all' });
const tags = defineModel('tags', { type: Array, default: () => [] });
const sortAsc = defineModel('sortAsc', { type: Boolean, default: true });

defineProps({
  allTags: { type: Array, default: () => [] },
  sortClients: { type: Boolean, default: false },
});

defineEmits(['create']);

function toggleTag(tag) {
  const index = tags.value.indexOf(tag);
  if (index >= 0) {
    tags.value = tags.value.filter((t) => t !== tag);
  } else {
    tags.value = [...tags.value, tag];
  }
}
</script>
