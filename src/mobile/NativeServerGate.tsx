import { useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, LoaderCircle, Server, ShieldCheck, Wifi } from "lucide-react";
import { getNativeServerUrl, isNativeAndroidApp, normalizeNativeServerUrl, saveNativeServerUrl } from "./nativeServerConfig";
import "./NativeServerGate.css";

function messageFor(error: unknown) {
  const code = error instanceof Error ? error.message : "server_unavailable";
  if (code === "https_required") return "برای نسخه انتشار، آدرس سرور باید HTTPS باشد.";
  if (code === "server_required") return "آدرس سرور را وارد کنید.";
  if (code === "server_invalid") return "آدرس واردشده معتبر نیست.";
  return "اتصال برقرار نشد. آدرس، شبکه و فعال‌بودن Backend را بررسی کنید.";
}

export default function NativeServerGate({ children }: { children: ReactNode }) {
  const [configured] = useState(() => getNativeServerUrl());
  const [server, setServer] = useState(configured ?? "");
  const [state, setState] = useState<"idle" | "testing" | "ready">("idle");
  const [error, setError] = useState("");

  if (!isNativeAndroidApp() || configured) return children;

  async function connect(event: FormEvent) {
    event.preventDefault();
    setState("testing");
    setError("");
    try {
      const normalized = normalizeNativeServerUrl(server);
      const response = await fetch(`${normalized}/health/ready`, {
        method: "GET",
        headers: { "X-Firewall-Client": "android" },
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error("server_unavailable");
      const health = await response.json() as { ok?: boolean; databaseReady?: boolean };
      if (health.ok === false || health.databaseReady === false) throw new Error("server_unavailable");
      saveNativeServerUrl(normalized);
      setState("ready");
      window.setTimeout(() => window.location.reload(), 350);
    } catch (connectError) {
      setError(messageFor(connectError));
      setState("idle");
    }
  }

  return (
    <main className="native-server-setup" dir="rtl">
      <section className="native-server-card">
        <div className="native-server-mark" aria-hidden="true"><ShieldCheck /></div>
        <header>
          <span>Firewall SOAR · Android</span>
          <h1>اتصال امن به سرور</h1>
          <p>برای شروع، آدرس سروری را وارد کنید که Backend برنامه روی آن در حال اجراست.</p>
        </header>
        <form onSubmit={connect}>
          <label htmlFor="native-server-url">آدرس Backend</label>
          <div className="native-server-input"><Server aria-hidden="true" /><input id="native-server-url" type="url" inputMode="url" dir="ltr" autoCapitalize="none" autoCorrect="off" placeholder="https://soar.example.com/firewall-api" value={server} onChange={(event) => setServer(event.target.value)} disabled={state !== "idle"} /></div>
          <small>در شبکه آزمایش می‌توانید از آدرس IP رایانه استفاده کنید؛ مثال: <bdi>http://192.168.1.20/firewall-api</bdi></small>
          {error ? <div className="native-server-error" role="alert">{error}</div> : null}
          <button type="submit" disabled={state !== "idle"}>{state === "testing" ? <LoaderCircle className="is-spinning" /> : state === "ready" ? <CheckCircle2 /> : <Wifi />}{state === "testing" ? "در حال بررسی…" : state === "ready" ? "متصل شد" : "بررسی و اتصال"}</button>
        </form>
        <footer><ShieldCheck aria-hidden="true" /> رمز عبور ذخیره نمی‌شود؛ نشست ورود در فضای امن اندروید نگهداری می‌شود.</footer>
      </section>
    </main>
  );
}
