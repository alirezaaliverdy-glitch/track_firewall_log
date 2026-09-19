import { useCallback, useEffect, useMemo, useState } from "react";
import { listPlatformAssets, type PlatformAsset } from "@/lib/platform";

export function useAssets(companyId?: string) {
  const [assets, setAssets] = useState<PlatformAsset[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    listPlatformAssets("active", companyId)
      .then((result) => {
        setAssets(result.assets ?? []);
        setSummary(result.summary ?? {});
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Asset API unavailable"))
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => refresh(), [refresh]);

  const stats = useMemo(() => {
    const total = assets.length;
    const managed = assets.filter((asset) => asset.managedState === "managed").length;
    const online = assets.filter((asset) => ["online", "healthy"].includes(asset.healthState)).length;
    const unmanaged = assets.filter((asset) => asset.managedState !== "managed").length;
    const unreachable = assets.filter((asset) => ["offline", "error", "unknown"].includes(asset.healthState)).length;
    const needsReview = assets.filter((asset) => !["online", "healthy"].includes(asset.healthState)).length;
    const withoutSite = assets.filter((asset) => !asset.site?.name).length;
    return { total, managed, online, unmanaged, unreachable, needsReview, withoutSite };
  }, [assets]);

  return { assets, summary, stats, loading, error, refresh };
}
