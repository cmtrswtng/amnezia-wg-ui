import { useId, useState } from "react";
import { CalendarDays, Check, LoaderCircle } from "lucide-react";
import Modal from "./ui/Modal";
import { useI18n } from "../state/i18n";
import { toLocalInputValue } from "../utils/format";

export default function ClientForm({ client, tags = [], onSave, onClose }) {
  const { t } = useI18n();
  const [name, setName] = useState(client?.name || "");
  const [tagText, setTagText] = useState((client?.tags || []).join(", "));
  const [expires, setExpires] = useState(toLocalInputValue(client?.expiredAt));
  const [quota, setQuota] = useState(
    client?.quotaBytes != null
      ? String(Math.round((client.quotaBytes / 1024 ** 3) * 100) / 100)
      : "",
  );
  const [cycle, setCycle] = useState(client?.quotaCycleDays || 30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tagId = useId();
  async function submit(event) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSave({
        name: name.trim(),
        tags: [
          ...new Set(
            tagText
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        ],
        expiredDate: expires ? new Date(expires).toISOString() : null,
        quotaBytes:
          quota !== "" && Number(quota) > 0
            ? Math.round(Number(quota) * 1024 ** 3)
            : null,
        quotaCycleDays: Number(cycle) || 30,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={t(client ? "editClient" : "newClient")}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="client-form">
        <fieldset disabled={busy}>
          <label className="field">
            {t("name")}
            <input
              autoFocus
              required
              maxLength={128}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="field">
            {t("tags")}
            <input
              aria-label={t("tags")}
              aria-describedby={`${tagId}-hint`}
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              list={tagId}
            />
            <small id={`${tagId}-hint`}>{t("tagsHint")}</small>
          </label>
          <datalist id={tagId}>
            {tags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          <label className="field">
            {t("ExpireDate")}
            <input
              type="datetime-local"
              value={expires}
              onChange={(event) => setExpires(event.target.value)}
            />
            <small>{t("accessHint")}</small>
          </label>
          <div className="preset-row">
            {[7, 30, 90].map((days) => (
              <button
                type="button"
                className="button button-small"
                key={days}
                onClick={() =>
                  setExpires(
                    toLocalInputValue(new Date(Date.now() + days * 86400000)),
                  )
                }
              >
                <CalendarDays size={13} />
                {t(`preset${days}d`)}
              </button>
            ))}
            <button
              className="button button-small"
              type="button"
              onClick={() => setExpires("")}
            >
              {t("Permanent")}
            </button>
          </div>
          <div className="form-columns">
            <label className="field">
              {t("quotaGb")}
              <input
                aria-label={t("quotaGb")}
                type="number"
                min="0"
                max="1000000"
                step="0.1"
                value={quota}
                onChange={(event) => setQuota(event.target.value)}
              />
              <small>{t("quotaHint")}</small>
            </label>
            <label className="field">
              {t("quotaCycleDays")}
              <input
                type="number"
                min="1"
                max="365"
                step="1"
                value={cycle}
                onChange={(event) => setCycle(event.target.value)}
                disabled={!Number(quota)}
              />
            </label>
          </div>
        </fieldset>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={busy || !name.trim()}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}{" "}
            {t("save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
