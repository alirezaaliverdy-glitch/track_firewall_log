import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

async function call(path: string, method = "GET") {
  const response = await fetch(`${API_BASE_URL}${path}`, { method, credentials: "include", headers: method === "POST" ? { "Content-Type": "application/json" } : undefined, body: method === "POST" ? JSON.stringify({ idempotencyKey: `ui-${path}` }) : undefined });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : {};
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return payload;
}

export default function AssetSyncPage() {
  const [message, setMessage] = useState("");
  const run = (label: string, path: string, method = "GET") => {
    setMessage(`${label}: در حال اجرا...`);
    call(path, method).then(() => setMessage(`${label}: انجام شد. نتیجه خام نمایش داده نمی شود؛ برای جزئیات به audit/API مراجعه شود.`)).catch((error) => setMessage(error instanceof Error ? error.message : "Request failed"));
  };
  return (
    <section className="page-stack">
      <PageHeader title="همگام سازی دارایی" eyebrow="پیش نمایش قبل از تغییر" description="همگام سازی باید ابتدا preview شود و تغییر مستقیم بدون تایید انجام نشود." />
      <div className="content-grid">
        <section className="content-panel"><h2>NetBox <span className="status-badge status-badge--warning">آزمایشی / Mock</span></h2><p>فقط پیش‌نمایش امن فعال است؛ Apply تولیدی نیازمند تنظیم اتصال واقعی است.</p><button className="primary-button" onClick={() => run("NetBox preview", "/integrations/netbox/sync-preview")}>پیش‌نمایش NetBox</button></section>
        <section className="content-panel"><h2>Wazuh <span className="status-badge status-badge--warning">آزمایشی / Mock</span></h2><p>فقط پیش‌نمایش امن فعال است؛ Apply تولیدی نیازمند تنظیم اتصال واقعی است.</p><button className="primary-button" onClick={() => run("Wazuh preview", "/integrations/wazuh/sync-preview")}>پیش‌نمایش Wazuh</button></section>
        <section className="content-panel"><h2>اتصال Device</h2><p>این مسیر Deviceهای موجود پروژه را بدون credential جدید به Asset وصل می‌کند.</p><button className="primary-button" onClick={() => run("Device sync", "/assets/sync/devices", "POST")}>همگام‌سازی Deviceهای موجود</button></section>
      </div>
      {message ? <p className="content-panel text-sm text-slate-300">{message}</p> : null}
    </section>
  );
}
