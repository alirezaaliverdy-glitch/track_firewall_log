import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import LoginPage from "./LoginPage";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-loading"><span />Verifying secure session…</div>;
  return user ? children : <LoginPage />;
}
