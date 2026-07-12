import { useCallback, useEffect, useState } from "react";
import { type PlatformAsset } from "@/lib/platform";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : {};
  if (!response.ok) throw new Error(typeof payload === "object" && payload && "error" in payload ? String((payload as { error: unknown }).error) : `Request failed: ${response.status}`);
  return payload as T;
}

export function useAsset(id?: string) {
  const [asset, setAsset] = useState<PlatformAsset | null>(null);
  const [topology, setTopology] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    Promise.all([request<PlatformAsset>(`/assets/${id}`), request<Record<string, unknown>>(`/assets/${id}/topology`)])
      .then(([nextAsset, nextTopology]) => {
        setAsset(nextAsset);
        setTopology(nextTopology);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Asset detail unavailable"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => refresh(), [refresh]);

  return { asset, topology, loading, error, refresh };
}
