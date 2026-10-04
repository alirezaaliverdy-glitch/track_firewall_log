import { useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { testDeviceConnection, type ConnectionTestResult } from "@/lib/devices";
import type { DeviceWorkspace } from "@/lib/deviceOnboarding";
import { connectionGuides } from "./connectionGuides";
import { Snmpv3Setup } from "./Snmpv3Setup";
import "./DeviceConnectionChannels.css";

type Channel = DeviceWorkspace["connections"][number];

const methodLabels: Record<string, string> = {
  ssh: "SSH / CLI",
  rest_api: "REST API",
  xml_api: "XML API",
  restconf: "RESTCONF / YANG",
  syslog: "Syslog",
  agent: "Agent"
  ,snmpv3: "SNMPv3"
  ,soap_api: "vSphere API"
};

function statusCopy(status: string, isFa: boolean) {
  const labels: Record<string, [string, string]> = {
    verified: ["تأییدشده", "Verified"],
    receiving: ["در حال دریافت داده", "Receiving data"],
    available: ["آماده تست", "Ready to test"],
    configured: ["پیکربندی‌شده", "Configured"],
    waiting_data: ["در انتظار اولین داده", "Waiting for data"],
    setup_required: ["نیازمند راه‌اندازی", "Setup required"],
    error: ["خطا در اتصال", "Connection error"]
  };
  return labels[status]?.[isFa ? 0 : 1] ?? status;
}

function tone(status: string): "good" | "warning" | "danger" | "neutral" {
  if (status === "verified" || status === "receiving") return "good";
  if (status === "error") return "danger";
  if (status === "available" || status === "configured" || status === "waiting_data" || status === "setup_required") return "warning";
  return "neutral";
}

function purposeCopy(purposes: string[], isFa: boolean) {
  const labels: Record<string, [string, string]> = {
    control: ["فرمان", "Control"],
    inventory: ["موجودی", "Inventory"],
    telemetry: ["پایش", "Telemetry"],
    events: ["رخدادها", "Events"]
  };
  return purposes.map((item) => labels[item]?.[isFa ? 0 : 1] ?? item).join(" · ");
}

function prerequisites(channel: Channel, isFa: boolean) {
  const key = isFa ? "prerequisitesFa" : "prerequisites";
  const source = channel.settingsJson?.[key];
  return Array.isArray(source) ? source.filter((item): item is string => typeof item === "string") : [];
}

function testMessage(
  tested: NonNullable<ConnectionTestResult["connectionChannels"]>[number],
  method: string,
  isFa: boolean
) {
  if (!isFa || method === "snmpv3") return tested.message;
  const name = methodLabels[method] ?? method;
  if (tested.status === "verified") return `اتصال ${name} با موفقیت تست شد و آماده جمع‌آوری اطلاعات است.`;
  if (tested.status === "receiving") return `داده‌های ورودی ${name} دریافت شده و مسیر پایش فعال است.`;
  if (tested.status === "waiting_data") return `هنوز داده‌ای از ${name} دریافت نشده است؛ ارسال داده را روی دستگاه فعال کنید.`;
  if (tested.status === "setup_required") return `برای استفاده از ${name} ابتدا پیش‌نیازهای نمایش‌داده‌شده را روی دستگاه فعال کنید.`;
  return `تست ${name} ناموفق بود${tested.errorCode ? ` (${tested.errorCode})` : ""}. مسیر مدیریت سالم به‌عنوان جایگزین استفاده می‌شود.`;
}

export function DeviceConnectionChannels({
  deviceId,
  vendor,
  host,
  channels,
  isFa,
  locale,
  onRefresh
}: {
  deviceId: string;
  vendor: string;
  host: string;
  channels: Channel[];
  isFa: boolean;
  locale: string;
  onRefresh: () => Promise<unknown> | unknown;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState("");

  const runTest = async () => {
    setTesting(true);
    setError("");
    try {
      const next = await testDeviceConnection(deviceId);
      setResult(next);
      await onRefresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : (isFa ? "تست اتصال انجام نشد." : "Connection test failed."));
    } finally {
      setTesting(false);
    }
  };

  const testedById = new Map((result?.connectionChannels ?? []).map((item) => [item.id, item]));
  const preferred = result?.preferredDataChannel?.method;

  return (
    <article className="device-connection-hub">
      <header>
        <div>
          <span className="operator-eyebrow">{isFa ? "معماری اتصال افزونه‌پذیر" : "Resilient connectivity"}</span>
          <h2>{isFa ? "مسیرهای اتصال دستگاه" : "Device connection paths"}</h2>
          <p>{isFa ? "هر مسیر فقط پس از دریافت پاسخ واقعی تأیید می‌شود؛ روش‌های آماده‌نشده به‌عنوان اتصال موفق نمایش داده نمی‌شوند." : "Each path is verified only after a real response; unconfigured methods are never shown as connected."}</p>
        </div>
        <button className="primary-button" type="button" disabled={testing} onClick={() => void runTest()}>
          {testing ? (isFa ? "در حال تست اتصال…" : "Testing connection…") : (isFa ? "تست اتصال" : "Test connection")}
        </button>
      </header>

      <div className="device-connection-hub__flow">
        {channels.map((channel, index) => {
          const tested = testedById.get(channel.id);
          const status = tested?.status ?? channel.status;
          const requirements = prerequisites(channel, isFa);
          const lastSuccess = tested?.lastSuccessAt ?? channel.lastSuccessAt;
          const guide = connectionGuides[vendor]?.[channel.method];
          return (
            <section className={`device-channel is-${tone(status)}`} key={channel.id}>
              <div className="device-channel__number">{index + 1}</div>
              <div className="device-channel__body">
                <div className="device-channel__title">
                  <div>
                    <small>{channel.role === "management" ? (isFa ? "مدیریت و اجرای فرمان" : "Management & control") : (isFa ? "داده و پایش" : "Data & observability")}</small>
                    <strong dir="ltr">{methodLabels[channel.method] ?? channel.method}{channel.port ? ` · ${channel.method === "snmpv3" || channel.method === "syslog" ? "UDP" : "TCP"} ${channel.port}` : ""}</strong>
                  </div>
                  <StatusBadge value={statusCopy(status, isFa)} tone={tone(status)} />
                </div>
                <p>{purposeCopy(channel.purposes, isFa)}</p>
                {preferred === channel.method ? <span className="device-channel__preferred">{isFa ? "مسیر منتخب جمع‌آوری" : "Selected collection path"}</span> : null}
                {tested?.message ? <p className={tested.actionRequired ? "device-channel__message is-warning" : "device-channel__message"}>{testMessage(tested, channel.method, isFa)}</p> : null}
                {!tested?.message && requirements.length && status !== "verified" && status !== "receiving" ? <p className="device-channel__message is-warning">{requirements.join(" · ")}</p> : null}
                {guide ? <details className="device-channel__guide"><summary>{isFa ? guide.titleFa : guide.titleEn}</summary><ol>{(isFa ? guide.stepsFa : guide.stepsEn).map((step) => <li key={step}>{step}</li>)}</ol>{guide.command ? <pre dir="ltr">{guide.command}</pre> : null}{guide.noteFa ? <p>{isFa ? guide.noteFa : guide.noteEn}</p> : null}</details> : null}
                {channel.method === "snmpv3" ? <Snmpv3Setup deviceId={deviceId} isFa={isFa} onRefresh={onRefresh} initialPort={channel.port ?? 161} initialCredentialId={channel.credentialId} initialAuthProtocol={channel.settingsJson?.authProtocol} /> : null}
                <footer>
                  <span>{lastSuccess ? (isFa ? `آخرین موفق: ${new Date(lastSuccess).toLocaleString(locale)}` : `Last success: ${new Date(lastSuccess).toLocaleString(locale)}`) : (isFa ? "هنوز اتصال موفق ثبت نشده" : "No successful connection yet")}</span>
                  <span>{channel.host || channel.method === "snmpv3" || channel.method === "ssh" || channel.method === "soap_api" ? <bdi>{channel.host || host}</bdi> : (isFa ? "دریافت ورودی در مرکز لاگ" : "Inbound collector")}</span>
                </footer>
              </div>
            </section>
          );
        })}
      </div>
      {error ? <p className="device-connection-hub__error" role="alert">{error}</p> : null}
      {!channels.length ? <p>{isFa ? "مسیرهای اتصال هنوز ساخته نشده‌اند؛ یک‌بار تنظیمات دستگاه را ذخیره کنید." : "Connection channels have not been created yet; save device settings once."}</p> : null}
    </article>
  );
}
