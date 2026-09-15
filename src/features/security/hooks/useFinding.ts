import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/config/frontendEnv";
import { type SecurityFinding } from "@/lib/platform";

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : {};
  if (!response.ok) throw new Error(typeof payload === "object" && payload && "error" in payload ? String((payload as { error: unknown }).error) : `Request failed: ${response.status}`);
  return payload as T;
}

export function useFinding(id?: string) {
  const [finding, setFinding] = useState<SecurityFinding | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    request<SecurityFinding>(`/security/findings/${id}`)
      .then(setFinding)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Finding detail unavailable"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => refresh(), [refresh]);

  return { finding, loading, error, refresh };
}
