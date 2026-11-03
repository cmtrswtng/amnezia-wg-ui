import { useState } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import Modal from "./Modal";
import { useI18n } from "../../state/i18n";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <div className={`confirm-symbol ${danger ? "danger" : ""}`}>
        <AlertTriangle size={26} />
      </div>
      <p className="dialog-description">{message}</p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="modal-footer">
        <button className="button" onClick={onClose} disabled={busy}>
          {t("cancel")}
        </button>
        <button
          className={`button ${danger ? "button-danger" : "button-primary"}`}
          onClick={confirm}
          disabled={busy}
        >
          {busy && <LoaderCircle size={16} className="spin" />}
          {confirmLabel || t("done")}
        </button>
      </div>
    </Modal>
  );
}
