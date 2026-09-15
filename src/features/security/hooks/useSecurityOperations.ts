import { useCallback, useEffect, useMemo, useState } from "react";
import { getIncidents, type Incident } from "@/lib/incidents";
import {
  listDetectionRules,
  listPlatformAssets,
  listSecurityFindings,
  type DetectionRule,
  type PlatformAsset,
  type SecurityFinding,
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

  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([listSecurityFindings(), listDetectionRules(), getIncidents(), listPlatformAssets("active")])
      .then(([findingResult, ruleResult, incidentResult, assetResult]) => {
        setFindings(findingResult.findings ?? []);
        setRules(ruleResult.rules ?? []);
        setIncidents(incidentResult);
        setAssets(assetResult.assets ?? []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Security operations data is unavailable"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => refresh(), [refresh]);

  const stats = useMemo(() => {
    const openFindings = findings.filter((finding) => !closedFindingStatuses.has(finding.status));
    const openIncidents = incidents.filter((incident) => !closedIncidentStatuses.has(incident.status));
    const enabledRules = rules.filter((rule) => rule.enabled).length;
    return {
      openFindings,
      openIncidents,
      critical: openFindings.filter((finding) => finding.severity === "critical").length,
      high: openFindings.filter((finding) => finding.severity === "high").length,
      affectedAssets: new Set(openFindings.map((finding) => finding.asset?.id ?? finding.device?.id).filter(Boolean)).size,
      enabledRules,
      ruleCoverage: rules.length ? Math.round((enabledRules / rules.length) * 100) : 0,
    };
  }, [findings, incidents, rules]);

  return { findings, rules, incidents, assets, stats, loading, error, refresh };
}
