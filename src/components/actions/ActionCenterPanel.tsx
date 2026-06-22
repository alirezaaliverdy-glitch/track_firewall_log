import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  approveAction,
  dryRunAction,
  executeAction,
  getAction,
  getActionAudit,
  getActions,
  normalizeArray,
  normalizeObject,
  rejectAction,
  validateAction,
  type ActionAuditEntry,
  type ActionPlan,
} from "@/lib/actions";

const safeNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const formatDateTime = (value: unknown): string => {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};

function badgeClass(value: string) {
  if (value === "critical") return "border-red-700 bg-red-950/60 text-red-200";
  if (value === "high" || value === "failed" || value === "validation_failed") return "border-red-800 bg-red-950/40 text-red-300";
  if (value === "medium" || value === "awaiting_approval" || value === "dry_run_ready") return "border-yellow-800 bg-yellow-950/40 text-yellow-300";
  if (value === "approved" || value === "succeeded") return "border-green-800 bg-green-950/40 text-green-300";
  return "border-blue-800 bg-blue-950/40 text-blue-200";
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const objectValue = normalizeObject(value);
  const hasContent = Object.keys(objectValue).length > 0;

  return (
    <div className="rounded border border-zinc-800 bg-black/30">
      <div className="border-b border-zinc-800 px-3 py-2 text-left text-xs font-semibold text-zinc-300">{title}</div>
      <pre className="max-h-56 overflow-auto p-3 text-left text-xs text-zinc-300">
        {hasContent ? JSON.stringify(objectValue, null, 2) : "{}"}
      </pre>
    </div>
  );
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function VendorPlanView({ dryRunJson }: { dryRunJson: Record<string, unknown> }) {
  const vendorPlan = Object.keys(normalizeObject(dryRunJson)).length > 0
    ? dryRunJson
    : normalizeObject(dryRunJson.vendorCommandPlan);
  const commands = textArray(vendorPlan.commands);
  const apiCalls = normalizeArray<Record<string, unknown>>(vendorPlan.apiCalls);
  const warnings = textArray(vendorPlan.warnings);
  const rollbackSteps = textArray(vendorPlan.rollbackSteps);
  const questions = textArray(vendorPlan.questions);
  const missingFields = textArray(vendorPlan.missingFields);

  return (
    <div className="mb-4 rounded-lg border border-blue-900/50 bg-blue-950/10 p-3 text-left">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-blue-100">Vendor Command Plan</h4>
          <p className="mt-1 text-xs text-blue-100/70">Dry-run only. No command executed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded border px-2 py-0.5 text-xs ${badgeClass(String(vendorPlan.status ?? "planned"))}`}>
            {String(vendorPlan.status ?? "planned")}
          </span>
          <span className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-300">
            {String(vendorPlan.vendor ?? "generic")}
          </span>
          <span className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-300">
            {String(vendorPlan.transport ?? "manual")}
          </span>
        </div>
      </div>

      {missingFields.length > 0 && (
        <div className="mb-3 rounded border border-yellow-900/70 bg-yellow-950/20 p-3">
          <p className="text-xs font-semibold text-yellow-100">Needs clarification</p>
          <p className="mt-1 text-xs text-yellow-100/75">Missing: {missingFields.join(", ")}</p>
          <ul className="mt-2 space-y-1 text-xs text-yellow-100/80">
            {questions.map((question) => <li key={question}>- {question}</li>)}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-3 rounded border border-yellow-900/70 bg-yellow-950/20 p-3">
          <p className="text-xs font-semibold text-yellow-100">Warnings</p>
          <ul className="mt-2 space-y-1 text-xs text-yellow-100/80">
            {warnings.map((warning) => <li key={warning}>- {warning}</li>)}
          </ul>
        </div>
      )}

      {commands.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-xs font-semibold text-zinc-300">Template Commands</p>
          <pre className="max-h-64 overflow-auto rounded border border-zinc-800 bg-black/40 p-3 text-xs text-zinc-300">
            {commands.join("\n")}
          </pre>
        </div>
      )}

      {apiCalls.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-xs font-semibold text-zinc-300">Template API Calls</p>
          <pre className="max-h-64 overflow-auto rounded border border-zinc-800 bg-black/40 p-3 text-xs text-zinc-300">
            {JSON.stringify(apiCalls, null, 2)}
          </pre>
        </div>
      )}

      {rollbackSteps.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-zinc-300">Rollback Steps</p>
          <ul className="space-y-1 text-xs text-zinc-400">
            {rollbackSteps.map((step) => <li key={step}>- {step}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function PlanSummary({ plan }: { plan: ActionPlan }) {
  const params = normalizeObject(plan.parametersJson);
  const port = params.port ?? params.fromPort ?? params.toPort;
  const ip = params.srcIp ?? params.sourceIp ?? params.ip;

  return (
    <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
      <span>{plan.device?.name ?? plan.deviceId ?? "No device selected"}</span>
      {ip ? <span className="font-mono">ip: {String(ip)}</span> : null}
      {port ? <span className="font-mono">port: {String(port)}</span> : null}
    </div>
  );
}

export default function ActionCenterPanel() {
  const [actions, setActions] = useState<ActionPlan[]>([]);
  const [selectedAction, setSelectedAction] = useState<ActionPlan | null>(null);
  const [auditEntries, setAuditEntries] = useState<ActionAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [approveText, setApproveText] = useState("");
  const [executeText, setExecuteText] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const refreshActions = useCallback(() => {
    setLoading(true);
    setMessage(null);
    getActions()
      .then((nextActions) => {
        setActions(normalizeArray<ActionPlan>(nextActions));
        setLastRefreshedAt(new Date().toISOString());
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to load action plans."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshActions();
  }, [refreshActions]);

  const safeActions = useMemo(() => normalizeArray<ActionPlan>(actions), [actions]);
  const safeAudit = useMemo(() => normalizeArray<ActionAuditEntry>(auditEntries), [auditEntries]);

  const reloadSelected = (id: string) => {
    return Promise.all([getAction(id), getActionAudit(id)]).then(([plan, audit]) => {
      setSelectedAction(plan);
      setAuditEntries(normalizeArray<ActionAuditEntry>(audit));
      setActions((current) => {
        const exists = current.some((action) => action.id === plan.id);
        return exists ? current.map((action) => action.id === plan.id ? plan : action) : [plan, ...current];
      });
      return plan;
    });
  };

  const openAction = (action: ActionPlan) => {
    setDetailsLoading(true);
    setMessage(null);
    setApproveText("");
    setExecuteText("");
    reloadSelected(action.id)
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to load action details."))
      .finally(() => setDetailsLoading(false));
  };

  const runPlanStep = (label: string, operation: (id: string) => Promise<ActionPlan>) => {
    if (!selectedAction) return;
    setWorking(label);
    setMessage(null);
    operation(selectedAction.id)
      .then((plan) => {
        setSelectedAction(plan);
        setActions((current) => current.map((action) => action.id === plan.id ? plan : action));
        return getActionAudit(plan.id);
      })
      .then((audit) => setAuditEntries(normalizeArray<ActionAuditEntry>(audit)))
      .then(() => refreshActions())
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : `Failed to ${label}.`))
      .finally(() => setWorking(null));
  };

  const approveSelected = () => {
    if (!selectedAction) return;
    const risky = selectedAction.riskLevel === "high" || selectedAction.riskLevel === "critical";
    if (risky && approveText.trim() !== "APPROVE") {
      setMessage("Type APPROVE before approving high or critical actions.");
      return;
    }
    runPlanStep("approve", (id) => approveAction(id, { reason: risky ? "Confirmed with APPROVE" : "Approved from Action Center" }));
  };

  const rejectSelected = () => {
    runPlanStep("reject", (id) => rejectAction(id, { reason: rejectReason.trim() || "Rejected from Action Center" }));
  };

  const executeSelected = () => {
    if (!selectedAction) return;
    if (selectedAction.status !== "approved" || Object.keys(normalizeObject(selectedAction.dryRunJson)).length === 0) {
      setMessage("Execution requires approved status and a completed dry-run.");
      return;
    }
    if (executeText.trim() !== "EXECUTE") {
      setMessage("Type EXECUTE before running a real connector command.");
      return;
    }
    runPlanStep("execute", executeAction);
  };

  const totalOpen = safeActions.filter((action) => !["rejected", "succeeded", "rolled_back"].includes(action.status)).length;

  return (
    <section className="mb-4 rounded-lg border border-blue-900/50 bg-slate-950/70 p-4 shadow-[inset_0_1px_0_rgba(59,130,246,0.08)]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-left text-lg font-semibold text-zinc-100">
            <ShieldAlert className="h-5 w-5 text-yellow-300" aria-hidden="true" />
            Action Center
          </h2>
          <p className="mt-1 text-left text-sm text-zinc-400">
            Review proposed actions, run policy validation, dry-run, approval, and audit checks.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshActions}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm font-medium text-zinc-300 transition-colors hover:border-blue-700 hover:text-blue-200"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <p className="mb-4 text-left text-xs text-zinc-500">
        Last refreshed: {formatDateTime(lastRefreshedAt)}
      </p>

      <div className="mb-4 rounded-lg border border-yellow-800/70 bg-yellow-950/20 p-3 text-left">
        <div className="flex items-center gap-2 text-sm font-semibold text-yellow-100">
          <AlertTriangle className="h-4 w-4 text-yellow-300" aria-hidden="true" />
          No action is executed until approved and confirmed.
        </div>
        <p className="mt-1 text-xs text-yellow-100/75">
          Linux Edge execution uses fixed UFW templates only. There is no arbitrary command field and AI cannot execute directly.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs text-zinc-500">Action plans</p>
          <p className="mt-1 text-xl font-semibold text-blue-100">{safeNumber(safeActions.length).toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs text-zinc-500">Active review</p>
          <p className="mt-1 text-xl font-semibold text-yellow-100">{safeNumber(totalOpen).toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs text-zinc-500">Latest status</p>
          <p className="mt-2 text-xs text-zinc-300">{safeActions[0]?.status ?? "none"}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs text-zinc-500">Execution</p>
          <p className="mt-2 text-xs text-yellow-200">approval gated</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
            <thead className="bg-zinc-900/70 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Risk</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-zinc-500">Loading action plans...</td>
                </tr>
              ) : safeActions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-zinc-500">
                    No action plans yet. Ask the AI for a safe action proposal, then create an Action Plan.
                  </td>
                </tr>
              ) : (
                safeActions.map((action) => (
                  <tr key={action.id} className="text-zinc-300">
                    <td className="min-w-72 px-3 py-2">
                      <p className="font-medium text-zinc-100">{action.actionType}</p>
                      <PlanSummary plan={action} />
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${badgeClass(action.status)}`}>
                        {action.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${badgeClass(action.riskLevel)}`}>
                        {action.riskLevel}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">{action.source}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{formatDateTime(action.createdAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openAction(action)}
                        className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-300 transition-colors hover:text-blue-200"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedAction && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="max-h-[88vh] w-full max-w-6xl overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-left text-sm font-semibold text-zinc-100">{selectedAction.actionType}</h3>
                <p className="mt-0.5 text-left text-xs text-zinc-500">
                  {selectedAction.device?.name ?? selectedAction.deviceId ?? "No device selected"} · {selectedAction.id}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => runPlanStep("validate", validateAction)}
                  disabled={Boolean(working) || detailsLoading}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 px-2.5 text-xs font-medium text-zinc-300 hover:text-blue-200 disabled:opacity-60"
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Validate
                </button>
                <button
                  type="button"
                  onClick={() => runPlanStep("dry-run", dryRunAction)}
                  disabled={Boolean(working) || detailsLoading}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 px-2.5 text-xs font-medium text-zinc-300 hover:text-blue-200 disabled:opacity-60"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  Dry-run
                </button>
                <button
                  type="button"
                  onClick={rejectSelected}
                  disabled={Boolean(working) || detailsLoading}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-red-900/70 px-2.5 text-xs font-medium text-red-300 hover:text-red-200 disabled:opacity-60"
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Reject
                </button>
                <button
                  type="button"
                  onClick={approveSelected}
                  disabled={Boolean(working) || detailsLoading}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-green-900/70 px-2.5 text-xs font-medium text-green-300 hover:text-green-200 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={executeSelected}
                  disabled={Boolean(working) || detailsLoading || selectedAction.status !== "approved" || Object.keys(normalizeObject(selectedAction.dryRunJson)).length === 0}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-yellow-900/80 px-2.5 text-xs font-medium text-yellow-300 hover:text-yellow-200 disabled:opacity-60"
                >
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Execute
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAction(null)}
                  className="h-8 rounded border border-zinc-700 px-2 text-xs text-zinc-300 hover:text-zinc-100"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[76vh] overflow-y-auto p-4">
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">Status</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{selectedAction.status}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">Risk</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{selectedAction.riskLevel}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">Created</p>
                  <p className="mt-1 text-xs text-zinc-300">{formatDateTime(selectedAction.createdAt)}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">Updated</p>
                  <p className="mt-1 text-xs text-zinc-300">{formatDateTime(selectedAction.updatedAt)}</p>
                </div>
              </div>

              {(selectedAction.riskLevel === "high" || selectedAction.riskLevel === "critical") && (
                <div className="mb-4 rounded border border-red-900/70 bg-red-950/20 p-3 text-left">
                  <label className="text-xs font-semibold text-red-200" htmlFor="action-approve-confirm">
                    Type APPROVE before approving this high-risk action.
                  </label>
                  <input
                    id="action-approve-confirm"
                    value={approveText}
                    onChange={(event) => setApproveText(event.target.value)}
                    className="mt-2 h-9 w-full rounded border border-red-900/60 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-red-600"
                    placeholder="APPROVE"
                  />
                </div>
              )}

              <div className="mb-4 rounded border border-yellow-900/70 bg-yellow-950/20 p-3 text-left">
                <label className="text-xs font-semibold text-yellow-100" htmlFor="action-execute-confirm">
                  Real command will be executed on selected Linux device. Type EXECUTE to enable execution.
                </label>
                <input
                  id="action-execute-confirm"
                  value={executeText}
                  onChange={(event) => setExecuteText(event.target.value)}
                  className="mt-2 h-9 w-full rounded border border-yellow-900/60 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-yellow-600"
                  placeholder="EXECUTE"
                />
              </div>

              <div className="mb-4 rounded border border-zinc-800 bg-black/20 p-3 text-left">
                <label className="text-xs font-semibold text-zinc-300" htmlFor="action-reject-reason">Reject reason</label>
                <input
                  id="action-reject-reason"
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  className="mt-2 h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-blue-700"
                  placeholder="Optional reason"
                />
              </div>

              <div className="mb-4 grid gap-3 lg:grid-cols-2">
                <JsonBlock title="Parameters" value={selectedAction.parametersJson} />
                <JsonBlock title="Validation" value={selectedAction.validationJson} />
                <JsonBlock title="Approval" value={selectedAction.approvalJson} />
                <JsonBlock title="Result" value={selectedAction.resultJson} />
                <JsonBlock title="Rollback" value={selectedAction.rollbackJson} />
              </div>

              <VendorPlanView dryRunJson={normalizeObject(selectedAction.dryRunJson)} />

              <h4 className="mb-2 text-left text-sm font-semibold text-zinc-100">Audit Timeline</h4>
              <div className="rounded border border-zinc-800 bg-black/20">
                {safeAudit.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-zinc-500">No audit entries found.</p>
                ) : (
                  <div className="divide-y divide-zinc-800">
                    {safeAudit.map((entry) => (
                      <div key={entry.id} className="p-3 text-left">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-semibold text-zinc-200">{entry.eventType}</p>
                          <p className="text-[11px] text-zinc-500">{formatDateTime(entry.createdAt)}</p>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">{entry.message || "No audit message."}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {message && (
        <p className="mt-3 text-left text-xs text-zinc-400" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}
