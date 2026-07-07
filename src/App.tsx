import "./App.css";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LogProvider } from "@/context/LogContext";
import CsvUploader from "./components/csv-uploader";
import FirewallTypeSelector from "./components/upload/FirewallTypeSelector";
import ColumnMappingWizard from "./components/upload/ColumnMappingWizard";
import SummaryCards from "./components/dashboard/SummaryCards";
import DataQualityPanel from "./components/dashboard/DataQualityPanel";
import TrafficDirectionPanel from "./components/dashboard/TrafficDirectionPanel";
import SensitivePortsExplorer from "./components/dashboard/SensitivePortsExplorer";
import PolicyReviewPanel from "./components/policies/PolicyReviewPanel";
import FindingsPanel from "./components/findings/FindingsPanel";
import EvidenceOverviewBanner from "./components/findings/EvidenceOverviewBanner";
import FindingDetails from "./components/findings/FindingDetails";
import ActionDistributionChart from "./components/charts/ActionDistributionChart";
import TopPortsChart from "./components/charts/TopPortsChart";
import LogChart from "./components/log-chart";
import LogTable from "./components/log-table";
import ExportButtons from "./components/export/ExportButtons";
import WorkflowGuide from "./components/layout/WorkflowGuide";
import DeviceRegistryPanel from "./components/devices/DeviceRegistryPanel";
import LinuxTelemetryPanel from "./components/telemetry/LinuxTelemetryPanel";
import SecurityEventsPanel from "./components/events/SecurityEventsPanel";
import ErrorBoundary from "./components/common/ErrorBoundary";
import IncidentsPanel from "./components/incidents/IncidentsPanel";
import AiSecurityAssistantPanel from "./components/ai/AiSecurityAssistantPanel";
import ActionCenterPanel from "./components/actions/ActionCenterPanel";
import FortiGateCapabilityMatrixPanel from "./components/fortigate/FortiGateCapabilityMatrixPanel";
import AppBackground from "./components/background/AppBackground";
import CommandCatalogPanel from "./components/commands/CommandCatalogPanel";
import ActionResultView from "./components/actions/ActionResultView";
import DailyCheckPanel from "./components/daily-check/DailyCheckPanel";
import LinuxServiceHealthPanel from "./components/services/LinuxServiceHealthPanel";

function App() {
  const { user, logout } = useAuth();
  const resultMatch = window.location.pathname.match(/^\/actions\/([^/]+)\/result\/?$/);
  if (resultMatch) return <div className="authenticated-app"><AppBackground /><ActionResultView actionPlanId={decodeURIComponent(resultMatch[1])} /></div>;
  return (
    <Suspense fallback={<h1>loading logs ...</h1>}>
      <LogProvider>
        <div className="authenticated-app">
          <AppBackground />
          <main className="App relative z-10 mx-auto max-w-screen-2xl px-4 pb-12 pt-4 sm:px-6">
          <div className="app-command-header mb-5 overflow-hidden rounded-2xl">
            <div className="app-command-header__edge" />
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-left text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
                  مرکز فرمان شبکه و امنیت
                </h1>
                <p className="mt-1 text-left text-sm text-slate-400">
                  عملیات ساده، فارسی و کنترل‌شده برای دستگاه‌های شبکه و امنیت
                </p>
              </div>
              <div className="flex items-center gap-2" dir="rtl">
                <div className="text-right leading-tight">
                  <div className="text-sm font-medium text-slate-100">{user?.displayName || user?.username}</div>
                  <div className="text-[11px] uppercase tracking-wider text-cyan-400">{user?.role}</div>
                </div>
                <button onClick={() => void logout()} className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 transition hover:border-cyan-700 hover:text-white">
                  <LogOut className="h-3.5 w-3.5" /> خروج
                </button>
              </div>
            </div>
          </div>

          <ErrorBoundary title="کاتالوگ دستورات در دسترس نیست">
            <CommandCatalogPanel />
          </ErrorBoundary>

          <ErrorBoundary title="AI Security Assistant unavailable">
            <DailyCheckPanel />
          </ErrorBoundary>
          <ErrorBoundary title="Linux Service Health unavailable">
            <LinuxServiceHealthPanel />
          </ErrorBoundary>
          <ErrorBoundary title="AI Security Assistant unavailable">
            <AiSecurityAssistantPanel />
          </ErrorBoundary>
          <ErrorBoundary title="Action Center unavailable">
            <ActionCenterPanel />
          </ErrorBoundary>
          <details className="mb-4 rounded-lg border border-zinc-800 bg-slate-950/60 p-4 text-left">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-100" dir="rtl">افزودن و مدیریت دستگاه</summary>
            <div className="mt-4">
              <ErrorBoundary title="Device Registry unavailable">
                <DeviceRegistryPanel />
              </ErrorBoundary>
            </div>
          </details>
          <details className="mb-4 rounded-lg border border-zinc-800 bg-slate-950/60 p-4 text-left">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-100" dir="rtl">پایش دستگاه</summary>
            <div className="mt-4">
              <ErrorBoundary title="Linux Telemetry unavailable">
                <LinuxTelemetryPanel />
              </ErrorBoundary>
            </div>
          </details>
          <details className="mb-4 rounded-lg border border-zinc-800 bg-slate-950/60 p-4 text-left">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-100" dir="rtl">رویدادها، رخدادها و لاگ‌ها</summary>
            <div className="mt-4">
              <ErrorBoundary title="Upload panel unavailable">
                <div id="log-upload" className="scroll-mt-4">
                  <FirewallTypeSelector />
                  <CsvUploader />
                </div>
              </ErrorBoundary>
              <ErrorBoundary title="Security Events unavailable">
                <SecurityEventsPanel />
              </ErrorBoundary>
              <ErrorBoundary title="Incidents unavailable">
                <IncidentsPanel />
              </ErrorBoundary>
              <details className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-100">Import Diagnostics</summary>
                <div className="mt-4">
                  <DataQualityPanel />
                </div>
              </details>
            </div>
          </details>
          <WorkflowGuide />
          <ColumnMappingWizard />
          <SummaryCards />

          <div id="analysis-overview" className="scroll-mt-4">
            <EvidenceOverviewBanner />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <ActionDistributionChart />
              <TopPortsChart />
            </div>
          </div>
          <LogChart />

          <TrafficDirectionPanel />
          <PolicyReviewPanel />
          <FindingsPanel />
          <FindingDetails />
          <LogTable />
          <SensitivePortsExplorer />
          <ExportButtons />
          <details className="mb-4 rounded-lg border border-zinc-800 bg-slate-950/60 p-4 text-left">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-100">Vendor Readiness / Admin</summary>
            <div className="mt-4">
              <ErrorBoundary title="FortiGate Capability Matrix unavailable">
                <FortiGateCapabilityMatrixPanel />
              </ErrorBoundary>
            </div>
          </details>
          </main>
        </div>
      </LogProvider>
    </Suspense>
  );
}

export default App;
