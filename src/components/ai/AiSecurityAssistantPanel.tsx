import { useEffect, useMemo, useState } from "react";
import { Bot, RefreshCw, Send, ShieldAlert, Sparkles, TriangleAlert } from "lucide-react";
import {
  getAiProviderStatus,
  getSecuritySummary,
  normalizeAiMessage,
  normalizeArray,
  normalizeObject,
  sendAiMessage,
  type AiActionIntent,
  type AiMessage,
  type AiProviderStatus,
  type SecuritySummary,
  type StructuredAiResponse,
} from "@/lib/ai";
import { proposeAction } from "@/lib/actions";

const EXAMPLES = [
  "امروز چه تهدیدهایی داشتیم؟",
  "کدوم IP بیشتر حمله زده؟",
  "آیا پورت ۲۲ درگیر بوده؟",
  "پورت ۲۲ رو عوض کن روی ۲۲۰۲۲",
  "پورت ۸۰۸۰ رو ببند",
  "این IP رو ۳۰ دقیقه بلاک کن",
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

function IntentCard({
  intent,
  creating,
  createdPlanId,
  onCreateActionPlan,
}: {
  intent: AiActionIntent | null;
  creating: boolean;
  createdPlanId: string | null;
  onCreateActionPlan: (intent: AiActionIntent) => void;
}) {
  if (!intent) return null;
  const params = normalizeObject(intent.parametersJson);
  const missingFields = normalizeArray<unknown>(params.missingFields).map(String);
  const clarificationQuestions = normalizeArray<unknown>(params.clarificationQuestions).map(String);

  return (
    <div className="mt-3 rounded-lg border border-yellow-800/70 bg-yellow-950/20 p-3 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <TriangleAlert className="h-4 w-4 text-yellow-300" aria-hidden="true" />
        <span className="text-sm font-semibold text-yellow-100">Proposed action only</span>
        <span className={`rounded border px-2 py-0.5 text-xs ${riskClass(intent.riskLevel)}`}>{intent.riskLevel}</span>
        <span className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-300">{intent.status}</span>
      </div>
      <p className="mt-2 text-xs text-yellow-100/80">
        Not executed. Requires dry-run and approval before any future connector can act.
      </p>
      <div className="mt-3 grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
        <p><span className="text-zinc-500">Intent:</span> {intent.intentType}</p>
        <p><span className="text-zinc-500">Target:</span> {intent.device?.name ?? intent.deviceId ?? "not selected"}</p>
      </div>
      <p className="mt-2 text-xs text-zinc-400">{intent.explanation || "No explanation provided."}</p>
      {missingFields.length > 0 && (
        <div className="mt-3 rounded border border-yellow-800/70 bg-yellow-950/20 p-2">
          <p className="text-xs font-semibold text-yellow-100">Missing fields</p>
          <p className="mt-1 text-xs text-yellow-100/80">{missingFields.join(", ")}</p>
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
      <pre className="mt-3 max-h-40 overflow-auto rounded border border-zinc-800 bg-black/40 p-2 text-xs text-zinc-300">
        {JSON.stringify(params, null, 2)}
      </pre>
      <button
        type="button"
        onClick={() => onCreateActionPlan(intent)}
        disabled={creating || !intent.id}
        className="mt-3 inline-flex h-8 items-center rounded-md border border-yellow-700 bg-yellow-950/40 px-3 text-xs font-semibold text-yellow-100 transition-colors hover:border-yellow-500 disabled:opacity-60"
      >
        {creating ? "Creating..." : "Create Action Plan"}
      </button>
      {createdPlanId && (
        <p className="mt-2 text-xs text-green-300">
          ActionPlan created: <span className="font-mono">{createdPlanId}</span>
        </p>
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
  const [creatingActionPlan, setCreatingActionPlan] = useState(false);
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<AiProviderStatus | null>(null);
  const [structuredResponse, setStructuredResponse] = useState<StructuredAiResponse | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const refreshSummary = () => {
    setSummaryLoading(true);
    Promise.all([getSecuritySummary(), getAiProviderStatus()])
      .then(([nextSummary, nextStatus]) => {
        setSummary(nextSummary);
        setProviderStatus(nextStatus);
        setLastRefreshedAt(new Date().toISOString());
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load security summary."))
      .finally(() => setSummaryLoading(false));
  };

  useEffect(() => {
    refreshSummary();
  }, []);

  const safeMessages = useMemo(() => normalizeArray<AiMessage>(messages).map(normalizeAiMessage), [messages]);
  const topSourceIps = normalizeArray<{ srcIp: string | null; count: number }>(summary?.events.topSourceIps);
  const sensitivePorts = normalizeArray<{ dstPort: number | null; count: number }>(summary?.events.sensitivePorts);

  const submit = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || loading) return;

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
        setProviderStatus(response.providerStatus ?? providerStatus);
        setStructuredResponse(response.structured);
        setCreatedPlanId(null);
        refreshSummary();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to send AI message.");
      })
      .finally(() => setLoading(false));
  };

  const createActionPlanFromIntent = (intent: AiActionIntent) => {
    if (!intent.id || creatingActionPlan) return;
    setCreatingActionPlan(true);
    setError(null);
    proposeAction({ aiIntentId: intent.id })
      .then((plan) => setCreatedPlanId(plan.id || null))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to create ActionPlan from AI intent.");
      })
      .finally(() => setCreatingActionPlan(false));
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
          Refresh Summary
        </button>
      </div>

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
        <div className="rounded-lg border border-zinc-800 bg-zinc-950">
          <div className="max-h-[420px] min-h-[260px] overflow-y-auto p-4">
            {safeMessages.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center text-zinc-500">
                <Sparkles className="h-8 w-8" aria-hidden="true" />
                <p className="text-sm">Ask about events, incidents, devices, or proposed actions.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {safeMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-lg border p-3 text-left ${
                      message.role === "user"
                        ? "ml-auto max-w-[86%] border-blue-800/70 bg-blue-950/30"
                        : "mr-auto max-w-[92%] border-zinc-800 bg-zinc-900/70"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium uppercase text-zinc-500">{message.role}</span>
                      <span className="text-[11px] text-zinc-600">{formatDateTime(message.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-zinc-200">{message.content}</p>
                  </div>
                ))}
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
            creating={creatingActionPlan}
            createdPlanId={createdPlanId}
            onCreateActionPlan={createActionPlanFromIntent}
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
