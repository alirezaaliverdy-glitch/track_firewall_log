import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listSecurityFindings, type SecurityFinding } from "@/lib/platform";

export function useFindings() {
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const load = useCallback((showLoading = false) => {
    const currentRequest = ++requestId.current;
    if (showLoading) setLoading(true);
    return listSecurityFindings()
      .then((result) => {
        if (currentRequest !== requestId.current) return;
        setFindings(result.findings ?? []);
        setError("");
      })
      .catch((reason: unknown) => {
        if (currentRequest === requestId.current) setError(reason instanceof Error ? reason.message : "Finding API unavailable");
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
  }, []);

  const refresh = useCallback(() => { void load(true); }, [load]);

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(false);
    }, 5_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      requestId.current += 1;
    };
  }, [load]);

  const stats = useMemo(() => {
    const open = findings.filter((finding) => !["resolved", "closed", "false_positive", "accepted_risk", "suppressed"].includes(finding.status));
    return {
      open: open.length,
      critical: open.filter((finding) => finding.severity === "critical").length,
      high: open.filter((finding) => finding.severity === "high").length,
      affectedAssets: new Set(open.map((finding) => finding.asset?.id ?? finding.device?.id).filter(Boolean)).size
    };
  }, [findings]);

  return { findings, stats, loading, error, refresh };
}
