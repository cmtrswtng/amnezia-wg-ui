<template>
  <div class="min-h-screen">
    <LoginView v-if="authenticated === false" />
    <div v-else-if="authenticated === true" class="mx-auto max-w-6xl px-4 py-6 flex flex-col gap-5">
      <AppHeader @backup="onBackup" @restore="onRestore" @logout="onLogout" />

      <StatsBar :clients="clients" />

      <ClientToolbar
        v-model:search="searchQuery"
        v-model:status="statusFilter"
        v-model:tags="selectedTags"
        v-model:sort-asc="sortAsc"
        :all-tags="allTags"
        :sort-clients="settings.sortClients"
        :all-selected="allFilteredSelected"
        @create="openCreate"
        @toggle-select-all="onToggleSelectAll"
      />

      <BulkBar
        v-if="selectedClients.length"
        :count="selectedClients.length"
        :removable-tags="removableTags"
        @extend="onBulkExtend"
        @add-tag="onBulkAddTag"
        @remove-tag="onBulkRemoveTag"
        @enable="onBulkEnable"
        @disable="onBulkDisable"
        @reset-quota="onBulkResetQuota"
        @delete="confirmBulkDelete = true"
        @clear="selectedIds = []"
      />

      <div v-if="clients === null" class="glass p-6 text-sm text-zinc-400">Loading…</div>
      <div v-else-if="filteredClients.length === 0" class="glass p-6 text-sm text-zinc-400">
        {{ $t('noClients') }}
      </div>
      <div v-else class="grid gap-4 md:grid-cols-2">
        <ClientCard
          v-for="client in filteredClients"
          :key="client.id"
          :client="client"
          :avatar-settings="settings.avatarSettings"
          :one-time-links="settings.oneTimeLinks"
          :chart-type="settings.uiChartType"
          :selected="selectedIds.includes(client.id)"
          @toggle="onToggle"
          @edit="openEdit"
          @delete="deletingClient = $event"
          @show-qr="qrClient = $event"
          @one-time-link="onOneTimeLink"
          @reset-quota="onResetQuota"
          @toggle-select="onToggleSelect"
        />
      </div>

      <Transition name="modal">
        <ClientForm
          v-if="showForm"
          :client="editingClient"
          :all-tags="allTags"
          @save="onSaveClient"
          @close="closeForm"
        />
      </Transition>
      <Transition name="modal">
        <QrModal v-if="qrClient" :client="qrClient" @close="qrClient = null" />
      </Transition>
      <Transition name="modal">
        <ConfirmDialog
          v-if="deletingClient"
          :title="$t('deleteClient')"
          :message="deletingClient.name"
          @confirm="onDeleteClient"
          @cancel="deletingClient = null"
        />
      </Transition>
      <Transition name="modal">
        <ConfirmDialog
          v-if="confirmBulkDelete"
          :title="$t('bulkDelete')"
          :message="$t('confirmBulkDelete', { count: selectedClients.length })"
          @confirm="confirmBulkDelete = false; onBulkDelete()"
          @cancel="confirmBulkDelete = false"
        />
      </Transition>
    </div>
    <Toasts />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { api } from './api/client';
import AppHeader from './components/AppHeader.vue';
import BulkBar from './components/BulkBar.vue';
import ClientCard from './components/ClientCard.vue';
import ClientForm from './components/ClientForm.vue';
import ClientToolbar from './components/ClientToolbar.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import LoginView from './components/LoginView.vue';
import QrModal from './components/QrModal.vue';
import StatsBar from './components/StatsBar.vue';
import Toasts from './components/Toasts.vue';
import { useClients } from './composables/useClients';
import { useSession } from './composables/useSession';
import { useSettings } from './composables/useSettings';
import { useTags } from './composables/useTags';
import { useToasts } from './composables/useToasts';

const { t, locale, availableLocales } = useI18n();
const { authenticated, init, logout, onUnauthorized } = useSession();
const { settings, load: loadSettings } = useSettings();
const {
  clients,
  refresh,
  startPolling,
  stopPolling,
  createClient,
  saveClient,
  deleteClient,
  enableClient,
  disableClient,
  generateOneTimeLink,
  resetQuota,
  bulk,
} = useClients();
const { allTags } = useTags();
const toasts = useToasts();

const searchQuery = ref('');
const statusFilter = ref('all');
const selectedTags = ref([]);
const sortAsc = ref(true);

const showForm = ref(false);
const editingClient = ref(null);
const qrClient = ref(null);
const deletingClient = ref(null);

const selectedIds = ref([]);
const confirmBulkDelete = ref(false);

function statusOf(client) {
  if (client.quotaExceeded) return 'quota';
  if (client.isExpired) return 'expired';
  return client.enabled ? 'active' : 'disabled';
}

const filteredClients = computed(() => {
  let list = clients.value ?? [];

  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    list = list.filter((c) => c.name.toLowerCase().includes(query));
  }

  if (selectedTags.value.length) {
    list = list.filter((c) => selectedTags.value.every((tag) => (c.tags ?? []).includes(tag)));
  }

  if (statusFilter.value !== 'all') {
    list = list.filter((c) => statusOf(c) === statusFilter.value);
  }

  if (settings.sortClients) {
    list = [...list].sort((a, b) => (sortAsc.value
      ? a.name.localeCompare(b.name)
      : b.name.localeCompare(a.name)));
  }

  return list;
});

const selectedClients = computed(() => {
  const visible = new Set((clients.value ?? []).map((c) => c.id));
  return (clients.value ?? []).filter((c) => selectedIds.value.includes(c.id) && visible.has(c.id));
});

const allFilteredSelected = computed(() => {
  const list = filteredClients.value;
  return list.length > 0 && list.every((c) => selectedIds.value.includes(c.id));
});

const removableTags = computed(() => {
  const set = new Set();
  for (const c of selectedClients.value) for (const t of c.tags ?? []) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b));
});

function onToggleSelect(client) {
  selectedIds.value = selectedIds.value.includes(client.id)
    ? selectedIds.value.filter((id) => id !== client.id)
    : [...selectedIds.value, client.id];
}

function onToggleSelectAll() {
  selectedIds.value = allFilteredSelected.value ? [] : filteredClients.value.map((c) => c.id);
}

async function runBulk(fn) {
  const ids = selectedClients.value.map((c) => c.id);
  const { done, failed } = await bulk(ids, fn);
  selectedIds.value = [];
  if (failed === 0) toasts.success(t('bulkDone', { done, failed }));
  else toasts.error(t('bulkDone', { done, failed }));
}

function onBulkExtend(days) {
  runBulk((client) => {
    const base = client.expiredAt && new Date(client.expiredAt) > new Date()
      ? new Date(client.expiredAt)
      : new Date();
    return api.updateClientExpireDate(client.id, new Date(base.getTime() + days * 86400000).toISOString());
  });
}

const onBulkAddTag = (tag) => runBulk((client) => api.updateClientTags(client.id, [...new Set([...(client.tags ?? []), tag])]));
const onBulkRemoveTag = (tag) => runBulk((client) => api.updateClientTags(client.id, (client.tags ?? []).filter((x) => x !== tag)));
const onBulkEnable = () => runBulk((client) => api.enableClient(client.id));
const onBulkDisable = () => runBulk((client) => api.disableClient(client.id));
const onBulkResetQuota = () => runBulk((client) => (client.quotaBytes != null ? api.resetClientQuota(client.id) : Promise.resolve()));
const onBulkDelete = () => runBulk((client) => api.deleteClient(client.id));

// React to auth state transitions: load data and start polling on login,
// stop polling on logout or session expiry (api:unauthorized).
watch(authenticated, async (value) => {
  if (value === true) {
    try {
      await Promise.all([loadSettings(), refresh()]);
      startPolling();
    } catch (err) {
      toasts.error(err.message);
    }
  } else if (value === false) {
    stopPolling();
  }
});

async function boot() {
  try {
    await init();
  } catch (err) {
    toasts.error(err.message);
  }
}

// Server-side LANG overrides localStorage (same behavior as the legacy UI)
async function syncServerLocale() {
  try {
    const lang = await api.getLang();
    if (lang !== localStorage.getItem('lang') && availableLocales.value.includes(lang)) {
      localStorage.setItem('lang', lang);
      locale.value = lang;
    }
  } catch {
    // keep current locale
  }
}

function openCreate() {
  editingClient.value = null;
  showForm.value = true;
}

function openEdit(client) {
  editingClient.value = client;
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
  editingClient.value = null;
}

async function onSaveClient(payload) {
  try {
    if (editingClient.value) {
      await saveClient(editingClient.value.id, payload);
    } else {
      await createClient(payload);
    }
    closeForm();
  } catch {
    // toast already shown by the composable
  }
}

function onToggle(client) {
  const action = client.enabled ? disableClient : enableClient;
  action(client.id).catch(() => {});
}

function onResetQuota(client) {
  resetQuota(client.id).catch(() => {});
}

async function onDeleteClient() {
  const client = deletingClient.value;
  deletingClient.value = null;
  await deleteClient(client.id).catch(() => {});
}

async function onOneTimeLink(client) {
  try {
    await generateOneTimeLink(client.id);
    const updated = (clients.value ?? []).find((c) => c.id === client.id);
    if (updated?.oneTimeLink) {
      await navigator.clipboard.writeText(`${location.origin}/cnf/${updated.oneTimeLink}`);
      toasts.success(t('oneTimeLinkCopied'));
    }
  } catch {
    // toast already shown by the composable
  }
}

function onBackup() {
  api.backup()
    .then((config) => {
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wg0.json';
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch((err) => toasts.error(err.message));
}

function onRestore(file) {
  file.text()
    .then((content) => api.restore(content))
    .then(() => refresh())
    .catch((err) => toasts.error(err.message));
}

function onLogout() {
  stopPolling();
  logout();
}

onMounted(() => {
  window.addEventListener('api:unauthorized', onUnauthorized);
  boot();
  syncServerLocale();
});

onUnmounted(() => {
  window.removeEventListener('api:unauthorized', onUnauthorized);
  stopPolling();
});
</script>
