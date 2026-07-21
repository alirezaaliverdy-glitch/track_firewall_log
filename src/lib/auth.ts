const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "operator" | "viewer";
};

async function authRequest(path: string, init?: RequestInit) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await authRequest("/auth/session-status");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("network");
  return ((await response.json()) as { user: AuthUser | null }).user;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const response = await authRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  if (response.status === 401) throw new Error("invalid_credentials");
  if (!response.ok) throw new Error("network");
  return ((await response.json()) as { user: AuthUser }).user;
}

export async function logout() {
  await authRequest("/auth/logout", { method: "POST" });
}
