import { Activity, CheckCircle2, History, LoaderCircle, RadioTower, Server, Trash2, Unplug, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { listDevices, type Device } from "@/lib/devices";
import { clearNetworkProbes as clearNetworkProbeHistory, listNetworkProbes, runNetworkProbe, type NetworkProbe } from "@/lib/diagnostics";
import "./NetworkLabPage.css";

const labels: Record<NetworkProbe["status"], string> = { reachable: "در دسترس", unreachable: "بدون پاسخ", open: "پورت باز", closed: "پورت بسته", timeout: "مهلت تمام شد", error: "خطای اجرا" };
const tone = (item: NetworkProbe) => ["reachable", "open"].includes(item.status) ? "success" : ["unreachable", "closed"].includes(item.status) ? "danger" : "warning";
const number = (input: number | null, suffix = "") => input === null ? "—" : `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(input)}${suffix}`;

export default function NetworkLabPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [history, setHistory] = useState<NetworkProbe[]>([]);
  const [kind, setKind] = useState<"icmp" | "tcp">("icmp");
  const [source, setSource] = useState<"asset" | "custom">("asset");
  const [deviceId, setDeviceId] = useState("");
  const [target, setTarget] = useState("");
  const [port, setPort] = useState("443");
  const [attempts, setAttempts] = useState(4);
  const [active, setActive] = useState<NetworkProbe | null>(null);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState("");
  const selected = useMemo(() => devices.find((item) => item.id === deviceId), [devices, deviceId]);

  useEffect(() => {
    void Promise.all([listDevices(), listNetworkProbes()]).then(([inventory, records]) => {
      setDevices(inventory);
      setHistory(records.probes);
      setActive(records.probes[0] ?? null);
      if (inventory[0]) { setDeviceId(inventory[0].id); setPort(String(inventory[0].managementPort)); }
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "دریافت اطلاعات ناموفق بود."));
  }, []);

  const run = async () => {
    setBusy(true); setError("");
    try {
      const { probe } = await runNetworkProbe({ kind, ...(source === "asset" ? { deviceId } : { target }), ...(kind === "tcp" ? { port: Number(port) } : { attempts }) });
      setActive(probe);
      setHistory((items) => [probe, ...items.filter((item) => item.id !== probe.id)].slice(0, 30));
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      setError(({ TARGET_REQUIRED: "مقصد را وارد کنید.", TARGET_INVALID: "IP یا نام میزبان معتبر نیست.", PORT_INVALID: "پورت باید بین ۱ تا ۶۵۵۳۵ باشد.", DEVICE_NOT_FOUND: "این دارایی در دسترس نیست." } as Record<string, string>)[code] ?? code ?? "اجرای تست ناموفق بود.");
    } finally { setBusy(false); }
  };

  const clearHistory = async () => {
    setClearing(true); setError("");
    try {
      await clearNetworkProbeHistory();
      setHistory([]); setActive(null); setConfirmClear(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "حذف تاریخچه ناموفق بود."); }
    finally { setClearing(false); }
  };

  return <section className="page-stack network-lab" dir="rtl">
    <PageHeader title="آزمایشگاه شبکه" description="Ping و بررسی پورت از داخل شبکه" />

    <div className="network-lab__grid">
      <section className="network-lab__card network-lab__form">
        <header><Activity/><h2>تست جدید</h2></header>
        <div className="network-lab__modes">
          <button type="button" className={kind === "icmp" ? "active" : ""} onClick={() => setKind("icmp")}><Wifi/><span><b>Ping</b><small>ICMP</small></span></button>
          <button type="button" className={kind === "tcp" ? "active" : ""} onClick={() => setKind("tcp")}><Unplug/><span><b>بررسی پورت</b><small>TCP</small></span></button>
        </div>
        <div className="network-lab__tabs">
          <button type="button" className={source === "asset" ? "active" : ""} onClick={() => setSource("asset")}><Server/>دارایی‌ها</button>
          <button type="button" className={source === "custom" ? "active" : ""} onClick={() => setSource("custom")}><RadioTower/>IP یا Host</button>
        </div>
        {source === "asset" ? <label><span>دارایی</span><select value={deviceId} onChange={(event) => { setDeviceId(event.target.value); const item = devices.find((device) => device.id === event.target.value); if (item) setPort(String(item.managementPort)); }}><option value="">انتخاب کنید</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.host}</option>)}</select>{selected && <small>{selected.company?.name ?? "بدون شرکت"} · {selected.vendor} · {selected.managementPort.toLocaleString("fa-IR")}</small>}</label> :
          <label><span>IP یا نام میزبان</span><input dir="ltr" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="192.168.1.1"/></label>}
        {kind === "tcp" ? <label><span>پورت</span><input dir="ltr" type="number" min="1" max="65535" value={port} onChange={(event) => setPort(event.target.value)}/><div className="network-lab__chips">{[22, 53, 80, 443, 3389].map((item) => <button type="button" className={port === String(item) ? "active" : ""} onClick={() => setPort(String(item))} key={item}>{item}</button>)}</div></label> :
          <label><span>تعداد Packet</span><div className="network-lab__chips">{[2, 4, 6].map((item) => <button type="button" className={attempts === item ? "active" : ""} onClick={() => setAttempts(item)} key={item}>{item.toLocaleString("fa-IR")}</button>)}</div></label>}
        {error && <p className="network-lab__error">{error}</p>}
        <button type="button" className="network-lab__run" disabled={busy || (source === "asset" ? !deviceId : !target.trim())} onClick={() => void run()}>{busy ? <LoaderCircle className="is-spin"/> : <Activity/>}{busy ? "در حال تست…" : kind === "icmp" ? "شروع Ping" : "بررسی پورت"}</button>
      </section>

      <section className="network-lab__card network-lab__result">
        <header><RadioTower/><h2>نتیجه</h2>{active && <span className={`network-lab__badge ${tone(active)}`}>{labels[active.status]}</span>}</header>
        {!active ? <div className="network-lab__empty"><RadioTower/><span>مقصد را انتخاب و تست را اجرا کنید</span></div> : <>
          <div className="network-lab__result-head"><div dir="ltr"><b>{active.target}{active.port ? `:${active.port}` : ""}</b><small>{active.displayName}</small></div>{active.reachable ? <CheckCircle2/> : <Unplug/>}</div>
          <div className="network-lab__metrics"><article><span>میانگین</span><b>{number(active.latencyMs, " ms")}</b></article><article><span>Packet loss</span><b>{number(active.packetLossPercent, "%")}</b></article><article><span>دریافت</span><b>{active.successfulAttempts.toLocaleString("fa-IR")} / {active.attempts.toLocaleString("fa-IR")}</b></article></div>
          <div className="network-lab__console" dir="ltr">
            <div className="network-lab__console-bar"><i/><i/><i/><span>{active.kind === "icmp" ? `ping ${active.target}` : `tcp ${active.target}:${active.port}`}</span></div>
            <div className="network-lab__console-body">
              {active.kind === "icmp" ? <>
                <p>Pinging {active.target} with {active.attempts} packets:</p>
                {active.packets.length ? active.packets.map((packet) => packet.status === "reply" ? <p className="reply" key={packet.sequence}><span>[{packet.sequence}]</span> Reply from {packet.address || active.target}: bytes={packet.bytes} time={packet.timeMs}ms TTL={packet.ttl}</p> : <p className="timeout" key={packet.sequence}><span>[{packet.sequence}]</span> Request timed out.</p>) : <p className="muted">Packet details are not available for this older test.</p>}
                <p className="summary">Sent = {active.attempts}, Received = {active.successfulAttempts}, Lost = {active.attempts - active.successfulAttempts} ({active.packetLossPercent ?? 0}% loss)</p>
              </> : <><p>Connecting to {active.target}:{active.port} ...</p><p className={active.reachable ? "reply" : "timeout"}>{active.reachable ? `Connected in ${active.latencyMs}ms.` : labels[active.status]}</p></>}
            </div>
          </div>
        </>}
      </section>
    </div>

    <section className="network-lab__card network-lab__history">
      <header><History/><div><h2>تاریخچه</h2><small>{history.length.toLocaleString("fa-IR")} تست</small></div>{history.length > 0 && <button type="button" className="network-lab__clear" onClick={() => setConfirmClear(true)}><Trash2/>پاک‌کردن</button>}</header>
      {confirmClear && <div className="network-lab__confirm"><span>همه تاریخچه تست‌های شما پاک شود؟</span><button type="button" onClick={() => void clearHistory()} disabled={clearing}>{clearing ? "در حال حذف…" : "بله، پاک شود"}</button><button type="button" onClick={() => setConfirmClear(false)} disabled={clearing}>انصراف</button></div>}
      {!history.length ? <div className="network-lab__history-empty">تاریخچه‌ای وجود ندارد</div> : <div className="network-lab__history-list">{history.map((item) => <button type="button" key={item.id} className={active?.id === item.id ? "active" : ""} onClick={() => setActive(item)}><i className={tone(item)}/><span><b>{item.displayName}</b><small dir="ltr">{item.target}{item.port ? `:${item.port}` : ""}</small></span><em>{item.kind.toUpperCase()}</em><strong>{labels[item.status]}</strong><strong>{number(item.latencyMs, " ms")}</strong><time>{new Date(item.createdAt).toLocaleString("fa-IR")}</time></button>)}</div>}
    </section>
  </section>;
}
