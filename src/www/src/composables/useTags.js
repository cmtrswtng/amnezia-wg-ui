import { computed } from 'vue';

import { useClients } from './useClients';

export function useTags() {
  const { clients } = useClients();

  const allTags = computed(() => {
    const set = new Set();
    for (const client of clients.value ?? []) {
      for (const tag of client.tags ?? []) set.add(tag);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  return { allTags };
}
