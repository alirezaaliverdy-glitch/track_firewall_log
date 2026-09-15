import { useCallback, useEffect, useState } from "react";
import { listDetectionRules, setDetectionRuleEnabled, type DetectionRule } from "@/lib/platform";

export function useDetectionRules() {
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    setActionError("");
    listDetectionRules()
      .then((result) => setRules(result.rules ?? []))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Detection rules unavailable"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => refresh(), [refresh]);

  const updateEnabled = useCallback(async (id: string, enabled: boolean) => {
    setBusyId(id);
    setActionError("");
    try {
      const updated = await setDetectionRuleEnabled(id, enabled);
      setRules((current) => current.map((rule) => rule.id === id ? { ...rule, ...updated } : rule));
    } catch (reason: unknown) {
      setActionError(reason instanceof Error ? reason.message : "Detection rule update failed");
    } finally {
      setBusyId("");
    }
  }, []);

  return { rules, loading, error, actionError, busyId, refresh, updateEnabled };
}
