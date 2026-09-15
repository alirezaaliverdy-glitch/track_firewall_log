import { apiRequest } from "./apiTransport";
import { resetCsrfToken } from "./csrfFetch";
import { isNativeAndroidApp } from "@/mobile/nativeServerConfig";
import { clearNativeSessionToken, setNativeSessionToken } from "@/mobile/nativeSession";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "operator" | "viewer";
  allowedSections: string[];
};

export type ApplicationSection = "dashboard" | "assets" | "security" | "monitoring" | "actions" | "assistant" | "attackers";

export type ManagedUser = {
  id: string;
  username: string;
  displayName: string;
  role: AuthUser["role"];
  isActive: boolean;
  allowedSections: ApplicationSection[];
  effectivePermissions: string[];
  activeSessionCount: number;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserAccessCatalog = {
  sections: ApplicationSection[];
  roles: Array<{ role: AuthUser["role"]; permissions: string[] }>;
};

export type AuthSession = {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
};

export class AuthApiError extends Error {
  readonly code: string;
  readonly retryAfter: number;
  readonly violations: string[];

  constructor(
    code: string,
    retryAfter = 0,
    violations: string[] = []
  ) {
    super(code);
    this.name = "AuthApiError";
    this.code = code;
    this.retryAfter = retryAfter;
    this.violations = violations;
  }
}

async function authError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as {
    error?: string;
    retryAfter?: number;
    violations?: string[];
  };
  return new AuthApiError(
    body.error ?? fallback,
    Number(body.retryAfter ?? response.headers.get("Retry-After") ?? 0),
    Array.isArray(body.violations) ? body.violations : []
  );
}

async function authRequest(path: string, init?: RequestInit) {
  return apiRequest(path, init);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await authRequest("/auth/session-status");
  if (response.status === 401) {
    await clearNativeSessionToken();
    return null;
  }
  if (!response.ok) throw await authError(response, "session_unavailable");
  const user = ((await response.json()) as { user: AuthUser | null }).user;
  if (!user && isNativeAndroidApp()) await clearNativeSessionToken();
  return user;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const response = await authRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) throw await authError(response, response.status === 401 ? "invalid_credentials" : "login_unavailable");
  const body = (await response.json()) as { user: AuthUser; sessionToken?: string };
  if (isNativeAndroidApp()) {
    if (!body.sessionToken) throw new AuthApiError("native_session_unavailable");
    await setNativeSessionToken(body.sessionToken);
  }
  resetCsrfToken();
  return body.user;
}

export async function logout() {
  try {
    await authRequest("/auth/logout", { method: "POST" });
  } finally {
    resetCsrfToken();
    await clearNativeSessionToken();
  }
}

export async function logoutAll() {
  const response = await authRequest("/auth/logout-all", { method: "POST" });
  if (!response.ok) throw await authError(response, "logout_all_failed");
  resetCsrfToken();
  await clearNativeSessionToken();
}

export async function listSessions(): Promise<AuthSession[]> {
  const response = await authRequest("/auth/sessions");
  if (!response.ok) throw await authError(response, "sessions_unavailable");
  return ((await response.json()) as { sessions: AuthSession[] }).sessions;
}

export async function revokeSession(id: string) {
  const response = await authRequest(`/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw await authError(response, "session_revoke_failed");
  const result = await response.json() as { currentSessionRevoked: boolean };
  if (result.currentSessionRevoked) {
    resetCsrfToken();
    await clearNativeSessionToken();
  }
  return result;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const response = await authRequest("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword })
  });
  if (!response.ok) throw await authError(response, "password_change_failed");
  resetCsrfToken();
  await clearNativeSessionToken();
}

export async function listManagedUsers(): Promise<{ users: ManagedUser[]; catalog: UserAccessCatalog }> {
  const response = await authRequest("/admin/users");
  if (!response.ok) throw await authError(response, "users_unavailable");
  return response.json();
}

export async function createManagedUser(input: { username: string; displayName: string; password: string; role: AuthUser["role"]; allowedSections: ApplicationSection[] }) {
  const response = await authRequest("/admin/users", { method: "POST", body: JSON.stringify(input) });
  if (!response.ok) throw await authError(response, "user_create_failed");
  return (await response.json() as { user: ManagedUser }).user;
}

export async function updateManagedUser(id: string, input: { displayName: string; role: AuthUser["role"]; isActive: boolean; allowedSections: ApplicationSection[] }) {
  const response = await authRequest(`/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
  if (!response.ok) throw await authError(response, "user_update_failed");
  return (await response.json() as { user: ManagedUser }).user;
}

export async function resetManagedUserPassword(id: string, password: string) {
  const response = await authRequest(`/admin/users/${encodeURIComponent(id)}/reset-password`, { method: "POST", body: JSON.stringify({ password }) });
  if (!response.ok) throw await authError(response, "password_reset_failed");
  return response.json() as Promise<{ ok: true; sessionsRevoked: true }>;
}
