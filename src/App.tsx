import "./App.css";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
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

function App() {
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
              <div className="inline-flex w-fit items-center gap-2 rounded-md border border-blue-800/70 bg-blue-950/40 px-3 py-1.5 text-xs font-medium text-blue-200">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Backend analysis
              </div>
            </div>
          </div>

          <ErrorBoundary title="Upload panel unavailable">
            <FirewallTypeSelector />
            <CsvUploader />
          </ErrorBoundary>
          <ErrorBoundary title="Device Registry unavailable">
            <DeviceRegistryPanel />
          </ErrorBoundary>
          <ErrorBoundary title="Security Events unavailable">
            <SecurityEventsPanel />
          </ErrorBoundary>
          <ErrorBoundary title="Incidents unavailable">
            <IncidentsPanel />
          </ErrorBoundary>
          <ErrorBoundary title="AI Security Assistant unavailable">
            <AiSecurityAssistantPanel />
          </ErrorBoundary>
          <ErrorBoundary title="Action Center unavailable">
            <ActionCenterPanel />
          </ErrorBoundary>
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

          <DataQualityPanel />
          <TrafficDirectionPanel />
          <PolicyReviewPanel />
          <FindingsPanel />
          <FindingDetails />
          <LogTable />
          <SensitivePortsExplorer />
          <ExportButtons />
        </div>
      </LogProvider>
    </Suspense>
  );
}

export default App;
