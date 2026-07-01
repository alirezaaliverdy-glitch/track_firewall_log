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
import SecurityEventsPanel from "./components/events/SecurityEventsPanel";
import ErrorBoundary from "./components/common/ErrorBoundary";
import IncidentsPanel from "./components/incidents/IncidentsPanel";
import AiSecurityAssistantPanel from "./components/ai/AiSecurityAssistantPanel";
import ActionCenterPanel from "./components/actions/ActionCenterPanel";
import FortiGateCapabilityMatrixPanel from "./components/fortigate/FortiGateCapabilityMatrixPanel";

function App() {
  const { user, logout } = useAuth();
  return (
    <Suspense fallback={<h1>loading logs ...</h1>}>
      <LogProvider>
        <div className="App max-w-screen-2xl mx-auto px-4 pb-12 pt-4 sm:px-6">
          <div className="mb-4 overflow-hidden rounded-xl border border-blue-900/50 bg-slate-950/70 shadow-[inset_0_1px_0_rgba(59,130,246,0.14)]">
            <div className="h-1 bg-gradient-to-r from-blue-600 via-sky-400 to-blue-900" />
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-left text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
                  Firewall Log Analyzer
                </h1>
                <p className="mt-1 text-left text-sm text-slate-400">
                  Backend-powered firewall import, findings, evidence, and export review.
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

          <ErrorBoundary title="AI Security Assistant unavailable">
            <AiSecurityAssistantPanel />
          </ErrorBoundary>
          <ErrorBoundary title="Action Center unavailable">
            <ActionCenterPanel />
          </ErrorBoundary>
          <details className="mb-4 rounded-lg border border-zinc-800 bg-slate-950/60 p-4 text-left">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-100">Manage Devices</summary>
            <div className="mt-4">
              <ErrorBoundary title="Device Registry unavailable">
                <DeviceRegistryPanel />
              </ErrorBoundary>
            </div>
          </details>
          <details className="mb-4 rounded-lg border border-zinc-800 bg-slate-950/60 p-4 text-left">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-100">Events / Incidents / Logs</summary>
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
        </div>
      </LogProvider>
    </Suspense>
  );
}

export default App;
