import { useState } from "react";
import { Download } from "lucide-react";
import Modal from "./ui/Modal";
import { api } from "../api/client";
import { useI18n } from "../state/i18n";

export default function QrModal({ client, onClose }) {
  const { t } = useI18n();
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  return (
    <Modal title={client.name} onClose={onClose}>
      <p className="dialog-description">{t("exportHint")}</p>
      {error ? (
        <div className="panel-empty">
          <p role="alert">{t("connectionError")}</p>
          <button
            className="button"
            onClick={() => {
              setError(false);
              setVersion((value) => value + 1);
            }}
          >
            {t("retry")}
          </button>
        </div>
      ) : (
        <img
          key={version}
          className="qr-image"
          src={api.qrCodeUrl(client.id)}
          alt={`${t("showQR")} — ${client.name}`}
          onError={() => setError(true)}
        />
      )}
      <div className="modal-footer">
        <a
          className="button button-primary"
          href={api.configurationUrl(client.id)}
          download
        >
          <Download size={16} />
          {t("downloadConfig")}
        </a>
      </div>
    </Modal>
  );
}
