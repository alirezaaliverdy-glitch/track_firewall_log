import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/apiTransport";
import "./AiProviderSettings.css";
type Configuration = { enabled: boolean; model: string; keyConfigured: boolean; source: string };
export function AiProviderSettings({ isFa }: { isFa: boolean }) {
  const [config, setConfig] = useState<Configuration | null>(null), [key, setKey] = useState(""), [model, setModel] = useState("openrouter/free");
  const [enabled, setEnabled] = useState(false), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [verified, setVerified] = useState(false);
  const copy = (fa: string, en: string) => isFa ? fa : en;
  useEffect(() => { let active = true; void apiRequest("/ai/provider/config").then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Configuration>; }).then(value => { if (active) { setConfig(value); setEnabled(value.enabled); setModel(value.model); } }).catch(() => { if (active) setNotice(copy("دریافت تنظیمات ناموفق بود.", "Could not load settings.")); }); return () => { active = false; }; }, [isFa]);
  const save = async () => {
    setBusy(true); setNotice(""); setVerified(false);
    try {
      const response = await apiRequest("/ai/provider/config", { method: "PUT", body: JSON.stringify({ enabled, model, ...(key.trim() ? { apiKey: key.trim() } : {}), externalDataConsent: consent }) });
      if (!response.ok) throw new Error();
      setConfig(await response.json() as Configuration); setKey(""); setNotice(copy("تنظیمات ذخیره شد. برای اطمینان، اتصال را تست کن.", "Saved. Test the connection to verify it."));
    } catch { setNotice(copy("ذخیره نشد؛ کلید، مدل و مجوز ارسال داده را بررسی کن.", "Not saved. Check the key, model and data consent.")); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setNotice(""); setVerified(false);
    try {
      const response = await apiRequest("/ai/provider/test", { method: "POST", body: "{}" });
      const data = await response.json() as { ok?: boolean; liveVerified?: boolean; upstreamStatus?: number };
      if (response.ok && data.ok && data.liveVerified) { setVerified(true); setNotice(copy("پاسخ واقعی مدل دریافت شد.", "A real model response was received.")); }
      else setNotice(data.upstreamStatus === 403 ? copy("OpenRouter دسترسی این مسیر را رد می‌کند (۴۰۳). مسیر شبکه و محدودیت‌های حساب را بررسی کن.", "OpenRouter rejected access (403). Check network access and account restrictions.") : copy("پاسخ زنده دریافت نشد؛ کلید، مدل و دسترسی شبکه را بررسی کن.", "No live response. Check the key, model and network access."));
    } catch { setNotice(copy("تست اتصال انجام نشد.", "Connection test failed.")); }
    finally { setBusy(false); }
  };
  return <section className="ai-provider-settings"><header><span><KeyRound size={22} /></span><div><h2>OpenRouter</h2><p>{copy("اتصال دستیار به مدل هوش مصنوعی", "Connect the assistant to an AI model")}</p></div><small className={verified ? "is-verified" : ""}>{verified ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}{verified ? copy("اتصال تأیید شد", "Connection verified") : config?.keyConfigured ? copy("کلید ثبت شده", "Key configured") : copy("کلید لازم است", "Key required")}</small></header>
    <form onSubmit={event => { event.preventDefault(); void save(); }}><label>{copy("کلید API", "API key")}<input type="password" autoComplete="new-password" spellCheck={false} dir="ltr" value={key} onChange={event => { setKey(event.target.value); setVerified(false); }} placeholder={config?.keyConfigured ? copy("برای حفظ کلید فعلی، خالی بگذار", "Leave blank to keep the current key") : copy("کلید تازه را اینجا وارد کن", "Enter a new key here")} /><small>{copy("کلید رمزگذاری می‌شود و دوباره نمایش داده نمی‌شود. کلید افشاشده در چت را لغو کن.", "Encrypted at rest and never returned. Revoke any key exposed in chat.")}</small></label><label>{copy("مدل", "Model")}<input dir="ltr" value={model} onChange={event => { setModel(event.target.value); setVerified(false); }} maxLength={180} required /></label>
    <label className="ai-provider-settings__check"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />{copy("فعال‌کردن OpenRouter برای دستیار", "Enable OpenRouter for the assistant")}</label>
    {enabled ? <label className="ai-provider-settings__check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />{copy("ارسال پیام‌ها و زمینهٔ شواهد دستیار به OpenRouter و مدل انتخاب‌شده را تأیید می‌کنم.", "I approve sending assistant messages and evidence context to OpenRouter and the selected model.")}</label> : null}
    <footer><button type="submit" disabled={busy || !config || enabled && !consent}>{busy ? <LoaderCircle size={16} /> : null}{copy("ذخیرهٔ امن", "Save securely")}</button><button type="button" onClick={() => void test()} disabled={busy || !config?.keyConfigured}>{copy("تست پاسخ واقعی", "Test live response")}</button></footer></form>{notice ? <p className="ai-provider-settings__notice" role="status">{notice}</p> : null}
  </section>;
}
