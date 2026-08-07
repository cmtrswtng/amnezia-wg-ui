import { ref } from 'vue';

import { api } from '../api/client';

const authenticated = ref(null);
const requiresPassword = ref(false);
const rememberMeEnabled = ref(false);
let initPromise = null;

export function useSession() {
  function init() {
    if (!initPromise) {
      initPromise = (async () => {
        const session = await api.getSession();
        authenticated.value = session.authenticated;
        requiresPassword.value = session.requiresPassword;
        rememberMeEnabled.value = await api.getRememberMe().catch(() => false);
      })();
    }
    return initPromise;
  }

  async function login(password, remember) {
    await api.login(password, remember);
    authenticated.value = true;
  }

  async function logout() {
    await api.logout().catch(() => {});
    authenticated.value = false;
  }

  function onUnauthorized() {
    if (authenticated.value !== null) {
      authenticated.value = false;
    }
  }

  return { authenticated, requiresPassword, rememberMeEnabled, init, login, logout, onUnauthorized };
}
