import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileClock,
  LayoutDashboard,
  LogOut,
  Users,
} from "lucide-react";
import { Brand } from "./LoginView";
import { useI18n } from "../state/i18n";
import { useSession } from "../state/Session";

export default function AppHeader({
  page,
  onPage,
  count,
  onBackup,
  onRestore,
}) {
  const { t, locale, setLocale, availableLocales } = useI18n();
  const { requiresPassword, logout } = useSession();
  return (
    <aside className="sidebar">
      <Brand />
      <nav className="main-nav" aria-label={t("workspace")}>
        {[
          [Users, "clients"],
          [LayoutDashboard, "overview"],
          [FileClock, "auditLog"],
        ].map(([Icon, key]) => (
          <button
            key={key}
            className={page === key ? "is-current" : ""}
            aria-current={page === key ? "page" : undefined}
            onClick={() => onPage(key)}
          >
            <Icon size={19} />
            <span>{t(key)}</span>
            {key === "clients" && <b>{count}</b>}
          </button>
        ))}
      </nav>
      <div className="sidebar-tools">
        <div className="sidebar-label">{t("configuration")}</div>
        <button onClick={onBackup}>
          <ArrowDownToLine size={18} />
          {t("backup")}
        </button>
        <label className="restore-input">
          <ArrowUpFromLine size={18} />
          {t("restore")}
          <input
            type="file"
            accept=".json,application/json"
            aria-label={t("restore")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onRestore(file);
            }}
          />
        </label>
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-account">
          <select
            aria-label="Language"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
          >
            {availableLocales.map((lang) => (
              <option key={lang} value={lang}>
                {lang.toUpperCase()}
              </option>
            ))}
          </select>
          {requiresPassword && (
            <button
              className="icon-button"
              aria-label={t("logout")}
              title={t("logout")}
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
