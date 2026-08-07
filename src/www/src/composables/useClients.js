import { ref } from 'vue';

import { api } from '../api/client';
import { useToasts } from './useToasts';

const HISTORY_LENGTH = 50;
const POLL_INTERVAL = 5000;

const clients = ref(null);
const history = new Map();
let timer = null;

function updateTransferStats(list, updateCharts) {
  for (const client of list) {
    if (!history.has(client.id)) {
      history.set(client.id, {
        transferRxPrevious: client.transferRx ?? 0,
        transferTxPrevious: client.transferTx ?? 0,
        transferRxHistory: Array(HISTORY_LENGTH).fill(0),
        transferTxHistory: Array(HISTORY_LENGTH).fill(0),
      });
    }
    const persist = history.get(client.id);

    const rx = client.transferRx ?? 0;
    const tx = client.transferTx ?? 0;
    client.transferRxCurrent = Math.max(0, rx - persist.transferRxPrevious);
    client.transferTxCurrent = Math.max(0, tx - persist.transferTxPrevious);
    persist.transferRxPrevious = rx;
    persist.transferTxPrevious = tx;

    if (updateCharts) {
      persist.transferRxHistory.push(client.transferRxCurrent);
      persist.transferRxHistory.shift();
      persist.transferTxHistory.push(client.transferTxCurrent);
      persist.transferTxHistory.shift();
    }
    client.transferRxHistory = persist.transferRxHistory;
    client.transferTxHistory = persist.transferTxHistory;
  }
}

export function useClients() {
  const toasts = useToasts();

  async function refresh({ updateCharts = true } = {}) {
    const list = await api.getClients();
    updateTransferStats(list, updateCharts);
    clients.value = list;
  }

  function startPolling() {
    stopPolling();
    timer = setInterval(() => {
      refresh().catch((err) => toasts.error(err.message));
    }, POLL_INTERVAL);
  }

  function stopPolling() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function mutate(promise) {
    try {
      await promise;
    } catch (err) {
      toasts.error(err.message);
      throw err;
    } finally {
      await refresh().catch(() => {});
    }
  }

  return {
    clients,
    refresh,
    startPolling,
    stopPolling,
    createClient: (payload) => mutate(api.createClient(payload)),
    deleteClient: (id) => mutate(api.deleteClient(id)),
    enableClient: (id) => mutate(api.enableClient(id)),
    disableClient: (id) => mutate(api.disableClient(id)),
    generateOneTimeLink: (id) => mutate(api.generateOneTimeLink(id)),
    resetQuota: (id) => mutate(api.resetClientQuota(id)),
    saveClient: async (id, { name, expiredDate, tags, quotaBytes, quotaCycleDays }) => {
      await mutate(Promise.all([
        api.updateClientName(id, name),
        api.updateClientExpireDate(id, expiredDate || null),
        api.updateClientTags(id, tags ?? []),
        api.updateClientQuota(id, { quotaBytes, quotaCycleDays }),
      ]));
    },
  };
}
