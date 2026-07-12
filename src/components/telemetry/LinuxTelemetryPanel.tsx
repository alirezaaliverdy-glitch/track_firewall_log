import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Activity, AlertTriangle, Bot, CheckCircle2, ChevronDown, Play, Square, Wrench } from "lucide-react";
import { proposeAction } from "@/lib/actions";
import { publishActionPlanCreated } from "@/lib/actionPlanHandoff";
import { listDevices, type Device } from "@/lib/devices";
import { analyzeLinuxSnapshot, collectLinuxSnapshot, createFindingActionPlan, latestLinuxSnapshot, listDeviceFindings, linuxStreamStatus, linuxTelemetryOptions, linuxTelemetryStorageStatus, startLinuxStream, stopLinuxStream, subscribeLinuxStream, type LinuxLiveEvent, type LinuxSnapshot, type LinuxTelemetryAnalysis, type LinuxTelemetryOptions, type LinuxTelemetryStorageStatus, type VendorFinding } from "@/lib/linuxTelemetry";
import { buildFixActionProposal, buildLiveFindings, sourcesForPreset, type LiveFinding, type SourcePreset } from "@/lib/linuxTelemetryFindings";

const allSources = ["auth", "system", "kernel", "firewall", "nginx", "apache", "fail2ban", "docker"];
const presetLabels: Record<SourcePreset, string> = { essential: "Essential Security", web: "Web Server", docker: "Docker Host", full: "Full Observation" };
const severityClass: Record<string, string> = { info: "border-cyan-900 text-cyan-200", low: "border-blue-900 text-blue-200", medium: "border-yellow-900 text-yellow-200", high: "border-red-900 text-red-200", critical: "border-red-700 bg-red-950/40 text-red-100" };

const copy = {
  en: {
    title: "Device Telemetry",
    subtitle: "Simple live monitoring for Linux servers. The system collects logs, analyzes risks, and suggests controlled next steps.",
    noDevice: "No Linux SSH device found. Add a Linux device with SSH credentials first.",
    connection: "1. Connection",
    connected: "Connected",
    notConnected: "Not connected",
    device: "Linux device",
    ipPort: "Device IP and SSH port",
    checked: "Last checked",
    never: "Not checked yet",
    servicePort: "Detected SSH service",
    monitoring: "2. Live Monitoring",
    running: "Monitoring is running",
    stopped: "Monitoring is stopped",
    error: "Monitoring has an error",
    collecting: "Collecting logs from system, SSH, firewall, and selected services.",
    events: "Events received",
    lastEvent: "Last event",
    storage: "Storage",
    start: "Start Monitoring",
    stop: "Stop Monitoring",
    results: "3. Results",
    what: "What happened?",
    analysisFound: "Analysis found",
    issues: "issues",
    eventsAnalyzed: "events analyzed",
    noFindings: "No risks found yet. Start monitoring or run Analyze after logs arrive.",
    analyze: "Analyze",
    analyzing: "Analyzing...",
    analyzed: "Local analysis completed.",
    aiUnavailable: "AI explanation is unavailable. Local analysis is still available.",
    backendDown: "Backend is not reachable. Check API server.",
    problem: "Problem",
    matters: "Why it matters",
    evidence: "Evidence summary",
    count: "Count",
    fix: "Recommended fix",
    action: "Create ActionPlan",
    technical: "Show technical evidence",
    advanced: "Advanced diagnostics",
    rawStream: "Raw event stream",
    sources: "Advanced sources",
    warnings: "Storage and stream warnings",
    sourcePreset: "Source presets",
    selectedSources: "Selected sources",
    debug: "Backend counters"
  },
  fa: {
    title: "پایش دستگاه",
    subtitle: "پایش ساده برای سرور Linux. سیستم لاگ‌ها را جمع‌آوری می‌کند، ریسک‌ها را تحلیل می‌کند و قدم بعدی کنترل‌شده پیشنهاد می‌دهد.",
    noDevice: "هیچ دستگاه Linux با SSH پیدا نشد. ابتدا دستگاه و دسترسی SSH را اضافه کنید.",
    connection: "۱. اتصال",
    connected: "متصل است",
    notConnected: "متصل نیست",
    device: "دستگاه Linux",
    ipPort: "IP دستگاه و پورت SSH",
    checked: "آخرین بررسی",
    never: "هنوز بررسی نشده",
    servicePort: "سرویس SSH شناسایی‌شده",
    monitoring: "۲. پایش زنده",
    running: "پایش در حال اجراست",
    stopped: "پایش متوقف است",
    error: "پایش خطا دارد",
    collecting: "لاگ‌های سیستم، SSH، فایروال و سرویس‌های انتخاب‌شده جمع‌آوری می‌شوند.",
    events: "رویدادهای دریافت‌شده",
    lastEvent: "آخرین رویداد",
    storage: "ذخیره‌سازی",
    start: "شروع پایش",
    stop: "توقف پایش",
    results: "۳. نتایج",
    what: "چه اتفاقی افتاده؟",
    analysisFound: "تحلیل پیدا کرد",
    issues: "مورد",
    eventsAnalyzed: "رویداد تحلیل شد",
    noFindings: "هنوز ریسکی پیدا نشده است. پایش را شروع کنید یا بعد از رسیدن لاگ‌ها تحلیل را اجرا کنید.",
    analyze: "تحلیل",
    analyzing: "در حال تحلیل...",
    analyzed: "تحلیل محلی انجام شد.",
    aiUnavailable: "توضیح AI در دسترس نیست. تحلیل محلی همچنان آماده است.",
    backendDown: "Backend در دسترس نیست. API server را بررسی کنید.",
    problem: "مشکل",
    matters: "چرا مهم است",
    evidence: "خلاصه شواهد",
    count: "تعداد",
    fix: "اقدام پیشنهادی",
    action: "ساخت ActionPlan",
    technical: "نمایش شواهد فنی",
    advanced: "جزئیات پیشرفته",
    rawStream: "جریان خام رویدادها",
    sources: "منابع پیشرفته",
    warnings: "هشدارهای ذخیره‌سازی و جریان",
    sourcePreset: "الگوی منابع",
    selectedSources: "منابع انتخاب‌شده",
    debug: "شمارنده‌های Backend"
  }
};

export function isLinuxTelemetryDevice(device: Device) {
  const vendor = String(device.vendor ?? "").toLowerCase();
  const type = String(device.type ?? "").toLowerCase();
  const capabilities = JSON.stringify(device.capabilities ?? {}).toLowerCase();
  return (vendor === "linux" || vendor.includes("ubuntu") || vendor.includes("linux") || type === "linux" || type === "linux_edge" || capabilities.includes("linux")) && (device.protocol === "ssh" || capabilities.includes("ssh"));
}

export function smartMonitoringSources(options: LinuxTelemetryOptions | null, snapshot: LinuxSnapshot | null) {
  const available = options?.logSourcesAvailable ?? allSources;
  const selected = new Set(sourcesForPreset("essential", available));
  if (snapshot?.containers?.dockerDetected) selected.add("docker");
  const services = snapshot?.services?.importantServices ?? {};
  if ([services.nginx, services.apache2].some((value) => value === "detected")) selected.add("nginx");
  return Array.from(selected).filter((source) => available.includes(source));
}

type ResultCard = {
  id: string;
  severity: string;
  title: string;
  explanation: string;
  evidence: string[];
  count: number;
  recommendedFix: string;
  technicalEvidence: string[];
  createAction: () => void;
  actionDisabled: boolean;
};

export default function LinuxTelemetryPanel() {
  const { i18n } = useTranslation();
  const text = i18n.language?.startsWith("fa") ? copy.fa : copy.en;
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [snapshot, setSnapshot] = useState<LinuxSnapshot | null>(null);
  const [options, setOptions] = useState<LinuxTelemetryOptions | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>(["auth", "system", "firewall", "kernel"]);
  const [streamId, setStreamId] = useState("");
  const [events, setEvents] = useState<LinuxLiveEvent[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [vendorFindings, setVendorFindings] = useState<VendorFinding[]>([]);
  const [storageStatus, setStorageStatus] = useState<LinuxTelemetryStorageStatus | null>(null);
  const [analysis, setAnalysis] = useState<LinuxTelemetryAnalysis | null>(null);
  const [createdActions, setCreatedActions] = useState<Record<string, string>>({});
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const currentDeviceRef = useRef(deviceId);
  currentDeviceRef.current = deviceId;

  useEffect(() => {
    listDevices().then((items) => {
      const linux = items.filter(isLinuxTelemetryDevice).sort((a, b) => Number(b.status === "online") - Number(a.status === "online"));
      const remembered = sessionStorage.getItem("linuxTelemetryDeviceId");
      setDevices(linux);
      setDeviceId((current) => current || (remembered && linux.some((item) => item.id === remembered) ? remembered : linux[0]?.id ?? ""));
    }).catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    sessionStorage.setItem("linuxTelemetryDeviceId", deviceId);
    setSnapshot(null);
    setEvents([]);
    setWarnings([]);
    setAnalysis(null);
    Promise.allSettled([linuxTelemetryOptions(deviceId), latestLinuxSnapshot(deviceId), linuxStreamStatus(deviceId), listDeviceFindings(deviceId), linuxTelemetryStorageStatus(deviceId)]).then(([optionResult, snapshotResult, statusResult, findingResult, storageResult]) => {
      if (currentDeviceRef.current !== deviceId) return;
      if (optionResult.status === "fulfilled") setOptions(optionResult.value);
      if (snapshotResult.status === "fulfilled") setSnapshot(snapshotResult.value.snapshot);
      if (findingResult.status === "fulfilled") setVendorFindings(findingResult.value);
      if (storageResult.status === "fulfilled") setStorageStatus(storageResult.value);
      if (statusResult.status === "fulfilled" && statusResult.value.status === "running" && statusResult.value.streamId) {
        setStreamId(statusResult.value.streamId);
        setSelectedSources(statusResult.value.sources);
        setWarnings(statusResult.value.warnings);
      }
    });
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId || !streamId) return;
    return subscribeLinuxStream(deviceId, streamId, (event) => {
      setEvents((current) => [...current.slice(-499), event]);
      setStorageStatus((current) => current ? { ...current, eventCount: Math.min(current.eventCount + 1, current.maxEventCountPerDevice), newestEventTime: event.timestamp } : current);
      window.setTimeout(() => { void linuxTelemetryStorageStatus(deviceId).then(setStorageStatus).catch(() => undefined); }, 250);
    }, () => setMessage(text.error), (warning) => setWarnings((current) => Array.from(new Set([...current, warning])).slice(-20)), (finding) => setVendorFindings((current) => [finding, ...current.filter((item) => item.id !== finding.id)]));
  }, [deviceId, streamId, text.error]);

  const liveFindings = useMemo(() => buildLiveFindings(events, snapshot), [events, snapshot]);
  const selectedDevice = devices.find((device) => device.id === deviceId);
  const connectionHost = options?.connection.host ?? snapshot?.connection.host ?? selectedDevice?.host ?? "unknown";
  const connectionPort = options?.connectionPort ?? snapshot?.connection.connectionPort ?? selectedDevice?.managementPort ?? 22;
  const lastEventTime = events.at(-1)?.timestamp ?? storageStatus?.newestEventTime ?? null;
  const lastChecked = analysis?.lastAnalyzedAt ?? options?.lastSnapshotAt ?? storageStatus?.newestEventTime ?? null;
  const connected = (options?.connectionStatus ?? selectedDevice?.status ?? "unknown") === "online";
  const streamState = working === "monitor" || streamId ? "running" : message === text.error ? "error" : "stopped";

  const resultCards: ResultCard[] = useMemo(() => {
    if (vendorFindings.length) return vendorFindings.slice(0, 12).map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      title: finding.title,
      explanation: humanExplanation(finding.title, finding.summary),
      evidence: finding.evidence.slice(0, 2),
      count: finding.count,
      recommendedFix: finding.recommendedActions[0]?.intent ?? "Review this finding and create a controlled remediation plan.",
      technicalEvidence: finding.evidence,
      createAction: () => void createVendorFindingAction(finding),
      actionDisabled: Boolean(createdActions[finding.id]) || working === `action:${finding.id}`
    }));
    return liveFindings.slice(0, 12).map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      title: finding.title,
      explanation: humanExplanation(finding.title, finding.evidence[0] ?? ""),
      evidence: finding.evidence.slice(0, 2),
      count: finding.count,
      recommendedFix: finding.recommendedFix,
      technicalEvidence: finding.evidence,
      createAction: () => void createFixAction(finding),
      actionDisabled: Boolean(createdActions[finding.id]) || working === `action:${finding.id}` || !finding.actionable
    }));
  }, [vendorFindings, liveFindings, createdActions, working]);

  const collectBaseline = async () => {
    const result = await collectLinuxSnapshot(deviceId);
    setSnapshot(result.snapshot);
    setOptions(await linuxTelemetryOptions(deviceId));
  };
  const startMonitoring = async () => {
    setWorking("monitor");
    setMessage("");
    setWarnings([]);
    const smartSources = smartMonitoringSources(options, snapshot);
    setSelectedSources(smartSources);
    try {
      const result = await startLinuxStream(deviceId, smartSources);
      setStreamId(result.streamId);
      setWarnings(result.warnings ?? []);
      const last = options?.lastSnapshotAt ? new Date(options.lastSnapshotAt).getTime() : 0;
      if (!snapshot || Date.now() - last > 15 * 60_000) void collectBaseline().catch((error) => setWarnings((current) => [...current, `Baseline: ${error instanceof Error ? error.message : "failed"}`]));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.error);
    } finally {
      setWorking("");
    }
  };
  const stopMonitoring = async () => {
    if (!streamId) return;
    setWorking("stop");
    try {
      await stopLinuxStream(deviceId, streamId);
      setStreamId("");
      setStorageStatus(await linuxTelemetryStorageStatus(deviceId));
    } finally {
      setWorking("");
    }
  };
  const createFixAction = async (finding: LiveFinding) => {
    setWorking(`action:${finding.id}`);
    try {
      const plan = await proposeAction(buildFixActionProposal(finding, deviceId));
      setCreatedActions((current) => ({ ...current, [finding.id]: plan.id }));
      publishActionPlanCreated(plan.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ActionPlan creation failed");
    } finally {
      setWorking("");
    }
  };
  const createVendorFindingAction = async (finding: VendorFinding) => {
    setWorking(`action:${finding.id}`);
    try {
      const result = await createFindingActionPlan(finding.id, finding.recommendedActions[0]?.intent);
      setCreatedActions((current) => ({ ...current, [finding.id]: result.actionPlan.id }));
      publishActionPlanCreated(result.actionPlan.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ActionPlan creation failed");
    } finally {
      setWorking("");
    }
  };
  const analyzeLive = async () => {
    setWorking("analyze");
    setMessage("");
    try {
      const result = await analyzeLinuxSnapshot(deviceId);
      setAnalysis(result);
      setVendorFindings(result.findings);
      setStorageStatus(await linuxTelemetryStorageStatus(deviceId));
      setMessage(result.aiAvailable ? text.analyzed : `${text.analyzed} ${text.aiUnavailable}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      setMessage(/Failed to fetch|NetworkError/i.test(detail) ? text.backendDown : (detail || text.backendDown));
    } finally {
      setWorking("");
    }
  };

  if (!deviceId) return <section className="text-left"><h2 className="text-lg font-semibold text-zinc-100">{text.title}</h2><p className="mt-4 border-y border-zinc-800 py-8 text-center text-sm text-zinc-500">{text.noDevice}</p></section>;
  return <section className="text-left">
    <div className="mb-5 flex items-start gap-3"><Activity className="mt-0.5 h-5 w-5 text-cyan-300"/><div><h2 className="text-lg font-semibold text-zinc-100">{text.title}</h2><p className="max-w-3xl text-sm text-zinc-400">{text.subtitle}</p></div></div>
    <div className="grid gap-4 lg:grid-cols-3">
      <StepCard title={text.connection} tone={connected ? "good" : "warn"} icon={connected ? CheckCircle2 : AlertTriangle}>
        <label className="block text-xs text-zinc-500">{text.device}<select value={deviceId} onChange={(event) => { setStreamId(""); setDeviceId(event.target.value); }} className="mt-1 h-10 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100">{devices.map((device) => <option key={device.id} value={device.id}>{device.name} ({device.host})</option>)}</select></label>
        <BigStatus value={connected ? text.connected : text.notConnected} tone={connected ? "good" : "warn"}/>
        <Status label={text.ipPort} value={`${connectionHost}:${connectionPort}`}/>
        <Status label={text.checked} value={lastChecked ? new Date(lastChecked).toLocaleString() : text.never}/>
      </StepCard>
      <StepCard title={text.monitoring} tone={streamState === "running" ? "good" : streamState === "error" ? "bad" : "neutral"} icon={streamState === "running" ? Activity : streamState === "error" ? AlertTriangle : Square}>
        <BigStatus value={streamState === "running" ? text.running : streamState === "error" ? text.error : text.stopped} tone={streamState === "running" ? "good" : streamState === "error" ? "bad" : "neutral"}/>
        <p className="text-sm text-zinc-400">{text.collecting}</p>
        <Status label={text.events} value={String(events.length)}/>
        <Status label={text.lastEvent} value={lastEventTime ? new Date(lastEventTime).toLocaleString() : text.never}/>
        <Status label={text.storage} value={storageStatus ? `${(storageStatus.bytesUsed / 1024 / 1024).toFixed(2)} MB of ${(storageStatus.maxBytesPerDevice / 1024 / 1024).toFixed(0)} MB used` : text.never}/>
        {!streamId ? <button type="button" onClick={startMonitoring} disabled={Boolean(working)} className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded border border-green-800 bg-green-950/30 px-3 text-sm font-semibold text-green-100 disabled:opacity-50"><Play className="h-4 w-4"/>{text.start}</button> : <button type="button" onClick={stopMonitoring} disabled={Boolean(working)} className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded border border-red-900 bg-red-950/20 px-3 text-sm font-semibold text-red-100 disabled:opacity-50"><Square className="h-4 w-4"/>{text.stop}</button>}
      </StepCard>
      <StepCard title={text.results} tone={resultCards.length ? "warn" : "neutral"} icon={resultCards.length ? AlertTriangle : Bot}>
        <div className="flex items-center justify-between gap-3"><div><BigStatus value={resultCards.length ? `${text.analysisFound} ${resultCards.length} ${text.issues}` : text.what} tone={resultCards.length ? "warn" : "neutral"}/><p className="text-xs text-zinc-500">{analysis ? `${analysis.counts.analyzedEvents} ${text.eventsAnalyzed}` : text.what}</p></div><button type="button" onClick={analyzeLive} disabled={working === "analyze"} className="inline-flex h-9 items-center gap-1.5 rounded border border-cyan-900 px-3 text-xs font-semibold text-cyan-100 disabled:opacity-40"><Bot className="h-3.5 w-3.5"/>{working === "analyze" ? text.analyzing : text.analyze}</button></div>
        {message && <p className="mt-3 rounded border border-yellow-900/40 bg-yellow-950/10 px-3 py-2 text-xs text-yellow-100" role="status">{message}</p>}
      </StepCard>
    </div>
    <section className="mt-5 border-t border-zinc-800 pt-4">
      <h3 className="text-base font-semibold text-zinc-100">{text.what}</h3>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">{resultCards.length ? resultCards.map((finding) => <FindingCard key={finding.id} finding={finding} labels={text}/>) : <p className="border-y border-zinc-800 py-8 text-center text-sm text-zinc-500 lg:col-span-2">{text.noFindings}</p>}</div>
    </section>
    <details open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)} className="mt-5 border-t border-zinc-800 pt-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-zinc-200"><ChevronDown className="h-4 w-4"/>{text.advanced}</summary>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="border-t border-zinc-800 pt-3"><h4 className="text-xs font-semibold uppercase text-zinc-500">{text.sources}</h4><p className="mt-2 text-xs text-zinc-500">{text.selectedSources}: {selectedSources.join(", ") || "none"}</p><div className="mt-3 grid grid-cols-2 gap-2">{(options?.logSourcesAvailable ?? allSources).map((source) => <label key={source} className="flex items-center gap-1.5 text-xs text-zinc-400"><input type="checkbox" disabled={Boolean(streamId)} checked={selectedSources.includes(source)} onChange={() => setSelectedSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source])}/>{source}</label>)}</div><div className="mt-3 flex flex-wrap gap-2">{(Object.keys(presetLabels) as SourcePreset[]).map((preset) => <button key={preset} type="button" disabled={Boolean(streamId)} onClick={() => setSelectedSources(sourcesForPreset(preset, options?.logSourcesAvailable ?? allSources))} className="h-8 rounded border border-zinc-800 px-2 text-xs text-zinc-300 disabled:opacity-40">{presetLabels[preset]}</button>)}</div></div>
        <div className="border-t border-zinc-800 pt-3"><h4 className="text-xs font-semibold uppercase text-zinc-500">{text.debug}</h4><Status label={text.servicePort} value={String(options?.detectedSshServicePort ?? snapshot?.ssh.detectedSshServicePort ?? "not collected")}/><Status label="Stored events" value={storageStatus ? `${storageStatus.eventCount} of ${storageStatus.maxEventCountPerDevice}` : "unknown"}/><Status label="Oldest event" value={storageStatus?.oldestEventTime ? new Date(storageStatus.oldestEventTime).toLocaleString() : "none"}/>{warnings.length > 0 && <div className="mt-3"><h5 className="text-xs text-yellow-200">{text.warnings}</h5>{warnings.map((warning, index) => <p key={`${warning}-${index}`} className="mt-1 text-xs text-yellow-100/80">{warning}</p>)}</div>}</div>
        <div className="border-t border-zinc-800 pt-3"><h4 className="text-xs font-semibold uppercase text-zinc-500">{text.rawStream}</h4><div className="mt-2 max-h-80 overflow-auto border-y border-zinc-800 font-mono text-xs">{events.length ? events.slice(-80).map((event, index) => <div key={`${event.timestamp}-${index}`} className={`border-b border-zinc-900 px-2 py-2 ${event.suspicious ? "bg-red-950/10" : ""}`}><div className="flex flex-wrap gap-2"><span className="text-zinc-600">{new Date(event.timestamp).toLocaleTimeString()}</span><span className="text-cyan-300">{event.source}</span><span className={severityClass[event.severity]?.split(" ").at(-1)}>{event.severity}</span></div><p className="mt-1 text-zinc-300">{event.summary}</p><details className="mt-1"><summary className="cursor-pointer text-zinc-600">{text.technical}</summary><pre className="mt-1 whitespace-pre-wrap break-words text-zinc-500">{event.raw}</pre></details></div>) : <p className="px-3 py-8 text-center text-zinc-600">{text.noFindings}</p>}</div></div>
      </div>
    </details>
  </section>;
}

function humanExplanation(title: string, fallback: string) {
  if (/ssh.*password|password.*ssh/i.test(title)) return "This server allows SSH password login. This increases brute-force risk.";
  if (/ssh.*authentication|failed password|invalid user/i.test(title)) return "Repeated failed logins can mean someone is trying to guess server credentials.";
  if (/root/i.test(title)) return "Direct root access makes a successful login more dangerous.";
  if (/fail2ban/i.test(title)) return "Login attacks are not being automatically slowed down by fail2ban.";
  if (/nginx|apache|5xx|web/i.test(title)) return "Web errors can indicate an outage, attack traffic, or a broken service.";
  return fallback || "This finding can affect the security or reliability of the server.";
}

function StepCard({ title, tone, icon: Icon, children }: { title: string; tone: "good" | "warn" | "bad" | "neutral"; icon: typeof Activity; children: ReactNode }) {
  const color = tone === "good" ? "border-green-900/70" : tone === "bad" ? "border-red-900/70" : tone === "warn" ? "border-yellow-900/70" : "border-zinc-800";
  return <section className={`border-t ${color} pt-4`}><div className="mb-3 flex items-center gap-2"><Icon className="h-4 w-4 text-cyan-300"/><h3 className="text-sm font-semibold text-zinc-100">{title}</h3></div><div className="space-y-3">{children}</div></section>;
}

function BigStatus({ value, tone }: { value: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  const color = tone === "good" ? "text-green-200" : tone === "bad" ? "text-red-200" : tone === "warn" ? "text-yellow-100" : "text-zinc-100";
  return <p className={`text-xl font-semibold ${color}`}>{value}</p>;
}

function Status({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-zinc-600">{label}</dt><dd className="mt-0.5 break-words text-sm text-zinc-300">{value}</dd></div>;
}

function FindingCard({ finding, labels }: { finding: ResultCard; labels: typeof copy.en }) {
  return <article className="border-t border-zinc-800 pt-3">
    <div className="flex flex-wrap items-center gap-2"><span className={`rounded border px-2 py-0.5 text-[11px] ${severityClass[finding.severity]}`}>{finding.severity}</span><span className="text-[11px] text-zinc-500">{labels.count} {finding.count}</span></div>
    <h4 className="mt-2 text-sm font-semibold text-zinc-100">{finding.title}</h4>
    <dl className="mt-2 space-y-2 text-sm"><div><dt className="text-xs text-zinc-500">{labels.problem}</dt><dd className="text-zinc-300">{finding.title}</dd></div><div><dt className="text-xs text-zinc-500">{labels.matters}</dt><dd className="text-zinc-300">{finding.explanation}</dd></div><div><dt className="text-xs text-zinc-500">{labels.evidence}</dt><dd className="text-zinc-300">{finding.evidence.length ? finding.evidence.join(" ") : "Evidence is available in the technical view."}</dd></div><div><dt className="text-xs text-zinc-500">{labels.fix}</dt><dd className="text-cyan-100/90">{finding.recommendedFix}</dd></div></dl>
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={finding.createAction} disabled={finding.actionDisabled} className="inline-flex h-8 items-center gap-1.5 rounded border border-blue-900 px-2 text-xs text-blue-200 disabled:opacity-40"><Wrench className="h-3.5 w-3.5"/>{labels.action}</button><details className="text-xs text-zinc-400"><summary className="h-8 cursor-pointer rounded border border-zinc-800 px-2 py-2">{labels.technical}</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words border-y border-zinc-800 py-2 text-zinc-500">{finding.technicalEvidence.join("\n")}</pre></details></div>
  </article>;
}
