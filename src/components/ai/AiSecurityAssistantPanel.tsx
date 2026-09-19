import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Activity, Bot, ChevronDown, MessageCircle, RefreshCw, ScanSearch, Send, Server, ShieldAlert, ShieldCheck, Sparkles, Trash2, Wrench } from "lucide-react";
import {
  getAiProviderStatus,
  getSecuritySummary,
  type AiActionDebug,
  normalizeAiMessage,
  normalizeArray,
  sendAiMessage,
  type AiActionIntent,
  type AiIntentModeOverride,
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
import { ChatMessageBubble } from "@/features/assistant/components/AssistantMessageList";
import { IntentCard } from "@/features/assistant/components/AssistantIntentCard";
import { PlanningContextPanel } from "@/features/assistant/components/AssistantPlanningContext";
import { AssistantAssessmentReport } from "@/features/assistant/components/AssistantAssessmentReport";
import {
  canSurfaceActionPlan,
  classifyPlanningMode,
  connectorTypeOf,
  formatNumber,
  vendorOfDevice,
} from "@/features/assistant/assistantUiHelpers";
import type { AssistantExecutionState, GuidedStartState } from "@/features/assistant/types";

const CHAT_EXAMPLES = [
  "وضعیت امنیتی این دستگاه چطور است؟",
  "مهم‌ترین هشدارهای امروز را خلاصه کن",
  "برای ایمن‌تر شدن این دستگاه چه پیشنهادی داری؟",
];

const ACTION_EXAMPLES = [
  "وضعیت سرویس fail2ban را بررسی کن",
  "یک کاربر جدید لینوکس بساز",
  "پورت‌های باز این دستگاه را بررسی کن",
];

const INTENT_MODE_OPTIONS: AiIntentModeOverride[] = ["Chat", "Action"];

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
  copy.safetyText = isFa
    ? "AI may generate new commands and ActionPlans, but it cannot execute directly. Backend validation, preview, explicit approval, PolicyGuard, registered connector dispatch, verification, and audit are mandatory."
    : "AI may generate new commands and ActionPlans, but it cannot execute directly. Backend validation, preview, explicit approval, PolicyGuard, registered connector dispatch, verification, and audit are mandatory.";
  const viewGeneration = useRef(0);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
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
  const [executionState, setExecutionState] = useState<AssistantExecutionState | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [assistantMode, setAssistantMode] = useState<string | null>(null);
  const [intentModeOverride, setIntentModeOverride] = useState<AiIntentModeOverride>("Chat");
  const previousTargetDeviceId = useRef<string | null>(null);
  const [guidedStart, setGuidedStart] = useState<GuidedStartState | null>(null);
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
    setAssistantMode(null);
    setGuidedStart(null);
    setError(null);
    setTechnicalError(null);
    setAssessment(null);
    setAssessmentLoading(false);
    setHardeningLoading(false);
    setRecommendationWorking(null);
    setInput("");
    setIntentModeOverride("Chat");
    if (activeSessionId) {
      void clearAiSessionMessages(activeSessionId).catch((reason: unknown) => {
        setTechnicalError(reason instanceof Error ? reason.message : "پاک‌کردن سابقه سمت سرور ناموفق بود.");
      });
    }
  };

  const changeMode = (mode: AiIntentModeOverride) => {
    setIntentModeOverride(mode);
    setLastIntent(null);
    setExecutionState(null);
    setStructuredResponse(null);
    setActionDebug(null);
    setCreatedPlanId(null);
    setAssistantMode(null);
    setGuidedStart(null);
    setError(null);
    setTechnicalError(null);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedPrompt = params.get("prompt")?.trim();
    const requestedMode = params.get("mode");
    if (requestedPrompt) setInput(requestedPrompt.slice(0, 2000));
    if (requestedMode === "Action" || requestedMode === "Chat") setIntentModeOverride(requestedMode);
    refreshSummary();
    void listDevices().then((next) => {
      setDevices(next);
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
    setAssistantMode(null);
    setGuidedStart(null);
    setError(null);
    setTechnicalError(null);
    setAssessment(null);
    setAssessmentLoading(false);
    setHardeningLoading(false);
    setRecommendationWorking(null);
  }, [selectedDeviceId]);

  const safeMessages = useMemo(() => normalizeArray<AiMessage>(messages).map(normalizeAiMessage), [messages]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const viewport = chatViewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [safeMessages.length, loading]);
  const topSourceIps = normalizeArray<{ srcIp: string | null; count: number }>(summary?.events.topSourceIps);
  const sensitivePorts = normalizeArray<{ dstPort: number | null; count: number }>(summary?.events.sensitivePorts);
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  const providerIsLive = Boolean(providerStatus?.liveVerified && !providerStatus?.lastError);
  const visibleExamples = intentModeOverride === "Chat" ? CHAT_EXAMPLES : ACTION_EXAMPLES;
  const planningMode = classifyPlanningMode({ backendMode: assistantMode, createdPlanId, guidedStart, actionIntent: lastIntent, actionDebug, executionState });

  const runAssessment = () => {
    const generation = viewGeneration.current;
    setAssessmentLoading(true);
    setError(null);
    runFullSecurityAnalysis(selectedDeviceId || undefined)
      .then((result) => {
        if (generation !== viewGeneration.current) return;
        setAssessment(result);
      })
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
    const assessmentMatchesScope = assessment?.id && (
      selectedDeviceId
        ? assessment.scopeType === "device" && assessment.scopeId === selectedDeviceId
        : assessment.scopeType !== "device"
    );
    const assessmentPromise = assessmentMatchesScope
      ? Promise.resolve(assessment)
      : runFullSecurityAnalysis(selectedDeviceId || undefined);
    assessmentPromise
      .then((baseAssessment) => baseAssessment.id ? generateHardeningSuggestions(baseAssessment.id) : generateHardeningSuggestions())
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
    if (intentModeOverride === "Action" && !selectedDeviceId) {
      setError(isFa ? "برای ساخت برنامه عملیات، ابتدا دستگاه مقصد را انتخاب کنید." : "Select a target device before creating an ActionPlan.");
      return;
    }
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
    setAssistantMode(null);
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
      intentModeOverride,
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
        setAssistantMode(response.mode);
        setEvidenceMetadata(response.evidenceMetadata);
        const canSurfacePlan = canSurfaceActionPlan(response.mode);
        setExecutionState(canSurfacePlan ? { support: response.actionContract.executionSupport, implementation: response.actionContract.implementationState, missing: response.missingFields, nextStep: response.nextStepFa, template: response.mappedTemplate, canCreateActionPlan: response.actionContract.canCreateActionPlan, manualOnly: response.actionContract.manualOnly, executable: response.actionContract.executable, executionMode: response.actionContract.executionMode, lifecycle: response.actionContract.lifecycle } : null);
        setCreatedPlanId(canSurfacePlan ? response.actionPlan?.id ?? null : null);
        setGuidedStart(null);
        if (canSurfacePlan && response.actionPlan?.id) {
          publishActionPlanCreated(response.actionPlan.id);
        }
        refreshSummary();
      })
      .catch((err: unknown) => {
        if (generation !== viewGeneration.current) return;
        setError(isFa
          ? "ارتباط زنده با هوش مصنوعی برقرار نشد؛ هیچ پاسخ قالبی جایگزین نمایش داده نشد. اتصال اینترنت یا provider را بررسی و دوباره تلاش کنید."
          : "The live AI provider could not be reached. No canned fallback was shown; check connectivity or provider settings and try again.");
        setProviderStatus((current) => current ? { ...current, lastError: "AI_PROVIDER_UNAVAILABLE" } : current);
        setTechnicalError(err instanceof Error ? err.message : "خطای ناشناخته سرویس هوش مصنوعی");
      })
      .finally(() => { if (generation === viewGeneration.current) setLoading(false); });
  };

  return (
    <section className="relative mb-4 overflow-hidden rounded-2xl border border-cyan-900/50 bg-[linear-gradient(145deg,rgba(8,31,48,.92),rgba(2,10,18,.96)_42%)] p-3 shadow-[0_24px_80px_rgba(0,0,0,.28)] sm:p-5" dir={isFa ? "rtl" : "ltr"}>
      <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" aria-hidden="true" />
      <header className="relative mb-4 flex flex-col gap-3 border-b border-white/5 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,.08)]">
            <Bot className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-100 sm:text-xl">{copy.title}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-6 text-slate-400 sm:text-sm">
              {intentModeOverride === "Chat"
                ? (isFa ? "درباره وضعیت و امنیت دستگاه انتخابی گفت‌وگو کنید." : "Chat about the selected device and its security state.")
                : (isFa ? "درخواست عملیاتی خود را بنویسید تا برنامه‌ای قابل بازبینی ساخته شود." : "Describe an operation to build a reviewable ActionPlan.")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 ${providerIsLive ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : providerStatus?.lastError ? "border-rose-400/20 bg-rose-400/10 text-rose-200" : "border-amber-400/20 bg-amber-400/10 text-amber-200"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${providerIsLive ? "bg-emerald-300" : providerStatus?.lastError ? "bg-rose-300" : "bg-amber-300"}`} />
            {providerIsLive
              ? (isFa ? "هوش مصنوعی آماده" : "AI ready")
              : providerStatus?.lastError
                ? (isFa ? "ارتباط AI قطع است" : "AI unavailable")
                : providerStatus?.keyConfigured
                  ? (isFa ? "AI تنظیم شده؛ آماده‌ی اولین پیام" : "AI configured; send a message to verify")
                  : (isFa ? "سرویس AI تنظیم نشده" : "AI is not configured")}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-slate-400">
            {copy.lastRefresh}: {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleTimeString() : "-"}
          </span>
        </div>
      </header>

      <div className="relative mb-4 grid gap-3 rounded-2xl border border-white/5 bg-black/20 p-3 lg:grid-cols-[minmax(240px,.8fr)_minmax(280px,1.2fr)_auto] lg:items-end">
        <div>
          <span className="mb-2 block text-xs font-semibold text-slate-300">{isFa ? "نوع درخواست" : "Request type"}</span>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-slate-950/80 p-1" role="group" aria-label="Assistant mode">
            {INTENT_MODE_OPTIONS.map((mode) => {
              const active = intentModeOverride === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeMode(mode)}
                  aria-pressed={active}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition-all ${active ? "bg-cyan-500/15 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,.35)]" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}
                >
                  {mode === "Chat" ? <MessageCircle className="h-4 w-4" aria-hidden="true" /> : <Wrench className="h-4 w-4" aria-hidden="true" />}
                  {mode === "Chat" ? (isFa ? "گفت‌وگو" : "Chat") : (isFa ? "ساخت عملیات" : "Action")}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block min-w-0">
          <span className="mb-2 block text-xs font-semibold text-slate-300">{copy.target}</span>
          <span className="relative block">
            <Server className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400" aria-hidden="true" />
            <select
              value={selectedDeviceId}
              onChange={(event) => setSelectedDeviceId(event.target.value)}
              className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-slate-950/80 px-10 text-sm font-medium text-slate-100 outline-none transition focus:border-cyan-500/60 focus:ring-4 focus:ring-cyan-500/5"
            >
              <option value="">{copy.choose}</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name} — {vendorOfDevice(device)} — {device.host}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          </span>
        </label>

        <div className="grid grid-cols-2 gap-2 lg:flex">
          <button
            type="button"
            onClick={refreshSummary}
            disabled={summaryLoading}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-300 transition hover:border-cyan-500/30 hover:text-cyan-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${summaryLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            {isFa ? "تازه‌سازی" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={clearChat}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-300 transition hover:border-rose-500/30 hover:text-rose-200"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {isFa ? "گفت‌وگوی جدید" : "New chat"}
          </button>
        </div>
      </div>

      <PlanningContextPanel
        mode={planningMode}
        selectedDevice={selectedDevice}
        createdPlanId={createdPlanId}
        executionState={executionState}
        guidedStart={guidedStart}
        actionDebug={actionDebug}
        isFa={isFa}
      />

      <details className="group mb-4 rounded-xl border border-white/5 bg-black/15">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-slate-300 marker:hidden">
          <span className="inline-flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-400" aria-hidden="true" />{isFa ? "ابزارهای تحلیل پیشرفته" : "Advanced analysis tools"}</span>
          <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid gap-3 border-t border-white/5 p-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={runAssessment}
            disabled={assessmentLoading || hardeningLoading}
            className="rounded-xl border border-blue-400/15 bg-blue-400/5 p-4 text-start transition hover:border-blue-400/30 hover:bg-blue-400/10 disabled:opacity-60"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-blue-100">
              <ScanSearch className="h-5 w-5" aria-hidden="true" />
              تحلیل کامل
            </span>
            <span className="mt-2 block text-xs leading-6 text-slate-400">{selectedDevice ? `ارزیابی شواهد تازه، رخدادها و سطح حمله ${selectedDevice.name}` : "ارزیابی ساختاریافته همه دستگاه‌ها، رخدادهای فعال و پوشش داده"}</span>
            <span className="mt-2 block text-xs font-medium text-blue-300">{assessmentLoading ? "در حال تحلیل..." : "اجرای تحلیل کامل"}</span>
          </button>
          <button
            type="button"
            onClick={runHardening}
            disabled={assessmentLoading || hardeningLoading}
            className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-4 text-start transition hover:border-emerald-400/30 hover:bg-emerald-400/10 disabled:opacity-60"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              پیشنهاد ایمن‌سازی
            </span>
            <span className="mt-2 block text-xs leading-6 text-slate-400">{assessment ? "پیشنهادهای اولویت‌بندی‌شده دقیقاً بر پایه آخرین گزارش بالا" : "ابتدا تحلیل تازه اجرا می‌شود؛ سپس پیشنهادها از همان شواهد ساخته می‌شوند"}</span>
            <span className="mt-2 block text-xs font-medium text-emerald-300">{hardeningLoading ? "در حال تولید..." : "تولید پیشنهادهای ایمن‌سازی"}</span>
          </button>
        </div>
      </details>

      {assessment && (
        <AssistantAssessmentReport
          assessment={assessment}
          isFa={isFa}
          recommendationWorking={recommendationWorking}
          onCreatePlan={createRecommendationPlan}
        />
      )}

      <details className="group mb-4 rounded-xl border border-white/5 bg-black/15">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-slate-300 marker:hidden">
          <span>{isFa ? "خلاصه داده‌های امنیتی" : "Security data summary"}</span>
          <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t border-white/5 p-3 lg:grid-cols-4">
        <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
          <p className="text-xs text-zinc-500">{copy.recent}</p>
          <p className="mt-1 text-xl font-semibold text-blue-100">{formatNumber(summary?.events.recentCount)}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
          <p className="text-xs text-zinc-500">{copy.devices}</p>
          <p className="mt-1 text-xl font-semibold text-blue-100">{formatNumber(summary?.devices.length)}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
          <p className="text-xs text-zinc-500">{copy.topIp}</p>
          <p className="mt-2 text-xs text-zinc-300">{topSourceIps[0]?.srcIp ?? "none"}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
          <p className="text-xs text-zinc-500">{copy.ports}</p>
          <p className="mt-2 text-xs text-zinc-300">
            {sensitivePorts.slice(0, 3).map((item) => `${item.dstPort}: ${item.count}`).join(", ") || "none"}
          </p>
        </div>
        </div>
      </details>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex h-[min(68vh,660px)] min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-cyan-400/15 bg-slate-950/75 shadow-[inset_0_1px_0_rgba(255,255,255,.03)] max-sm:h-[72vh] max-sm:min-h-[540px]">
          <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${intentModeOverride === "Chat" ? "bg-cyan-400/10 text-cyan-300" : "bg-violet-400/10 text-violet-300"}`}>
                {intentModeOverride === "Chat" ? <MessageCircle className="h-4 w-4" aria-hidden="true" /> : <Wrench className="h-4 w-4" aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-100">{intentModeOverride === "Chat" ? (isFa ? "گفت‌وگو با دستیار" : "Assistant chat") : (isFa ? "طراحی برنامه عملیات" : "Action planning")}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">{selectedDevice ? `${selectedDevice.name} · ${vendorOfDevice(selectedDevice)}` : (isFa ? "دستگاهی انتخاب نشده است" : "No device selected")}</p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/5 bg-white/[.03] px-2 py-1 text-[10px] text-slate-500">
              <ShieldCheck className="h-3 w-3 text-emerald-400" aria-hidden="true" />
              {isFa ? "اجرای کنترل‌شده" : "Controlled execution"}
            </span>
          </div>

          <div ref={chatViewportRef} className="min-h-0 flex-1 overflow-y-auto scroll-smooth p-3 sm:p-5" aria-live="polite">
            {safeMessages.length === 0 ? (
              <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center px-2 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-400/15 bg-cyan-400/10 text-cyan-300 shadow-[0_0_32px_rgba(34,211,238,.08)]">
                  <Sparkles className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-bold text-slate-100">{intentModeOverride === "Chat" ? (isFa ? "چه چیزی را می‌خواهید بررسی کنیم؟" : "What should we investigate?") : (isFa ? "چه عملیاتی باید انجام شود؟" : "What operation should be planned?")}</h3>
                <p className="mt-2 max-w-md text-xs leading-6 text-slate-500">{intentModeOverride === "Chat" ? copy.empty : (isFa ? "درخواست را با زبان ساده بنویسید؛ پارامترهای لازم در مرکز عملیات تکمیل می‌شوند." : "Describe the request naturally; required parameters continue in Action Center.")}</p>
                <div className="mt-5 grid w-full gap-2 sm:grid-cols-3">
                  {visibleExamples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setInput(example)}
                      className="min-h-16 rounded-xl border border-white/5 bg-white/[.025] p-3 text-start text-[11px] leading-5 text-slate-400 transition hover:border-cyan-400/20 hover:bg-cyan-400/5 hover:text-cyan-100"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="assistant-chat-thread">
                {safeMessages.map((message) => <ChatMessageBubble key={message.id} message={message} isFa={isFa} />)}
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="flex gap-1"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 [animation-delay:300ms]" /></span>
                    {copy.thinking}
                  </div>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit(input);
            }}
            className="border-t border-white/5 bg-black/20 p-3 sm:p-4"
          >
            <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-slate-950/90 p-2 transition focus-within:border-cyan-400/35 focus-within:ring-4 focus-within:ring-cyan-400/5">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit(input);
                  }
                }}
                placeholder={t("assistant.promptPlaceholder")}
                rows={2}
                className="max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600"
              />
              <button
                type="submit"
                disabled={loading || input.trim() === ""}
                title={loading || input.trim() === "" ? t("assistant.sendUnavailable") : undefined}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-cyan-500 to-blue-600 px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(8,145,178,.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 max-sm:w-11 max-sm:px-0"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                <span className="max-sm:hidden">{copy.send}</span>
              </button>
            </div>
            <p className="mt-2 px-1 text-[10px] text-slate-600">{isFa ? "Enter برای ارسال · Shift + Enter برای خط جدید" : "Enter to send · Shift + Enter for a new line"}</p>
          </form>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 rounded-2xl border border-white/5 bg-black/20 p-3 sm:p-4">
          <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><Server className="h-5 w-5" aria-hidden="true" /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-slate-500">{isFa ? "زمینه فعال" : "Active context"}</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-100">{selectedDevice?.name ?? (isFa ? "دستگاهی انتخاب نشده" : "No device selected")}</p>
                <p className="mt-1 truncate text-[11px] text-slate-500">{selectedDevice ? `${vendorOfDevice(selectedDevice)} · ${selectedDevice.host}` : (isFa ? "برای پاسخ دقیق‌تر یک دستگاه انتخاب کنید." : "Select a device for better context.")}</p>
              </div>
            </div>
          </div>

          <div className={`rounded-xl border p-3 ${intentModeOverride === "Chat" ? "border-cyan-400/15 bg-cyan-400/5" : "border-violet-400/15 bg-violet-400/5"}`}>
            <div className="flex items-center gap-2">
              {intentModeOverride === "Chat" ? <MessageCircle className="h-4 w-4 text-cyan-300" aria-hidden="true" /> : <Wrench className="h-4 w-4 text-violet-300" aria-hidden="true" />}
              <p className="text-xs font-bold text-slate-200">{intentModeOverride === "Chat" ? (isFa ? "فقط گفت‌وگو" : "Conversation only") : (isFa ? "ساخت برنامه عملیات" : "ActionPlan creation")}</p>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">{intentModeOverride === "Chat" ? (isFa ? "در این حالت هیچ برنامه عملیاتی ساخته نمی‌شود." : "No ActionPlan is created in this mode.") : (isFa ? "هیچ عملیاتی بدون بازبینی و تأیید شما اجرا نمی‌شود." : "Nothing executes without your review and approval.")}</p>
          </div>

          <details className="group rounded-xl border border-white/5 bg-slate-950/40">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-3 text-xs font-semibold text-slate-400 marker:hidden">
              <span className="inline-flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-300" aria-hidden="true" />{isFa ? "ایمنی و وضعیت سرویس" : "Safety and provider"}</span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="border-t border-white/5 p-3 text-[11px] leading-5 text-slate-500">
              <p>{copy.safetyText}</p>
              <div className="mt-3 grid gap-1 border-t border-white/5 pt-3" dir="ltr">
                <p><span className="text-slate-600">provider:</span> {providerStatus?.provider ?? "mock"}</p>
                <p><span className="text-slate-600">model:</span> {providerStatus?.model ?? "mock-deterministic"}</p>
                <p><span className="text-slate-600">key configured:</span> {providerStatus?.keyConfigured ? "true" : "false"}</p>
              </div>
              {evidenceMetadata && <p className="mt-2 text-cyan-400">{evidenceMetadata.includedEventsCount} events · {evidenceMetadata.includedFindingsCount} findings · {evidenceMetadata.includedIncidentsCount} incidents</p>}
              {providerStatus?.lastError && <p className="mt-2 text-rose-300">{providerStatus.lastError}</p>}
            </div>
          </details>
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
              {createdPlanId && <button type="button" onClick={() => executionState?.missing.length ? navigate(`/actions/${encodeURIComponent(createdPlanId)}/configure`) : reviewInActionCenter(createdPlanId)} className="mt-3 rounded-md bg-cyan-700 px-3 py-2 text-xs font-semibold text-white">{executionState?.missing.length ? "تکمیل پارامترها در مرکز عملیات" : "رفتن به مرکز عملیات"}</button>}
              {!createdPlanId && executionState.missing.length > 0 && <button type="button" onClick={() => setInput(executionState.nextStep)} className="mt-3 rounded-md bg-amber-700 px-3 py-2 text-xs font-semibold text-white">تکمیل اطلاعات</button>}
            </div>
          )}
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
