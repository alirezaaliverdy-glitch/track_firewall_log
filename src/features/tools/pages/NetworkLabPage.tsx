import { Activity, CheckCircle2, History, LoaderCircle, RadioTower, RefreshCw, Server, Unplug, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { listDevices, type Device } from "@/lib/devices";
import { listNetworkProbes, runNetworkProbe, type NetworkProbe } from "@/lib/diagnostics";
import "./NetworkLabPage.css";

const labels: Record<NetworkProbe["status"], string> = { reachable: "در دسترس", unreachable: "بدون پاسخ", open: "پورت باز است", closed: "پورت بسته است", timeout: "پایان مهلت", error: "خطای اجرا" };
const tone = (item: NetworkProbe) => ["reachable", "open"].includes(item.status) ? "success" : ["unreachable", "closed"].includes(item.status) ? "danger" : "warning";
const value = (number: number | null, suffix = "") => number === null ? "—" : `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(number)}${suffix}`;

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
  const [error, setError] = useState("");
  const selected = useMemo(() => devices.find((item) => item.id === deviceId), [devices, deviceId]);

  const refresh = async () => {
    try {
      const [inventory, records] = await Promise.all([listDevices(), listNetworkProbes()]);
      setDevices(inventory); setHistory(records.probes); setActive((old) => old ?? records.probes[0] ?? null);
      if (!deviceId && inventory[0]) { setDeviceId(inventory[0].id); setPort(String(inventory[0].managementPort)); }
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "دریافت اطلاعات ناموفق بود."); }
  };
  useEffect(() => { void refresh(); }, []);

  const run = async () => {
    setBusy(true); setError("");
    try {
      const { probe } = await runNetworkProbe({ kind, ...(source === "asset" ? { deviceId } : { target }), ...(kind === "tcp" ? { port: Number(port) } : { attempts }) });
      setActive(probe); setHistory((items) => [probe, ...items.filter((item) => item.id !== probe.id)]);
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      setError(({ TARGET_REQUIRED: "مقصد را وارد کنید.", TARGET_INVALID: "IP یا نام میزبان معتبر نیست.", PORT_INVALID: "پورت باید بین ۱ تا ۶۵۵۳۵ باشد.", DEVICE_NOT_FOUND: "دارایی در دسترس نیست." } as Record<string, string>)[code] ?? code ?? "اجرای تست ناموفق بود.");
    } finally { setBusy(false); }
  };

  return <section className="page-stack network-lab" dir="rtl">
    <PageHeader eyebrow="NETWORK LAB" title="آزمایشگاه شبکه" description="Ping واقعی دارایی‌ها و بررسی پورت TCP، مستقیم از سرور برنامه."
      actions={<button className="network-lab__refresh" onClick={() => void refresh()}><RefreshCw/>به‌روزرسانی</button>} />
    <section className="network-lab__hero"><div className="network-lab__radar"><i/><i/><i/><RadioTower/></div><div><span>● تست زنده Backend</span><h2>از دارایی ثبت‌شده تا IP دلخواه</h2><p>زمان پاسخ، Packet loss و نتیجه هر اجرا در تاریخچه حساب شما ثبت می‌شود.</p></div><aside><b>{devices.length.toLocaleString("fa-IR")}</b> دارایی <b>{history.length.toLocaleString("fa-IR")}</b> تست اخیر</aside></section>
    <div className="network-lab__grid">
      <section className="network-lab__card">
        <header><Activity/><div><h2>ساخت تست جدید</h2><p>نوع بررسی و مقصد را انتخاب کنید.</p></div></header>
        <div className="network-lab__modes">
          <button className={kind === "icmp" ? "active" : ""} onClick={() => setKind("icmp")}><Wifi/><span><b>ICMP Ping</b><small>دسترسی و کیفیت پاسخ</small></span></button>
          <button className={kind === "tcp" ? "active" : ""} onClick={() => setKind("tcp")}><Unplug/><span><b>TCP Port</b><small>باز بودن سرویس</small></span></button>
        </div>
        <div className="network-lab__tabs"><button className={source === "asset" ? "active" : ""} onClick={() => setSource("asset")}><Server/>دارایی ثبت‌شده</button><button className={source === "custom" ? "active" : ""} onClick={() => setSource("custom")}><RadioTower/>مقصد دلخواه</button></div>
        {source === "asset" ? <label><span>دارایی</span><select value={deviceId} onChange={(event) => { setDeviceId(event.target.value); const item = devices.find((device) => device.id === event.target.value); if (item) setPort(String(item.managementPort)); }}><option value="">انتخاب کنید</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.host} · {device.company?.name ?? "بدون شرکت"}</option>)}</select>{selected && <small>{selected.vendor} · {selected.protocol.toUpperCase()} · پورت مدیریت {selected.managementPort.toLocaleString("fa-IR")}</small>}</label> :
          <label><span>IP یا نام میزبان</span><input dir="ltr" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="192.168.1.1 یا server.example.com"/><small>URL، رنج شبکه و دستور Shell پذیرفته نمی‌شود.</small></label>}
        {kind === "tcp" ? <label><span>پورت مقصد</span><input dir="ltr" type="number" min="1" max="65535" value={port} onChange={(event) => setPort(event.target.value)}/><div className="network-lab__chips">{[22, 53, 80, 443, 3389].map((item) => <button className={port === String(item) ? "active" : ""} onClick={() => setPort(String(item))} key={item}>{item}</button>)}</div></label> :
          <label><span>تعداد درخواست</span><div className="network-lab__chips">{[2, 4, 6].map((item) => <button className={attempts === item ? "active" : ""} onClick={() => setAttempts(item)} key={item}>{item.toLocaleString("fa-IR")} بسته</button>)}</div><small>ICMP پورت ندارد؛ برای پورت مشخص، TCP Port را انتخاب کنید.</small></label>}
        {error && <p className="network-lab__error">{error}</p>}
        <button className="network-lab__run" disabled={busy || (source === "asset" ? !deviceId : !target.trim())} onClick={() => void run()}>{busy ? <LoaderCircle className="is-spin"/> : <Activity/>}{busy ? "در حال اجرا…" : kind === "icmp" ? "اجرای Ping" : "بررسی پورت"}</button>
      </section>
      <aside className="network-lab__card network-lab__result"><header><RadioTower/><div><h2>نتیجه زنده</h2><p>آخرین پاسخ ثبت‌شده</p></div></header>
        {!active ? <div className="network-lab__empty"><RadioTower/><h3>آماده دریافت نتیجه</h3><p>یک مقصد انتخاب و تست را اجرا کنید.</p></div> :
        <div className={`network-lab__result-box ${tone(active)}`}><div className="network-lab__status">{active.reachable ? <CheckCircle2/> : <Unplug/>}<span><small>{active.kind === "icmp" ? "ICMP PING" : `TCP · PORT ${active.port}`}</small><b>{labels[active.status]}</b></span></div><div className="network-lab__target" dir="ltr"><b>{active.displayName}</b><span>{active.target}{active.port ? `:${active.port}` : ""}</span></div><div className="network-lab__metrics"><article><span>میانگین پاسخ</span><b>{value(active.latencyMs, " ms")}</b></article><article><span>Packet loss</span><b>{value(active.packetLossPercent, "%")}</b></article><article><span>موفق</span><b>{active.successfulAttempts.toLocaleString("fa-IR")} / {active.attempts.toLocaleString("fa-IR")}</b></article></div></div>}
      </aside>
    </div>
    <section className="network-lab__card network-lab__history"><header><History/><div><h2>تاریخچه تست‌ها</h2><p>۳۰ اجرای آخر حساب شما</p></div></header>{!history.length ? <p>هنوز تستی اجرا نشده است.</p> : <div>{history.map((item) => <button key={item.id} className={active?.id === item.id ? "active" : ""} onClick={() => setActive(item)}><i className={tone(item)}/><span><b>{item.displayName}</b><small dir="ltr">{item.target}{item.port ? `:${item.port}` : ""}</small></span><em>{item.kind.toUpperCase()}</em><strong>{labels[item.status]}</strong><strong>{value(item.latencyMs, " ms")}</strong><time>{new Date(item.createdAt).toLocaleString("fa-IR")}</time></button>)}</div>}</section>
  </section>;
}
