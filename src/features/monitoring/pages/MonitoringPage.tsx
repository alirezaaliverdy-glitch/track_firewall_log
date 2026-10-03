import DailyCheckPanel from "@/components/daily-check/DailyCheckPanel";
import { Navigate, useLocation } from "react-router-dom";
import "./MonitoringPage.css";

export default function MonitoringPage() {
  const location = useLocation();
  if (location.pathname !== "/monitoring/daily-check") return <Navigate to="/assets" replace />;
  return (
    <section className="monitoring-page">
      <DailyCheckPanel />
    </section>
  );
}
