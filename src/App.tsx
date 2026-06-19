import "./App.css";
import { Suspense } from "react";
import { LogProvider } from "@/context/LogContext";
import CsvUploader from "./components/csv-uploader";
import FirewallTypeSelector from "./components/upload/FirewallTypeSelector";
import ColumnMappingWizard from "./components/upload/ColumnMappingWizard";
import SummaryCards from "./components/dashboard/SummaryCards";
import DataQualityPanel from "./components/dashboard/DataQualityPanel";
import SensitivePortsExplorer from "./components/dashboard/SensitivePortsExplorer";
import FindingsPanel from "./components/findings/FindingsPanel";
import FindingDetails from "./components/findings/FindingDetails";
import ActionDistributionChart from "./components/charts/ActionDistributionChart";
import TopPortsChart from "./components/charts/TopPortsChart";
import LogChart from "./components/log-chart";
import LogTable from "./components/log-table";
import ExportButtons from "./components/export/ExportButtons";
import WorkflowGuide from "./components/layout/WorkflowGuide";

function App() {
  return (
    <Suspense fallback={<h1>loading logs ...</h1>}>
      <LogProvider>
        <div className="App max-w-screen-2xl mx-auto px-4 pb-12">

          {/* Header */}
          <div className="flex items-center w-full justify-between">
            <h2 className="text-3xl font-semibold text-left my-4">
              Firewall Log Analyzer
            </h2>
          </div>

          {/* Workflow Guide */}
          <WorkflowGuide />

          {/* 1. Upload */}
          <FirewallTypeSelector />
          <CsvUploader />

          {/* 2. Column mapping wizard */}
          <ColumnMappingWizard />

          {/* 3. Summary cards */}
          <SummaryCards />

          {/* 4. Export buttons */}
          <ExportButtons />

          {/* 5. Data quality */}
          <DataQualityPanel />

          {/* 6. Security findings */}
          <FindingsPanel />

          {/* 7. Finding details — only visible when a finding is selected */}
          <FindingDetails />

          <SensitivePortsExplorer />

          {/* 8. Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <ActionDistributionChart />
            <TopPortsChart />
          </div>

          {/* 9. Bytes-over-time chart */}
          <LogChart />

          {/* 10. Log table */}
          <LogTable />

        </div>
      </LogProvider>
    </Suspense>
  );
}

export default App;
