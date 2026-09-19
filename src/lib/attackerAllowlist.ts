import { apiRequest } from "./apiTransport";

export type TrustedSourceIp = { id: string; ip: string; vendor: string; label: string | null; enabled: boolean; createdAt: string };

async function responseError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return new Error(body.error ?? "TRUSTED_SOURCE_REQUEST_FAILED");
}

export async function listTrustedSourceIps() {
  const response = await apiRequest("/security/attackers-allowlist");
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<{ entries: TrustedSourceIp[]; vendors: string[] }>;
}

export async function createTrustedSourceIp(input: { ip: string; vendor: string; label: string }) {
  const response = await apiRequest("/security/attackers-allowlist", { method: "POST", body: JSON.stringify(input) });
  if (!response.ok) throw await responseError(response);
  return (await response.json() as { entry: TrustedSourceIp }).entry;
}

export async function deleteTrustedSourceIp(id: string) {
  const response = await apiRequest(`/security/attackers-allowlist/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw await responseError(response);
}
