import "./App.css";
import { Suspense } from "react";
import { Library, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import GuidedActionWizard from "./components/guided-actions/GuidedActionWizard";

function App() {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const resultMatch = window.location.pathname.match(/^\/actions\/([^/]+)\/result\/?$/);
  if (resultMatch) return <div className="authenticated-app"><AppBackground /><ActionResultView actionPlanId={decodeURIComponent(resultMatch[1])} /></div>;
  const guidedMatch = window.location.pathname.match(/^\/guided-actions\/([^/]+)\/?$/);
  if (guidedMatch) return (
    <div className="authenticated-app">
      <AppBackground />
      <main className="App relative z-10 mx-auto max-w-screen-lg px-4 pb-12 pt-6 sm:px-6">
        <h1 dir="rtl" className="mb-4 text-right text-2xl font-bold text-slate-100">ساخت مرحله‌ای اکشن</h1>
        <GuidedActionWizard sessionId={decodeURIComponent(guidedMatch[1])} onClose={() => { window.location.pathname = "/"; }} />
      </main>
    </div>
  );
  const isActionLibrary = window.location.pathname === "/action-library";
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
	                <div className="mb-2 text-left">
	                  <div className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">{t("app.title")}</div>
	                  <div className="mt-1 text-sm text-slate-400">{t("app.subtitle")}</div>
	                </div>
	                <nav className="mb-3 flex flex-wrap gap-2 text-sm">
	                  <a className={`rounded-md border px-3 py-1.5 ${!isActionLibrary ? "border-cyan-600 bg-cyan-950/50 text-cyan-100" : "border-slate-700 text-slate-300"}`} href="/">{t("nav.dashboard")}</a>
	                  <a className={`rounded-md border px-3 py-1.5 ${isActionLibrary ? "border-cyan-600 bg-cyan-950/50 text-cyan-100" : "border-slate-700 text-slate-300"}`} href="/action-library">{t("nav.actionLibrary")}</a>
	                </nav>
              </div>
	              <div className="flex items-center gap-2">
	                <select value={i18n.language} onChange={(event) => void i18n.changeLanguage(event.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200">
	                  <option value="fa">{t("language.fa")}</option>
	                  <option value="en">{t("language.en")}</option>
	                </select>
                <div className="text-right leading-tight">
                  <div className="text-sm font-medium text-slate-100">{user?.displayName || user?.username}</div>
                  <div className="text-[11px] uppercase tracking-wider text-cyan-400">{user?.role}</div>
                </div>
                <button onClick={() => void logout()} className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 transition hover:border-cyan-700 hover:text-white">
	                  <LogOut className="h-3.5 w-3.5" /> {t("auth.logout")}
                </button>
              </div>
            </div>
          </div>

          <ErrorBoundary title={t("error.actionLibrary")}>
	            {isActionLibrary ? (
	              <CommandCatalogPanel />
	            ) : (
	              <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-slate-100">
	                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	                  <div>
	                    <h2 className="text-lg font-semibold">{t("dashboard.shortcuts.title")}</h2>
	                    <p className="text-sm text-slate-400">{t("dashboard.shortcuts.libraryDesc")}</p>
	                  </div>
	                  <a href="/action-library" className="inline-flex items-center gap-2 rounded-md bg-cyan-700 px-3 py-2 text-sm text-white hover:bg-cyan-600">
	                    <Library className="h-4 w-4" /> {t("dashboard.shortcuts.library")}
	                  </a>
	                </div>
	              </section>
	            )}
          </ErrorBoundary>

          <ErrorBoundary title={t("error.dailyCheck")}>
            <DailyCheckPanel />
          </ErrorBoundary>
          <ErrorBoundary title={t("error.serviceHealth")}>
            <LinuxServiceHealthPanel />
          </ErrorBoundary>
          <ErrorBoundary title={t("error.aiAssistant")}>
            <AiSecurityAssistantPanel />
          </ErrorBoundary>
          <ErrorBoundary title={t("error.actionCenter")}>
            <ActionCenterPanel />
          </ErrorBoundary>
          <details className="mb-4 rounded-lg border border-zinc-800 bg-slate-950/60 p-4 text-left">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-100">{t("sections.devices")}</summary>
            <div className="mt-4">
              <ErrorBoundary title={t("error.deviceRegistry")}>
                <DeviceRegistryPanel />
              </ErrorBoundary>
            </div>
          </details>
          <details className="mb-4 rounded-lg border border-zinc-800 bg-slate-950/60 p-4 text-left">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-100">{t("sections.monitoring")}</summary>
            <div className="mt-4">
              <ErrorBoundary title={t("error.telemetry")}>
                <LinuxTelemetryPanel />
              </ErrorBoundary>
            </div>
          </details>
          <details className="mb-4 rounded-lg border border-zinc-800 bg-slate-950/60 p-4 text-left">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-100">{t("sections.events")}</summary>
            <div className="mt-4">
              <ErrorBoundary title={t("error.upload")}>
                <div id="log-upload" className="scroll-mt-4">
                  <FirewallTypeSelector />
                  <CsvUploader />
                </div>
              </ErrorBoundary>
              <ErrorBoundary title={t("error.securityEvents")}>
                <SecurityEventsPanel />
              </ErrorBoundary>
              <ErrorBoundary title={t("error.incidents")}>
                <IncidentsPanel />
              </ErrorBoundary>
              <details className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-100">{t("sections.importDiagnostics")}</summary>
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
            <summary className="cursor-pointer text-sm font-semibold text-zinc-100">{t("sections.vendorReadiness")}</summary>
            <div className="mt-4">
              <ErrorBoundary title={t("error.fortigateMatrix")}>
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
