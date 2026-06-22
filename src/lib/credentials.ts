const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type DeviceCredentialType = "password" | "private_key";

export type DeviceCredential = {
  id: string;
  name: string;
  type: DeviceCredentialType;
  username: string;
  sudo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CredentialInput = {
  name: string;
  type: DeviceCredentialType;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  sudo: boolean;
};

const normalizeObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const normalizeArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as { credentials?: unknown }).credentials)) {
    return (value as { credentials: T[] }).credentials;
  }
  return [];
};

function parsePayload(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function apiErrorMessage(url: string, status: number, payload: unknown) {
  const body = normalizeObject(payload);
  const detail = typeof body.error === "string"
    ? `${body.error}${typeof body.detail === "string" ? `: ${body.detail}` : ""}`
    : typeof body.message === "string"
      ? body.message
      : "No response details were provided.";
  return `Credential API error ${status}: ${detail} [${url}]`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    ...init,
  });

  if (response.status === 204) return undefined as T;
  const payload = parsePayload(await response.text());
  if (!response.ok) throw new Error(apiErrorMessage(url, response.status, payload));
  return payload as T;
}

export function normalizeCredential(value: unknown): DeviceCredential {
  const source = normalizeObject(value);
  return {
    id: String(source.id ?? ""),
    name: String(source.name ?? ""),
    type: String(source.type ?? "password") as DeviceCredentialType,
    username: String(source.username ?? ""),
    sudo: Boolean(source.sudo),
    createdAt: String(source.createdAt ?? ""),
    updatedAt: String(source.updatedAt ?? ""),
  };
}

export async function listCredentials() {
  const payload = await requestJson<unknown>("/credentials");
  const source = normalizeObject(payload);
  return normalizeArray<unknown>(source.credentials).map(normalizeCredential);
}

export function createCredential(input: CredentialInput) {
  return requestJson<unknown>("/credentials", {
    method: "POST",
    body: JSON.stringify(input),
  }).then(normalizeCredential);
}

export function deleteCredential(id: string) {
  return requestJson<void>(`/credentials/${id}`, { method: "DELETE" });
}
