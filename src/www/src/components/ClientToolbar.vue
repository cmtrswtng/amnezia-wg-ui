<template>
  <div class="glass px-4 py-3">
    <div class="flex flex-wrap items-center gap-2">
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

      <div v-if="allTags.length" ref="tagDropdown" class="relative">
        <button type="button" class="glass-button text-xs" @click="open = !open">
          {{ $t('filterByTags') }}
          <span
            v-if="tags.length"
            class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-[3px]
              tag-chip text-[0.65rem] font-medium"
          >{{ tags.length }}</span>
        </button>
        <Transition name="dropdown">
          <div
            v-if="open"
            class="absolute right-0 z-30 mt-2 w-56 glass-floating border border-white/[0.08] p-2 max-h-60 overflow-y-auto flex flex-col gap-1"
          >
          <label
            v-for="tag in allTags"
            :key="tag"
            class="flex items-center gap-2 text-xs text-zinc-300 px-1 py-0.5 rounded hover:bg-white/5 cursor-pointer"
          >
            <input
              type="checkbox"
              class="rounded accent-[#38bdf8]"
              :checked="tags.includes(tag)"
              @change="toggleTag(tag)"
            />
            {{ tag }}
          </label>
          </div>
        </Transition>
      </div>

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

    <div v-if="tags.length" class="flex flex-wrap gap-1 mt-2">
      <span
        v-for="tag in tags"
        :key="tag"
        class="tag-chip inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-[3px]"
      >
        {{ tag }}
        <button
          type="button"
          class="text-[#bae6fd]/60 hover:text-[#bae6fd] leading-none"
          :aria-label="`Remove ${tag}`"
          @click="toggleTag(tag)"
        >&times;</button>
      </span>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';

const search = defineModel('search', { type: String, default: '' });
const status = defineModel('status', { type: String, default: 'all' });
const tags = defineModel('tags', { type: Array, default: () => [] });
const sortAsc = defineModel('sortAsc', { type: Boolean, default: true });

defineProps({
  allTags: { type: Array, default: () => [] },
  sortClients: { type: Boolean, default: false },
});

defineEmits(['create']);

const open = ref(false);
const tagDropdown = ref(null);

function onClickOutside(event) {
  if (tagDropdown.value && !tagDropdown.value.contains(event.target)) {
    open.value = false;
  }
}

function onEscape(event) {
  if (event.key === 'Escape') open.value = false;
}

onMounted(() => {
  document.addEventListener('click', onClickOutside);
  document.addEventListener('keydown', onEscape);
});

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside);
  document.removeEventListener('keydown', onEscape);
});

function toggleTag(tag) {
  const index = tags.value.indexOf(tag);
  if (index >= 0) {
    tags.value = tags.value.filter((t) => t !== tag);
  } else {
    tags.value = [...tags.value, tag];
  }
}
</script>
