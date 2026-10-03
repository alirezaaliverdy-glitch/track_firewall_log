import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getIncidents, type Incident } from "@/lib/incidents";
import {
  listDetectionRules,
  listPlatformAssets,
  listSecurityFindings,
  getSecurityMonitoringStatus,
  getSecurityEmailAlertSettings,
  type DetectionRule,
  type PlatformAsset,
  type SecurityFinding,
  type SecurityMonitoringStatus,
  type SecurityEmailAlertSettings,
} from "@/lib/platform";

const closedFindingStatuses = new Set(["resolved", "false_positive", "accepted_risk", "suppressed"]);
const closedIncidentStatuses = new Set(["resolved", "false_positive"]);

export function useSecurityOperations() {
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [assets, setAssets] = useState<PlatformAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [monitoring, setMonitoring] = useState<SecurityMonitoringStatus | null>(null);
  const [emailSettings, setEmailSettings] = useState<SecurityEmailAlertSettings | null>(null);
  const [findingSummary, setFindingSummary] = useState<{ open: number; critical: number; high: number; affectedAssets: number } | null>(null);
  const pending = useRef(false);
  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    if (loaded.current) setRefreshing(true);
    try {
      const [findingResult, ruleResult, incidentResult, assetResult, monitorResult, emailResult] = await Promise.all([
        listSecurityFindings({ scope: "overview" }), listDetectionRules(), getIncidents(), listPlatformAssets("active"),
        getSecurityMonitoringStatus().catch(() => null),
        getSecurityEmailAlertSettings().catch(() => null),
      ]);
        setFindings(findingResult.findings ?? []);
        setFindingSummary(findingResult.summary ?? null);
        setRules(ruleResult.rules ?? []);
        setIncidents(incidentResult);
        setAssets(assetResult.assets ?? []);
        setMonitoring(monitorResult);
        setEmailSettings(emailResult);
        setLastUpdatedAt(new Date().toISOString());
        setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Security operations data is unavailable");
    } finally {
      pending.current = false;
      loaded.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); };
  }, [refresh]);

  const stats = useMemo(() => {
    const openFindings = findings.filter((finding) => !closedFindingStatuses.has(finding.status));
    const openIncidents = incidents.filter((incident) => !closedIncidentStatuses.has(incident.status));
    const enabledRules = rules.filter((rule) => rule.enabled).length;
    return {
      openFindings,
      openIncidents,
      openCount: findingSummary?.open ?? openFindings.length,
      critical: findingSummary?.critical ?? openFindings.filter((finding) => finding.severity === "critical").length,
      high: findingSummary?.high ?? openFindings.filter((finding) => finding.severity === "high").length,
      affectedAssets: findingSummary?.affectedAssets ?? new Set(openFindings.map((finding) => finding.asset?.id ?? finding.device?.id).filter(Boolean)).size,
      enabledRules,
      ruleCoverage: rules.length ? Math.round((enabledRules / rules.length) * 100) : 0,
    };
  }, [findings, findingSummary, incidents, rules]);

  return { findings, rules, incidents, assets, stats, loading, refreshing, lastUpdatedAt, monitoring, emailSettings, error, refresh };
}
