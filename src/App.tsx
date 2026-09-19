import "./i18n";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { LogProvider } from "@/context/LogContext";
import { useAuth } from "@/context/AuthContext";
import AppBackground from "@/components/background/AppBackground";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import { AppShell } from "@/components/layout/AppShell";
import { appRoutes, type AppRoute } from "@/routes/appRoutes";
import { normalizeAppDeepLink } from "@/lib/deepLinks";

const ActionResultView = lazy(() => import("@/components/actions/ActionResultView"));
const GuidedActionWizard = lazy(() => import("@/components/guided-actions/GuidedActionWizard"));
const CommandCatalogPanel = lazy(() => import("@/components/commands/CommandCatalogPanel"));
const LandingPage = lazy(() => import("@/features/landing/LandingPage"));
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

const sectionLanding: Record<string, string> = {
  dashboard: "/dashboard", assets: "/assets", security: "/security", monitoring: "/monitoring",
  actions: "/actions", assistant: "/assistant", attackers: "/attackers"
};

function firstAllowedRoute(allowedSections: string[] = []) {
  const section = Object.keys(sectionLanding).find((key) => allowedSections.includes(key));
  return section ? sectionLanding[section] : "/settings";
}

function HomeRedirect() {
  return <Navigate to="/landing" replace />;
}

function SectionGate({ section, children }: { section: string; children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "admin" && !(user?.allowedSections ?? []).includes(section)) {
    return <Navigate to={firstAllowedRoute(user?.allowedSections)} replace />;
  }
  return children;
}

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
  const { user } = useAuth();
  const params = useParams();
  const Page = route.component;
  const section = route.group === "tools" ? "actions" : route.group;
  if (user?.role !== "admin" && section !== "settings" && !(user?.allowedSections ?? []).includes(section)) {
    return <Navigate to={firstAllowedRoute(user?.allowedSections)} replace />;
  }
  return (
    <div className="authenticated-app" data-page-id={route.featureKey}>
      <AppBackground />
      <AppShell currentGroup={route.group}>
        <ErrorBoundary title={route.labelFa}>
          <Page params={params as Record<string, string>} />
        </ErrorBoundary>
      </AppShell>
    </div>
  );
}

function WorkflowLabRoute() {
  const { t } = useTranslation();
  const WorkflowLabPage = lazy(() => import("@/features/tools/pages/WorkflowLabPage"));
  return (
    <div className="authenticated-app" data-page-id="tools.workflow_lab">
      <AppBackground />
      <AppShell currentGroup="tools">
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
      <AppShell currentGroup="actions">
        <ErrorBoundary title={t("error.actionLibrary")}><CommandCatalogPanel /></ErrorBoundary>
      </AppShell>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="authenticated-app" data-page-id="not-found">
      <AppBackground />
      <AppShell currentGroup="dashboard">
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
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/action-library" element={<SectionGate section="actions"><ActionLibraryRoute /></SectionGate>} />
          <Route path="/guided-actions/:sessionId" element={<SectionGate section="actions"><GuidedActionRoute /></SectionGate>} />
          <Route path="/actions/:actionId/result" element={<SectionGate section="actions"><ActionResultRoute /></SectionGate>} />
          <Route path="/monitoring/actions/:actionId/result" element={<SectionGate section="monitoring"><MonitoringActionResultRoute /></SectionGate>} />
          {import.meta.env.DEV ? <Route path="/tools/workflow-lab" element={<SectionGate section="actions"><WorkflowLabRoute /></SectionGate>} /> : null}
          {appRoutes.map((route) => <Route key={route.featureKey} path={route.path} element={<FeatureRoute route={route} />} />)}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </LogProvider>
    </Suspense>
  );
}

export default App;
