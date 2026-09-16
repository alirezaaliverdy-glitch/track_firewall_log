import { sendAiMessage } from "@/lib/ai";
import {
  ArrowUpLeft,
  Bot,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";

type DashboardAssistantPanelProps = {
  isFa: boolean;
  criticalFindings: number;
  pendingApprovals: number;
  failedActions: number;
  latestFindingTitle?: string;
};

type ChatLine = {
  role: "user" | "assistant";
  text: string;
};

function copy(isFa: boolean, fa: string, en: string) {
  return isFa ? fa : en;
}

export function DashboardAssistantPanel({
  isFa,
  criticalFindings,
  pendingApprovals,
  failedActions,
  latestFindingTitle,
}: DashboardAssistantPanelProps) {
  const suggestedPrompts = useMemo(() => [
    copy(isFa, "وضعیت امنیتی امروز را خلاصه کن", "Summarize today's security posture"),
    criticalFindings > 0
      ? copy(isFa, `${criticalFindings} یافته بحرانی را اولویت‌بندی کن`, `Prioritize ${criticalFindings} critical findings`)
      : copy(isFa, "موارد نیازمند بررسی را مشخص کن", "Identify items needing review"),
    latestFindingTitle
      ? copy(isFa, `یافته «${latestFindingTitle}» را تحلیل کن`, `Analyze the finding “${latestFindingTitle}”`)
      : copy(isFa, "گام امن بعدی را پیشنهاد بده", "Suggest the next safe step"),
  ], [criticalFindings, isFa, latestFindingTitle]);

  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt || busy) return;

    setInput("");
    setError(null);
    setBusy(true);
    setLines((current) => [...current, { role: "user" as const, text: prompt }].slice(-4));

    try {
      const response = await sendAiMessage(sessionId, prompt, undefined, { intentModeOverride: "Chat" });
      setSessionId(response.sessionId || sessionId);
      const answer = response.assistantMessage?.content
        || response.structured?.assistantMessage
        || response.answer
        || response.nextStepFa
        || copy(isFa, "پاسخی از دستیار دریافت نشد.", "The assistant returned no response.");
      setLines((current) => [...current, { role: "assistant" as const, text: answer }].slice(-4));
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : copy(isFa, "ارتباط با دستیار برقرار نشد.", "Could not reach the assistant."));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(input);
  };

  const fullAssistantPath = `/assistant?mode=Chat${input.trim() ? `&prompt=${encodeURIComponent(input.trim())}` : ""}`;

  return (
    <aside className="command-assistant-panel" aria-labelledby="dashboard-assistant-title">
      <div className="command-assistant-panel__aura" aria-hidden="true" />
      <header className="command-assistant-panel__header">
        <span className="command-assistant-panel__avatar"><Bot /></span>
        <div>
          <span><i />{copy(isFa, "آنلاین و متصل به داده واقعی", "Online and connected to real data")}</span>
          <h2 id="dashboard-assistant-title">{copy(isFa, "دستیار هوشمند امنیت", "AI security assistant")}</h2>
        </div>
        <Link to={fullAssistantPath} aria-label={copy(isFa, "باز کردن دستیار کامل", "Open full assistant")}><ExternalLink /></Link>
      </header>

      <div className="command-assistant-panel__context">
        <span className={criticalFindings ? "is-danger" : "is-good"}><ShieldCheck />{criticalFindings} {copy(isFa, "بحرانی", "critical")}</span>
        <span className={pendingApprovals ? "is-warning" : "is-good"}><CircleAlert />{pendingApprovals} {copy(isFa, "در انتظار", "pending")}</span>
        <span className={failedActions ? "is-danger" : "is-good"}><CheckCircle2 />{failedActions} {copy(isFa, "ناموفق", "failed")}</span>
      </div>

      <div className="command-assistant-panel__conversation" aria-live="polite">
        <div className="assistant-message assistant-message--system">
          <span><Sparkles /></span>
          <p>{copy(
            isFa,
            "من داده‌های همین سامانه را تحلیل می‌کنم و برای بررسی رخدادها، اولویت‌بندی و انتخاب اقدام بعدی کنار شما هستم.",
            "I analyze this system's live data and help review incidents, prioritize work, and choose the next action.",
          )}</p>
        </div>

        {lines.map((line, index) => (
          <div className={`assistant-message assistant-message--${line.role}`} key={`${line.role}-${index}-${line.text.slice(0, 16)}`}>
            {line.role === "assistant" ? <span><Bot /></span> : null}
            <p>{line.text}</p>
          </div>
        ))}

        {busy ? <div className="assistant-message assistant-message--thinking"><span><Bot /></span><p><i /><i /><i /></p></div> : null}
        {error ? <div className="assistant-message assistant-message--error"><CircleAlert /><p>{error}</p></div> : null}
      </div>

      <div className="command-assistant-panel__suggestions">
        <span>{copy(isFa, "پرسش‌های پیشنهادی", "Suggested prompts")}</span>
        {suggestedPrompts.map((prompt) => <button type="button" onClick={() => void ask(prompt)} disabled={busy} key={prompt}>{prompt}<ArrowUpLeft /></button>)}
      </div>

      <form className="command-assistant-panel__composer" onSubmit={submit}>
        <label htmlFor="dashboard-assistant-input" className="sr-only">{copy(isFa, "پیام به دستیار", "Message the assistant")}</label>
        <textarea
          id="dashboard-assistant-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (input.trim()) void ask(input);
            }
          }}
          placeholder={copy(isFa, "درباره وضعیت امنیت بپرسید...", "Ask about security posture...")}
          rows={2}
          maxLength={2000}
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label={copy(isFa, "ارسال پیام", "Send message")}><SendHorizontal /></button>
      </form>

      <footer>
        <ShieldCheck />
        <p>{copy(isFa, "دستیار فقط پیشنهاد می‌دهد؛ هر اجرای واقعی پس از پیش‌نمایش و تأیید در Action Center انجام می‌شود.", "The assistant only proposes; real execution requires preview and confirmation in Action Center.")}</p>
        <Link to="/actions">{copy(isFa, "مرکز اقدام", "Action Center")}<ArrowUpLeft /></Link>
      </footer>
    </aside>
  );
}
