import { ArrowUpRight, CalendarDays, Sparkles, TrendingUp } from "lucide-react";
import { useI18n } from "../state/i18n";
import { DAY, isExpiring, totalTraffic } from "../utils/clients";
import { formatBytes, formatDate } from "../utils/format";

export default function Overview({ clients, now, onEdit, onExtend }) {
  const { t, locale } = useI18n();
  const expiring = clients
    .filter((client) => isExpiring(client, now))
    .sort((a, b) => Date.parse(a.expiredAt) - Date.parse(b.expiredAt));
  const recent = clients
    .filter((client) => Date.parse(client.createdAt) >= now - 30 * DAY)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const top = [...clients]
    .filter((client) => totalTraffic(client) > 0)
    .sort((a, b) => totalTraffic(b) - totalTraffic(a))
    .slice(0, 5);
  const max = Math.max(1, ...top.map(totalTraffic));
  return (
    <div className="overview-grid">
      <section className="overview-panel">
        <h2>
          <CalendarDays size={19} />
          {t("expiringSoon")}
          <span>{expiring.length}</span>
        </h2>
        <p>{t("nextSevenDays")}</p>
        {expiring.length === 0 ? (
          <div className="panel-empty">{t("noAttention")}</div>
        ) : (
          expiring.map((client) => (
            <div className="overview-row" key={client.id}>
              <div>
                <button className="text-button" onClick={() => onEdit(client)}>
                  {client.name}
                </button>
                <small>{formatDate(client.expiredAt, locale)}</small>
              </div>
              <button
                className="button button-small"
                onClick={() => onExtend(client)}
              >
                {t("preset30d")}
              </button>
            </div>
          ))
        )}
      </section>
      <section className="overview-panel">
        <h2>
          <Sparkles size={19} />
          {t("newClients")}
          <span>{recent.length}</span>
        </h2>
        <p>{t("lastThirtyDays")}</p>
        {recent.length === 0 ? (
          <div className="panel-empty">{t("noData")}</div>
        ) : (
          recent.slice(0, 10).map((client) => (
            <div className="overview-row" key={client.id}>
              <div>
                <button className="text-button" onClick={() => onEdit(client)}>
                  {client.name}
                </button>
                <small>{client.address}</small>
              </div>
              <ArrowUpRight size={16} />
            </div>
          ))
        )}
      </section>
      <section className="overview-panel">
        <h2>
          <TrendingUp size={19} />
          {t("topClients")}
        </h2>
        <p>{t("trafficDescription")}</p>
        {top.length === 0 ? (
          <div className="panel-empty">{t("noData")}</div>
        ) : (
          top.map((client) => (
            <div className="overview-traffic" key={client.id}>
              <div>
                <button className="text-button" onClick={() => onEdit(client)}>
                  {client.name}
                </button>
                <span>{formatBytes(totalTraffic(client), 1)}</span>
              </div>
              <div className="quota-track">
                <i
                  style={{ width: `${(totalTraffic(client) / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
