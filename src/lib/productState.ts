import { API_BASE_URL } from "@/config/frontendEnv";

export type ProductFeatureState = "implemented" | "partial" | "not_configured" | "unverified" | "planned" | "unsupported" | "disabled";
export type ProductNavigationItem = { key: string; titleFa: string; titleEn: string; route: string; state: ProductFeatureState };
export type ProductNavigationGroup = { key: string; titleFa: string; titleEn: string; iconKey: string; route: string; mobilePrimary: boolean; items: ProductNavigationItem[] };

export async function getProductNavigation() {
  const response = await fetch(`${API_BASE_URL}/product-state/navigation`, { credentials: "include" });
  if (!response.ok) throw new Error(`Product state request failed: ${response.status}`);
  const payload = await response.json() as { contractVersion: string; navigation: ProductNavigationGroup[] };
  return payload.navigation;
}
