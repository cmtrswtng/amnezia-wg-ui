import { I18nProvider, useI18n } from "./state/i18n";
import { SessionProvider, useSession } from "./state/Session";
import { ToastProvider } from "./state/Toasts";
import LoginView from "./components/LoginView";
import Dashboard from "./components/Dashboard";

function SessionView() {
  const { authenticated, error, initialize } = useSession();
  const { t } = useI18n();
  if (authenticated === null)
    return (
      <main className="boot-state">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="button button-primary" onClick={initialize}>
              {t("retry")}
            </button>
          </>
        ) : (
          <p role="status">{t("loading")}</p>
        )}
      </main>
    );
  return authenticated ? <Dashboard /> : <LoginView />;
}
export default function App() {
  return (
    <I18nProvider>
      <SessionProvider>
        <ToastProvider>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          <SessionView />
        </ToastProvider>
      </SessionProvider>
    </I18nProvider>
  );
}
