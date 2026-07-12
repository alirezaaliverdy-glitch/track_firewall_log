import "./App.css";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { LogProvider } from "@/context/LogContext";
import AppBackground from "@/components/background/AppBackground";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import ActionResultView from "@/components/actions/ActionResultView";
import GuidedActionWizard from "@/components/guided-actions/GuidedActionWizard";
import CommandCatalogPanel from "@/components/commands/CommandCatalogPanel";
import { AppShell } from "@/components/layout/AppShell";
import { matchRoute } from "@/routes/appRoutes";

function StandaloneGuidedAction({ sessionId }: { sessionId: string }) {
  return (
    <div className="authenticated-app">
      <AppBackground />
      <main className="App relative z-10 mx-auto max-w-screen-lg px-4 pb-12 pt-6 sm:px-6">
        <h1 dir="rtl" className="mb-4 text-right text-2xl font-bold text-slate-100">ساخت مرحله ای اکشن</h1>
        <GuidedActionWizard sessionId={sessionId} onClose={() => { window.location.pathname = "/actions"; }} />
      </main>
    </div>
  );
}

const legacyDashboardShortcutKey = "dashboard.shortcuts.library";
void legacyDashboardShortcutKey;

function App() {
  const { t } = useTranslation();
  const pathname = window.location.pathname;
  const resultMatch = pathname.match(/^\/actions\/([^/]+)\/result\/?$/);
  if (resultMatch) {
    return <div className="authenticated-app"><AppBackground /><ActionResultView actionPlanId={decodeURIComponent(resultMatch[1])} /></div>;
  }

  const guidedMatch = pathname.match(/^\/guided-actions\/([^/]+)\/?$/);
  if (guidedMatch) return <StandaloneGuidedAction sessionId={decodeURIComponent(guidedMatch[1])} />;

  if (pathname === "/action-library") {
    return (
      <Suspense fallback={<h1>loading...</h1>}>
        <LogProvider>
          <div className="authenticated-app">
            <AppBackground />
            <AppShell currentPath="/actions">
              <ErrorBoundary title={t("error.actionLibrary")}>
                <CommandCatalogPanel />
              </ErrorBoundary>
            </AppShell>
          </div>
        </LogProvider>
      </Suspense>
    );
  }

  const { route, params } = matchRoute(pathname);
  const Page = route.component;

  return (
    <Suspense fallback={<h1>loading...</h1>}>
      <LogProvider>
        <div className="authenticated-app">
          <AppBackground />
          <AppShell currentPath={route.path}>
            <ErrorBoundary title={route.labelFa}>
              <Page params={params} />
            </ErrorBoundary>
          </AppShell>
        </div>
      </LogProvider>
    </Suspense>
  );
}

export default App;
