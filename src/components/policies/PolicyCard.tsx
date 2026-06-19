import { useState } from "react";
import { ChevronDown, ShieldAlert } from "lucide-react";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import PolicyDetails from "@/components/policies/PolicyDetails";
import type { PolicySummary } from "@/lib/policyIntelligence";

export default function PolicyCard({ policy }: { policy: PolicySummary }) {
  const [open, setOpen] = useState(false);
  const blockedTotal = policy.deniedEvents + policy.droppedEvents;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full flex-col gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-900/60 lg:flex-row lg:items-center lg:justify-between"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={policy.riskLevel} />
            <span className="rounded border border-blue-900/60 bg-blue-950/30 px-2 py-0.5 text-[11px] font-medium text-blue-200">
              Risk {policy.riskScore}/100
            </span>
            {policy.policyId && (
              <span className="text-[11px] text-slate-500">ID {policy.policyId}</span>
            )}
          </div>
          <p className="truncate text-sm font-semibold text-slate-100">{policy.policyName}</p>
          <p className="mt-1 line-clamp-1 text-xs text-slate-500">{policy.recommendation}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span><span className="font-semibold text-slate-200">{policy.totalEvents.toLocaleString()}</span> events</span>
          <span><span className="font-semibold text-green-300">{policy.allowedEvents.toLocaleString()}</span> allowed</span>
          <span><span className="font-semibold text-amber-300">{blockedTotal.toLocaleString()}</span> blocked/denied</span>
          {(policy.managementTrafficEvents > 0 || policy.databaseTrafficEvents > 0 || policy.sensitivePortEvents > 0) && (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              exposure
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </div>
      </button>

      {open && <PolicyDetails policy={policy} />}
    </div>
  );
}
