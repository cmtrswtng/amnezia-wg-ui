import { reactive } from 'vue';

let nextId = 1;
const toasts = reactive([]);

export function useToasts() {
  const push = (type, message) => {
    const id = nextId++;
    toasts.push({ id, type, message });
    setTimeout(() => {
      const index = toasts.findIndex((t) => t.id === id);
      if (index >= 0) toasts.splice(index, 1);
    }, 4000);
  };

  return {
    toasts,
    success: (message) => push('success', message),
    error: (message) => push('error', message),
  };
}
