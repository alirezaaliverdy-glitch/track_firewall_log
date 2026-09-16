import "./App.css";
import { Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Route, Routes, useNavigate, useParams } from "react-router-dom";
import { LogProvider } from "@/context/LogContext";
import AppBackground from "@/components/background/AppBackground";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import ActionResultView from "@/components/actions/ActionResultView";
import GuidedActionWizard from "@/components/guided-actions/GuidedActionWizard";
import CommandCatalogPanel from "@/components/commands/CommandCatalogPanel";
import { AppShell } from "@/components/layout/AppShell";
import { appRoutes, type AppRoute } from "@/routes/appRoutes";
import WorkflowLabPage from "@/features/tools/pages/WorkflowLabPage";
import { normalizeAppDeepLink } from "@/lib/deepLinks";
import LandingPage from "@/features/landing/pages/LandingPage";

function StandaloneGuidedAction({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  return (
    <div className="authenticated-app" data-page-id="actions.guided.session">
      <AppBackground />
      <main className="App relative z-10 mx-auto max-w-screen-lg px-4 pb-12 pt-6 sm:px-6">
        <h1 dir="rtl" className="mb-4 text-right text-2xl font-bold text-slate-100">ساخت مرحله ای اکشن</h1>
        <GuidedActionWizard sessionId={sessionId} onClose={() => navigate("/actions")} />
      </main>
    </div>
  );
}

const legacyDashboardShortcutKey = "dashboard.shortcuts.library";
void legacyDashboardShortcutKey;

function GuidedActionRoute() {
  const { sessionId = "" } = useParams();
  return <StandaloneGuidedAction sessionId={sessionId} />;
}

function ActionResultRoute() {
  const { actionId = "" } = useParams();
  return <div className="authenticated-app" data-page-id="actions.result"><AppBackground /><ActionResultView actionPlanId={actionId} /></div>;
}

function MonitoringActionResultRoute() {
  const { actionId = "" } = useParams();
  return <div className="authenticated-app" data-page-id="monitoring.action_result"><AppBackground /><ActionResultView actionPlanId={actionId} /></div>;
}

function FeatureRoute({ route }: { route: AppRoute }) {
  const params = useParams();
  const Page = route.component;
  return (
    <div className="authenticated-app" data-page-id={route.featureKey}>
      <AppBackground />
      <AppShell currentPath={route.path}>
        <ErrorBoundary title={route.labelFa}>
          <Page params={params as Record<string, string>} />
        </ErrorBoundary>
      </AppShell>
    </div>
  );
}

function WorkflowLabRoute() {
  const { t } = useTranslation();
  return (
    <div className="authenticated-app" data-page-id="tools.workflow_lab">
      <AppBackground />
      <AppShell currentPath="/tools">
        <ErrorBoundary title={t("workflowLab.title")}><WorkflowLabPage /></ErrorBoundary>
      </AppShell>
    </div>
  );
}

function ActionLibraryRoute() {
  const { t } = useTranslation();
  return (
    <div className="authenticated-app" data-page-id="actions.library">
      <AppBackground />
      <AppShell currentPath="/actions">
        <ErrorBoundary title={t("error.actionLibrary")}><CommandCatalogPanel /></ErrorBoundary>
      </AppShell>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="authenticated-app" data-page-id="not-found">
      <AppBackground />
      <AppShell currentPath="">
        <section className="state-card" role="alert">
          <h1>404</h1>
          <p>Page not found / صفحه پیدا نشد</p>
        </section>
      </AppShell>
    </div>
  );
}

function RouterNavigationBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (event: Event) => {
      const to = event instanceof CustomEvent && typeof event.detail?.to === "string" ? event.detail.to : "";
      if (to) navigate(normalizeAppDeepLink(to));
    };
    window.addEventListener("app:navigate", handler);
    return () => window.removeEventListener("app:navigate", handler);
  }, [navigate]);
  return null;
}

function App() {
  return (
    <Suspense fallback={<h1>loading...</h1>}>
      <LogProvider>
        <RouterNavigationBridge />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/action-library" element={<ActionLibraryRoute />} />
          <Route path="/guided-actions/:sessionId" element={<GuidedActionRoute />} />
          <Route path="/actions/:actionId/result" element={<ActionResultRoute />} />
          <Route path="/monitoring/actions/:actionId/result" element={<MonitoringActionResultRoute />} />
          {import.meta.env.DEV ? <Route path="/tools/workflow-lab" element={<WorkflowLabRoute />} /> : null}
          {appRoutes.map((route) => <Route key={route.featureKey} path={route.path} element={<FeatureRoute route={route} />} />)}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </LogProvider>
    </Suspense>
  );
}

export default App;
