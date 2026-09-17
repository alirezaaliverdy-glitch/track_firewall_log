import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as authApi from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.getCurrentUser().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => setUser(await authApi.login(username, password)), []);
  const logout = useCallback(async () => {
    try { await authApi.logout(); } finally { setUser(null); }
  }, []);
  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
