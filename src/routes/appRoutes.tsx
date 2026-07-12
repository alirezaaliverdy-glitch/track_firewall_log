import type { ComponentType } from "react";
import { Bot, Boxes, Gauge, LayoutDashboard, Plug, Settings, ShieldAlert, Wrench } from "lucide-react";
import DashboardPage from "@/features/dashboard/pages/DashboardPage";
import AssetsOverviewPage from "@/features/assets/pages/AssetsOverviewPage";
import AssetListPage from "@/features/assets/pages/AssetListPage";
import AssetDetailPage from "@/features/assets/pages/AssetDetailPage";
import AssetSyncPage from "@/features/assets/pages/AssetSyncPage";
import SecurityOverviewPage from "@/features/security/pages/SecurityOverviewPage";
import FindingsPage from "@/features/security/pages/FindingsPage";
import FindingDetailPage from "@/features/security/pages/FindingDetailPage";
import DetectionRulesPage from "@/features/security/pages/DetectionRulesPage";
import ActionsPage from "@/features/actions/pages/ActionsPage";
import AssistantPage from "@/features/assistant/pages/AssistantPage";
import IntegrationsPage from "@/features/integrations/pages/IntegrationsPage";
import MonitoringPage from "@/features/monitoring/pages/MonitoringPage";
import SettingsPage from "@/features/settings/pages/SettingsPage";
import { PlannedState } from "@/components/ui/PlannedState";

export type RouteComponentProps = { params: Record<string, string> };
export type AppRoute = {
  path: string;
  labelFa: string;
  labelEn: string;
  group: string;
  component: ComponentType<RouteComponentProps>;
  implemented: boolean;
  mobilePrimary?: boolean;
  nav?: boolean;
};

const planned = (title: string, description?: string): ComponentType<RouteComponentProps> => () => <PlannedState title={title} description={description} />;

export const navGroups = [
  { id: "dashboard", labelFa: "داشبورد", labelEn: "Dashboard", icon: LayoutDashboard },
  { id: "assets", labelFa: "دارایی ها", labelEn: "Assets", icon: Boxes },
  { id: "security", labelFa: "امنیت", labelEn: "Security", icon: ShieldAlert },
  { id: "monitoring", labelFa: "پایش", labelEn: "Monitoring", icon: Gauge },
  { id: "actions", labelFa: "اقدامات", labelEn: "Actions", icon: Wrench },
  { id: "assistant", labelFa: "دستیار هوشمند", labelEn: "Assistant", icon: Bot },
  { id: "integrations", labelFa: "یکپارچه سازی ها", labelEn: "Integrations", icon: Plug },
  { id: "settings", labelFa: "تنظیمات", labelEn: "Settings", icon: Settings }
] as const;

export const appRoutes: AppRoute[] = [
  { path: "/dashboard", labelFa: "نمای کلی", labelEn: "Overview", group: "dashboard", component: DashboardPage, implemented: true, mobilePrimary: true, nav: true },
  { path: "/assets", labelFa: "نمای کلی", labelEn: "Overview", group: "assets", component: AssetsOverviewPage, implemented: true, mobilePrimary: true, nav: true },
  { path: "/assets/devices", labelFa: "تجهیزات", labelEn: "Devices", group: "assets", component: AssetListPage, implemented: true, nav: true },
  { path: "/assets/devices/:assetId", labelFa: "جزئیات تجهیز", labelEn: "Asset detail", group: "assets", component: AssetDetailPage, implemented: true },
  { path: "/assets/sites", labelFa: "سایت ها", labelEn: "Sites", group: "assets", component: planned("سایت ها", "API سایت ها وجود دارد؛ صفحه عملیاتی در Milestone بعدی تکمیل می شود."), implemented: false, nav: true },
  { path: "/assets/networks", labelFa: "شبکه ها و VLANها", labelEn: "Networks", group: "assets", component: planned("شبکه ها و VLANها"), implemented: false, nav: true },
  { path: "/assets/topology", labelFa: "توپولوژی", labelEn: "Topology", group: "assets", component: planned("توپولوژی", "توپولوژی برای asset detail موجود است؛ نمای گراف کامل planned است."), implemented: false, nav: true },
  { path: "/assets/sync", labelFa: "همگام سازی", labelEn: "Sync", group: "assets", component: AssetSyncPage, implemented: true, nav: true },
  { path: "/security", labelFa: "نمای کلی", labelEn: "Overview", group: "security", component: SecurityOverviewPage, implemented: true, mobilePrimary: true, nav: true },
  { path: "/security/findings", labelFa: "یافته ها", labelEn: "Findings", group: "security", component: FindingsPage, implemented: true, nav: true },
  { path: "/security/findings/:findingId", labelFa: "جزئیات یافته", labelEn: "Finding detail", group: "security", component: FindingDetailPage, implemented: true },
  { path: "/security/events", labelFa: "رویدادها", labelEn: "Events", group: "security", component: planned("رویدادها", "API رویدادها وجود دارد؛ جدول صفحه جدا در Milestone C تکمیل می شود."), implemented: false, nav: true },
  { path: "/security/rules", labelFa: "قوانین تشخیص", labelEn: "Rules", group: "security", component: DetectionRulesPage, implemented: true, nav: true },
  { path: "/security/rules/:ruleId", labelFa: "جزئیات قانون", labelEn: "Rule detail", group: "security", component: planned("جزئیات قانون"), implemented: false },
  { path: "/monitoring", labelFa: "وضعیت کلی", labelEn: "Overview", group: "monitoring", component: MonitoringPage, implemented: true, nav: true },
  { path: "/monitoring/devices", labelFa: "مانیتورینگ تجهیزات", labelEn: "Device monitoring", group: "monitoring", component: MonitoringPage, implemented: true, nav: true },
  { path: "/monitoring/devices/:deviceId", labelFa: "جزئیات مانیتورینگ", labelEn: "Monitoring detail", group: "monitoring", component: MonitoringPage, implemented: true },
  { path: "/monitoring/connectors", labelFa: "سلامت Connectorها", labelEn: "Connectors", group: "monitoring", component: planned("سلامت Connectorها"), implemented: false, nav: true },
  { path: "/monitoring/daily-check", labelFa: "Daily Check", labelEn: "Daily Check", group: "monitoring", component: MonitoringPage, implemented: true, nav: true },
  { path: "/actions", labelFa: "Action Center", labelEn: "Action Center", group: "actions", component: ActionsPage, implemented: true, mobilePrimary: true, nav: true },
  { path: "/actions/guided", labelFa: "Guided Actions", labelEn: "Guided Actions", group: "actions", component: planned("Guided Actions", "جلسه های موجود با مسیر /guided-actions/:sessionId باز می مانند."), implemented: false, nav: true },
  { path: "/actions/pending", labelFa: "تاییدهای منتظر", labelEn: "Pending", group: "actions", component: ActionsPage, implemented: true, nav: true },
  { path: "/actions/history", labelFa: "تاریخچه اجرا", labelEn: "History", group: "actions", component: ActionsPage, implemented: true, nav: true },
  { path: "/actions/:actionId", labelFa: "جزئیات Action", labelEn: "Action detail", group: "actions", component: ActionsPage, implemented: true },
  { path: "/assistant", labelFa: "دستیار هوشمند", labelEn: "Assistant", group: "assistant", component: AssistantPage, implemented: true, nav: true },
  { path: "/integrations", labelFa: "وضعیت کلی", labelEn: "Overview", group: "integrations", component: IntegrationsPage, implemented: true, nav: true },
  { path: "/integrations/netbox", labelFa: "NetBox", labelEn: "NetBox", group: "integrations", component: IntegrationsPage, implemented: true, nav: true },
  { path: "/integrations/wazuh", labelFa: "Wazuh", labelEn: "Wazuh", group: "integrations", component: IntegrationsPage, implemented: true, nav: true },
  { path: "/settings", labelFa: "تنظیمات", labelEn: "Settings", group: "settings", component: SettingsPage, implemented: true, nav: true }
];

export function matchRoute(pathname: string) {
  const normalized = pathname === "/" || pathname === "" ? "/dashboard" : pathname.replace(/\/$/, "") || "/dashboard";
  for (const route of appRoutes) {
    const routeParts = route.path.split("/").filter(Boolean);
    const pathParts = normalized.split("/").filter(Boolean);
    if (routeParts.length !== pathParts.length) continue;
    const params: Record<string, string> = {};
    const matches = routeParts.every((part, index) => {
      if (part.startsWith(":")) {
        params[part.slice(1)] = decodeURIComponent(pathParts[index]);
        return true;
      }
      return part === pathParts[index];
    });
    if (matches) return { route, params };
  }
  return { route: appRoutes[0], params: {} };
}
