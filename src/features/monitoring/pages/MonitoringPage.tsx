import DailyCheckPanel from "@/components/daily-check/DailyCheckPanel";
import { useLocation } from "react-router-dom";
import OperationsMonitoring from "./OperationsMonitoring";
import "./MonitoringPage.css";

export default function MonitoringPage() {
  const location = useLocation();
  if (location.pathname !== "/monitoring/daily-check") return <OperationsMonitoring />;
  return (
    <section className="monitoring-page">
      <DailyCheckPanel />
    </section>
  );
}
