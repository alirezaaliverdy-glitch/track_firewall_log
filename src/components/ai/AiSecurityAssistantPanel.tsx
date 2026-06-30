import { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, RefreshCw, ScanSearch, Send, ShieldAlert, ShieldCheck, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import {
  getAiProviderStatus,
  getSecuritySummary,
  completeAiActionRequest,
  type AiActionDebug,
  normalizeAiMessage,
  normalizeArray,
  normalizeObject,
  sendAiMessage,
  type AiActionIntent,
  type AiMessage,
  type AiProviderStatus,
  type SecuritySummary,
  type StructuredAiResponse,
  createRecommendationActionPlan,
  generateHardeningSuggestions,
  runFullSecurityAnalysis,
  type SecurityAssessment,
} from "@/lib/ai";
import { listDevices, type Device } from "@/lib/devices";
import { publishActionPlanCreated, reviewInActionCenter } from "@/lib/actionPlanHandoff";

const EXAMPLES = [
  "امروز چه تهدیدهایی داشتیم؟",
  "کدوم IP بیشتر حمله زده؟",
  "آیا پورت ۲۲ درگیر بوده؟",
  "پورت ۲۲ رو عوض کن روی ۲۲۰۲۲",
  "پورت ۸۰۸۰ رو ببند",
  "این IP رو ۳۰ دقیقه بلاک کن",
  "FortiGate: create address object for 192.168.8.2",
  "FortiGate: create VIP for port 443",
  "MikroTik: change SSH port to 22022 trusted source 192.168.1.0/24",
];

const safeNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const formatNumber = (value: unknown) => safeNumber(value).toLocaleString();

const formatDateTime = (value: unknown): string => {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};

function riskClass(risk: string) {
  if (risk === "critical") return "border-red-700 bg-red-950/60 text-red-200";
  if (risk === "high") return "border-red-800 bg-red-950/40 text-red-300";
  if (risk === "medium") return "border-yellow-800 bg-yellow-950/40 text-yellow-300";
  return "border-blue-800 bg-blue-950/40 text-blue-200";
}

function normalizedVendor(value: unknown, intentType?: string) {
  const token = typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_-]+/g, "") : "";
  if (["mikrotik", "routeros", "mt", "mkt"].includes(token) || intentType?.startsWith("mikrotik_")) return "mikrotik";
  if (["fortigate", "fortinet", "fortios"].includes(token) || intentType?.startsWith("fortigate_")) return "fortigate";
  if (["linux", "linuxedge", "ubuntu"].includes(token) || intentType?.startsWith("linux_")) return "linux_edge";
  return null;
}

function IntentCard({
  intent,
  debug,
  createdPlanId,
  onCompleted,
}: {
  intent: AiActionIntent | null;
  debug: AiActionDebug | null;
  createdPlanId: string | null;
  onCompleted: (input: { actionPlanId: string | null; intent: AiActionIntent | null; message: string }) => void;
}) {
  const [missingValues, setMissingValues] = useState<Record<string, string>>({});
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const params = normalizeObject(intent?.parametersJson);
  const rawMissingFields = debug?.missingFields.length ? debug.missingFields : normalizeArray<unknown>(params.missingFields).map(String);
  const missingFields = rawMissingFields.filter((field) => field !== "deviceId");
  const needsDevice = !debug?.deviceId && !intent?.deviceId && !createdPlanId;
  const clarificationQuestions = normalizeArray<unknown>(params.clarificationQuestions).map(String);
  const canCreatePlan = Boolean(debug?.canCreateActionPlan);
  const riskLevel = intent?.riskLevel ?? "medium";
  const sshPortChange = intent?.intentType === "mikrotik_change_service_port" && params.service === "ssh";
  const intentType = String(intent?.intentType ?? debug?.intentType ?? "");
  const vendor = normalizedVendor(debug?.vendor ?? params.vendor ?? params.targetDeviceHint, intentType);
  const compatibleDevices = devices.filter((device) => {
    if (vendor === "mikrotik") return device.type === "mikrotik";
    if (vendor === "fortigate") return device.type === "fortigate";
    if (vendor === "linux_edge") return device.type === "linux_edge";
    if (intentType.startsWith("mikrotik_")) return device.type === "mikrotik";
    if (intentType.startsWith("fortigate_")) return device.type === "fortigate";
    if (intentType.startsWith("linux_")) return device.type === "linux_edge";
    return true;
  });
  const targetDevice = devices.find((device) => device.id === (intent?.deviceId ?? debug?.deviceId ?? selectedDeviceId));

  useEffect(() => {
    listDevices()
      .then((nextDevices) => setDevices(nextDevices))
      .catch(() => setDevices([]));
  }, [intent?.id]);

  useEffect(() => {
    if (selectedDeviceId || compatibleDevices.length !== 1) return;
    setSelectedDeviceId(compatibleDevices[0].id);
  }, [compatibleDevices, selectedDeviceId]);

  if (!intent && !debug) return null;

  const completeRequest = () => {
    if (!intent?.id) return;
    const fields: Record<string, unknown> = { ...params };
    if (selectedDeviceId) fields.deviceId = selectedDeviceId;
    for (const [key, value] of Object.entries(missingValues)) {
      if (value.trim()) fields[key] = value.trim();
    }
    if (needsDevice && !fields.deviceId) {
      setLocalMessage("Select a device first.");
      return;
    }
    const stillMissing = missingFields.filter((field) => !String(fields[field] ?? "").trim());
    if (stillMissing.length > 0) {
      setLocalMessage(`Fill missing fields: ${stillMissing.join(", ")}`);
      return;
    }
    setSubmitting(true);
    setLocalMessage(null);
    completeAiActionRequest(intent.id, fields)
      .then((result) => {
        onCompleted({
          actionPlanId: result.actionPlanId,
          intent: result.intent,
          message: result.actionPlanId ? "ActionPlan created. Review in Action Center." : result.blockedReason ?? "ActionPlan not created."
        });
        if (result.actionPlanId) {
          publishActionPlanCreated(result.actionPlanId);
          reviewInActionCenter();
        }
      })
      .catch((error: unknown) => setLocalMessage(error instanceof Error ? error.message : "Failed to complete action request."))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="mt-3 rounded-lg border border-yellow-800/70 bg-yellow-950/20 p-3 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <TriangleAlert className="h-4 w-4 text-yellow-300" aria-hidden="true" />
        <span className="text-sm font-semibold text-yellow-100">{createdPlanId ? "ActionPlan proposed" : "Action request reviewed"}</span>
        <span className={`rounded border px-2 py-0.5 text-xs ${riskClass(riskLevel)}`}>{riskLevel}</span>
        <span className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-300">{intent?.status ?? "not_supported_yet"}</span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-zinc-300">
        <p><span className="text-zinc-500">intentType:</span> {debug?.intentType ?? intent?.intentType ?? "none"}</p>
        <p><span className="text-zinc-500">vendor:</span> {vendor ?? "not selected"}</p>
        <p><span className="text-zinc-500">deviceId:</span> {debug?.deviceId ?? intent?.deviceId ?? "missing"}</p>
        <p><span className="text-zinc-500">canCreateActionPlan:</span> {String(canCreatePlan)}</p>
        {createdPlanId && <p><span className="text-zinc-500">actionPlanId:</span> {createdPlanId}</p>}
      </div>
      <div className="mt-3 rounded border border-zinc-800 bg-black/20 p-2 text-xs text-zinc-300">
        <p className="font-semibold text-zinc-200">Planned action summary</p>
        <p className="mt-1">actionType: {sshPortChange ? "Change MikroTik SSH port" : intent?.intentType ?? debug?.intentType ?? "unknown"}</p>
        <p>risk: {riskLevel}</p>
        {sshPortChange && <p>target device: {targetDevice?.name ?? intent?.deviceId ?? "select a MikroTik device"}</p>}
        {sshPortChange && <p>new port: {String(params.newPort ?? "missing")}</p>}
        {sshPortChange && <p>trusted source: {String(params.trustedSourceIp ?? params.trustedSourceCidr ?? params.trustedSource ?? "required")}</p>}
        <pre className="mt-2 max-h-32 overflow-auto rounded bg-black/30 p-2">{JSON.stringify(params, null, 2)}</pre>
      </div>
      {sshPortChange && (
        <p className="mt-2 rounded border border-red-900/70 bg-red-950/20 p-2 text-xs font-medium text-red-200">
          Lockout warning: the trusted-source firewall rule must be reviewed before the SSH service port changes.
        </p>
      )}
      {!canCreatePlan && (
        <p className="mt-2 text-xs text-yellow-200">blockedReason: {debug?.blockedReason ?? debug?.reason ?? "blocked"}</p>
      )}
      <p className="mt-2 text-xs text-zinc-400">{intent?.explanation || "No explanation provided."}</p>
      {(needsDevice || missingFields.length > 0) && (
        <div className="mt-3 rounded border border-yellow-800/70 bg-yellow-950/20 p-2">
          <p className="text-xs font-semibold text-yellow-100">Missing fields</p>
          <p className="mt-1 text-xs text-yellow-100/80">{[...(needsDevice ? ["device"] : []), ...missingFields].join(", ")}</p>
          <div className="mt-2 grid gap-2">
            {needsDevice && (
              compatibleDevices.length === 0 ? (
                <p className="rounded border border-red-900/60 bg-red-950/20 p-2 text-xs text-red-200">
                  No device found. Add one in Device Registry.
                </p>
              ) : (
                <select
                  value={selectedDeviceId}
                  onChange={(event) => setSelectedDeviceId(event.target.value)}
                  className="h-9 rounded border border-yellow-900/60 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none"
                >
                  <option value="">Select device</option>
                  {(["mikrotik", "fortigate", "linux_edge"] as const).map((type) => {
                    const group = compatibleDevices.filter((device) => device.type === type);
                    if (group.length === 0) return null;
                    return (
                      <optgroup key={type} label={type === "linux_edge" ? "Linux" : type === "mikrotik" ? "MikroTik" : "FortiGate"}>
                        {group.map((device) => (
                          <option key={device.id} value={device.id}>
                            {device.name} - {device.host}:{device.managementPort} - {device.vendor}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              )
            )}
            {missingFields.map((field) => (
              <input
                key={field}
                value={missingValues[field] ?? ""}
                onChange={(event) => setMissingValues((current) => ({ ...current, [field]: event.target.value }))}
                placeholder={field === "trustedSourceIp" ? "trustedSourceIp or trustedSourceCidr" : field}
                className="h-8 rounded border border-yellow-900/60 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none"
              />
            ))}
            <button
              type="button"
              onClick={completeRequest}
              className="h-8 rounded border border-yellow-700 bg-yellow-950/40 px-2 text-xs font-semibold text-yellow-100 disabled:opacity-50"
              disabled={submitting || (needsDevice && compatibleDevices.length === 0)}
            >
              {submitting ? "Creating..." : "Create ActionPlan"}
            </button>
          </div>
        </div>
      )}
      {clarificationQuestions.length > 0 && (
        <div className="mt-3 rounded border border-blue-900/70 bg-blue-950/20 p-2">
          <p className="text-xs font-semibold text-blue-100">Clarification questions</p>
          <ul className="mt-1 space-y-1 text-xs text-blue-100/80">
            {clarificationQuestions.map((question) => <li key={question}>- {question}</li>)}
          </ul>
        </div>
      )}
      {createdPlanId && (
        <div className="mt-3 rounded border border-green-900/70 bg-green-950/20 p-3">
          <p className="text-xs font-medium text-green-200">ActionPlan created. Review in Action Center.</p>
          <button
            type="button"
            onClick={reviewInActionCenter}
            className="mt-2 inline-flex h-8 items-center rounded-md border border-green-800 bg-green-950/30 px-3 text-xs font-semibold text-green-200 hover:text-green-100"
          >
            Review in Action Center
          </button>
        </div>
      )}
      {localMessage && <p className="mt-2 text-xs text-zinc-300">{localMessage}</p>}
    </div>
  );
}

function ChatMessageBubble({ message }: { message: AiMessage }) {
  const [expanded, setExpanded] = useState(false);
  const long = message.content.length > 360;
  const content = long && !expanded ? `${message.content.slice(0, 360)}...` : message.content;
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-left ${
        message.role === "user"
          ? "ml-auto max-w-[82%] border-blue-800/70 bg-blue-950/30"
          : "mr-auto max-w-[88%] border-zinc-800 bg-zinc-900/70"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase text-zinc-500">{message.role}</span>
        <span className="text-[10px] text-zinc-600">{formatDateTime(message.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap text-xs leading-5 text-zinc-200">{content}</p>
      {long && (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-xs text-blue-300">
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

export default function AiSecurityAssistantPanel() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [lastIntent, setLastIntent] = useState<AiActionIntent | null>(null);
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);
  const [actionDebug, setActionDebug] = useState<AiActionDebug | null>(null);
  const [providerStatus, setProviderStatus] = useState<AiProviderStatus | null>(null);
  const [structuredResponse, setStructuredResponse] = useState<StructuredAiResponse | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<SecurityAssessment | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [hardeningLoading, setHardeningLoading] = useState(false);
  const [recommendationWorking, setRecommendationWorking] = useState<string | null>(null);

  const refreshSummary = () => {
    setSummaryLoading(true);
    setSummary(null);
    setProviderStatus(null);
    setError(null);
    setLastRefreshedAt(null);
    Promise.all([getSecuritySummary(), getAiProviderStatus()])
      .then(([nextSummary, nextStatus]) => {
        setSummary(nextSummary);
        setProviderStatus(nextStatus);
        setLastRefreshedAt(new Date().toISOString());
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load security summary."))
      .finally(() => setSummaryLoading(false));
  };

  const clearChat = () => {
    setSessionId(null);
    setMessages([]);
    setLastIntent(null);
    setStructuredResponse(null);
    setActionDebug(null);
    setCreatedPlanId(null);
    setError(null);
  };

  useEffect(() => {
    refreshSummary();
  }, []);

  const safeMessages = useMemo(() => normalizeArray<AiMessage>(messages).map(normalizeAiMessage), [messages]);
  const topSourceIps = normalizeArray<{ srcIp: string | null; count: number }>(summary?.events.topSourceIps);
  const sensitivePorts = normalizeArray<{ dstPort: number | null; count: number }>(summary?.events.sensitivePorts);
  const assessmentDetails = normalizeObject(assessment?.findingsJson);
  const assessmentFindings = normalizeArray<Record<string, unknown>>(assessmentDetails.findings);

  const runAssessment = () => {
    setAssessmentLoading(true);
    setError(null);
    runFullSecurityAnalysis()
      .then(setAssessment)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Full analysis failed."))
      .finally(() => setAssessmentLoading(false));
  };

  const runHardening = () => {
    setHardeningLoading(true);
    setError(null);
    const source = assessment ? Promise.resolve(assessment) : runFullSecurityAnalysis();
    source
      .then((current) => generateHardeningSuggestions(current.id))
      .then(setAssessment)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Hardening suggestions failed."))
      .finally(() => setHardeningLoading(false));
  };

  const createRecommendationPlan = (recommendationId: string) => {
    setRecommendationWorking(recommendationId);
    setError(null);
    createRecommendationActionPlan(recommendationId)
      .then((result) => {
        publishActionPlanCreated(result.actionPlan.id);
        setCreatedPlanId(result.actionPlan.id);
        setAssessment((current) => current ? {
          ...current,
          recommendations: current.recommendations.map((item) => item.id === recommendationId ? { ...item, status: "action_plan_created", actionPlanId: result.actionPlan.id } : item)
        } : current);
        reviewInActionCenter();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not create ActionPlan."))
      .finally(() => setRecommendationWorking(null));
  };

  const submit = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || loading) return;
    const quickIntent = trimmed.toLowerCase();
    if (["تحلیل کامل", "full analysis"].includes(quickIntent)) {
      setInput("");
      runAssessment();
      return;
    }
    if (["پیشنهاد ایمن‌سازی", "پیشنهاد ایمن سازی", "hardening suggestions"].includes(quickIntent)) {
      setInput("");
      runHardening();
      return;
    }

    setLoading(true);
    setError(null);
    setCreatedPlanId(null);
    const optimisticUser = normalizeAiMessage({
      id: `local-${Date.now()}`,
      sessionId: sessionId ?? "",
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    });
    setMessages((current) => [...current, optimisticUser]);
    setInput("");

    sendAiMessage(sessionId, trimmed)
      .then((response) => {
        setSessionId(response.sessionId || sessionId);
        setMessages((current) => [
          ...current.filter((message) => message.id !== optimisticUser.id),
          ...(response.message ? [response.message] : [optimisticUser]),
          ...(response.assistantMessage ? [response.assistantMessage] : []),
        ]);
        setLastIntent(response.actionIntent);
        setActionDebug(response.actionDebug);
        setProviderStatus(response.providerStatus ?? providerStatus);
        setStructuredResponse(response.structured);
        setCreatedPlanId(response.actionPlan?.id ?? null);
        if (response.actionPlan?.id) {
          publishActionPlanCreated(response.actionPlan.id);
        }
        refreshSummary();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to send AI message.");
      })
      .finally(() => setLoading(false));
  };

  return (
    <section className="mb-4 rounded-lg border border-blue-900/50 bg-slate-950/70 p-4 shadow-[inset_0_1px_0_rgba(59,130,246,0.08)]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-left text-lg font-semibold text-zinc-100">
            <Bot className="h-5 w-5 text-blue-300" aria-hidden="true" />
            AI Security Assistant
          </h2>
          <p className="mt-1 text-left text-sm text-zinc-400">
            Context-aware security chat. Proposed intents only, no execution.
          </p>
          <p className="mt-1 text-left text-xs text-zinc-500">
            Last refreshed: {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleString() : "-"}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshSummary}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm font-medium text-zinc-300 transition-colors hover:border-blue-700 hover:text-blue-200"
        >
          <RefreshCw className={`h-4 w-4 ${summaryLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          {summaryLoading ? "Refreshing..." : "Refresh Summary"}
        </button>
        <button
          type="button"
          onClick={clearChat}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm font-medium text-zinc-300 transition-colors hover:border-red-800 hover:text-red-200"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Clear Chat
        </button>
        <button
          type="button"
          onClick={clearChat}
          className="inline-flex h-9 w-fit items-center rounded-md border border-blue-800 bg-blue-950/30 px-3 text-sm font-medium text-blue-200 transition-colors hover:bg-blue-950/50"
        >
          New Request
        </button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={runAssessment}
          disabled={assessmentLoading || hardeningLoading}
          className="rounded-lg border border-blue-800/70 bg-blue-950/20 p-4 text-left transition-colors hover:bg-blue-950/40 disabled:opacity-60"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-blue-100">
            <ScanSearch className="h-5 w-5" aria-hidden="true" />
            تحلیل کامل
          </span>
          <span className="mt-1 block text-xs text-zinc-400">Full Analysis across devices, events, incidents, actions, connector snapshots, and catalog coverage.</span>
          <span className="mt-2 block text-xs font-medium text-blue-300">{assessmentLoading ? "Analyzing..." : "Run Full Analysis"}</span>
        </button>
        <button
          type="button"
          onClick={runHardening}
          disabled={assessmentLoading || hardeningLoading}
          className="rounded-lg border border-green-800/70 bg-green-950/20 p-4 text-left transition-colors hover:bg-green-950/40 disabled:opacity-60"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-green-100">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            پیشنهاد ایمن‌سازی
          </span>
          <span className="mt-1 block text-xs text-zinc-400">Prioritized recommendations mapped to controlled catalog actions whenever possible.</span>
          <span className="mt-2 block text-xs font-medium text-green-300">{hardeningLoading ? "Generating..." : "Generate Hardening Suggestions"}</span>
        </button>
      </div>

      {assessment && (
        <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-950/80 p-4 text-left">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-100">Security Assessment</p>
              <p className="mt-1 text-xs text-zinc-400">{assessment.summary}</p>
            </div>
            <span className={`rounded border px-3 py-1 text-sm font-bold ${assessment.riskScore >= 70 ? "border-red-700 text-red-200" : assessment.riskScore >= 40 ? "border-yellow-700 text-yellow-200" : "border-green-700 text-green-200"}`}>
              Risk {assessment.riskScore}/100
            </span>
          </div>
          {assessmentFindings.length > 0 && (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {assessmentFindings.slice(0, 6).map((finding, index) => (
                <div key={String(finding.id ?? index)} className="rounded border border-zinc-800 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-zinc-200">{String(finding.title ?? "Finding")}</p>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${riskClass(String(finding.severity ?? "medium"))}`}>{String(finding.severity ?? "medium")}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{String(finding.explanation ?? "")}</p>
                </div>
              ))}
            </div>
          )}
          {assessment.recommendations.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-zinc-100">Hardening Suggestions</h3>
              <div className="mt-2 space-y-2">
                {assessment.recommendations.map((recommendation) => (
                  <div key={recommendation.id} className="rounded border border-zinc-800 bg-black/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold text-zinc-100">{recommendation.title}</p>
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] ${riskClass(recommendation.severity)}`}>{recommendation.severity}</span>
                          <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">{recommendation.vendor}</span>
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] ${recommendation.executable ? "border-green-800 text-green-300" : "border-zinc-700 text-zinc-500"}`}>
                            {recommendation.executable ? "Executable" : "Manual"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">{recommendation.reason}</p>
                        <p className="mt-1 text-xs text-zinc-500">{recommendation.device?.name ?? "All devices"} · {recommendation.catalogActionId ?? "No catalog action"}</p>
                      </div>
                      {recommendation.executable && !recommendation.actionPlanId && (
                        <button
                          type="button"
                          onClick={() => createRecommendationPlan(recommendation.id)}
                          disabled={recommendationWorking === recommendation.id}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-green-800 bg-green-950/30 px-3 text-xs font-semibold text-green-200 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {recommendationWorking === recommendation.id ? "Creating..." : "Create ActionPlan"}
                        </button>
                      )}
                      {recommendation.actionPlanId && <span className="text-xs font-medium text-green-300">Ready in Action Center</span>}
                    </div>
                    <details className="mt-2 text-xs text-zinc-400">
                      <summary className="cursor-pointer">Evidence and recommendation</summary>
                      <p className="mt-2">{recommendation.recommendation}</p>
                      <pre className="mt-2 max-h-32 overflow-auto rounded bg-black/30 p-2">{JSON.stringify(recommendation.evidenceJson, null, 2)}</pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}
          <details className="mt-4 rounded border border-zinc-800 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-zinc-300">Assessment details</summary>
            <pre className="mt-2 max-h-64 overflow-auto text-[11px] text-zinc-400">{JSON.stringify(assessment.findingsJson, null, 2)}</pre>
          </details>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs text-zinc-500">Recent events</p>
          <p className="mt-1 text-xl font-semibold text-blue-100">{formatNumber(summary?.events.recentCount)}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs text-zinc-500">Devices</p>
          <p className="mt-1 text-xl font-semibold text-blue-100">{formatNumber(summary?.devices.length)}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs text-zinc-500">Top source IP</p>
          <p className="mt-2 text-xs text-zinc-300">{topSourceIps[0]?.srcIp ?? "none"}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs text-zinc-500">Sensitive ports</p>
          <p className="mt-2 text-xs text-zinc-300">
            {sensitivePorts.slice(0, 3).map((item) => `${item.dstPort}: ${item.count}`).join(", ") || "none"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex h-[500px] min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-950">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {safeMessages.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center text-zinc-500">
                <Sparkles className="h-8 w-8" aria-hidden="true" />
                <p className="text-sm">Ask about events, incidents, devices, or proposed actions.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {safeMessages.map((message) => <ChatMessageBubble key={message.id} message={message} />)}
                {loading && (
                  <p className="text-left text-xs text-zinc-500">Assistant is thinking...</p>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit(input);
            }}
            className="border-t border-zinc-800 p-3"
          >
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="امروز چه تهدیدهایی داشتیم؟"
                className="h-10 min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-blue-700"
              />
              <button
                type="submit"
                disabled={loading || input.trim() === ""}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Send
              </button>
            </div>
          </form>
        </div>

        <aside className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-3 flex items-center gap-2 text-left text-sm font-semibold text-zinc-100">
            <ShieldAlert className="h-4 w-4 text-yellow-300" aria-hidden="true" />
            Safety Boundary
          </div>
          <p className="text-left text-xs text-zinc-400">
            AI cannot execute commands, SSH to devices, or change firewall rules. Action requests become proposed intents only.
          </p>
          <div className="mt-3 rounded border border-zinc-800 bg-black/30 p-2 text-left">
            <p className="text-xs font-semibold text-zinc-200">AI Provider</p>
            <div className="mt-2 grid gap-1 text-xs text-zinc-400">
              <p><span className="text-zinc-500">provider:</span> {providerStatus?.provider ?? "mock"}</p>
              <p><span className="text-zinc-500">model:</span> {providerStatus?.model ?? "mock-deterministic"}</p>
              <p><span className="text-zinc-500">key configured:</span> {providerStatus?.keyConfigured ? "true" : "false"}</p>
              <p><span className="text-zinc-500">execution:</span> disabled</p>
            </div>
            {providerStatus?.lastError && (
              <p className="mt-2 text-xs text-red-300">{providerStatus.lastError}</p>
            )}
          </div>
          {structuredResponse?.intent && !lastIntent && (
            <div className="mt-3 rounded border border-yellow-800/70 bg-yellow-950/20 p-2 text-left">
              <p className="text-xs font-semibold text-yellow-100">Structured intent proposed</p>
              <p className="mt-1 text-xs text-yellow-100/80">{structuredResponse.intent.intentType}</p>
              <p className="mt-1 text-xs text-yellow-100/80">
                Missing: {structuredResponse.intent.missingFields.join(", ") || "none"}
              </p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setInput(example)}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-left text-[11px] text-zinc-300 hover:border-blue-700 hover:text-blue-200"
              >
                {example}
              </button>
            ))}
          </div>
          <IntentCard
            intent={lastIntent}
            debug={actionDebug}
            createdPlanId={createdPlanId}
            onCompleted={({ actionPlanId, intent, message }) => {
              setCreatedPlanId(actionPlanId);
              if (intent) setLastIntent(intent);
              setError(null);
              if (!actionPlanId) setError(message);
            }}
          />
        </aside>
      </div>

      {error && (
        <p className="mt-3 text-left text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
