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
import LinuxMonitoringPage from "@/features/monitoring/pages/LinuxMonitoringPage";
import CiscoOverviewPage from "@/features/vendors/cisco/pages/CiscoOverviewPage";
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
  { id: "dashboard", labelFa: "Ø¯Ø§Ø´Ø¨ÙˆØ±Ø¯", labelEn: "Dashboard", icon: LayoutDashboard },
  { id: "assets", labelFa: "Ø¯Ø§Ø±Ø§ÛŒÛŒ Ù‡Ø§", labelEn: "Assets", icon: Boxes },
  { id: "security", labelFa: "Ø§Ù…Ù†ÛŒØª", labelEn: "Security", icon: ShieldAlert },
  { id: "monitoring", labelFa: "Ù¾Ø§ÛŒØ´", labelEn: "Monitoring", icon: Gauge },
  { id: "actions", labelFa: "Ø§Ù‚Ø¯Ø§Ù…Ø§Øª", labelEn: "Actions", icon: Wrench },
  { id: "assistant", labelFa: "Ø¯Ø³ØªÛŒØ§Ø± Ù‡ÙˆØ´Ù…Ù†Ø¯", labelEn: "Assistant", icon: Bot },
  { id: "integrations", labelFa: "ÛŒÚ©Ù¾Ø§Ø±Ú†Ù‡ Ø³Ø§Ø²ÛŒ Ù‡Ø§", labelEn: "Integrations", icon: Plug },
  { id: "settings", labelFa: "ØªÙ†Ø¸ÛŒÙ…Ø§Øª", labelEn: "Settings", icon: Settings }
] as const;

export const appRoutes: AppRoute[] = [
  { path: "/dashboard", labelFa: "Ù†Ù…Ø§ÛŒ Ú©Ù„ÛŒ", labelEn: "Overview", group: "dashboard", component: DashboardPage, implemented: true, mobilePrimary: true, nav: true },
  { path: "/assets", labelFa: "Ù†Ù…Ø§ÛŒ Ú©Ù„ÛŒ", labelEn: "Overview", group: "assets", component: AssetsOverviewPage, implemented: true, mobilePrimary: true, nav: true },
  { path: "/assets/devices", labelFa: "ØªØ¬Ù‡ÛŒØ²Ø§Øª", labelEn: "Devices", group: "assets", component: AssetListPage, implemented: true, nav: true },
  { path: "/assets/devices/:assetId", labelFa: "Ø¬Ø²Ø¦ÛŒØ§Øª ØªØ¬Ù‡ÛŒØ²", labelEn: "Asset detail", group: "assets", component: AssetDetailPage, implemented: true },
  { path: "/assets/sites", labelFa: "Ø³Ø§ÛŒØª Ù‡Ø§", labelEn: "Sites", group: "assets", component: planned("Ø³Ø§ÛŒØª Ù‡Ø§", "API Ø³Ø§ÛŒØª Ù‡Ø§ ÙˆØ¬ÙˆØ¯ Ø¯Ø§Ø±Ø¯Ø› ØµÙØ­Ù‡ Ø¹Ù…Ù„ÛŒØ§ØªÛŒ Ø¯Ø± Milestone Ø¨Ø¹Ø¯ÛŒ ØªÚ©Ù…ÛŒÙ„ Ù…ÛŒ Ø´ÙˆØ¯."), implemented: false, nav: true },
  { path: "/assets/networks", labelFa: "Ø´Ø¨Ú©Ù‡ Ù‡Ø§ Ùˆ VLANÙ‡Ø§", labelEn: "Networks", group: "assets", component: planned("Ø´Ø¨Ú©Ù‡ Ù‡Ø§ Ùˆ VLANÙ‡Ø§"), implemented: false, nav: true },
  { path: "/assets/topology", labelFa: "ØªÙˆÙ¾ÙˆÙ„ÙˆÚ˜ÛŒ", labelEn: "Topology", group: "assets", component: planned("ØªÙˆÙ¾ÙˆÙ„ÙˆÚ˜ÛŒ", "ØªÙˆÙ¾ÙˆÙ„ÙˆÚ˜ÛŒ Ø¨Ø±Ø§ÛŒ asset detail Ù…ÙˆØ¬ÙˆØ¯ Ø§Ø³ØªØ› Ù†Ù…Ø§ÛŒ Ú¯Ø±Ø§Ù Ú©Ø§Ù…Ù„ planned Ø§Ø³Øª."), implemented: false, nav: true },
  { path: "/assets/sync", labelFa: "Ù‡Ù…Ú¯Ø§Ù… Ø³Ø§Ø²ÛŒ", labelEn: "Sync", group: "assets", component: AssetSyncPage, implemented: true, nav: true },
  { path: "/assets/vendors", labelFa: "Vendorها", labelEn: "Vendors", group: "assets", component: CiscoOverviewPage, implemented: true, nav: true },
  { path: "/assets/vendors/cisco", labelFa: "Cisco", labelEn: "Cisco", group: "assets", component: CiscoOverviewPage, implemented: true, nav: true },
  { path: "/assets/vendors/cisco/devices", labelFa: "Cisco Devices", labelEn: "Cisco Devices", group: "assets", component: CiscoOverviewPage, implemented: true, nav: true },
  { path: "/security", labelFa: "Ù†Ù…Ø§ÛŒ Ú©Ù„ÛŒ", labelEn: "Overview", group: "security", component: SecurityOverviewPage, implemented: true, mobilePrimary: true, nav: true },
  { path: "/security/findings", labelFa: "ÛŒØ§ÙØªÙ‡ Ù‡Ø§", labelEn: "Findings", group: "security", component: FindingsPage, implemented: true, nav: true },
  { path: "/security/findings/:findingId", labelFa: "Ø¬Ø²Ø¦ÛŒØ§Øª ÛŒØ§ÙØªÙ‡", labelEn: "Finding detail", group: "security", component: FindingDetailPage, implemented: true },
  { path: "/security/events", labelFa: "Ø±ÙˆÛŒØ¯Ø§Ø¯Ù‡Ø§", labelEn: "Events", group: "security", component: planned("Ø±ÙˆÛŒØ¯Ø§Ø¯Ù‡Ø§", "API Ø±ÙˆÛŒØ¯Ø§Ø¯Ù‡Ø§ ÙˆØ¬ÙˆØ¯ Ø¯Ø§Ø±Ø¯Ø› Ø¬Ø¯ÙˆÙ„ ØµÙØ­Ù‡ Ø¬Ø¯Ø§ Ø¯Ø± Milestone C ØªÚ©Ù…ÛŒÙ„ Ù…ÛŒ Ø´ÙˆØ¯."), implemented: false, nav: true },
  { path: "/security/rules", labelFa: "Ù‚ÙˆØ§Ù†ÛŒÙ† ØªØ´Ø®ÛŒØµ", labelEn: "Rules", group: "security", component: DetectionRulesPage, implemented: true, nav: true },
  { path: "/security/rules/:ruleId", labelFa: "Ø¬Ø²Ø¦ÛŒØ§Øª Ù‚Ø§Ù†ÙˆÙ†", labelEn: "Rule detail", group: "security", component: planned("Ø¬Ø²Ø¦ÛŒØ§Øª Ù‚Ø§Ù†ÙˆÙ†"), implemented: false },
  { path: "/monitoring", labelFa: "ÙˆØ¶Ø¹ÛŒØª Ú©Ù„ÛŒ", labelEn: "Overview", group: "monitoring", component: MonitoringPage, implemented: true, nav: true },
  { path: "/monitoring/linux", labelFa: "Linux", labelEn: "Linux", group: "monitoring", component: LinuxMonitoringPage, implemented: true, nav: true },
  { path: "/monitoring/linux/:deviceId", labelFa: "Linux detail", labelEn: "Linux detail", group: "monitoring", component: LinuxMonitoringPage, implemented: true },
  { path: "/monitoring/devices", labelFa: "Ù…Ø§Ù†ÛŒØªÙˆØ±ÛŒÙ†Ú¯ ØªØ¬Ù‡ÛŒØ²Ø§Øª", labelEn: "Device monitoring", group: "monitoring", component: MonitoringPage, implemented: true, nav: true },
  { path: "/monitoring/devices/:deviceId", labelFa: "Ø¬Ø²Ø¦ÛŒØ§Øª Ù…Ø§Ù†ÛŒØªÙˆØ±ÛŒÙ†Ú¯", labelEn: "Monitoring detail", group: "monitoring", component: MonitoringPage, implemented: true },
  { path: "/monitoring/connectors", labelFa: "Ø³Ù„Ø§Ù…Øª ConnectorÙ‡Ø§", labelEn: "Connectors", group: "monitoring", component: planned("Ø³Ù„Ø§Ù…Øª ConnectorÙ‡Ø§"), implemented: false, nav: true },
  { path: "/monitoring/daily-check", labelFa: "Daily Check", labelEn: "Daily Check", group: "monitoring", component: MonitoringPage, implemented: true, nav: true },
  { path: "/actions", labelFa: "Action Center", labelEn: "Action Center", group: "actions", component: ActionsPage, implemented: true, mobilePrimary: true, nav: true },
  { path: "/actions/guided", labelFa: "Guided Actions", labelEn: "Guided Actions", group: "actions", component: planned("Guided Actions", "Ø¬Ù„Ø³Ù‡ Ù‡Ø§ÛŒ Ù…ÙˆØ¬ÙˆØ¯ Ø¨Ø§ Ù…Ø³ÛŒØ± /guided-actions/:sessionId Ø¨Ø§Ø² Ù…ÛŒ Ù…Ø§Ù†Ù†Ø¯."), implemented: false, nav: true },
  { path: "/actions/pending", labelFa: "ØªØ§ÛŒÛŒØ¯Ù‡Ø§ÛŒ Ù…Ù†ØªØ¸Ø±", labelEn: "Pending", group: "actions", component: ActionsPage, implemented: true, nav: true },
  { path: "/actions/history", labelFa: "ØªØ§Ø±ÛŒØ®Ú†Ù‡ Ø§Ø¬Ø±Ø§", labelEn: "History", group: "actions", component: ActionsPage, implemented: true, nav: true },
  { path: "/actions/:actionId", labelFa: "Ø¬Ø²Ø¦ÛŒØ§Øª Action", labelEn: "Action detail", group: "actions", component: ActionsPage, implemented: true },
  { path: "/assistant", labelFa: "Ø¯Ø³ØªÛŒØ§Ø± Ù‡ÙˆØ´Ù…Ù†Ø¯", labelEn: "Assistant", group: "assistant", component: AssistantPage, implemented: true, nav: true },
  { path: "/integrations", labelFa: "ÙˆØ¶Ø¹ÛŒØª Ú©Ù„ÛŒ", labelEn: "Overview", group: "integrations", component: IntegrationsPage, implemented: true, nav: true },
  { path: "/integrations/netbox", labelFa: "NetBox", labelEn: "NetBox", group: "integrations", component: IntegrationsPage, implemented: true, nav: true },
  { path: "/integrations/wazuh", labelFa: "Wazuh", labelEn: "Wazuh", group: "integrations", component: IntegrationsPage, implemented: true, nav: true },
  { path: "/settings", labelFa: "ØªÙ†Ø¸ÛŒÙ…Ø§Øª", labelEn: "Settings", group: "settings", component: SettingsPage, implemented: true, nav: true }
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
