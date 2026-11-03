import { LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "../state/i18n";

export default function ClientToolbar({
  query,
  onQuery,
  status,
  onStatus,
  tags,
  selectedTags,
  onTags,
  sort,
  onSort,
  view,
  onView,
  count,
  allSelected,
  onSelectAll,
}) {
  const { t } = useI18n();
  const filtered = Boolean(query || status !== "all" || selectedTags.length);
  const statuses = ["all", "online", "offline"];
  const statusLabel = (key) =>
    ["online", "offline"].includes(key)
      ? t(key)
      : key === "expiring"
        ? t("expiringSoon")
        : t(`status${key[0].toUpperCase()}${key.slice(1)}`);
  return (
    <section className="client-controls">
      <div className="toolbar-main">
        <div className="search-field">
          <Search size={19} />
          <input
            type="search"
            aria-label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
          {query && (
            <button
              className="icon-button"
              aria-label={t("clearFilters")}
              onClick={() => onQuery("")}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="sort-control">
          <SlidersHorizontal size={16} />
          <select
            aria-label={t("sortLabel")}
            value={sort}
            onChange={(event) => onSort(event.target.value)}
          >
            {[
              ["name", "sortName"],
              ["name-desc", "sortNameDesc"],
              ["recent", "sortRecent"],
              ["traffic", "sortTraffic"],
              ["expiry", "sortExpiry"],
            ].map(([value, key]) => (
              <option key={value} value={value}>
                {t(key)}
              </option>
            ))}
          </select>
        </div>
        <div className="view-toggle">
          <button
            aria-label={t("cardView")}
            aria-pressed={view === "cards"}
            onClick={() => onView("cards")}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            aria-label={t("listView")}
            aria-pressed={view === "list"}
            onClick={() => onView("list")}
          >
            <List size={19} />
          </button>
        </div>
      </div>
      <div className="toolbar-filters">
        <div className="status-tabs" aria-label={t("connection")}>
          {statuses.map((key) => (
            <button
              key={key}
              aria-pressed={status === key}
              onClick={() => onStatus(key)}
            >
              {statusLabel(key)}
            </button>
          ))}
        </div>
        <select
          className="access-filter"
          aria-label={t("access")}
          value={statuses.includes(status) ? "" : status}
          onChange={(event) => onStatus(event.target.value || "all")}
        >
          <option value="">{t("access")}</option>
          {["active", "disabled", "expired", "quota", "expiring"].map(
            (value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ),
          )}
        </select>
        {tags.length > 0 && (
          <details className="tag-filter">
            <summary>
              {t("filterByTags")}
              {selectedTags.length > 0 && <b>{selectedTags.length}</b>}
            </summary>
            <div className="tag-options">
              {tags.map((tag) => (
                <label key={tag}>
                  <input
                    type="checkbox"
                    checked={selectedTags.includes(tag)}
                    onChange={() =>
                      onTags(
                        selectedTags.includes(tag)
                          ? selectedTags.filter((value) => value !== tag)
                          : [...selectedTags, tag],
                      )
                    }
                  />
                  {tag}
                </label>
              ))}
            </div>
          </details>
        )}
      </div>
      <div className="list-meta">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onSelectAll}
            aria-label={t("selectVisible")}
          />
          {t("selectAll")}
        </label>
        <span>{t("results", { count })}</span>
        {filtered && (
          <button
            className="text-button"
            onClick={() => {
              onQuery("");
              onStatus("all");
              onTags([]);
            }}
          >
            <X size={13} />
            {t("clearFilters")}
          </button>
        )}
      </div>
    </section>
  );
}
