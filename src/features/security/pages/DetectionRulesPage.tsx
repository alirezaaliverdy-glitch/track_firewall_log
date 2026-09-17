import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useDetectionRules } from "../hooks/useDetectionRules";

export default function DetectionRulesPage() {
  const { rules, loading, error, refresh } = useDetectionRules();
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  return (
    <section className="page-stack">
      <PageHeader title="قوانین تشخیص" eyebrow="Detection Rules" description="حداقل 12 قانون seed شده با وضعیت فعال/غیرفعال و شدت." />
      <div className="table-shell">
        <table>
          <thead><tr><th>Rule</th><th>Enabled</th><th>Severity</th><th>Vendor/Event</th><th>Threshold</th></tr></thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.name}<p className="text-xs text-slate-500">{rule.description}</p></td>
                <td><StatusBadge value={rule.enabled ? "enabled" : "disabled"} tone={rule.enabled ? "good" : "neutral"} /></td>
                <td><StatusBadge value={rule.severity} tone={["critical", "high"].includes(rule.severity) ? "danger" : "warning"} /></td>
                <td>{rule.ruleType}</td>
                <td>seeded rule</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
