<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <form class="glass w-full max-w-sm p-8 flex flex-col gap-4" @submit.prevent="submit">
      <h1 class="text-xl font-semibold text-center text-zinc-100">AmneziaWG Easy</h1>
      <input
        v-model="password"
        type="password"
        class="glass-input w-full"
        :placeholder="$t('password')"
        autofocus
      />
      <label v-if="rememberMeEnabled" class="flex items-center gap-2 text-sm text-zinc-400">
        <input v-model="remember" type="checkbox" class="rounded accent-indigo-500" />
        {{ $t('rememberMe') }}
      </label>
      <button type="submit" class="glass-button-primary justify-center" :disabled="!password || authenticating">
        {{ $t('signIn') }}
      </button>
      <p v-if="error" class="text-sm text-red-400 text-center">{{ error }}</p>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';

import { useSession } from '../composables/useSession';

const { login, rememberMeEnabled } = useSession();

const password = ref('');
const remember = ref(false);
const authenticating = ref(false);
const error = ref('');

async function submit() {
  if (!password.value || authenticating.value) return;
  authenticating.value = true;
  error.value = '';
  try {
    await login(password.value, remember.value);
  } catch (err) {
    error.value = err.message;
  } finally {
    authenticating.value = false;
    password.value = '';
  }
}
</script>
