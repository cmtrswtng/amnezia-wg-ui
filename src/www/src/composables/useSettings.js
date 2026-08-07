import { reactive } from 'vue';

import { api } from '../api/client';

const settings = reactive({
  uiTrafficStats: false,
  uiChartType: 0,
  oneTimeLinks: false,
  sortClients: false,
  avatarSettings: { dicebear: null, gravatar: false },
});
let loadPromise = null;

export function useSettings() {
  function load() {
    if (!loadPromise) {
      loadPromise = Promise.all([
        api.getUiTrafficStats().then((v) => { settings.uiTrafficStats = v === true || v === 'true'; }).catch(() => {}),
        api.getUiChartType().then((v) => { settings.uiChartType = parseInt(v, 10) || 0; }).catch(() => {}),
        api.getOneTimeLinksEnabled().then((v) => { settings.oneTimeLinks = v === true || v === 'true'; }).catch(() => {}),
        api.getSortClientsEnabled().then((v) => { settings.sortClients = v === true || v === 'true'; }).catch(() => {}),
        api.getAvatarSettings().then((v) => { settings.avatarSettings = v; }).catch(() => {}),
      ]);
    }
    return loadPromise;
  }

  return { settings, load };
}
