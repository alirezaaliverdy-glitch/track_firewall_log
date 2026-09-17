import { PageHeader } from "@/components/ui/PageHeader";
import DailyCheckPanel from "@/components/daily-check/DailyCheckPanel";
import LinuxTelemetryPanel from "@/components/telemetry/LinuxTelemetryPanel";

export default function MonitoringPage() {
  return (
    <section className="page-stack">
      <PageHeader title="پایش" eyebrow="Monitoring" description="مانیتورینگ دستگاه و Daily Check در یک بخش تخصصی، نه داخل داشبورد اصلی." />
      <LinuxTelemetryPanel />
      <DailyCheckPanel />
    </section>
  );
}
