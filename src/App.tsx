import "./App.css";
import { Suspense } from "react";
import { LogProvider } from "@/context/LogContext";
import CsvUploader from "./components/csv-uploader";
import SummaryCards from "./components/dashboard/SummaryCards";
import DataQualityPanel from "./components/dashboard/DataQualityPanel";
import FindingsPanel from "./components/findings/FindingsPanel";
import ActionDistributionChart from "./components/charts/ActionDistributionChart";
import TopPortsChart from "./components/charts/TopPortsChart";
import LogChart from "./components/log-chart";
import LogTable from "./components/log-table";
import ExportButtons from "./components/export/ExportButtons";

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

          {/* 1. Upload + privacy notice */}
          <CsvUploader />

          {/* 2. Summary cards */}
          <SummaryCards />

          {/* 3. Export buttons — only visible when data is loaded */}
          <ExportButtons />

          {/* 4. Data quality */}
          <DataQualityPanel />

          {/* 5. Security findings */}
          <FindingsPanel />

          {/* 6. Charts side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <ActionDistributionChart />
            <TopPortsChart />
          </div>

          {/* 7. Bytes-over-time chart */}
          <LogChart />

          {/* 8. Log table */}
          <LogTable />

        </div>
      </LogProvider>
    </Suspense>
  );
}

export default App;
