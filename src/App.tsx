import "./App.css";
import LogTable from "./components/log-table";
import LogChart from "./components/log-chart";
import { LogProvider } from "@/context/LogContext";
import { Suspense } from "react";

function App() {
  return (
    <Suspense fallback={<h1>loading logs ...</h1>}>
      <LogProvider>
        <div className="App">
          <div className="flex items-center w-full justify-between">
            <h2 className="text-3xl font-semibold text-left my-4">
              Firewall Packet Tracer Logs (JSON)
            </h2>
          </div>
          <LogChart />
          <LogTable />
        </div>
      </LogProvider>
    </Suspense>
  );
}

export default App;
