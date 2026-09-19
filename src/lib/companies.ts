import { API_BASE_URL } from "@/config/frontendEnv";

export type Company = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { devices: number; assets: number };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    ...init
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (!response.ok) throw new Error(String(body.error ?? `Company request failed (${response.status})`));
  return body as T;
}

export const listCompanies = (view: "active" | "deleted" | "all" = "active") =>
  request<{ companies: Company[] }>(`/companies?view=${view}`).then((result) => result.companies);

export const createCompany = (input: { name: string; code: string; description?: string }) =>
  request<{ company: Company }>("/companies", { method: "POST", body: JSON.stringify(input) }).then((result) => result.company);

export const updateCompany = (id: string, input: { name: string; code: string; description?: string }) =>
  request<{ company: Company }>(`/companies/${id}`, { method: "PATCH", body: JSON.stringify(input) }).then((result) => result.company);

export const archiveCompany = (id: string, confirmation: string) =>
  request<{ id: string; deletedAt: string }>(`/companies/${id}`, { method: "DELETE", body: JSON.stringify({ confirmation }) });

export const restoreCompany = (id: string) =>
  request<{ company: Company }>(`/companies/${id}/restore`, { method: "POST", body: "{}" }).then((result) => result.company);

export const ACTIVE_COMPANY_STORAGE_KEY = "firewall.activeCompanyId";
