import { memo, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Copy,
  Download,
  Ellipsis,
  Link,
  Pencil,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { api } from "../api/client";
import { formatBytes, formatDate, timeAgo, sha256Hex } from "../utils/format";
import { accessStatus, DAY, isOnline } from "../utils/clients";
import { useI18n } from "../state/i18n";
import TrafficChart from "./TrafficChart";
import SpotlightCard from "./react-bits/SpotlightCard";

function ClientCard({
  client,
  selected,
  onSelect,
  settings,
  onToggle,
  onEdit,
  onDelete,
  onQr,
  onLink,
  onReset,
  onExtend,
  onCopy,
  now,
}) {
  const { t, locale } = useI18n();
  const [avatar, setAvatar] = useState(null);
  const [busy, setBusy] = useState(false);
  const menu = useRef(null);
  const status = accessStatus(client, now);
  const online = isOnline(client, now);
  const expires = client.expiredAt
    ? Math.ceil((Date.parse(client.expiredAt) - now) / DAY)
    : null;
  useEffect(() => {
    let active = true;
    setAvatar(null);
    if (
      !settings.avatarSettings?.dicebear &&
      !settings.avatarSettings?.gravatar
    )
      return;
    sha256Hex(client.name.toLowerCase().trim())
      .then((hash) => {
        if (!active) return;
        if (settings.avatarSettings.gravatar && client.name.includes("@"))
          setAvatar(`https://gravatar.com/avatar/${hash}.jpg?d=404`);
        else if (settings.avatarSettings.dicebear)
          setAvatar(
            `https://api.dicebear.com/9.x/${encodeURIComponent(settings.avatarSettings.dicebear)}/svg?seed=${hash}`,
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [
    client.name,
    settings.avatarSettings?.dicebear,
    settings.avatarSettings?.gravatar,
  ]);
  useEffect(() => {
    function dismiss(event) {
      if (menu.current && !menu.current.contains(event.target))
        menu.current.open = false;
    }
    function escape(event) {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary").focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  async function toggle() {
    setBusy(true);
    try {
      await onToggle(client);
    } finally {
      setBusy(false);
    }
  }
  function action(fn) {
    menu.current.open = false;
    fn(client);
  }
  const canExport = client.downloadableConfig !== false;
  return (
    <SpotlightCard className={`client-card ${selected ? "is-selected" : ""}`}>
      <div className="client-top">
        <label className="client-select">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(client.id)}
            aria-label={t("selectClient", { name: client.name })}
          />
        </label>
        {avatar && (
          <div className="client-avatar">
            <img src={avatar} alt="" onError={() => setAvatar(null)} />
          </div>
        )}
        <div className="client-identity">
          <h3 title={client.name}>{client.name}</h3>
          <button
            className="copy-address"
            onClick={() => onCopy(client.address)}
            title={t("copyIp")}
            aria-label={`${t("copyIp")} ${client.address}`}
          >
            {client.address}
            <Copy size={12} />
          </button>
        </div>
        <details className="client-menu" ref={menu}>
          <summary
            role="button"
            className="icon-button"
            aria-label={`${t("actions")} — ${client.name}`}
          >
            <Ellipsis size={20} />
          </summary>
          <div className="action-menu">
            <button onClick={() => action(onEdit)}>
              <Pencil size={15} />
              {t("editClient")}
            </button>
            <button onClick={() => action(onExtend)}>
              <CalendarDays size={15} />
              {t("preset30d")}
            </button>
            {settings.oneTimeLinks && (
              <button disabled={!canExport} onClick={() => action(onLink)}>
                <Link size={15} />
                {t("oneTimeLinkShort")}
              </button>
            )}
            {client.quotaBytes != null && (
              <button onClick={() => action(onReset)}>
                <RotateCcw size={15} />
                {t("quotaReset")}
              </button>
            )}
            <button className="text-warning" onClick={() => action(onDelete)}>
              <Trash2 size={15} />
              {t("deleteClient")}
            </button>
          </div>
        </details>
      </div>
      <div className="client-states">
        <span
          className={`status-badge ${online ? "status-online" : "status-offline"}`}
          title={t("onlineHint")}
        >
          <i />
          {t(online ? "online" : "offline")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={client.enabled}
          aria-label={`${t(client.enabled ? "disableClient" : "enableClient")} — ${client.name}`}
          disabled={busy}
          onClick={toggle}
          className={`access-switch ${client.enabled ? "is-on" : ""}`}
        >
          <span>
            {t(
              status === "active"
                ? "permitted"
                : `status${status[0].toUpperCase()}${status.slice(1)}`,
            )}
          </span>
          <i />
        </button>
      </div>
      <div className="client-tags">
        {(client.tags || []).map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
          </span>
        ))}
      </div>
      <div className="client-facts">
        <div>
          <span className="fact-label">
            <ShieldCheck size={13} />
            {t("access")}
          </span>
          <strong
            className={expires !== null && expires <= 7 ? "text-warning" : ""}
          >
            {expires === null ? (
              t("Permanent")
            ) : expires <= 0 ? (
              t("statusExpired")
            ) : (
              <>
                {expires}
                <small>
                  {" "}
                  {t("daysShort")} {t("remaining")}
                </small>
              </>
            )}
          </strong>
          {client.expiredAt && (
            <span className="fact-note">
              {formatDate(client.expiredAt, locale)}
            </span>
          )}
        </div>
        <div>
          <span className="fact-label">{t("lastConnection")}</span>
          <strong className="last-handshake">
            {client.latestHandshakeAt
              ? timeAgo(client.latestHandshakeAt, locale)
              : t("neverConnected")}
          </strong>
        </div>
      </div>
      <div className="client-traffic">
        <div>
          <span>
            <ArrowDownLeft size={13} />
            {formatBytes(client.transferRx, 1)}
          </span>
          <span>
            <ArrowUpRight size={13} />
            {formatBytes(client.transferTx, 1)}
          </span>
        </div>
        <small>
          {client.quotaBytes != null
            ? `${formatBytes(client.quotaUsedBytes, 1)} / ${formatBytes(client.quotaBytes, 1)}`
            : t("unlimited")}
        </small>
      </div>
      <div
        className={`quota-track ${status === "quota" ? "quota-danger" : ""}`}
        role={client.quotaBytes != null ? "progressbar" : undefined}
        aria-label={client.quotaBytes != null ? t("quotaGb") : undefined}
        aria-valuenow={
          client.quotaBytes != null
            ? Math.min(100, client.quotaUsedPercent || 0)
            : undefined
        }
        aria-valuemin={client.quotaBytes != null ? 0 : undefined}
        aria-valuemax={client.quotaBytes != null ? 100 : undefined}
      >
        <i
          style={{
            width: `${client.quotaBytes != null ? Math.min(100, client.quotaUsedPercent || 0) : 0}%`,
          }}
        />
      </div>
      {client.quotaCycleEndsAt && (
        <p className="quota-cycle">
          {t("quotaUntil")} {formatDate(client.quotaCycleEndsAt, locale)}
        </p>
      )}
      {settings.uiChartType > 0 && (
        <div className="client-charts">
          <TrafficChart
            data={client.transferRxHistory}
            type={settings.uiChartType}
            label={t("totalDownload")}
          />
          <TrafficChart
            data={client.transferTxHistory}
            type={settings.uiChartType}
            label={t("totalUpload")}
          />
        </div>
      )}
      {settings.uiTrafficStats && (
        <div className="live-rates">
          ↓ {formatBytes(client.transferRxCurrent, 1)}/s{" "}
          <span>↑ {formatBytes(client.transferTxCurrent, 1)}/s</span>
        </div>
      )}
      <div className="client-footer">
        <button
          className="button button-small"
          onClick={() => onQr(client)}
          disabled={!canExport}
          title={!canExport ? t("noPrivateKey") : undefined}
        >
          <QrCode size={15} />
          <span>{t("showQR")}</span>
        </button>
        {canExport ? (
          <a
            className="button button-small button-download"
            href={api.configurationUrl(client.id)}
            download
          >
            <Download size={15} />
            {t("downloadShort")}
          </a>
        ) : (
          <span className="no-key" title={t("noPrivateKey")}>
            {t("noPrivKey")}
          </span>
        )}
      </div>
    </SpotlightCard>
  );
}
export default memo(ClientCard);
