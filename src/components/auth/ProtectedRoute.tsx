import { lazy, Suspense, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "react-router-dom";

const LoginPage = lazy(() => import("./LoginPage"));

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, loading, restoreError, retrySessionRestore } = useAuth();
  const normalizedPath = location.pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath === "/" || normalizedPath === "/landing") return children;
  if (loading) return <div className="auth-loading" role="status"><span />در حال بررسی نشست امن…</div>;
  if (restoreError) return <div className="auth-loading auth-loading--error" role="alert"><strong>سرویس ورود در دسترس نیست</strong><small>اتصال برنامه به سرور احراز هویت برقرار نشد.</small><button type="button" onClick={() => void retrySessionRestore()}>تلاش دوباره</button></div>;
  return user ? children : (
    <Suspense fallback={<div className="auth-loading" role="status"><span />در حال آماده‌سازی صفحه ورود…</div>}>
      <LoginPage />
    </Suspense>
  );
}
