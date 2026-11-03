import { useState } from "react";
import { LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { useI18n } from "../state/i18n";

export default function BulkBar({
  count,
  removableTags,
  onAction,
  onDelete,
  onClear,
  busy,
}) {
  const { t } = useI18n();
  const [tag, setTag] = useState("");
  return (
    <section className="bulk-bar" aria-label={t("selected")}>
      <span className="bulk-count">
        {busy ? <LoaderCircle size={15} className="spin" /> : <b>{count}</b>}
        {t("selected")}
      </span>
      <div className="bulk-actions">
        {[7, 30].map((days) => (
          <button
            className="button button-small"
            disabled={busy}
            key={days}
            onClick={() => onAction("extend", days)}
          >
            {t(`preset${days}d`)}
          </button>
        ))}
        <form
          className="bulk-tag"
          onSubmit={(event) => {
            event.preventDefault();
            if (tag.trim()) {
              onAction("addTag", tag.trim());
              setTag("");
            }
          }}
        >
          <input
            aria-label={t("bulkAddTag")}
            placeholder={t("bulkAddTag")}
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            disabled={busy}
            maxLength={64}
          />
          <button
            className="icon-button"
            aria-label={t("addTagAction")}
            disabled={busy || !tag.trim()}
          >
            <Plus size={16} />
          </button>
        </form>
        {removableTags.length > 0 && (
          <select
            className="bulk-remove-tag"
            aria-label={t("bulkRemoveTag")}
            value=""
            disabled={busy}
            onChange={(event) => onAction("removeTag", event.target.value)}
          >
            <option value="">{t("bulkRemoveTag")}</option>
            {removableTags.map((tag) => (
              <option key={tag}>{tag}</option>
            ))}
          </select>
        )}
        <button
          className="button button-small"
          disabled={busy}
          onClick={() => onAction("enable")}
        >
          {t("bulkEnable")}
        </button>
        <button
          className="button button-small"
          disabled={busy}
          onClick={() => onAction("disable")}
        >
          {t("bulkDisable")}
        </button>
        <button
          className="button button-small"
          disabled={busy}
          onClick={() => onAction("reset")}
        >
          {t("bulkResetQuota")}
        </button>
        <button
          className="button button-small text-warning"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 size={14} />
          {t("bulkDelete")}
        </button>
      </div>
      <button
        className="icon-button"
        aria-label={t("clearSelection")}
        onClick={onClear}
        disabled={busy}
      >
        <X size={18} />
      </button>
    </section>
  );
}
