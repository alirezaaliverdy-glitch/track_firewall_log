import { AlertTriangle, AppWindow, Cable, CheckCircle2, CircleDot, Cpu, LoaderCircle, Network, Pencil, Play, Plus, Power, PowerOff, Radio, RefreshCw, RotateCcw, Router, Save, Server, ShieldAlert, ShieldCheck, Unplug, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { normalizeArray, normalizeObject, quickExecuteAction, type ActionPlan } from "@/lib/actions";
import { createCatalogAction } from "@/lib/commandCatalog";
import { clearPortConnection, clearServiceEndpoint, discoverPortTopology, listPortTopology, refreshLinuxServicePorts, savePortConnection, saveServiceEndpoint, type PortMapDevice, type PortMapPort, type ServiceEndpoint } from "@/lib/portTopology";
import "./PortTopologyPage.css";

type Draft = Partial<PortMapPort> & { name: string };
type DisplayPort = PortMapPort & { placeholder?: boolean };
type InlineOperation = { catalogId: string; title: string; params: Record<string, unknown> };
type PortControlProfile = {
  enable?: string;
  disable?: string;
  address?: string;
  description?: string;
  addressParams?: (portName: string, address: string, mask: string) => Record<string, unknown>;
  descriptionParams?: (portName: string, description: string) => Record<string, unknown>;
};

const profiles: Record<string, { ports: number; prefix: string; tone: string; family: string }> = {
  cisco: { ports: 24, prefix: "Gi1/0/", tone: "cisco", family: "Catalyst-style" },
  mikrotik: { ports: 8, prefix: "ether", tone: "mikrotik", family: "RouterBOARD-style" },
  fortigate: { ports: 10, prefix: "port", tone: "fortigate", family: "FortiGate-style" },
  sophos: { ports: 8, prefix: "Port", tone: "sophos", family: "Sophos XGS-style" },
  pfsense: { ports: 6, prefix: "igc", tone: "pfsense", family: "Netgate-style" },
  linux: { ports: 4, prefix: "eth", tone: "linux", family: "Rack server" },
  generic: { ports: 8, prefix: "port", tone: "generic", family: "Network appliance" }
};

function vendorKey(device: PortMapDevice) {
  const value = `${device.vendor} ${device.type}`.toLowerCase();
  return Object.keys(profiles).find((key) => value.includes(key)) ?? "generic";
}

function displayPorts(device: PortMapDevice): DisplayPort[] {
  if (device.ports.length) return device.ports;
  const profile = profiles[vendorKey(device)];
  return Array.from({ length: profile.ports }, (_, index) => ({
    id: `placeholder-${index}`, name: `${profile.prefix}${profile.prefix.endsWith("/") ? index + 1 : index}`, type: "ethernet",
    macAddress: null, enabled: true, operationalStatus: "unknown" as const, source: "inferred" as const,
    confidence: 0, updatedAt: "", placeholder: true
  }));
}

function statusLabel(port: PortMapPort, fa: boolean) {
  if (port.operationalStatus === "up") return fa ? "فعال" : "Up";
  if (port.operationalStatus === "down") return fa ? "قطع" : "Down";
  return fa ? "نامشخص" : "Unknown";
}

function adminStatusLabel(port: PortMapPort, fa: boolean) {
  if (port.administrativeStatus === "up") return fa ? "روشن" : "Enabled";
  if (port.administrativeStatus === "down") return fa ? "خاموش (Shutdown)" : "Administratively down";
  return fa ? "نامشخص" : "Unknown";
}

function portControlProfile(device: PortMapDevice): PortControlProfile {
  const key = vendorKey(device);
  if (key === "cisco") return {
    enable: "cisco.enable-interface",
    disable: "cisco.disable-interface",
    address: "cisco.configure-interface-ipv4",
    description: "cisco.update-interface-description",
    addressParams: (interfaceName, ipAddress, subnetMask) => ({ interfaceName, ipAddress, subnetMask }),
    descriptionParams: (interfaceName, description) => ({ interfaceName, description })
  };
  if (key === "fortigate") return {
    enable: "fortigate.enable-interface",
    disable: "fortigate.disable-interface",
    address: "fortigate.update-interface-ip",
    description: "fortigate.set-interface-alias",
    addressParams: (name, ip) => ({ name, ip }),
    descriptionParams: (name, alias) => ({ name, alias })
  };
  if (key === "sophos") return {
    enable: "sophos.enable-interface",
    disable: "sophos.disable-interface",
    address: "sophos.set-interface-ipv4",
    addressParams: (interfaceName, ipAddress) => ({ interfaceName, ipAddress })
  };
  if (key === "mikrotik") return {
    enable: "mikrotik.enable-interface",
    disable: "mikrotik.disable-interface",
    description: "mikrotik.set-interface-comment",
    descriptionParams: (interfaceName, comment) => ({ interfaceName, comment })
  };
  return {};
}

function devicePowerProfile(device: PortMapDevice) {
  const key = vendorKey(device);
  if (key === "linux") return { reboot: "linux.reboot", shutdown: "linux.shutdown" };
  if (key === "mikrotik") return { reboot: "mikrotik.reboot", shutdown: "mikrotik.shutdown" };
  if (key === "fortigate") return { reboot: "fortigate.reboot", shutdown: "fortigate.shutdown" };
  if (key === "cisco") return { reboot: "cisco.reload-device" };
  return {};
}

function actionPreviewLines(plan: ActionPlan) {
  const dryRun = normalizeObject(plan.dryRunJson);
  const nested = normalizeObject(dryRun.plan);
  const raw = normalizeArray<unknown>(dryRun.commands).length ? normalizeArray<unknown>(dryRun.commands) : normalizeArray<unknown>(nested.commands);
  return raw.map((item) => typeof item === "string" ? item : String(normalizeObject(item).command ?? "")).filter(Boolean).slice(0, 5);
}

function actionWasExecuted(plan: ActionPlan) {
  const result = normalizeObject(plan.resultJson);
  const metadata = normalizeObject(plan.parametersJson.metadata);
  return plan.status === "succeeded" && result.executed === true && (result.connectorInvoked === true || metadata.connectorInvoked === true);
}

function useInlineExecution(fa: boolean, onApplied: (message: string) => Promise<void>, onError: (message: string) => void) {
  const [pending, setPending] = useState<{ operation: InlineOperation; plan: ActionPlan } | null>(null);
  const [working, setWorking] = useState(false);
  const prepare = async (deviceId: string, operation: InlineOperation) => {
    setWorking(true); onError("");
    try {
      const plan = await createCatalogAction(operation.catalogId, deviceId, operation.params);
      const preview = await quickExecuteAction(plan.id, { intent: "preview", reason: "Inline topology port control preview" });
      setPending({ operation, plan: preview });
    } catch (error) { onError(error instanceof Error ? error.message : "PORT_ACTION_PREVIEW_FAILED"); }
    finally { setWorking(false); }
  };
  const execute = async () => {
    if (!pending) return;
    setWorking(true); onError("");
    try {
      const result = await quickExecuteAction(pending.plan.id, { intent: "execute", reason: "Explicitly confirmed from topology port control" });
      if (!actionWasExecuted(result)) throw new Error(fa ? "کانکتور نتیجه اجرای واقعی را تأیید نکرد؛ وضعیت دستگاه تغییر داده‌شده نمایش داده نمی‌شود." : "The connector did not confirm a real execution; device state was not changed in the UI.");
      setPending(null);
      await onApplied(fa ? `${pending.operation.title} روی دستگاه اجرا و در Audit ثبت شد.` : `${pending.operation.title} executed and recorded in Audit.`);
    } catch (error) { onError(error instanceof Error ? error.message : "PORT_ACTION_EXECUTION_FAILED"); }
    finally { setWorking(false); }
  };
  return { pending, working, prepare, execute, cancel: () => setPending(null) };
}

function InlineActionReview({ pending, working, fa, onConfirm, onCancel }: { pending: { operation: InlineOperation; plan: ActionPlan }; working: boolean; fa: boolean; onConfirm: () => void; onCancel: () => void }) {
  const commands = actionPreviewLines(pending.plan);
  return <section className="port-action-review" role="alertdialog" aria-label={fa ? "تأیید تغییر پورت" : "Confirm port change"}>
    <div><ShieldCheck /><span><small>{fa ? "پیش‌نمایش امن آماده است" : "Safe preview is ready"}</small><strong>{pending.operation.title}</strong></span><em>{pending.plan.riskLevel}</em></div>
    {commands.length ? <details><summary>{fa ? "مشاهده فرمان‌های کنترل‌شده" : "View controlled commands"}</summary>{commands.map((command) => <code dir="ltr" key={command}>{command}</code>)}</details> : null}
    <p><AlertTriangle />{fa ? "ممکن است مسیر ارتباطی این دستگاه قطع شود. پس از تأیید، عملیات از همین صفحه اجرا و ثبت می‌شود." : "This can interrupt connectivity. After confirmation it runs here and is audited."}</p>
    <footer><button type="button" className="port-action-confirm" disabled={working} onClick={onConfirm}>{working ? <LoaderCircle className="is-spinning" /> : <Play />}{fa ? "تأیید و اعمال" : "Confirm & apply"}</button><button type="button" disabled={working} onClick={onCancel}>{fa ? "انصراف" : "Cancel"}</button></footer>
  </section>;
}

function DevicePowerControls({ device, fa, enabled, onApplied, onError }: { device: PortMapDevice; fa: boolean; enabled: boolean; onApplied: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const profile = devicePowerProfile(device);
  const execution = useInlineExecution(fa, onApplied, onError);
  const params = { breakGlass: true, deviceNameConfirmation: device.name, executeConfirmation: "EXECUTE", reason: "Explicitly confirmed device power control from topology" };
  const operation = (catalogId: string, title: string): InlineOperation => ({ catalogId, title, params });
  const unsupportedShutdown = !profile.shutdown;
  return <section className="device-power-card">
    <header><div><Power /><span><strong>{fa ? "کنترل توان دستگاه" : "Device power"}</strong><small>{fa ? "اجرای واقعی، ثبت‌شده و نیازمند یک تأیید" : "Real, audited execution with one confirmation"}</small></span></div><i>{device.vendor}</i></header>
    {execution.pending ? <InlineActionReview pending={execution.pending} working={execution.working} fa={fa} onConfirm={() => void execution.execute()} onCancel={execution.cancel} /> : <div className="device-power-actions">
      <button type="button" className="is-reboot" disabled={!enabled || execution.working || !profile.reboot} onClick={() => profile.reboot && void execution.prepare(device.id, operation(profile.reboot, fa ? `راه‌اندازی دوباره ${device.name}` : `Reboot ${device.name}`))}><RotateCcw />{fa ? "ریبوت" : "Reboot"}</button>
      <button type="button" className="is-shutdown" title={unsupportedShutdown ? (fa ? "خاموش‌کردن کامل برای این پلتفرم قرارداد اجرایی قابل اتکایی ندارد." : "This platform has no reliable universal power-off contract.") : undefined} disabled={!enabled || execution.working || unsupportedShutdown} onClick={() => profile.shutdown && void execution.prepare(device.id, operation(profile.shutdown, fa ? `خاموش کردن ${device.name}` : `Shut down ${device.name}`))}><PowerOff />{fa ? "خاموش کردن" : "Shut down"}</button>
    </div>}
    {unsupportedShutdown ? <p>{fa ? "برای این مدل فقط Reboot قابل اجرای مطمئن است؛ خاموش‌کردن غیرواقعی فعال نشده است." : "Only reboot has a reliable execution contract for this platform; fake power-off is not enabled."}</p> : null}
  </section>;
}

function DeviceFace({ device, selected, onSelect }: { device: PortMapDevice; selected?: string; onSelect: (port: PortMapPort) => void }) {
  const profile = profiles[vendorKey(device)];
  const ports = displayPorts(device);
  return <div className={`port-device port-device--${profile.tone}`}>
    <div className="port-device__top" />
    <div className="port-device__face">
      <div className="port-device__brand"><span>{device.vendor}</span><small>{device.model ?? profile.family}</small></div>
      <div className="port-device__display"><i className={device.status === "online" ? "is-on" : ""} /><span>{device.name}</span></div>
      <div className="port-device__rack-hole is-start" />
      <div className="port-device__ports">
        {ports.map((port) => <button type="button" key={port.id} title={`${port.name}${port.peerName ? ` → ${port.peerName}` : ""}`} className={`port-jack is-${port.operationalStatus} ${port.peerName ? "has-peer" : ""} ${selected === port.name ? "is-selected" : ""}`} onClick={() => onSelect(port)}>
          <i className="port-jack__led" /><span className="port-jack__slot"><b /><b /><b /><b /></span><small>{port.name.replace(/GigabitEthernet/i, "Gi").replace(/ethernet/i, "eth")}</small>
        </button>)}
      </div>
      <div className="port-device__vents">{Array.from({ length: 18 }, (_, i) => <i key={i} />)}</div>
      <div className="port-device__rack-hole is-end" />
    </div>
    <div className="port-device__bottom" />
  </div>;
}

function ConnectionEditor({ device, port, fa, busy, editable, onClose, onSaved, onApplied, onError }: { device: PortMapDevice; port: DisplayPort; fa: boolean; busy: boolean; editable: boolean; onClose: () => void; onSaved: () => Promise<void>; onApplied: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const [draft, setDraft] = useState<Draft>({ ...port, name: port.name });
  const [address, setAddress] = useState(port.ipAddresses?.[0] ?? "");
  const [subnetMask, setSubnetMask] = useState("255.255.255.0");
  const [deviceDescription, setDeviceDescription] = useState(port.description ?? "");
  const [saving, setSaving] = useState(false);
  const profile = portControlProfile(device);
  const execution = useInlineExecution(fa, onApplied, onError);
  const hasLiveControls = Boolean(profile.enable || profile.disable || profile.address || profile.description);
  useEffect(() => { setDraft({ ...port, name: port.name }); setAddress(port.ipAddresses?.[0] ?? ""); setDeviceDescription(port.description ?? ""); }, [port]);
  const set = (key: keyof Draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const persist = async (operation: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await operation();
      await onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : "PORT_UPDATE_FAILED");
    } finally {
      setSaving(false);
    }
  };
  const save = () => persist(() => savePortConnection(device.id, draft.name, draft));
  const clear = () => persist(() => port.placeholder ? Promise.resolve() : clearPortConnection(device.id, port.name));
  const pending = busy || saving || execution.working;
  const prepare = (catalogId: string | undefined, title: string, params: Record<string, unknown>) => {
    if (!catalogId) return;
    void execution.prepare(device.id, { catalogId, title, params });
  };
  return <aside className="port-editor" aria-label={fa ? "ویرایش اتصال پورت" : "Edit port connection"}>
    <header><div><small>{device.name}</small><h2>{port.name}</h2></div><button type="button" onClick={onClose}><X /></button></header>
    <div className="port-editor__status"><CircleDot className={`is-${port.operationalStatus}`} /><div><span>{fa ? "وضعیت واقعی لینک" : "Operational link"}</span><strong>{statusLabel(port, fa)}</strong></div><div><span>{fa ? "وضعیت مدیریتی" : "Administrative state"}</span><strong>{adminStatusLabel(port, fa)}</strong></div></div>
    <div className="port-editor__facts"><span><small>VLAN</small><strong dir="ltr">{port.vlan || "—"}</strong></span><span><small>{fa ? "سرعت" : "Speed"}</small><strong dir="ltr">{port.speed || "—"}</strong></span><span><small>IP</small><strong dir="ltr">{port.ipAddresses?.join(", ") || "—"}</strong></span></div>
    <section className="port-live-controls">
      <header><div><Power /><span><strong>{fa ? "کنترل مستقیم پورت" : "Direct port control"}</strong><small>{fa ? "بدون خروج از نقشه" : "Without leaving the map"}</small></span></div><i className={hasLiveControls ? "is-ready" : ""}>{hasLiveControls ? (fa ? "آماده" : "Ready") : (fa ? "فقط ثبت اطلاعات" : "Inventory only")}</i></header>
      {hasLiveControls ? <>
        <div className="port-power-actions">
          <button type="button" className="is-enable" disabled={!editable || pending || port.placeholder} onClick={() => prepare(profile.enable, fa ? `روشن کردن ${port.name}` : `Enable ${port.name}`, vendorKey(device) === "fortigate" ? { name: port.name } : { interfaceName: port.name })}><Power />{fa ? "روشن" : "Enable"}</button>
          <button type="button" className="is-disable" disabled={!editable || pending || port.placeholder} onClick={() => prepare(profile.disable, fa ? `خاموش کردن ${port.name}` : `Disable ${port.name}`, vendorKey(device) === "fortigate" ? { name: port.name } : { interfaceName: port.name })}><Power />{fa ? "خاموش" : "Disable"}</button>
        </div>
        {profile.address && profile.addressParams ? <div className="port-quick-setting"><label><span>{fa ? "IPv4 / CIDR" : "IPv4 / CIDR"}</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder={["fortigate", "sophos"].includes(vendorKey(device)) ? "192.168.10.1/24" : "192.168.10.1"} dir="ltr" /></label>{vendorKey(device) === "cisco" ? <label><span>{fa ? "Subnet mask" : "Subnet mask"}</span><input value={subnetMask} onChange={(event) => setSubnetMask(event.target.value)} placeholder="255.255.255.0" dir="ltr" /></label> : null}<button type="button" disabled={!editable || pending || port.placeholder || !address.trim()} onClick={() => prepare(profile.address, fa ? `تنظیم IP پورت ${port.name}` : `Set IP on ${port.name}`, profile.addressParams!(port.name, address.trim(), subnetMask.trim()))}><Save />{fa ? "اعمال IP" : "Apply IP"}</button></div> : null}
        {profile.description && profile.descriptionParams ? <div className="port-quick-setting is-description"><label><span>{fa ? "توضیح روی خود دستگاه" : "Description on device"}</span><input value={deviceDescription} onChange={(event) => setDeviceDescription(event.target.value)} placeholder={fa ? "مثلاً uplink طبقه دوم" : "e.g. floor-2 uplink"} /></label><button type="button" disabled={!editable || pending || port.placeholder || !deviceDescription.trim()} onClick={() => prepare(profile.description, fa ? `ثبت توضیح برای ${port.name}` : `Set description for ${port.name}`, profile.descriptionParams!(port.name, deviceDescription.trim()))}><Pencil />{fa ? "اعمال" : "Apply"}</button></div> : null}
      </> : <p>{fa ? "برای این وندور Connector تغییر زنده ثبت نشده است؛ اطلاعات نقشه را می‌توانید پایین ویرایش کنید." : "No verified live-change connector exists for this vendor; map details remain editable below."}</p>}
    </section>
    {execution.pending ? <InlineActionReview pending={execution.pending} working={execution.working} fa={fa} onConfirm={() => void execution.execute()} onCancel={execution.cancel} /> : null}
    <div className="port-editor__section-title"><Cable /><span>{fa ? "اطلاعات اتصال و کابل" : "Connection & cable details"}</span></div>
    <fieldset disabled={!editable} className="port-editor__grid">
      <label><span>{fa ? "نام دستگاه متصل" : "Connected device"}</span><input value={draft.peerName ?? ""} onChange={(e) => set("peerName", e.target.value)} placeholder={fa ? "مثلاً سوئیچ طبقه دوم" : "e.g. Floor 2 switch"} /></label>
      <label><span>{fa ? "پورت سمت مقابل" : "Remote port"}</span><input value={draft.peerPort ?? ""} onChange={(e) => set("peerPort", e.target.value)} placeholder="Gi0/1" dir="ltr" /></label>
      <label><span>{fa ? "IP سمت مقابل" : "Peer IP"}</span><input value={draft.peerIp ?? ""} onChange={(e) => set("peerIp", e.target.value)} placeholder="192.168.1.2" dir="ltr" /></label>
      <label><span>{fa ? "نوع کابل" : "Cable"}</span><select value={draft.cableType ?? "copper"} onChange={(e) => set("cableType", e.target.value)}><option value="copper">Copper</option><option value="fiber">Fiber</option><option value="dac">DAC</option><option value="wireless">Wireless</option><option value="virtual">Virtual</option></select></label>
      <label><span>VLAN</span><input value={draft.vlan ?? ""} onChange={(e) => set("vlan", e.target.value)} placeholder="10 / trunk" dir="ltr" /></label>
      <label><span>{fa ? "سرعت" : "Speed"}</span><input value={draft.speed ?? ""} onChange={(e) => set("speed", e.target.value)} placeholder="1 Gbps" dir="ltr" /></label>
      <label className="is-wide"><span>{fa ? "یادداشت" : "Note"}</span><textarea value={draft.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder={fa ? "کاربرد یا مسیر کابل…" : "Cable path or purpose…"} /></label>
    </fieldset>
    {editable ? <footer><button type="button" className="port-editor__save" disabled={pending} onClick={() => void save()}><Save />{saving ? (fa ? "در حال ذخیره…" : "Saving…") : (fa ? "ذخیره اطلاعات نقشه" : "Save map details")}</button>{port.manualOverride ? <button type="button" className="port-editor__clear" disabled={pending} onClick={() => void clear()}><Unplug />{fa ? "حذف اصلاح دستی" : "Clear override"}</button> : null}</footer> : null}
  </aside>;
}

function exposureLabel(value: ServiceEndpoint["exposure"], fa: boolean) {
  const labels = fa
    ? { all_interfaces: "همه اینترفیس‌ها", loopback: "فقط همین سرور", interface: "IP مشخص", policy: "سرویس سیاست فایروال", unknown: "نامشخص" }
    : { all_interfaces: "All interfaces", loopback: "This host only", interface: "Specific IP", policy: "Firewall policy service", unknown: "Unknown" };
  return labels[value];
}

function serviceOperation(device: PortMapDevice, endpoint: ServiceEndpoint, enable: boolean, fa: boolean): InlineOperation | null {
  const key = vendorKey(device);
  if (key === "linux") return {
    catalogId: enable ? "linux.open-port" : "linux.close-port",
    title: enable ? (fa ? `اجازه پورت ${endpoint.port} در فایروال` : `Allow port ${endpoint.port} in firewall`) : (fa ? `مسدود کردن پورت ${endpoint.port} در فایروال` : `Deny port ${endpoint.port} in firewall`),
    params: { port: endpoint.port, protocol: endpoint.protocol === "udp" ? "udp" : "tcp" }
  };
  if (key === "mikrotik" && endpoint.serviceName) return {
    catalogId: enable ? "mikrotik.enable-service" : "mikrotik.disable-service",
    title: enable ? (fa ? `فعال‌کردن سرویس ${endpoint.serviceName}` : `Enable ${endpoint.serviceName}`) : (fa ? `غیرفعال‌کردن سرویس ${endpoint.serviceName}` : `Disable ${endpoint.serviceName}`),
    params: { serviceName: endpoint.serviceName }
  };
  return null;
}

function ServiceEndpointEditor({ device, endpoint, fa, editable, onClose, onSaved, onApplied, onError }: { device: PortMapDevice; endpoint: ServiceEndpoint; fa: boolean; editable: boolean; onClose: () => void; onSaved: () => Promise<void>; onApplied: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const [draft, setDraft] = useState<ServiceEndpoint>(endpoint);
  const [saving, setSaving] = useState(false);
  const execution = useInlineExecution(fa, onApplied, onError);
  useEffect(() => setDraft(endpoint), [endpoint]);
  const set = <K extends keyof ServiceEndpoint>(key: K, value: ServiceEndpoint[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const run = async (operation: () => Promise<unknown>) => {
    setSaving(true);
    try { await operation(); await onSaved(); }
    catch (error) { onError(error instanceof Error ? error.message : "SERVICE_UPDATE_FAILED"); }
    finally { setSaving(false); }
  };
  const bindings = endpoint.bindings?.length ? endpoint.bindings : [{ address: endpoint.address, exposure: endpoint.exposure, state: endpoint.state, process: endpoint.process, serviceName: endpoint.serviceName, source: endpoint.source, confidence: endpoint.confidence }];
  const hasDiscoveredBinding = bindings.some((binding) => binding.source !== "manual");
  const enableOperation = serviceOperation(device, endpoint, true, fa);
  const disableOperation = serviceOperation(device, endpoint, false, fa);
  return <aside className="port-editor service-editor" aria-label={fa ? "جزئیات پورت سرویس" : "Service port details"}>
    <header><div><small>{device.name} · {endpoint.source}</small><h2 dir="ltr">{draft.port}/{draft.protocol.toUpperCase()}</h2></div><button type="button" onClick={onClose}><X /></button></header>
    <div className={`service-editor__exposure is-${draft.exposure}`}><ShieldAlert /><div><strong>{exposureLabel(draft.exposure, fa)}</strong><small>{fa ? "بازبودن Listener الزاماً به معنی عبور از فایروال نیست." : "A listener is not necessarily reachable through the firewall."}</small></div></div>
    {enableOperation && disableOperation ? <section className="port-live-controls service-live-controls"><header><div><ShieldCheck /><span><strong>{fa ? "کنترل واقعی دسترسی" : "Live access control"}</strong><small>{vendorKey(device) === "linux" ? (fa ? "قانون فایروال؛ سرویس متوقف نمی‌شود" : "Firewall rule; process is not stopped") : "RouterOS IP service"}</small></span></div><i className="is-ready">{fa ? "آماده" : "Ready"}</i></header><div className="port-power-actions"><button type="button" className="is-enable" disabled={!editable || saving || execution.working || endpoint.key === "new"} onClick={() => void execution.prepare(device.id, enableOperation)}><Power />{fa ? "اجازه / روشن" : "Allow / enable"}</button><button type="button" className="is-disable" disabled={!editable || saving || execution.working || endpoint.key === "new"} onClick={() => void execution.prepare(device.id, disableOperation)}><Power />{fa ? "مسدود / خاموش" : "Deny / disable"}</button></div></section> : null}
    {execution.pending ? <InlineActionReview pending={execution.pending} working={execution.working} fa={fa} onConfirm={() => void execution.execute()} onCancel={execution.cancel} /> : null}
    <section className="service-editor__bindings" aria-label={fa ? "آدرس‌های Listen تشخیص‌داده‌شده" : "Detected listen bindings"}>
      <div><strong>{fa ? "Bindهای تشخیص‌داده‌شده" : "Detected bindings"}</strong><small>{bindings.length}</small></div>
      {bindings.map((binding, index) => <article key={`${binding.address}:${binding.process ?? binding.serviceName ?? ""}:${index}`}>
        <code dir="ltr">{binding.address}:{endpoint.port}</code>
        <span>{binding.process ?? binding.serviceName ?? (fa ? "فرایند نامشخص" : "Unknown process")}</span>
        <small>{binding.source}</small>
      </article>)}
    </section>
    <fieldset disabled={!editable} className="port-editor__grid">
      <label><span>{fa ? "پروتکل" : "Protocol"}</span><select value={draft.protocol} onChange={(e) => set("protocol", e.target.value as ServiceEndpoint["protocol"])}><option value="tcp">TCP</option><option value="udp">UDP</option><option value="sctp">SCTP</option><option value="other">Other</option></select></label>
      <label><span>{fa ? "شماره پورت" : "Port"}</span><input type="number" min="1" max="65535" value={draft.port} onChange={(e) => set("port", Number(e.target.value))} dir="ltr" /></label>
      <label><span>{fa ? "آدرس Listen" : "Listen address"}</span><input value={draft.address} onChange={(e) => set("address", e.target.value)} dir="ltr" /></label>
      <label><span>{fa ? "نام سرویس" : "Service name"}</span><input value={draft.serviceName ?? ""} onChange={(e) => set("serviceName", e.target.value)} placeholder="HTTP API" /></label>
      <label><span>{fa ? "فرایند" : "Process"}</span><input value={draft.process ?? ""} onChange={(e) => set("process", e.target.value)} placeholder="node / nginx" dir="ltr" /></label>
      <label><span>{fa ? "دامنه اتصال" : "Binding"}</span><select value={draft.exposure} onChange={(e) => set("exposure", e.target.value as ServiceEndpoint["exposure"])}><option value="all_interfaces">{fa ? "همه اینترفیس‌ها" : "All interfaces"}</option><option value="loopback">Loopback</option><option value="interface">{fa ? "IP مشخص" : "Specific IP"}</option><option value="policy">{fa ? "سیاست فایروال" : "Firewall policy"}</option><option value="unknown">{fa ? "نامشخص" : "Unknown"}</option></select></label>
      <label className="is-wide"><span>{fa ? "توضیحات شما" : "Your notes"}</span><textarea value={draft.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder={fa ? "کاربرد سرویس، مالک آن یا دلیل بازبودن پورت…" : "Purpose, owner, or reason this port is open…"} /></label>
    </fieldset>
    {editable ? <footer><button type="button" className="port-editor__save" disabled={saving} onClick={() => void run(() => saveServiceEndpoint(device.id, endpoint.key, draft))}><Save />{saving ? (fa ? "در حال ذخیره…" : "Saving…") : (fa ? "ذخیره توضیحات و اصلاح" : "Save details")}</button>{endpoint.manualOverride && endpoint.key !== "new" ? <button type="button" className="port-editor__clear" disabled={saving} onClick={() => void run(() => clearServiceEndpoint(device.id, endpoint.key))}><Unplug />{hasDiscoveredBinding ? (fa ? "بازگشت به تشخیص خودکار" : "Use discovered values") : (fa ? "حذف پورت دستی" : "Delete manual port")}</button> : null}</footer> : null}
  </aside>;
}

export default function PortTopologyPage() {
  const { i18n } = useTranslation(); const { user } = useAuth(); const fa = i18n.language.startsWith("fa");
  const [devices, setDevices] = useState<PortMapDevice[]>([]); const [deviceId, setDeviceId] = useState("");
  const [selectedPort, setSelectedPort] = useState<DisplayPort | null>(null); const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<ServiceEndpoint | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [liveSyncing, setLiveSyncing] = useState(false);
  const liveSyncInFlight = useRef(false);
  const editable = user?.role === "admin" || user?.role === "operator";
  const device = useMemo(() => devices.find((item) => item.id === deviceId) ?? devices[0], [deviceId, devices]);
  const liveLinuxDeviceId = device && vendorKey(device) === "linux" ? device.id : "";
  const load = useCallback(async (keepSelection = true) => { try { setError(""); const result = await listPortTopology(); setDevices(result.devices); setDeviceId((current) => !keepSelection || !result.devices.some((item) => item.id === current) ? result.devices[0]?.id ?? "" : current); } catch (e) { setError(e instanceof Error ? e.message : "LOAD_FAILED"); } finally { setLoading(false); setBusy(false); } }, []);
  useEffect(() => { void load(false); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 45_000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!liveLinuxDeviceId || !editable) return;
    let cancelled = false;
    const refreshLiveListeners = async () => {
      if (document.visibilityState !== "visible" || liveSyncInFlight.current) return;
      liveSyncInFlight.current = true;
      setLiveSyncing(true);
      try {
        await refreshLinuxServicePorts(liveLinuxDeviceId);
        if (!cancelled) await load();
      } catch {
        // The last trustworthy snapshot remains visible when the lightweight probe is unavailable.
      } finally {
        liveSyncInFlight.current = false;
        if (!cancelled) setLiveSyncing(false);
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void refreshLiveListeners(); };
    void refreshLiveListeners();
    const timer = window.setInterval(() => void refreshLiveListeners(), 60_000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [liveLinuxDeviceId, editable, load]);
  const discover = async () => {
    if (!device) return;
    setBusy(true); setNotice(""); setError("");
    try {
      const result = await discoverPortTopology(device.id);
      if (result.liveConnected) {
        setNotice(fa ? `${result.discoveredCount} اینترفیس و ${result.serviceEndpointCount} پورت سرویس از دستگاه خوانده شد.` : `${result.discoveredCount} interfaces and ${result.serviceEndpointCount} service ports discovered.`);
      } else {
        const reason = result.connectionErrorCode === "CISCO_SSH_NEGOTIATION_FAILED"
          ? (fa ? "مذاکره SSH سیسکو ناموفق بود؛ پروفایل سازگاری Legacy دستگاه را در تنظیم اتصال بررسی کنید." : "Cisco SSH negotiation failed; review the device legacy compatibility profile in connection setup.")
          : result.connectionErrorCode?.startsWith("CISCO_")
            ? (fa ? `جمع‌آوری زنده سیسکو ناموفق بود (${result.connectionErrorCode}). اطلاعات معتبر قبلی حفظ شد.` : `Cisco live collection failed (${result.connectionErrorCode}). The last verified inventory was preserved.`)
            : result.connectionErrorCode === "MIKROTIK_AUTH_FAILED"
          ? (fa ? "احراز هویت MikroTik رد شد؛ Credential متصل به این دستگاه را در تنظیمات بررسی کنید." : "MikroTik authentication failed; check the credential assigned to this device in Settings.")
          : result.connectionErrorCode === "MIKROTIK_CREDENTIAL_MISSING"
            ? (fa ? "برای این MikroTik هنوز Credential معتبری انتخاب نشده است." : "No valid credential is assigned to this MikroTik device.")
            : result.connectionErrorCode?.includes("TCP_CONNECT")
              ? (fa ? "پورت SSH ثبت‌شده از Backend در دسترس نیست؛ آدرس، NAT و فایروال مسیر را بررسی کنید." : "The configured SSH port is unreachable from the Backend; check address, NAT, and path firewall.")
              : (fa ? "از داده‌های موجود نقشه ساخته شد؛ اتصال زنده در دسترس نبود." : "Map built from stored inventory; live connection was unavailable.");
        setNotice(reason);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "DISCOVERY_FAILED");
      setBusy(false);
    }
  };
  const refreshAfterAction = async (message: string) => {
    setNotice(message); setError(""); setSelectedPort(null); setSelectedService(null);
    if (device) await discoverPortTopology(device.id).catch(() => undefined);
    await load();
  };
  const ports = device ? displayPorts(device) : [];
  const services = device?.serviceEndpoints ?? [];
  const linked = ports.filter((port) => port.peerName).length; const active = ports.filter((port) => port.operationalStatus === "up").length;
  const addManualService = () => {
    setSelectedPort(null);
    setSelectedService({ key: "new", protocol: "tcp", address: "0.0.0.0", port: 8080, state: "unknown", exposure: "all_interfaces", source: "manual", confidence: 1, manualOverride: true });
  };
  return <section className="page-stack port-topology-page">
    <header className="port-topology-hero"><div><span><Network />{fa ? "نقشه فیزیکی شبکه" : "Physical network map"}</span><h1>{fa ? "پورت‌ها و اتصالات" : "Ports & connections"}</h1><p>{fa ? "پنل هر تجهیز را ببینید، اتصال‌های کشف‌شده را بررسی کنید و موارد اشتباه را اصلاح کنید." : "Inspect each device faceplate, review discovered links, and correct mismatches."}</p></div><Router /></header>
    <div className="port-topology-toolbar"><label><span>{fa ? "تجهیز" : "Device"}</span><select value={device?.id ?? ""} onChange={(e) => { setDeviceId(e.target.value); setSelectedPort(null); setSelectedService(null); }}>{devices.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.vendor}</option>)}</select></label><button type="button" disabled={!device || busy || liveSyncing || !editable} onClick={() => void discover()}><RefreshCw className={busy || liveSyncing ? "is-spinning" : ""} />{liveSyncing ? (fa ? "همگام‌سازی زنده" : "Live sync") : (fa ? "کشف دوباره" : "Rediscover")}</button></div>
    {error ? <div className="port-topology-message is-error">{error}</div> : null}{notice ? <div className="port-topology-message"><CheckCircle2 />{notice}</div> : null}
    {loading ? <div className="port-topology-empty"><RefreshCw className="is-spinning" /></div> : !device ? <div className="port-topology-empty"><Server /><h2>{fa ? "هنوز دستگاهی ثبت نشده" : "No devices registered"}</h2></div> : <>
      <div className="port-topology-stats"><article><Cpu /><span>{fa ? "وندور" : "Vendor"}</span><strong>{device.vendor}</strong></article><article><Cable /><span>{fa ? "پورت دیده‌شده" : "Visible ports"}</span><strong>{ports.length}</strong></article><article><CircleDot /><span>{fa ? "لینک فعال" : "Active links"}</span><strong>{active}</strong></article><article><Network /><span>{fa ? "اتصال مشخص" : "Mapped peers"}</span><strong>{linked}</strong></article></div>
      <DevicePowerControls device={device} fa={fa} enabled={user?.role === "admin"} onApplied={refreshAfterAction} onError={setError} />
      <main className={`port-topology-workspace ${selectedPort ? "has-editor" : ""}`}><div className="port-topology-stage"><div className="port-topology-stage__floor" /><DeviceFace device={device} selected={selectedPort?.name} onSelect={(port) => { setSelectedService(null); setSelectedPort(port); }} /><div className="port-connection-list">{ports.filter((port) => port.peerName).map((port) => <button type="button" key={port.name} onClick={() => { setSelectedService(null); setSelectedPort(port); }}><i className={`is-${port.operationalStatus}`} /><strong>{port.name}</strong><span><Cable />{port.peerName}{port.peerPort ? ` · ${port.peerPort}` : ""}</span><small>{statusLabel(port, fa)}</small><Pencil /></button>)}</div></div>{selectedPort ? <ConnectionEditor key={selectedPort.id} device={device} port={selectedPort} fa={fa} busy={busy} editable={editable} onClose={() => setSelectedPort(null)} onSaved={async () => { setSelectedPort(null); await load(); }} onApplied={refreshAfterAction} onError={(message) => setError(message)} /> : null}</main>
      <section className={`service-port-workspace ${selectedService ? "has-editor" : ""}`}>
        <div className="service-port-panel">
          <header><div><span><Radio />{fa ? "پایش سبک سرویس‌ها" : "Lightweight service watch"}</span><h2>{fa ? "پورت‌های سرویس و Listenerها" : "Service ports & listeners"}</h2></div>{editable ? <button type="button" onClick={addManualService}><Plus />{fa ? "ثبت دستی" : "Add manually"}</button> : null}</header>
          <div className="service-port-rail" aria-label={fa ? "پورت‌های سرویس شناسایی‌شده" : "Detected service ports"}>
            {services.map((endpoint) => <button type="button" key={endpoint.key} className={`service-node is-${endpoint.exposure} ${selectedService?.key === endpoint.key ? "is-selected" : ""}`} onClick={() => { setSelectedPort(null); setSelectedService(endpoint); }}>
              <i><AppWindow /></i><strong>{endpoint.port}</strong><small>{endpoint.protocol.toUpperCase()}</small><span>{endpoint.serviceName ?? endpoint.process ?? (fa ? "سرویس ناشناس" : "Unknown service")}</span><em>{exposureLabel(endpoint.exposure, fa)}{(endpoint.bindings?.length ?? 0) > 1 ? ` · ${endpoint.bindings?.length} Bind` : ""}</em>
            </button>)}
            {!services.length ? <div className="service-port-empty"><Radio /><strong>{fa ? "هنوز Listener قابل اتکایی ثبت نشده" : "No reliable listener data yet"}</strong><span>{fa ? "«کشف دوباره» را بزنید؛ در Linux خروجی ss خوانده می‌شود." : "Run Rediscover; Linux reads the current ss inventory."}</span></div> : null}
          </div>
        </div>
        {selectedService ? <ServiceEndpointEditor key={selectedService.key} device={device} endpoint={selectedService} fa={fa} editable={editable} onClose={() => setSelectedService(null)} onSaved={async () => { setSelectedService(null); await load(); }} onApplied={refreshAfterAction} onError={setError} /> : null}
      </section>
    </>}
  </section>;
}
