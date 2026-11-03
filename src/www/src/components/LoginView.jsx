import { useState } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole, Shield } from "lucide-react";
import { useSession } from "../state/Session";
import { useI18n } from "../state/i18n";
import AnimatedContent from "./react-bits/AnimatedContent";

export function Brand() {
  return (
    <div className="brand">
      <Shield size={25} strokeWidth={1.7} aria-hidden="true" />
      <span>AmneziaWG</span>
      <small>3.1</small>
    </div>
  );
}
export default function LoginView() {
  const { t } = useI18n();
  const { login, rememberMeEnabled } = useSession();
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(password, remember);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setPassword("");
    }
  }
  return (
    <main className="login-page">
      <AnimatedContent className="login-card">
        <Brand />
        <div className="login-intro">
          <h1>{t("loginTitle")}</h1>
          <p>{t("loginHint")}</p>
        </div>
        <form onSubmit={submit}>
          <label className="field">
            {t("password")}
            <div className="password-input">
              <LockKeyhole size={18} />
              <input
                autoFocus
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
            </div>
          </label>
          {rememberMeEnabled && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              {t("rememberMe")}
            </label>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button button-primary login-submit"
            disabled={!password || busy}
          >
            {t("signIn")}
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <ArrowRight size={18} />
            )}
          </button>
        </form>
        <span className="login-version">AmneziaWG 3.1</span>
      </AnimatedContent>
    </main>
  );
}
