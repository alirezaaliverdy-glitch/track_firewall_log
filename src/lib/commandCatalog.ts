import type { ActionPlan } from "./actions";

const API = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");
export type CatalogParam = { key: string; labelFa: string; helpFa: string; type: string; placeholderFa?: string };
export type CatalogItem = { id: string; vendor: string; titleFa: string; titleEn: string; descriptionFa: string; category: string; actionType: string; riskLevel: string; readOnly: boolean; implementationState: "implemented" | "manualOnly" | "planned" | "unsupported"; executionSupport: string; requiredParams: CatalogParam[]; optionalParams: CatalogParam[]; defaultParams: Record<string, unknown>; tagsFa: string[]; disabledReasonFa: string | null; uiHints: { executable: boolean; badgeFa: string } };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: "include", headers: init?.body ? { "Content-Type": "application/json" } : undefined, ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.messageFa ?? body.detail ?? body.error ?? "خطا در ارتباط با سرور");
  return body as T;
}
export function searchCommands(filters: Record<string, string>) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  return request<{ count: number; items: CatalogItem[] }>(`/commands/catalog/search?${query}`);
}
export function createCatalogAction(id: string, deviceId: string, params: Record<string, unknown>) {
  return request<ActionPlan>(`/commands/catalog/${encodeURIComponent(id)}/create-action-plan`, { method: "POST", body: JSON.stringify({ deviceId, params }) });
}
export function proposeWithAi(requestText: string, vendor: string, deviceId?: string) {
  return request<{ draft: Record<string, unknown>; actionPlan: ActionPlan }>("/commands/ai-propose", { method: "POST", body: JSON.stringify({ request: requestText, vendor, deviceId }) });
}
