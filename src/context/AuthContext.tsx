import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as authApi from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  restoreError: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  retrySessionRestore: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

let sessionRestorePromise: Promise<AuthUser | null> | null = null;

function restoreCurrentUser() {
  if (!sessionRestorePromise) {
    const request = authApi.getCurrentUser().finally(() => {
      if (sessionRestorePromise === request) sessionRestorePromise = null;
    });
    sessionRestorePromise = request;
  }
  return sessionRestorePromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoreError, setRestoreError] = useState(false);

  const restore = useCallback(async () => {
    setLoading(true);
    setRestoreError(false);
    try {
      setUser(await restoreCurrentUser());
    } catch {
      setRestoreError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    restoreCurrentUser().then((currentUser) => {
      if (active) setUser(currentUser);
    }).catch(() => {
      if (active) setRestoreError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => setUser(null);
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => setUser(await authApi.login(username, password)), []);
  const logout = useCallback(async () => {
    try { await authApi.logout(); } finally { setUser(null); }
  }, []);
  const logoutAll = useCallback(async () => {
    await authApi.logoutAll();
    setUser(null);
  }, []);
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await authApi.changePassword(currentPassword, newPassword);
    window.sessionStorage.setItem("auth.notice", "password_changed");
    setUser(null);
  }, []);
  const value = useMemo(() => ({ user, loading, restoreError, login, logout, logoutAll, changePassword, retrySessionRestore: restore }), [user, loading, restoreError, login, logout, logoutAll, changePassword, restore]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Context hooks intentionally share this module with the provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
