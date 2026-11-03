import {
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  Plus,
  RefreshCw,
  SearchX,
  ShieldPlus,
} from "lucide-react";
import { api } from "../api/client";
import { useClients } from "../state/useClients";
import { useSettings } from "../state/useSettings";
import { useI18n } from "../state/i18n";
import { useToasts } from "../state/Toasts";
import { DAY, filterClients, sortClients } from "../utils/clients";
import { copyText } from "../utils/clipboard";
import AppHeader from "./AppHeader";
import StatsBar from "./StatsBar";
import ClientToolbar from "./ClientToolbar";
import ClientCard from "./ClientCard";
import ClientForm from "./ClientForm";
import BulkBar from "./BulkBar";
import ConfirmDialog from "./ui/ConfirmDialog";
import QrModal from "./QrModal";
import AnimatedContent from "./react-bits/AnimatedContent";

const Overview = lazy(() => import("./Overview"));
const AuditLog = lazy(() => import("./AuditLog"));
const savedView = () => {
  try {
    return localStorage.getItem("clientView") === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
};

export default function Dashboard() {
  const { t, locale } = useI18n();
  const toasts = useToasts();
  const { clients, error, updatedAt, refresh, mutate, bulk } = useClients(true);
  const settings = useSettings();
  const [page, setPage] = useState("clients");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState("all");
  const [tags, setTags] = useState([]);
  const [sort, setSort] = useState("name");
  const [view, setView] = useState(savedView);
  const [selected, setSelected] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [qr, setQr] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const now = Date.now();
  const list = clients || [];
  const allTags = useMemo(
    () =>
      [
        ...new Set((clients || []).flatMap((client) => client.tags || [])),
      ].sort(),
    [clients],
  );
  const filtered = useMemo(
    () =>
      sortClients(
        filterClients(
          clients || [],
          { query: deferredQuery, status, tags },
          now,
        ),
        sort,
      ),
    [clients, deferredQuery, status, tags, sort, updatedAt],
  );
  const selectedClients = list.filter((client) => selected.includes(client.id));
  const selectedTags = [
    ...new Set(selectedClients.flatMap((client) => client.tags || [])),
  ].sort();
  const allSelected =
    filtered.length > 0 &&
    filtered.every((client) => selected.includes(client.id));
  useEffect(() => {
    if (clients)
      setSelected((ids) =>
        ids.filter((id) => clients.some((client) => client.id === id)),
      );
  }, [clients]);
  function changeView(value) {
    setView(value);
    try {
      localStorage.setItem("clientView", value);
    } catch {
      /* optional preference */
    }
  }
  function select(id) {
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  }
  function selectAll() {
    setSelected((ids) =>
      allSelected
        ? ids.filter((id) => !filtered.some((client) => client.id === id))
        : [...new Set([...ids, ...filtered.map((client) => client.id)])],
    );
  }
  function filter(status) {
    setPage("clients");
    setStatus(status);
  }
  async function run(action, success) {
    try {
      const result = await mutate(action);
      if (success) toasts.success(success);
      return result;
    } catch (err) {
      toasts.error(err.message);
    }
  }
  async function saveClient(payload) {
    try {
      await mutate(async () => {
        if (form.client) {
          const id = form.client.id;
          await api.updateClientName(id, payload.name);
          await api.updateClientExpireDate(id, payload.expiredDate);
          await api.updateClientTags(id, payload.tags);
          await api.updateClientQuota(id, {
            quotaBytes: payload.quotaBytes,
            quotaCycleDays: payload.quotaCycleDays,
          });
        } else await api.createClient(payload);
      });
      toasts.success(t(form.client ? "saved" : "created"));
    } catch (err) {
      await refresh();
      throw err;
    }
  }
  function extend(client) {
    const base = Math.max(Date.now(), Date.parse(client.expiredAt) || 0);
    return run(
      () =>
        api.updateClientExpireDate(
          client.id,
          new Date(base + 30 * DAY).toISOString(),
        ),
      t("saved"),
    );
  }
  function deleteClient(client) {
    setConfirm({
      title: t("dangerTitle"),
      message: t("confirmDelete", { name: client.name }),
      confirmLabel: t("deleteClient"),
      danger: true,
      onConfirm: async () => {
        await mutate(() => api.deleteClient(client.id));
        toasts.success(t("deleted"));
      },
    });
  }
  function resetQuota(client) {
    setConfirm({
      title: t("quotaResetTitle"),
      message: t("quotaResetConfirm", { name: client.name }),
      onConfirm: () => mutate(() => api.resetClientQuota(client.id)),
    });
  }
  async function copy(value) {
    try {
      await copyText(value);
      toasts.success(t("copied"));
    } catch (err) {
      toasts.error(err.message);
    }
  }
  async function oneTimeLink(client) {
    const result = await run(() => api.generateOneTimeLink(client.id));
    const next = result?.find((item) => item.id === client.id);
    if (next?.oneTimeLink)
      await copy(`${location.origin}/cnf/${next.oneTimeLink}`);
  }
  async function backup() {
    try {
      const config = await api.backup();
      const url = URL.createObjectURL(
        new Blob(
          [
            typeof config === "string"
              ? config
              : JSON.stringify(config, null, 2),
          ],
          { type: "application/json" },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "wg0.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toasts.success(t("backupSuccess"));
    } catch (err) {
      toasts.error(err.message);
    }
  }
  async function restore(file) {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error(t("fileError"));
      const content = await file.text();
      const parsed = JSON.parse(content);
      if (!parsed?.server || !parsed?.clients) throw new Error(t("fileError"));
      setConfirm({
        title: t("restoreWarning"),
        message: t("restoreHint"),
        confirmLabel: t("restore"),
        danger: true,
        onConfirm: async () => {
          await mutate(() => api.restore(content));
          toasts.success(t("restoreSuccess"));
          setSelected([]);
        },
      });
    } catch (err) {
      toasts.error(err.message);
    }
  }
  async function bulkAction(action, value) {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      const result = await bulk(
        selectedClients.map((client) => client.id),
        async (id) => {
          const client = selectedClients.find((entry) => entry.id === id);
          if (action === "enable") return api.enableClient(id);
          if (action === "disable") return api.disableClient(id);
          if (action === "delete") return api.deleteClient(id);
          if (action === "reset")
            return client.quotaBytes != null
              ? api.resetClientQuota(id)
              : undefined;
          if (action === "extend")
            return api.updateClientExpireDate(
              id,
              new Date(
                Math.max(Date.now(), Date.parse(client.expiredAt) || 0) +
                  value * DAY,
              ).toISOString(),
            );
          if (action === "addTag")
            return api.updateClientTags(id, [
              ...new Set([...(client.tags || []), value]),
            ]);
          if (action === "removeTag")
            return api.updateClientTags(
              id,
              (client.tags || []).filter((tag) => tag !== value),
            );
        },
      );
      toasts[result.failed ? "error" : "success"](t("bulkReport", result));
      setSelected([]);
    } finally {
      setBulkBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <AppHeader
        page={page}
        onPage={setPage}
        count={list.length}
        onBackup={backup}
        onRestore={restore}
      />
      <main className="main-content" id="main-content">
        <header className="page-heading">
          <div>
            <h1>{t(page)}</h1>
          </div>
          <button
            className="button button-primary desktop-create"
            onClick={() => setForm({ client: null })}
          >
            <Plus size={18} />
            {t("newClient")}
          </button>
        </header>
        {error && (
          <div className="connection-error" role="alert">
            <AlertCircle size={20} />
            <div>
              <strong>{t("connectionError")}</strong>
              <p>{error}</p>
            </div>
            <button className="button button-small" onClick={refresh}>
              <RefreshCw size={15} />
              {t("retry")}
            </button>
          </div>
        )}
        {clients === null ? (
          <div className="loading-state" role="status">
            <RefreshCw size={24} className="spin" />
            {t("loading")}
          </div>
        ) : (
          <>
            <AnimatedContent>
              <StatsBar clients={list} now={now} onFilter={filter} />
            </AnimatedContent>
            {page === "clients" ? (
              <AnimatedContent delay={0.05}>
                <div className="section-heading">
                  <span
                    className={`sync-indicator ${error ? "sync-error" : ""}`}
                    title={
                      updatedAt
                        ? `${t("refreshed")} ${new Date(updatedAt).toLocaleTimeString(locale)}`
                        : ""
                    }
                  >
                    {t("refreshed")}{" "}
                    {updatedAt &&
                      new Date(updatedAt).toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                  </span>
                </div>
                <ClientToolbar
                  query={query}
                  onQuery={setQuery}
                  status={status}
                  onStatus={setStatus}
                  tags={allTags}
                  selectedTags={tags}
                  onTags={setTags}
                  sort={sort}
                  onSort={setSort}
                  view={view}
                  onView={changeView}
                  count={filtered.length}
                  allSelected={allSelected}
                  onSelectAll={selectAll}
                />
                {selectedClients.length > 0 && (
                  <BulkBar
                    count={selectedClients.length}
                    removableTags={selectedTags}
                    onAction={bulkAction}
                    busy={bulkBusy}
                    onClear={() => setSelected([])}
                    onDelete={() =>
                      setConfirm({
                        title: t("bulkDeleteTitle"),
                        message: t("bulkDeleteHint", {
                          count: selectedClients.length,
                        }),
                        confirmLabel: t("bulkDelete"),
                        danger: true,
                        onConfirm: () => bulkAction("delete"),
                      })
                    }
                  />
                )}
                {filtered.length === 0 ? (
                  <div className="empty-state">
                    {list.length ? (
                      <SearchX size={38} />
                    ) : (
                      <ShieldPlus size={40} />
                    )}
                    <h2>{t(list.length ? "noMatches" : "emptyTitle")}</h2>
                    <p>{t(list.length ? "noMatchesHint" : "emptyHint")}</p>
                    <button
                      className="button button-primary"
                      onClick={() =>
                        list.length
                          ? (setQuery(""), setStatus("all"), setTags([]))
                          : setForm({ client: null })
                      }
                    >
                      {t(list.length ? "clearFilters" : "newClient")}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                ) : (
                  <div
                    className={`clients-grid ${view === "list" ? "clients-list" : ""}`}
                  >
                    {filtered.map((client) => (
                      <ClientCard
                        key={client.id}
                        client={client}
                        now={now}
                        selected={selected.includes(client.id)}
                        onSelect={select}
                        settings={settings}
                        onToggle={(entry) =>
                          run(() =>
                            entry.enabled
                              ? api.disableClient(entry.id)
                              : api.enableClient(entry.id),
                          )
                        }
                        onEdit={(entry) => setForm({ client: entry })}
                        onDelete={deleteClient}
                        onQr={setQr}
                        onReset={resetQuota}
                        onExtend={extend}
                        onLink={oneTimeLink}
                        onCopy={copy}
                      />
                    ))}
                  </div>
                )}
              </AnimatedContent>
            ) : (
              <Suspense fallback={<p role="status">{t("loading")}</p>}>
                {page === "overview" ? (
                  <Overview
                    clients={list}
                    now={now}
                    onEdit={(client) => setForm({ client })}
                    onExtend={extend}
                  />
                ) : (
                  <AuditLog />
                )}
              </Suspense>
            )}
          </>
        )}
      </main>
      {form && (
        <ClientForm
          client={form.client}
          tags={allTags}
          onSave={saveClient}
          onClose={() => setForm(null)}
        />
      )}{" "}
      {qr && <QrModal client={qr} onClose={() => setQr(null)} />}{" "}
      {confirm && (
        <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}
