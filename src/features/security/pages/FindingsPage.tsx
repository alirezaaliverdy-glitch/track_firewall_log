import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { FindingTable } from "../components/FindingTable";
import { useFindings } from "../hooks/useFindings";

export default function FindingsPage() {
  const { findings, loading, error, refresh } = useFindings();
  const [severity, setSeverity] = useState("all");
  const filtered = useMemo(() => severity === "all" ? findings : findings.filter((finding) => finding.severity === severity), [findings, severity]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  return (
    <section className="page-stack">
      <PageHeader title="یافته ها" eyebrow="Findings" description="لیست یافته های امنیتی با فیلتر پایه و مسیر جزئیات." />
      <div className="filter-bar">
        <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
          <option value="all">همه شدت ها</option>
          <option value="critical">critical</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
      </div>
      {filtered.length ? <FindingTable findings={filtered} /> : <EmptyState title="یافته ای پیدا نشد" description="فیلترها را تغییر دهید یا detection را اجرا کنید." />}
    </section>
  );
}
