import { useI18n } from "../state/i18n";
import {
  isOnline,
  isExpiring,
  accessStatus,
  totalTraffic,
} from "../utils/clients";
import { formatBytes } from "../utils/format";
import CountUp from "./react-bits/CountUp";

export default function StatsBar({ clients, now, onFilter }) {
  const { t } = useI18n();
  const online = clients.filter((client) => isOnline(client, now)).length;
  const expiring = clients.filter((client) => isExpiring(client, now)).length;
  const allowed = clients.filter(
    (client) => accessStatus(client, now) === "active",
  ).length;
  return (
    <section className="stats-grid" aria-label={t("overview")}>
      <button
        className="stat-card stat-blue"
        onClick={() => onFilter("online")}
        title={t("onlineHint")}
      >
        <span className="stat-label">{t("online")}</span>
        <strong className="stat-number">
          <CountUp value={online} />
          <span className="live-dot" />
        </strong>
        <span className="stat-caption">{t("onlineDescription")}</span>
      </button>
      <button className="stat-card" onClick={() => onFilter("all")}>
        <span className="stat-label">{t("totalClients")}</span>
        <strong className="stat-number">
          <CountUp value={clients.length} />
        </strong>
        <span className="stat-caption">
          {t("permitted")}: {allowed}
        </span>
      </button>
      <button className="stat-card" onClick={() => onFilter("expiring")}>
        <span className="stat-label">{t("expiringSoon")}</span>
        <strong className={`stat-number ${expiring ? "text-warning" : ""}`}>
          <CountUp value={expiring} />
        </strong>
        <span className="stat-caption">{t("nextSevenDays")}</span>
      </button>
      <div className="stat-card">
        <span className="stat-label">{t("totalTraffic")}</span>
        <strong className="stat-number stat-traffic">
          {formatBytes(
            clients.reduce((sum, client) => sum + totalTraffic(client), 0),
            1,
          )}
        </strong>
        <span className="stat-caption">{t("trafficDescription")}</span>
      </div>
    </section>
  );
}
