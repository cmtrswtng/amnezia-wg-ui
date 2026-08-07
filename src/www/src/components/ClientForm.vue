<template>
  <BaseModal @close="$emit('close')">
    <h2 class="text-lg font-semibold text-zinc-100 mb-4">
      {{ client ? $t('editClient') : $t('newClient') }}
    </h2>

    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <label class="flex flex-col gap-1 text-xs text-zinc-400">
        {{ $t('name') }}
        <input v-model.trim="name" type="text" class="glass-input" required autofocus />
      </label>

      <label class="flex flex-col gap-1 text-xs text-zinc-400">
        {{ $t('tags') }}
        <TagInput v-model="tags" :suggestions="allTags" />
      </label>

      <div class="flex flex-col gap-1 text-xs text-zinc-400">
        {{ $t('ExpireDate') }}
        <input v-model="expireValue" type="datetime-local" class="glass-input" />
        <div class="flex flex-wrap gap-1.5 mt-1">
          <button type="button" class="glass-button text-xs" @click="setPreset(7)">{{ $t('preset7d') }}</button>
          <button type="button" class="glass-button text-xs" @click="setPreset(30)">{{ $t('preset30d') }}</button>
          <button type="button" class="glass-button text-xs" @click="setPreset(90)">{{ $t('preset90d') }}</button>
          <button type="button" class="glass-button text-xs" @click="expireValue = ''">{{ $t('Permanent') }}</button>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button type="button" class="glass-button" @click="$emit('close')">{{ $t('cancel') }}</button>
        <button type="submit" class="glass-button-primary" :disabled="!name">{{ $t('save') }}</button>
      </div>
    </form>
  </BaseModal>
</template>

<script setup>
import { ref, watch } from 'vue';

import { toLocalInputValue } from '../utils/format';
import BaseModal from './ui/BaseModal.vue';
import TagInput from './TagInput.vue';

const props = defineProps({
  client: { type: Object, default: null },
  allTags: { type: Array, default: () => [] },
});

const emit = defineEmits(['save', 'close']);

const name = ref('');
const expireValue = ref('');
const tags = ref([]);

watch(
  () => props.client,
  (client) => {
    name.value = client?.name ?? '';
    expireValue.value = toLocalInputValue(client?.expiredAt);
    tags.value = [...(client?.tags ?? [])];
  },
  { immediate: true },
);

function setPreset(days) {
  expireValue.value = toLocalInputValue(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
}

function submit() {
  if (!name.value) return;
  emit('save', {
    name: name.value,
    expiredDate: expireValue.value ? new Date(expireValue.value).toISOString() : null,
    tags: tags.value,
  });
}
</script>
