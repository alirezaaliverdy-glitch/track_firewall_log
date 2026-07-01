import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AnimatedShield from "./AnimatedShield";
import CyberBackground from "./CyberBackground";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!username.trim() || password.length < 8) {
      setError("Invalid username or password.");
      return;
    }
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === "invalid_credentials"
          ? "Invalid username or password."
          : "Unable to connect to the authentication server."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-scene" dir="ltr">
      <CyberBackground />

      <section className="login-card" aria-labelledby="login-title">
        <AnimatedShield />

        <div className="login-status"><span />Secure &amp; Active System</div>
        <h1 id="login-title">Sign in to <strong>Firewall Log Analyzer</strong></h1>
        <p>AI-powered firewall analysis, security orchestration, and network action management</p>

        <form onSubmit={submit}>
          <label>
            Username
            <div className="login-field">
              <UserRound />
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus placeholder="Enter your username" />
            </div>
          </label>
          <label>
            Password
            <div className="login-field">
              <LockKeyhole />
              <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your password" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="login-submit" disabled={submitting}>
            {submitting ? <span className="login-spinner" /> : <ShieldCheck />}
            {submitting ? "Signing in..." : "Secure Sign In"}
          </button>
        </form>

        <footer><span />AI Security Orchestrator<span /></footer>
      </section>
    </main>
  );
}
