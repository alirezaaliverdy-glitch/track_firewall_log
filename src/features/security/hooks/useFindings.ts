import { useCallback, useEffect, useMemo, useState } from "react";
import { listSecurityFindings, type SecurityFinding } from "@/lib/platform";

export function useFindings() {
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    listSecurityFindings()
      .then((result) => setFindings(result.findings ?? []))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Finding API unavailable"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => refresh(), [refresh]);

  const stats = useMemo(() => ({
    open: findings.filter((finding) => !["resolved", "false_positive", "accepted_risk", "suppressed"].includes(finding.status)).length,
    critical: findings.filter((finding) => finding.severity === "critical").length,
    high: findings.filter((finding) => finding.severity === "high").length,
    affectedAssets: new Set(findings.map((finding) => finding.asset?.id ?? finding.device?.id).filter(Boolean)).size
  }), [findings]);

  return { findings, stats, loading, error, refresh };
}
