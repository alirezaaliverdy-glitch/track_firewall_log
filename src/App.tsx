import "./App.css";
import { Suspense } from "react";
import { LogProvider } from "@/context/LogContext";
import LogTable from "./components/log-table";
import LogChart from "./components/log-chart";

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
