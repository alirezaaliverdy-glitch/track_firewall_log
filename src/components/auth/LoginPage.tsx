import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Eye, EyeOff, ShieldCheck, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { AuthApiError } from "@/lib/auth";
import { isNativeAndroidApp } from "@/mobile/nativeServerConfig";
import i18n from "@/i18n";
import logoSource from "@/assets/branding/eosnet-logo-source.jpg";
import "@/mobile/PwaMobile.css";
import "./EosnetLogin.css";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
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
    if (submittingRef.current) return;
    setError("");
    if (!username.trim() || password.length < 6) {
      setError(t("auth.login.errors.invalid"));
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (cause) {
      setError(errorCopy(cause));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className={`eos-login${isNativeAndroid ? " eos-login--native" : ""}`} dir={isFa ? "rtl" : "ltr"}>
      <div className="eos-login__background" aria-hidden="true" />
      <nav className="eos-login__language" dir="ltr" aria-label={t("auth.login.languageLabel")}>
        <button type="button" lang="en" aria-pressed={!isFa} onClick={() => void i18n.changeLanguage("en")}>EN</button>
        <button type="button" lang="fa" aria-pressed={isFa} onClick={() => void i18n.changeLanguage("fa")}>فارسی</button>
      </nav>

      <section className="eos-login__content" aria-labelledby="login-title">
        <header className="eos-login__header">
          <div className="eos-login__brand">
            <img src={logoSource} alt="EOSNET · eosnet.ir" width="844" height="1500" fetchPriority="high" />
          </div>
          <div className="eos-login__status">
            <span className="eos-login__status-dot" aria-hidden="true" />
            <span>{t("auth.login.status")}</span>
            <ShieldCheck aria-hidden="true" />
          </div>
          <h1 id="login-title">{t("auth.login.title")}</h1>
        </header>

        <form className="eos-login__form" onSubmit={submit} noValidate aria-busy={submitting}>
          <div className="eos-login__field eos-login__field--username">
            <label className="eos-login__sr-only" htmlFor="login-username">{t("auth.login.username")}</label>
            <span className="eos-login__user-icon"><UserRound aria-hidden="true" /></span>
            <input id="login-username" name="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={128} readOnly={submitting} placeholder={t("auth.login.usernamePlaceholder")} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
          </div>
          <div className="eos-login__field eos-login__field--password">
            <label className="eos-login__sr-only" htmlFor="login-password">{t("auth.login.password")}</label>
            <input id="login-password" name="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={updateCapsLock} onKeyUp={updateCapsLock} onBlur={() => setCapsLock(false)} autoComplete="current-password" minLength={6} maxLength={128} readOnly={submitting} placeholder={t("auth.login.passwordPlaceholder")} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : capsLock ? "login-caps" : undefined} />
            <button className="eos-login__password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("auth.login.hidePassword") : t("auth.login.showPassword")} aria-pressed={showPassword}>
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </div>
          {capsLock && <div id="login-caps" className="eos-login__message" role="status">{t("auth.login.capsLock")}</div>}
          {notice === "password_changed" && <div className="eos-login__message" role="status">{t("auth.login.passwordChanged")}</div>}
          {error && <div id="login-error" className="eos-login__message eos-login__message--error" role="alert">{error}</div>}
          <button className="eos-login__submit" disabled={submitting} type="submit">
            {submitting ? <span className="eos-login__spinner" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
            {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
          </button>
        </form>
      </section>
    </main>
  );
}
