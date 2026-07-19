import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
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
  type EvidencePackMetadata,
  createRecommendationActionPlan,
  clearAiSessionMessages,
  generateHardeningSuggestions,
  runFullSecurityAnalysis,
  type SecurityAssessment,
} from "@/lib/ai";
import { listDevices, type Device } from "@/lib/devices";
import { publishActionPlanCreated, reviewInActionCenter } from "@/lib/actionPlanHandoff";
import { startGuidedSession } from "@/lib/guidedActions";

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

function vendorOfDevice(device?: Device | null) {
  if (!device) return "";
  if (device.type === "linux_edge") return "linux";
  if (device.type === "generic_firewall" || device.type === "generic_syslog_source") return "generic";
  return device.type;
}

function connectorTypeOf(vendor: string) {
  if (vendor === "fortigate") return "fortigate-ssh";
  if (vendor === "mikrotik") return "mikrotik-ssh";
  if (vendor === "linux") return "linux-ssh";
  return null;
}

function IntentCard({
  intent,
  debug,
  createdPlanId,
  onCompleted,
  isFa,
}: {
  intent: AiActionIntent | null;
  debug: AiActionDebug | null;
  createdPlanId: string | null;
  onCompleted: (input: { actionPlanId: string | null; intent: AiActionIntent | null; message: string }) => void;
  isFa: boolean;
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
              {submitting ? (isFa ? "در حال ساخت..." : "Creating...") : (isFa ? "ساخت برنامه اقدام" : "Create ActionPlan")}
            </button>
          </div>
        </div>
      )}
      {clarificationQuestions.length > 0 && (
        <div className="mt-3 rounded border border-blue-900/70 bg-blue-950/20 p-2">
          <p className="text-xs font-semibold text-blue-100">{isFa ? "پرسش‌های تکمیلی" : "Clarification questions"}</p>
          <ul className="mt-1 space-y-1 text-xs text-blue-100/80">
            {clarificationQuestions.map((question) => <li key={question}>- {question}</li>)}
          </ul>
        </div>
      )}
      {createdPlanId && (
        <div className="mt-3 rounded border border-green-900/70 bg-green-950/20 p-3">
          <p className="text-xs font-medium text-green-200">{isFa ? "برنامه اقدام ساخته شد؛ آن را در مرکز اقدام بازبینی کنید." : "ActionPlan created. Review in Action Center."}</p>
          <button
            type="button"
            onClick={() => reviewInActionCenter(createdPlanId)}
            className="mt-2 inline-flex h-8 items-center rounded-md border border-green-800 bg-green-950/30 px-3 text-xs font-semibold text-green-200 hover:text-green-100"
          >
            {isFa ? "بازبینی در مرکز اقدام" : "Review in Action Center"}
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
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isFa = i18n.language?.startsWith("fa") ?? false;
  const copy = isFa ? {
    title: "دستیار هوشمند امنیت", subtitle: "گفت‌وگوی امنیتی زمینه‌محور؛ فقط پیشنهاد و بدون اجرای مستقیم.", lastRefresh: "آخرین تازه‌سازی", refresh: "تازه‌سازی خلاصه", refreshing: "در حال تازه‌سازی...", target: "دستگاه مقصد", choose: "انتخاب دستگاه", clear: "پاک‌کردن گفت‌وگو", newRequest: "درخواست جدید", recent: "رخدادهای اخیر", devices: "دستگاه‌ها", topIp: "IP پرتکرار", ports: "پورت‌های حساس", empty: "درباره رخدادها، دستگاه‌ها یا اقدام‌های پیشنهادی بپرسید.", thinking: "دستیار در حال بررسی است...", send: "ارسال", safety: "مرز ایمنی", safetyText: "هوش مصنوعی نمی‌تواند فرمان اجرا کند، به دستگاه SSH بزند یا قانون فایروال را مستقیم تغییر دهد. درخواست‌ها فقط به پیشنهاد یا ActionPlan قابل بازبینی تبدیل می‌شوند.", provider: "ارائه‌دهنده هوش مصنوعی"
  } : {
    title: "AI Security Assistant", subtitle: "Context-aware security chat. Proposed intents only, no direct execution.", lastRefresh: "Last refreshed", refresh: "Refresh Summary", refreshing: "Refreshing...", target: "Target device", choose: "Choose a device", clear: "Clear Chat", newRequest: "New Request", recent: "Recent events", devices: "Devices", topIp: "Top source IP", ports: "Sensitive ports", empty: "Ask about events, incidents, devices, or proposed actions.", thinking: "Assistant is thinking...", send: "Send", safety: "Safety Boundary", safetyText: "AI cannot execute commands, SSH to devices, or change firewall rules directly. Requests become reviewable proposals or ActionPlans only.", provider: "AI Provider"
  };
  copy.refresh = t("assistant.controls.refreshSummary");
  copy.clear = t("assistant.controls.clearChat");
  copy.newRequest = t("assistant.controls.newRequest");
  copy.safety = t("assistant.safetyBoundary");
  copy.provider = t("assistant.aiProvider");
  const viewGeneration = useRef(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [lastIntent, setLastIntent] = useState<AiActionIntent | null>(null);
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [technicalError, setTechnicalError] = useState<string | null>(null);
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);
  const [actionDebug, setActionDebug] = useState<AiActionDebug | null>(null);
  const [providerStatus, setProviderStatus] = useState<AiProviderStatus | null>(null);
  const [structuredResponse, setStructuredResponse] = useState<StructuredAiResponse | null>(null);
  const [evidenceMetadata, setEvidenceMetadata] = useState<EvidencePackMetadata | null>(null);
  const [executionState, setExecutionState] = useState<{ support: string; implementation: string; missing: string[]; nextStep: string; template: string | null; canCreateActionPlan: boolean; manualOnly: boolean; executable: boolean; executionMode: string; lifecycle: { actionPlanId: string; status: string; planRevision: number; planState: string } | null } | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const previousTargetDeviceId = useRef<string | null>(null);
  const [guidedStart, setGuidedStart] = useState<null | { blueprintId: string; initialValues: Record<string, unknown>; vendor: string | null; deviceId: string | null; initialRequest: string }>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<SecurityAssessment | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [hardeningLoading, setHardeningLoading] = useState(false);
  const [activeAnalysisDevice, setActiveAnalysisDevice] = useState<string | null>(null);
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
      .catch((err: unknown) => {
        setError("دریافت خلاصه امنیتی انجام نشد. جزئیات خطا در بخش Details قابل مشاهده است.");
        setTechnicalError(err instanceof Error ? err.message : "خطای ناشناخته در دریافت خلاصه امنیتی");
      })
      .finally(() => setSummaryLoading(false));
  };

  const clearChat = () => {
    viewGeneration.current += 1;
    const activeSessionId = sessionId;
    setSessionId(null);
    setMessages([]);
    setLastIntent(null);
    setExecutionState(null);
    setStructuredResponse(null);
    setActionDebug(null);
    setCreatedPlanId(null);
    setError(null);
    setTechnicalError(null);
    setAssessment(null);
    setAssessmentLoading(false);
    setHardeningLoading(false);
    setRecommendationWorking(null);
    setInput("");
    if (activeSessionId) {
      void clearAiSessionMessages(activeSessionId).catch((reason: unknown) => {
        setTechnicalError(reason instanceof Error ? reason.message : "پاک‌کردن سابقه سمت سرور ناموفق بود.");
      });
    }
  };

  useEffect(() => {
    refreshSummary();
    void listDevices().then((next) => {
      setDevices(next);
      const params = new URLSearchParams(window.location.search);
      const selected = params.get("deviceId") ?? params.get("selectedDeviceId");
      if (selected && next.some((device) => device.id === selected)) setSelectedDeviceId(selected);
      else if (next.length === 1) setSelectedDeviceId(next[0].id);
    }).catch(() => setDevices([]));
  }, []);

  useEffect(() => {
    if (previousTargetDeviceId.current === null) {
      previousTargetDeviceId.current = selectedDeviceId;
      return;
    }
    if (previousTargetDeviceId.current === selectedDeviceId) return;
    previousTargetDeviceId.current = selectedDeviceId;
    viewGeneration.current += 1;
    setSessionId(null);
    setMessages([]);
    setLastIntent(null);
    setExecutionState(null);
    setStructuredResponse(null);
    setActionDebug(null);
    setCreatedPlanId(null);
    setGuidedStart(null);
    setError(null);
    setTechnicalError(null);
  }, [selectedDeviceId]);

  const safeMessages = useMemo(() => normalizeArray<AiMessage>(messages).map(normalizeAiMessage), [messages]);
  const topSourceIps = normalizeArray<{ srcIp: string | null; count: number }>(summary?.events.topSourceIps);
  const sensitivePorts = normalizeArray<{ dstPort: number | null; count: number }>(summary?.events.sensitivePorts);
  const assessmentDetails = normalizeObject(assessment?.findingsJson);
  const assessmentFindings = normalizeArray<Record<string, unknown>>(assessmentDetails.findings);
  const assessmentSections = normalizeObject(assessmentDetails.sections);
  const vendorAnalyses = normalizeArray<Record<string, unknown>>(assessmentDetails.vendorAnalyses);
  const visibleVendorAnalyses = activeAnalysisDevice ? vendorAnalyses.filter((item) => String(item.deviceId) === activeAnalysisDevice) : vendorAnalyses.slice(0, 1);
  const severityFa = (value: string) => ({ low: "کم", medium: "متوسط", high: "زیاد", critical: "بحرانی" }[value.toLowerCase()] ?? value);
  const evidenceText = (value: unknown): string => {
    if (value === null || value === undefined || value === "") return "نامشخص";
    if (Array.isArray(value)) return value.length ? value.map(evidenceText).join("، ") : "موردی ثبت نشده";
    if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${evidenceText(item)}`).join("؛ ");
    if (typeof value === "boolean") return value ? "بله" : "خیر";
    return String(value);
  };

  const runAssessment = () => {
    const generation = viewGeneration.current;
    setAssessmentLoading(true);
    setError(null);
    runFullSecurityAnalysis()
      .then((result) => { if (generation === viewGeneration.current) setAssessment(result); })
      .catch((err: unknown) => {
        if (generation !== viewGeneration.current) return;
        setError("تحلیل کامل انجام نشد. جزئیات خطا در بخش Details قابل مشاهده است.");
        setTechnicalError(err instanceof Error ? err.message : "خطای ناشناخته در تحلیل کامل");
      })
      .finally(() => { if (generation === viewGeneration.current) setAssessmentLoading(false); });
  };

  const runHardening = () => {
    const generation = viewGeneration.current;
    setHardeningLoading(true);
    setError(null);
    generateHardeningSuggestions(assessment?.id)
      .then((result) => { if (generation === viewGeneration.current) setAssessment(result); })
      .catch((err: unknown) => {
        if (generation !== viewGeneration.current) return;
        setError("پیشنهادهای ایمن‌سازی تولید نشد. جزئیات خطا در بخش Details قابل مشاهده است.");
        setTechnicalError(err instanceof Error ? err.message : "خطای ناشناخته در پیشنهادهای ایمن‌سازی");
      })
      .finally(() => { if (generation === viewGeneration.current) setHardeningLoading(false); });
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
      })
      .catch((err: unknown) => {
        setError("ساخت برنامه اقدام انجام نشد. جزئیات خطا در بخش Details قابل مشاهده است.");
        setTechnicalError(err instanceof Error ? err.message : "خطای ناشناخته در ساخت برنامه اقدام");
      })
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
    const generation = viewGeneration.current;
    setError(null);
    setCreatedPlanId(null);
    setGuidedStart(null);
    setLastIntent(null);
    setActionDebug(null);
    setExecutionState(null);
    setStructuredResponse(null);
    const optimisticUser = normalizeAiMessage({
      id: `local-${Date.now()}`,
      sessionId: sessionId ?? "",
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    });
    setMessages((current) => [...current, optimisticUser]);
    setInput("");

    const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
    const selectedVendor = vendorOfDevice(selectedDevice);
    sendAiMessage(sessionId, trimmed, selectedDeviceId || undefined, {
      selectedVendor: selectedVendor || undefined,
      selectedConnectorType: connectorTypeOf(selectedVendor),
      selectedDeviceName: selectedDevice?.name,
    })
      .then((response) => {
        if (generation !== viewGeneration.current) return;
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
        setEvidenceMetadata(response.evidenceMetadata);
        setExecutionState({ support: response.actionContract.executionSupport, implementation: response.actionContract.implementationState, missing: response.missingFields, nextStep: response.nextStepFa, template: response.mappedTemplate, canCreateActionPlan: response.actionContract.canCreateActionPlan, manualOnly: response.actionContract.manualOnly, executable: response.actionContract.executable, executionMode: response.actionContract.executionMode, lifecycle: response.actionContract.lifecycle });
        setCreatedPlanId(response.actionPlan?.id ?? null);
        if (response.mode === "guided_workflow" && response.blueprintId) {
          if (response.actionSessionId) {
            const url = response.guidedActionUrl ?? `/guided-actions/${encodeURIComponent(response.actionSessionId)}`;
            navigate(url);
            return;
          }
          const guided = {
            blueprintId: response.blueprintId,
            initialValues: response.initialValues ?? {},
            vendor: response.vendor ?? (selectedVendor || null),
            deviceId: response.deviceId ?? (selectedDeviceId || null),
            initialRequest: trimmed,
          };
          setGuidedStart(guided);
          startGuidedSession(guided)
            .then((session) => {
              navigate(`/guided-actions/${encodeURIComponent(session.sessionId)}`);
            })
            .catch((err: unknown) => {
              setError("شروع ساخت مرحله‌ای انجام نشد. جزئیات خطا در بخش Details قابل مشاهده است.");
              setTechnicalError(err instanceof Error ? err.message : "خطای ناشناخته در شروع Workflow");
            });
        }
        if (response.actionPlan?.id) {
          publishActionPlanCreated(response.actionPlan.id);
        }
        refreshSummary();
      })
      .catch((err: unknown) => {
        if (generation !== viewGeneration.current) return;
        setError("پاسخ سرویس هوش مصنوعی دریافت نشد. جزئیات خطا در بخش Details قابل مشاهده است.");
        setTechnicalError(err instanceof Error ? err.message : "خطای ناشناخته سرویس هوش مصنوعی");
      })
      .finally(() => { if (generation === viewGeneration.current) setLoading(false); });
  };

  const startGuidedWorkflow = () => {
    if (!guidedStart) return;
    startGuidedSession(guidedStart)
      .then((session) => {
        navigate(`/guided-actions/${encodeURIComponent(session.sessionId)}`);
      })
      .catch((err: unknown) => {
        setError("شروع ساخت مرحله‌ای انجام نشد. جزئیات خطا در بخش Details قابل مشاهده است.");
        setTechnicalError(err instanceof Error ? err.message : "خطای ناشناخته در شروع Workflow");
      });
  };

  return (
    <section className="mb-4 rounded-lg border border-blue-900/50 bg-slate-950/70 p-4 shadow-[inset_0_1px_0_rgba(59,130,246,0.08)]" dir={isFa ? "rtl" : "ltr"}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-left text-lg font-semibold text-zinc-100">
            <Bot className="h-5 w-5 text-blue-300" aria-hidden="true" />
            {copy.title}
          </h2>
          <p className="mt-1 text-left text-sm text-zinc-400">
            {copy.subtitle}
          </p>
          <p className="mt-1 text-left text-xs text-zinc-500">
            {copy.lastRefresh}: {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleString() : "-"}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshSummary}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm font-medium text-zinc-300 transition-colors hover:border-blue-700 hover:text-blue-200"
        >
          <RefreshCw className={`h-4 w-4 ${summaryLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          {summaryLoading ? copy.refreshing : copy.refresh}
        </button>
        <div className="flex flex-col gap-1 text-right" dir="rtl">
          <label className="text-xs text-zinc-400">{copy.target}</label>
          <select
            value={selectedDeviceId}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
            className="h-9 min-w-[220px] rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none"
          >
            <option value="">{copy.choose}</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name} - {vendorOfDevice(device)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={clearChat}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm font-medium text-zinc-300 transition-colors hover:border-red-800 hover:text-red-200"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {copy.clear}
        </button>
        <button
          type="button"
          onClick={clearChat}
          className="inline-flex h-9 w-fit items-center rounded-md border border-blue-800 bg-blue-950/30 px-3 text-sm font-medium text-blue-200 transition-colors hover:bg-blue-950/50"
        >
          {copy.newRequest}
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
          <span className="mt-1 block text-xs text-zinc-400">ارزیابی ساختاریافته دستگاه‌ها، رخدادها، سطح حمله، Policyها و پوشش لاگ</span>
          <span className="mt-2 block text-xs font-medium text-blue-300">{assessmentLoading ? "در حال تحلیل..." : "اجرای تحلیل کامل"}</span>
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
          <span className="mt-1 block text-xs text-zinc-400">پیشنهادهای اولویت‌بندی‌شده با نگاشت امن به اکشن‌های کاتالوگ</span>
          <span className="mt-2 block text-xs font-medium text-green-300">{hardeningLoading ? "در حال تولید..." : "تولید پیشنهادهای ایمن‌سازی"}</span>
        </button>
      </div>

      {assessment && (
        <div dir="rtl" className="mb-4 rounded-lg border border-zinc-700 bg-zinc-950/80 p-4 text-right">
          <h3 className="text-base font-semibold text-zinc-100">گزارش ارزیابی امنیتی</h3>
          <p className="mt-2 text-xs text-zinc-400">{assessment.summary}</p>
          <p className="mt-2 rounded border border-amber-900/60 bg-amber-950/20 p-2 text-xs text-amber-200">{String(assessmentDetails.dataNotice ?? "داده خوانده‌شده از دستگاه موجود نیست؛ تحلیل بر اساس داده‌های ثبت‌شده در برنامه انجام شده است.")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-zinc-800 p-3"><p className="text-xs text-zinc-500">امتیاز ریسک</p><p className="mt-1 text-xl font-bold text-red-200">{assessment.riskScore} از ۱۰۰</p></div>
            <div className="rounded border border-zinc-800 p-3"><p className="text-xs text-zinc-500">یافته‌های مهم</p><p className="mt-1 text-xl font-bold text-yellow-200">{assessmentFindings.length}</p></div>
            <div className="rounded border border-zinc-800 p-3"><p className="text-xs text-zinc-500">پوشش دستگاه</p><p className="mt-1 text-sm text-blue-200">{evidenceText(normalizeObject(assessmentSections.assetsAndVendors).connected)} دستگاه متصل</p></div>
            <div className="rounded border border-zinc-800 p-3"><p className="text-xs text-zinc-500">پیشرفت ایمن‌سازی</p><p className="mt-1 text-sm text-green-200">{assessment.recommendations.filter((item) => item.status === "action_plan_created").length} اقدام برنامه‌ریزی‌شده</p></div>
          </div>
          {vendorAnalyses.length > 0 && <div className="mt-4">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Vendor and device analysis">
              {vendorAnalyses.map((item) => <button key={String(item.deviceId)} type="button" role="tab" aria-selected={(activeAnalysisDevice ?? String(vendorAnalyses[0]?.deviceId)) === String(item.deviceId)} onClick={() => setActiveAnalysisDevice(String(item.deviceId))} className={`rounded border px-3 py-1.5 text-xs ${(activeAnalysisDevice ?? String(vendorAnalyses[0]?.deviceId)) === String(item.deviceId) ? "border-blue-600 bg-blue-950/50 text-blue-100" : "border-zinc-700 text-zinc-400"}`}>{String(item.device)} · {String(item.vendorLabel ?? item.vendor)}</button>)}
            </div>
            {visibleVendorAnalyses.map((item) => {
              const collected = normalizeArray<string>(item.collectedData);
              const missing = normalizeArray<string>(item.missingData);
              const findings = normalizeArray<Record<string, unknown>>(item.findings);
              const actions = normalizeArray<string>(item.recommendedActions);
              return <div key={String(item.deviceId)} className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="rounded border border-green-900/60 bg-green-950/10 p-3"><h4 className="text-xs font-semibold text-green-200">Collected data</h4><p className="mt-2 text-xs text-zinc-400">{collected.length ? collected.join(" · ") : "No vendor telemetry collected"}</p></div>
                <div className="rounded border border-amber-900/60 bg-amber-950/10 p-3"><h4 className="text-xs font-semibold text-amber-200">Missing data</h4><p className="mt-2 text-xs text-zinc-400">{missing.length ? missing.join(" · ") : "None identified"}</p></div>
                <div className="rounded border border-red-900/60 bg-red-950/10 p-3"><h4 className="text-xs font-semibold text-red-200">Findings</h4><div className="mt-2 space-y-2 text-xs text-zinc-400">{findings.length ? findings.map((finding) => <p key={String(finding.id)}><span className="text-zinc-200">{String(finding.title)}</span>: {String(finding.evidence)}</p>) : <p>No confirmed vendor-specific findings.</p>}</div></div>
                <div className="rounded border border-blue-900/60 bg-blue-950/10 p-3"><h4 className="text-xs font-semibold text-blue-200">Recommended actions</h4><p className="mt-2 text-xs text-zinc-400">{actions.length ? actions.join(" · ") : "Collect missing telemetry, then reassess."}</p></div>
              </div>;
            })}
          </div>}
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {Object.entries(assessmentSections).filter(([key, section]) => key !== "vendorSpecificChecks" && section && typeof section === "object" && !Array.isArray(section)).map(([, section], index) => {
              const item = normalizeObject(section);
              if (item.title === "یافته‌ها") return null;
              return <div key={index} className="rounded border border-zinc-800 bg-black/20 p-3"><h4 className="text-xs font-semibold text-blue-100">{String(item.title ?? "بخش گزارش")}</h4><p className="mt-2 text-xs leading-6 text-zinc-400">{evidenceText(Object.fromEntries(Object.entries(item).filter(([key]) => key !== "title")))}</p></div>;
            })}
          </div>
          {assessmentFindings.length > 0 && (
            <div className="mt-4"><h3 className="mb-2 text-sm font-semibold text-zinc-100">یافته‌ها</h3><div className="grid gap-2 md:grid-cols-2">
              {assessmentFindings.slice(0, 6).map((finding, index) => (
                <div key={String(finding.id ?? index)} className="rounded border border-zinc-800 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-zinc-200">{String(finding.title ?? "یافته امنیتی")}</p>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${riskClass(String(finding.severity ?? "medium"))}`}>{severityFa(String(finding.severity ?? "medium"))}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{String(finding.explanation ?? "")}</p>
                  <p className="mt-2 text-xs text-zinc-500"><span className="text-zinc-300">شواهد:</span> {evidenceText(finding.evidence)}</p>
                  <p className="mt-1 text-xs text-green-300"><span className="text-zinc-300">اقدام پیشنهادی:</span> {String(finding.recommendedNextStep ?? "نیازمند بررسی دستی")}</p>
                </div>
              ))}
            </div></div>
          )}
          {assessment.recommendations.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-zinc-100">پیشنهادهای ایمن‌سازی</h3>
              <div className="mt-2 space-y-2">
                {assessment.recommendations.map((recommendation) => (
                  <div key={recommendation.id} className="rounded border border-zinc-800 bg-black/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold text-zinc-100">{recommendation.title}</p>
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] ${riskClass(recommendation.severity)}`}>{severityFa(recommendation.severity)}</span>
                          <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">{recommendation.vendor}</span>
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] ${recommendation.executable ? "border-green-800 text-green-300" : "border-zinc-700 text-zinc-500"}`}>
                          {recommendation.createActionSupported ? "ActionPlan supported" : "نیاز به بررسی دستی"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">{recommendation.reason}</p>
                        <p className="mt-1 text-xs text-zinc-500">دستگاه: {recommendation.device?.name ?? "همه دستگاه‌ها"} · دسته: {recommendation.category}</p>
                        <p className="mt-1 text-xs text-zinc-500">شواهد: {evidenceText(recommendation.evidenceJson)}</p>
                        <p className="mt-1 text-xs text-green-300">اقدام پیشنهادی: {recommendation.recommendation}</p>
                      </div>
                      {recommendation.createActionSupported && !recommendation.actionPlanId && (
                        <button
                          type="button"
                          onClick={() => createRecommendationPlan(recommendation.id)}
                          disabled={recommendationWorking === recommendation.id}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-green-800 bg-green-950/30 px-3 text-xs font-semibold text-green-200 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {recommendationWorking === recommendation.id ? "در حال ساخت..." : "Create Fix Action · ساخت اکشن"}
                        </button>
                      )}
                      {recommendation.actionPlanId && <span className="text-xs font-medium text-green-300">در مرکز اکشن آماده است</span>}
                    </div>
                    {recommendation.executable && <details className="mt-2 text-xs text-zinc-400"><summary className="cursor-pointer">جزئیات فنی اکشن</summary><p className="mt-2">شناسه کاتالوگ: {recommendation.catalogActionId}</p><p className="mt-1">پارامترها: {evidenceText(recommendation.parametersJson)}</p></details>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs text-zinc-500">{copy.recent}</p>
          <p className="mt-1 text-xl font-semibold text-blue-100">{formatNumber(summary?.events.recentCount)}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs text-zinc-500">{copy.devices}</p>
          <p className="mt-1 text-xl font-semibold text-blue-100">{formatNumber(summary?.devices.length)}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs text-zinc-500">{copy.topIp}</p>
          <p className="mt-2 text-xs text-zinc-300">{topSourceIps[0]?.srcIp ?? "none"}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs text-zinc-500">{copy.ports}</p>
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
                <p className="text-sm">{copy.empty}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {safeMessages.map((message) => <ChatMessageBubble key={message.id} message={message} />)}
                {loading && (
                  <p className="text-left text-xs text-zinc-500">{copy.thinking}</p>
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
                placeholder={t("assistant.promptPlaceholder")}
                className="h-10 min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-blue-700"
              />
              <button
                type="submit"
                disabled={loading || input.trim() === ""}
                title={loading || input.trim() === "" ? t("assistant.sendUnavailable") : undefined}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {copy.send}
              </button>
            </div>
          </form>
        </div>

        <aside className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-3 flex items-center gap-2 text-left text-sm font-semibold text-zinc-100">
            <ShieldAlert className="h-4 w-4 text-yellow-300" aria-hidden="true" />
            {copy.safety}
          </div>
          <p className="text-left text-xs text-zinc-400">
            {copy.safetyText}
          </p>
          <div className="mt-3 rounded border border-zinc-800 bg-black/30 p-2 text-left">
            <p className="text-xs font-semibold text-zinc-200">{copy.provider}</p>
            <div className="mt-2 grid gap-1 text-xs text-zinc-400">
              <p><span className="text-zinc-500">provider:</span> {providerStatus?.provider ?? "mock"}</p>
              <p><span className="text-zinc-500">model:</span> {providerStatus?.model ?? "mock-deterministic"}</p>
              <p><span className="text-zinc-500">key configured:</span> {providerStatus?.keyConfigured ? "true" : "false"}</p>
              <p><span className="text-zinc-500">execution:</span> disabled</p>
            </div>
            {evidenceMetadata && (
              <div className="mt-2 border-t border-zinc-800 pt-2 text-xs text-zinc-400">
                <p className="font-medium text-blue-300">compact evidence mode</p>
                <p>events {evidenceMetadata.includedEventsCount} · findings {evidenceMetadata.includedFindingsCount} · incidents {evidenceMetadata.includedIncidentsCount}</p>
                <p>context truncated: {String(evidenceMetadata.contextTruncated)}</p>
              </div>
            )}
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
          {executionState && (
            <div className="mt-3 rounded-lg border border-cyan-900/70 bg-cyan-950/20 p-3 text-right" dir="rtl">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${executionState.executable ? "bg-emerald-950 text-emerald-300" : executionState.missing.length ? "bg-amber-950 text-amber-300" : executionState.implementation === "unsupported" ? "bg-red-950 text-red-300" : "bg-slate-800 text-slate-300"}`}>
                  {executionState.executable ? "قابل اجرا" : executionState.missing.length ? "نیازمند تکمیل اطلاعات" : executionState.implementation === "unsupported" ? "پشتیبانی نمی‌شود" : executionState.manualOnly ? "فقط بررسی دستی" : "غیرقابل اجرا"}
                </span>
                {executionState.template && <code className="text-[10px] text-cyan-400">{executionState.template}</code>}
              </div>
              <p className="mt-2 text-xs text-slate-300">{executionState.nextStep}</p>
              {executionState.lifecycle && <p className="mt-2 text-[11px] text-slate-500">ActionPlan {executionState.lifecycle.actionPlanId} · revision {executionState.lifecycle.planRevision} · {executionState.lifecycle.planState} · {executionState.executionMode}</p>}
              {createdPlanId && <button type="button" onClick={() => reviewInActionCenter(createdPlanId)} className="mt-3 rounded-md bg-cyan-700 px-3 py-2 text-xs font-semibold text-white">رفتن به مرکز عملیات</button>}
              {guidedStart && <button type="button" onClick={startGuidedWorkflow} className="mt-3 rounded-md bg-cyan-700 px-3 py-2 text-xs font-semibold text-white">شروع ساخت مرحله‌ای</button>}
              {!createdPlanId && executionState.missing.length > 0 && <button type="button" onClick={() => setInput(executionState.nextStep)} className="mt-3 rounded-md bg-amber-700 px-3 py-2 text-xs font-semibold text-white">تکمیل اطلاعات</button>}
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
            isFa={isFa}
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
      {technicalError && (
        <details dir="rtl" className="mt-2 rounded border border-zinc-800 p-2 text-right text-xs text-zinc-500">
          <summary className="cursor-pointer">جزئیات فنی</summary>
          <p className="mt-2 break-words" dir="ltr">{technicalError}</p>
        </details>
      )}
    </section>
  );
}
