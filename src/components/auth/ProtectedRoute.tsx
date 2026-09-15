import { lazy, Suspense, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";

const LoginPage = lazy(() => import("./LoginPage"));

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, restoreError, retrySessionRestore } = useAuth();
  if (loading) return <div className="auth-loading" role="status"><span />در حال بررسی نشست امن…</div>;
  if (restoreError) return <div className="auth-loading auth-loading--error" role="alert"><strong>سرویس ورود در دسترس نیست</strong><small>اتصال برنامه به سرور احراز هویت برقرار نشد.</small><button type="button" onClick={() => void retrySessionRestore()}>تلاش دوباره</button></div>;
  return user ? children : (
    <Suspense fallback={<div className="auth-loading" role="status"><span />در حال آماده‌سازی صفحه ورود…</div>}>
      <LoginPage />
    </Suspense>
  );
}
