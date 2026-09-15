import { useMemo } from "react";
import { useLogContext } from "@/context/LogContext";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import PolicyCard from "@/components/policies/PolicyCard";
import { buildPolicyReview, type PolicySummary } from "@/lib/policyIntelligence";

function PolicyGroup({ title, policies }: { title: string; policies: PolicySummary[] }) {
  if (policies.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{title}</h4>
        <span className="text-[11px] text-slate-600">{policies.length} shown</span>
      </div>
      <div className="space-y-2">
        {policies.map((policy) => (
          <PolicyCard key={`${title}-${policy.policyKey}`} policy={policy} />
        ))}
      </div>
    </div>
  );
}

export default function PolicyReviewPanel() {
  const { logs, summary, logProfile } = useLogContext();

  const policies = useMemo(() => buildPolicyReview(logs), [logs]);

  if (summary.total === 0) return null;

  if (!logProfile.capabilities.includes("policyReview")) return null;

  const topRisky = policies.filter((policy) => policy.riskScore > 0).slice(0, 5);
  const mostActive = [...policies].sort((a, b) => b.totalEvents - a.totalEvents).slice(0, 5);
  const noisyBlocked = policies
    .filter((policy) => policy.deniedEvents + policy.droppedEvents > 0)
    .sort((a, b) => (b.deniedEvents + b.droppedEvents) - (a.deniedEvents + a.droppedEvents))
    .slice(0, 5);
  const sensitiveAllowed = policies
    .filter((policy) => policy.allowedEvents > 0 && policy.sensitivePortEvents > 0)
    .slice(0, 5);
  const unknownDirection = policies
    .filter((policy) => policy.unknownDirectionEvents > 0)
    .sort((a, b) => b.unknownDirectionEvents - a.unknownDirectionEvents)
    .slice(0, 5);

  const headerRight = (
    <span className="text-xs text-slate-400">
      {policies.length} polic{policies.length === 1 ? "y" : "ies"}
    </span>
  );

  return (
    <SectionCard
      title="Policy / Rule Review"
      subtitle="Review which firewall policies allowed risky traffic, blocked suspicious traffic, or generated the most activity."
      headerRight={headerRight}
    >
      {policies.length === 0 ? (
        <EmptyState
          compact
          title="No policy or rule data available"
          description="Map policy, rule, or ACL fields to enable policy review."
        />
      ) : (
        <div className="space-y-6">
          <PolicyGroup title="Top risky policies" policies={topRisky.length > 0 ? topRisky : policies.slice(0, 3)} />
          <PolicyGroup title="Policies allowing sensitive ports" policies={sensitiveAllowed} />
          <PolicyGroup title="Noisy blocked / denied policies" policies={noisyBlocked} />
          <PolicyGroup title="Most active policies" policies={mostActive} />
          <PolicyGroup title="Policies with unknown direction" policies={unknownDirection} />
        </div>
      )}
    </SectionCard>
  );
}
