import { useCallback, useEffect, useState } from "react";
import { listDetectionRules, type DetectionRule } from "@/lib/platform";

export function useDetectionRules() {
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    listDetectionRules()
      .then((result) => setRules(result.rules ?? []))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Detection rules unavailable"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => refresh(), [refresh]);

  return { rules, loading, error, refresh };
}
