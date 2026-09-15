import type { PolicySummary } from "@/lib/policyIntelligence";

function TagList({ items }: { items: { value: string; count: number }[] }) {
  if (items.length === 0) return <span className="text-xs text-slate-600">No data</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item.value}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-300"
        >
          {item.value} <span className="text-slate-500">({item.count})</span>
        </span>
      ))}
    </div>
  );
}

export default function PolicyDetails({ policy }: { policy: PolicySummary }) {
  return (
    <div className="space-y-4 border-t border-slate-800 bg-slate-900/40 px-4 py-4">
      <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Recommendation
        </p>
        <p className="text-xs leading-relaxed text-slate-200">{policy.recommendation}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Inbound</p>
          <p className="text-lg font-semibold text-blue-100">{policy.inboundEvents.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Management</p>
          <p className="text-lg font-semibold text-amber-200">{policy.managementTrafficEvents.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Database</p>
          <p className="text-lg font-semibold text-red-200">{policy.databaseTrafficEvents.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Unknown direction</p>
          <p className="text-lg font-semibold text-slate-200">{policy.unknownDirectionEvents.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Top destination ports
          </p>
          <TagList items={policy.topDestinationPorts} />
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Top services
          </p>
          <TagList items={policy.topServices} />
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Top source IPs
          </p>
          <TagList items={policy.topSourceIps} />
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Top destination IPs
          </p>
          <TagList items={policy.topDestinationIps} />
        </div>
      </div>

      {(policy.firstSeen || policy.lastSeen) && (
        <p className="text-xs text-slate-500">
          Seen from <span className="text-slate-300">{policy.firstSeen ?? "unknown"}</span> to{" "}
          <span className="text-slate-300">{policy.lastSeen ?? "unknown"}</span>
        </p>
      )}
    </div>
  );
}
