import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import {
  getFortiGateCapabilities,
  type FortiGateCapability,
  type FortiGateCapabilityMode,
  type FortiGateCapabilityResponse,
  type FortiGateCapabilityRisk,
} from "@/lib/fortigateCapabilities";

function modePresentation(mode: FortiGateCapabilityMode) {
  if (mode === "execution") return { label: "Ready", detail: "Execution", className: "border-emerald-800 bg-emerald-950/60 text-emerald-300", Icon: CheckCircle2 };
  if (mode === "dry-run") return { label: "Dry-run only", detail: "No execution", className: "border-amber-800 bg-amber-950/60 text-amber-300", Icon: AlertTriangle };
  if (mode === "read-only") return { label: "Read-only", detail: "No changes", className: "border-amber-800 bg-amber-950/60 text-amber-300", Icon: AlertTriangle };
  return { label: "Not implemented", detail: "Unavailable", className: "border-red-900 bg-red-950/60 text-red-300", Icon: XCircle };
}

function riskClass(risk: FortiGateCapabilityRisk) {
  if (risk === "critical") return "border-red-700 bg-red-950/70 text-red-200";
  if (risk === "high") return "border-orange-800 bg-orange-950/60 text-orange-300";
  if (risk === "medium") return "border-amber-800 bg-amber-950/50 text-amber-300";
  return "border-slate-700 bg-slate-900 text-slate-300";
}

function CapabilityStatus({ capability }: { capability: FortiGateCapability }) {
  const presentation = modePresentation(capability.mode);
  const Icon = presentation.Icon;
  return (
    <div className={`inline-flex min-w-32 items-center gap-2 rounded-md border px-2.5 py-1.5 ${presentation.className}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="block text-xs font-semibold">{presentation.label}</span>
        <span className="block text-[10px] opacity-75">{presentation.detail}</span>
      </span>
    </div>
  );
}

export default function FortiGateCapabilityMatrixPanel() {
  const [data, setData] = useState<FortiGateCapabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    getFortiGateCapabilities()
      .then(setData)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Failed to load FortiGate capabilities."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <SectionCard
      title="FortiGate Capability Matrix"
      subtitle="Current code-backed readiness; this view does not run device commands."
      headerRight={(
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-700 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      )}
    >
      {error && (
        <div className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {!error && loading && !data && <p className="text-sm text-slate-400">Loading FortiGate capabilities...</p>}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Ready", data.summary.execution, "text-emerald-300"],
              ["Dry-run only", data.summary.dryRunOnly, "text-amber-300"],
              ["Read-only", data.summary.readOnly, "text-amber-300"],
              ["Not implemented", data.summary.notImplemented, "text-red-300"],
              ["High / critical risk", data.summary.dangerous, "text-orange-300"],
            ].map(([label, value, className]) => (
              <div key={String(label)} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2.5">
                <div className={`text-xl font-semibold ${className}`}>{value}</div>
                <div className="text-[11px] text-slate-500">{label}</div>
              </div>
            ))}
          </div>

          <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-900/70 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Execution requires a validated dry-run and approval. High/critical actions may also require backup or break-glass confirmation.</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead className="bg-slate-900/90 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Capability</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Risk</th>
                  <th className="px-4 py-3 font-semibold">Current support</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                {data.capabilities.map((capability) => (
                  <tr key={capability.id} className="align-top hover:bg-slate-900/50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-100">{capability.category}</td>
                    <td className="px-4 py-3"><CapabilityStatus capability={capability} /></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded border px-2 py-1 text-[11px] font-semibold uppercase ${riskClass(capability.risk)}`}>
                        {capability.risk}
                      </span>
                    </td>
                    <td className="min-w-96 px-4 py-3 text-xs text-slate-400">
                      <p className="leading-5 text-slate-300">{capability.notes}</p>
                      {capability.mode === "execution" && (
                        <p className="mt-1 font-medium text-blue-300">Execution requires approval.</p>
                      )}
                      {capability.missingPieces.length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-slate-500 hover:text-slate-300">Missing pieces and files</summary>
                          <div className="mt-2 space-y-2 border-l border-slate-700 pl-3">
                            <ul className="list-disc space-y-1 pl-4 text-slate-400">
                              {capability.missingPieces.map((piece) => <li key={piece}>{piece}</li>)}
                            </ul>
                            <p className="break-all text-[10px] text-slate-600">
                              {capability.currentFiles.length > 0 ? capability.currentFiles.join(" · ") : "No current implementation files"}
                            </p>
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  );
}
