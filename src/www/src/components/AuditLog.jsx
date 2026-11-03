import { useEffect, useState } from "react";
import { FileClock, RefreshCw, Search } from "lucide-react";
import { api } from "../api/client";
import { useI18n } from "../state/i18n";
import { formatDateTime } from "../utils/format";

export default function AuditLog() {
  const { t, locale } = useI18n();
  const [entries, setEntries] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    api
      .getAudit()
      .then((data) => {
        if (active) setEntries(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [version]);
  const filtered = (entries || []).filter((entry) =>
    `${entry.clientName || ""} ${entry.action} ${t(`auditAction_${entry.action.replaceAll(".", "_")}`)}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <section className="audit-panel">
      <div className="audit-controls">
        <div className="search-field">
          <Search size={18} />
          <input
            type="search"
            aria-label={t("auditFilter")}
            placeholder={t("auditFilter")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button
          className="button"
          onClick={() => setVersion((value) => value + 1)}
          aria-label={t("retry")}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {entries === null && !error ? (
        <p className="panel-empty">{t("loading")}</p>
      ) : filtered.length === 0 ? (
        <div className="panel-empty">
          <FileClock size={28} />
          <p>{t("noData")}</p>
        </div>
      ) : (
        <div className="audit-entries">
          {filtered.map((entry, index) => (
            <div className="audit-entry" key={`${entry.ts}-${index}`}>
              <span
                className={`audit-icon ${entry.actor === "system" ? "system" : ""}`}
              >
                <FileClock size={17} />
              </span>
              <div>
                <strong>
                  {t(`auditAction_${entry.action.replaceAll(".", "_")}`)}
                </strong>
                <span>
                  {entry.clientName || t(`auditActor_${entry.actor}`)}
                </span>
                {entry.details && (
                  <small>
                    {typeof entry.details === "string"
                      ? entry.details
                      : JSON.stringify(entry.details)}
                  </small>
                )}
              </div>
              <time dateTime={entry.ts}>
                {formatDateTime(entry.ts, locale)}
              </time>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
