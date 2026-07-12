import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");
type Health = { name?: string; status?: string; mode?: string; lastHealthCheck?: string; lastSync?: string; importedCount?: number; errorCount?: number; configurationStatus?: string; productionEnabled?: boolean };

async function getHealth(path: string): Promise<Health> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as Health : {};
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return payload;
}

export default function IntegrationsPage() {
  const [items, setItems] = useState<Array<{ key: string; health: Health }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([getHealth("/integrations/netbox/health"), getHealth("/integrations/wazuh/health")])
      .then(([netbox, wazuh]) => setItems([{ key: "NetBox", health: netbox }, { key: "Wazuh", health: wazuh }]))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Integration health unavailable"))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  return (
    <section className="page-stack">
      <PageHeader title="یکپارچه سازی ها" eyebrow="Integrations" description="اتصال های mock به عنوان قابلیت production نمایش داده نمی شوند." />
      <div className="content-grid">
        {items.map((item) => (
          <section key={item.key} className="content-panel">
            <h2>{item.key} <span className="status-badge status-badge--warning">آزمایشی / Mock</span></h2>
            <dl className="detail-list">
              <dt>وضعیت</dt><dd>{item.health.status ?? "آزمایشی"}</dd>
              <dt>Mode</dt><dd>{item.health.mode ?? "Mock"}</dd>
              <dt>اجرای Production</dt><dd>{item.health.productionEnabled ? "فعال" : "غیرفعال"}</dd>
              <dt>Configuration</dt><dd>{item.health.configurationStatus ?? "mock-only"}</dd>
            </dl>
            <a className="primary-link" href={`/assets/sync`}>Sync flow</a>
          </section>
        ))}
      </div>
    </section>
  );
}
