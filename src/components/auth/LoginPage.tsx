import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { AuthApiError } from "@/lib/auth";
import { isNativeAndroidApp } from "@/mobile/nativeServerConfig";
import i18n from "@/i18n";
import AnimatedShield from "./AnimatedShield";
import CyberBackground from "./CyberBackground";
import "./NativeLoginStability.css";

type LoginIconName = "eye" | "eyeOff" | "lock" | "shield" | "user";

function LoginIcon({ name }: { name: LoginIconName }) {
  return (
    <svg className="login-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {name === "eye" ? (
        <>
          <path d="M2.1 12s3.4-6.5 9.9-6.5 9.9 6.5 9.9 6.5-3.4 6.5-9.9 6.5S2.1 12 2.1 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : null}
      {name === "eyeOff" ? (
        <>
          <path d="M9.9 5.8A10.2 10.2 0 0 1 12 5.5c6.5 0 9.9 6.5 9.9 6.5a17.8 17.8 0 0 1-2.8 3.7" />
          <path d="M14.1 14.1A3 3 0 0 1 9.9 9.9" />
          <path d="M3 3l18 18" />
          <path d="M6.6 6.6C3.7 8.6 2.1 12 2.1 12s3.4 6.5 9.9 6.5c1.4 0 2.7-.3 3.8-.8" />
        </>
      ) : null}
      {name === "lock" ? (
        <>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      ) : null}
      {name === "shield" ? (
        <>
          <path d="M12 3 19 6v5c0 4.7-3 8.1-7 10-4-1.9-7-5.3-7-10V6l7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </>
      ) : null}
      {name === "user" ? (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </>
      ) : null}
    </svg>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice] = useState(() => {
    const value = window.sessionStorage.getItem("auth.notice");
    window.sessionStorage.removeItem("auth.notice");
    return value;
  });
  const isFa = i18n.resolvedLanguage?.startsWith("fa") ?? true;
  const isNativeAndroid = isNativeAndroidApp();

  function updateCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  function errorCopy(cause: unknown) {
    if (!(cause instanceof AuthApiError)) return t("auth.login.errors.unavailable");
    if (cause.code === "invalid_credentials") return t("auth.login.errors.invalid");
    if (cause.code === "too_many_attempts") return t("auth.login.errors.rateLimited", { seconds: cause.retryAfter });
    if (cause.code === "database_unavailable") return t("auth.login.errors.database");
    return t("auth.login.errors.unavailable");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!username.trim() || password.length < 6) {
      setError(t("auth.login.errors.invalid"));
      return;
    }
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (cause) {
      setError(errorCopy(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={`login-scene ${isNativeAndroid ? "login-scene--native" : ""}`} dir={isFa ? "rtl" : "ltr"}>
      <CyberBackground />

      <section className="login-card" aria-labelledby="login-title">
        <AnimatedShield />

        <nav className="login-language" aria-label={t("auth.login.languageLabel")}>
          <button type="button" aria-pressed={isFa} onClick={() => void i18n.changeLanguage("fa")}>فارسی</button>
          <button type="button" aria-pressed={!isFa} onClick={() => void i18n.changeLanguage("en")}>EN</button>
        </nav>

        <div className="login-status"><span />{t("auth.login.status")}</div>
        <h1 id="login-title">{t("auth.login.title")} <strong>{t("auth.login.product")}</strong></h1>
        <p>{t("auth.login.description")}</p>

        <form onSubmit={submit} noValidate aria-busy={submitting}>
          <label>
            {t("auth.login.username")}
            <div className="login-field">
              <LoginIcon name="user" />
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={128} autoFocus={!isNativeAndroid} placeholder={t("auth.login.usernamePlaceholder")} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
            </div>
          </label>
          <label>
            {t("auth.login.password")}
            <div className="login-field">
              <LoginIcon name="lock" />
              <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={updateCapsLock} onKeyUp={updateCapsLock} onBlur={() => setCapsLock(false)} autoComplete="current-password" minLength={6} maxLength={128} placeholder={t("auth.login.passwordPlaceholder")} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("auth.login.hidePassword") : t("auth.login.showPassword")} aria-pressed={showPassword}>
                <LoginIcon name={showPassword ? "eyeOff" : "eye"} />
              </button>
            </div>
          </label>
          {capsLock && <div className="login-caps" role="status">{t("auth.login.capsLock")}</div>}
          {notice === "password_changed" && <div className="login-notice" role="status">{t("auth.login.passwordChanged")}</div>}
          {error && <div id="login-error" className="login-error" role="alert">{error}</div>}
          <button className="login-submit" disabled={submitting} type="submit">
            {submitting ? <span className="login-spinner" /> : <LoginIcon name="shield" />}
            {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
          </button>
        </form>

        <aside className="login-security-note" aria-label={t("auth.login.securityTitle")}>
          <LoginIcon name="lock" />
          <span><strong>{t("auth.login.securityTitle")}</strong><small>{t("auth.login.securityDescription")}</small></span>
        </aside>
        <footer><span />{t("auth.login.footer")}<span /></footer>
      </section>
    </main>
  );
}
