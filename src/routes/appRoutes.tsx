import type { ComponentType } from "react";
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
import ActionConfigurePage from "@/features/actions/pages/ActionConfigurePage";
import AssistantPage from "@/features/assistant/pages/AssistantPage";
import IntegrationsPage from "@/features/integrations/pages/IntegrationsPage";
import ToolsPage from "@/features/tools/pages/ToolsPage";
import MonitoringPage from "@/features/monitoring/pages/MonitoringPage";
import LinuxMonitoringPage from "@/features/monitoring/pages/LinuxMonitoringPage";
import CiscoOverviewPage from "@/features/vendors/cisco/pages/CiscoOverviewPage";
import SettingsPage from "@/features/settings/pages/SettingsPage";
import DeviceOnboardingPage from "@/features/assets/pages/DeviceOnboardingPage";
import VendorDetailPage from "@/features/vendors/pages/VendorDetailPage";
import LocalMobileRuntimePage from "@/features/mobile-local/pages/LocalMobileRuntimePage";
import { PlannedState } from "@/components/ui/PlannedState";

export type RouteComponentProps = { params: Record<string, string> };
export type AppRoute = {
  path: string;
  featureKey: string;
  labelFa: string;
  labelEn: string;
  group: string;
  component: ComponentType<RouteComponentProps>;
};

const planned = (title: string, description?: string): ComponentType<RouteComponentProps> => () => <PlannedState title={title} description={description} />;

export const appRoutes: AppRoute[] = [
  { path: "/dashboard", featureKey: "dashboard.overview", labelFa: "نمای کلی", labelEn: "Overview", group: "dashboard", component: DashboardPage },
  { path: "/assets", featureKey: "assets.overview", labelFa: "نمای کلی", labelEn: "Overview", group: "assets", component: AssetsOverviewPage },
  { path: "/assets/devices", featureKey: "assets.devices", labelFa: "تجهیزات", labelEn: "Devices", group: "assets", component: AssetListPage },
  { path: "/assets/devices/new", featureKey: "assets.device_onboarding_new", labelFa: "ثبت دستگاه", labelEn: "Register device", group: "assets", component: DeviceOnboardingPage },
  { path: "/assets/onboarding", featureKey: "assets.device_onboarding", labelFa: "راه‌اندازی دستگاه", labelEn: "Device onboarding", group: "assets", component: DeviceOnboardingPage },
  { path: "/assets/vendors/:vendorKey/devices/new", featureKey: "assets.vendor_device_onboarding", labelFa: "ثبت دستگاه وندور", labelEn: "Register vendor device", group: "assets", component: DeviceOnboardingPage },
  { path: "/assets/devices/:deviceId/setup", featureKey: "assets.device_setup", labelFa: "راه‌اندازی اتصال", labelEn: "Device setup", group: "assets", component: DeviceOnboardingPage },
  { path: "/assets/devices/:deviceId", featureKey: "assets.device_detail", labelFa: "فضای کاری تجهیز", labelEn: "Device workspace", group: "assets", component: AssetDetailPage },
  { path: "/assets/devices/:deviceId/:section", featureKey: "assets.device_workspace_section", labelFa: "بخش فضای کاری", labelEn: "Workspace section", group: "assets", component: AssetDetailPage },
  { path: "/assets/sites", featureKey: "assets.sites", labelFa: "سایت‌ها", labelEn: "Sites", group: "assets", component: planned("سایت‌ها", "این مسیر تا تکمیل گردش کار سایت‌ها از ناوبری اصلی خارج شده است.") },
  { path: "/assets/networks", featureKey: "assets.networks", labelFa: "شبکه‌ها و VLANها", labelEn: "Networks", group: "assets", component: planned("شبکه‌ها و VLANها", "شبکه و VLAN فعلا فقط در مدل داده وجود دارد و صفحه عملیاتی ندارد.") },
  { path: "/assets/topology", featureKey: "assets.topology", labelFa: "توپولوژی", labelEn: "Topology", group: "assets", component: planned("توپولوژی", "توپولوژی در جزئیات دارایی قابل توسعه است؛ نمای گراف عمومی هنوز فعال نیست.") },
  { path: "/assets/sync", featureKey: "assets.sync", labelFa: "همگام‌سازی", labelEn: "Sync", group: "assets", component: AssetSyncPage },
  { path: "/assets/vendors", featureKey: "assets.vendors", labelFa: "وندورها", labelEn: "Vendors", group: "assets", component: CiscoOverviewPage },
  { path: "/assets/vendors/cisco", featureKey: "assets.vendors.cisco", labelFa: "Cisco", labelEn: "Cisco", group: "assets", component: CiscoOverviewPage },
  { path: "/assets/vendors/cisco/devices", featureKey: "assets.vendors.cisco_devices", labelFa: "دستگاه‌های Cisco", labelEn: "Cisco devices", group: "assets", component: CiscoOverviewPage },
  { path: "/assets/vendors/:vendorKey", featureKey: "assets.vendor_detail", labelFa: "جزئیات وندور", labelEn: "Vendor detail", group: "assets", component: VendorDetailPage },
  { path: "/security", featureKey: "security.overview", labelFa: "نمای کلی", labelEn: "Overview", group: "security", component: SecurityOverviewPage },
  { path: "/security/findings", featureKey: "security.findings", labelFa: "یافته‌ها", labelEn: "Findings", group: "security", component: FindingsPage },
  { path: "/security/findings/:findingId", featureKey: "security.finding_detail", labelFa: "جزئیات یافته", labelEn: "Finding detail", group: "security", component: FindingDetailPage },
  { path: "/security/events", featureKey: "security.events", labelFa: "رویدادها", labelEn: "Events", group: "security", component: planned("رویدادها", "رویدادها در یافته‌ها و پایش مصرف می‌شوند؛ صفحه مستقل هنوز آماده نیست.") },
  { path: "/security/rules", featureKey: "security.rules", labelFa: "قوانین تشخیص", labelEn: "Rules", group: "security", component: DetectionRulesPage },
  { path: "/security/rules/:ruleId", featureKey: "security.rule_detail", labelFa: "جزئیات قانون", labelEn: "Rule detail", group: "security", component: planned("جزئیات قانون") },
  { path: "/monitoring", featureKey: "monitoring.overview", labelFa: "وضعیت کلی", labelEn: "Overview", group: "monitoring", component: MonitoringPage },
  { path: "/monitoring/linux", featureKey: "monitoring.linux", labelFa: "Linux", labelEn: "Linux", group: "monitoring", component: LinuxMonitoringPage },
  { path: "/monitoring/linux/:deviceId", featureKey: "monitoring.linux_detail", labelFa: "Linux detail", labelEn: "Linux detail", group: "monitoring", component: LinuxMonitoringPage },
  { path: "/monitoring/devices", featureKey: "monitoring.devices", labelFa: "مانیتورینگ تجهیزات", labelEn: "Device monitoring", group: "monitoring", component: MonitoringPage },
  { path: "/monitoring/devices/:deviceId", featureKey: "monitoring.device_detail", labelFa: "جزئیات مانیتورینگ", labelEn: "Monitoring detail", group: "monitoring", component: MonitoringPage },
  { path: "/monitoring/connectors", featureKey: "monitoring.connectors", labelFa: "سلامت Connectorها", labelEn: "Connectors", group: "monitoring", component: planned("سلامت Connectorها", "وضعیت Connectorها فعلا در صفحات پایش و اقدام‌ها نمایش داده می‌شود.") },
  { path: "/monitoring/daily-check", featureKey: "monitoring.daily_check", labelFa: "چک روزانه", labelEn: "Daily Check", group: "monitoring", component: MonitoringPage },
  { path: "/actions", featureKey: "actions.center", labelFa: "مرکز اقدام", labelEn: "Action Center", group: "actions", component: ActionsPage },
  { path: "/actions/guided", featureKey: "actions.guided", labelFa: "اقدام راهنما", labelEn: "Guided Actions", group: "actions", component: planned("اقدام راهنما", "جلسه‌های موجود با مسیر /guided-actions/:sessionId باز می‌مانند.") },
  { path: "/actions/pending", featureKey: "actions.pending", labelFa: "تأییدهای منتظر", labelEn: "Pending", group: "actions", component: ActionsPage },
  { path: "/actions/history", featureKey: "actions.history", labelFa: "تاریخچه اجرا", labelEn: "History", group: "actions", component: ActionsPage },
  { path: "/actions/:actionId/configure", featureKey: "actions.configure", labelFa: "تنظیم ActionPlan", labelEn: "Configure ActionPlan", group: "actions", component: ActionConfigurePage },
  { path: "/actions/:actionId", featureKey: "actions.detail", labelFa: "جزئیات Action", labelEn: "Action detail", group: "actions", component: ActionsPage },
  { path: "/assistant", featureKey: "assistant", labelFa: "دستیار هوشمند", labelEn: "Assistant", group: "assistant", component: AssistantPage },
  { path: "/tools", featureKey: "tools.overview", labelFa: "ابزارهای تشخیصی", labelEn: "Diagnostic tools", group: "integrations", component: ToolsPage },
  { path: "/tools/network-check", featureKey: "tools.network_check", labelFa: "تست سریع شبکه", labelEn: "Network quick check", group: "integrations", component: ToolsPage },
  { path: "/tools/domain-check", featureKey: "tools.domain_check", labelFa: "بررسی دامنه", labelEn: "Domain check", group: "integrations", component: ToolsPage },
  { path: "/tools/ip-check", featureKey: "tools.ip_check", labelFa: "بررسی IP", labelEn: "IP check", group: "integrations", component: ToolsPage },
  { path: "/tools/nmap", featureKey: "tools.nmap", labelFa: "Nmap", labelEn: "Nmap", group: "integrations", component: ToolsPage },
  { path: "/tools/dns", featureKey: "tools.dns", labelFa: "DNS", labelEn: "DNS", group: "integrations", component: ToolsPage },
  { path: "/tools/http", featureKey: "tools.http", labelFa: "HTTP و TLS", labelEn: "HTTP and TLS", group: "integrations", component: ToolsPage },
  { path: "/tools/ports", featureKey: "tools.ports", labelFa: "پورت‌ها", labelEn: "Ports", group: "integrations", component: ToolsPage },
  { path: "/tools/traceroute", featureKey: "tools.traceroute", labelFa: "مسیر", labelEn: "Traceroute", group: "integrations", component: ToolsPage },
  { path: "/tools/ip-info", featureKey: "tools.ip_info", labelFa: "اطلاعات IP", labelEn: "IP info", group: "integrations", component: ToolsPage },
  { path: "/tools/subnet", featureKey: "tools.subnet", labelFa: "Subnet", labelEn: "Subnet", group: "integrations", component: ToolsPage },
  { path: "/tools/history", featureKey: "tools.history", labelFa: "تاریخچه", labelEn: "History", group: "integrations", component: ToolsPage },
  { path: "/tools/monitors", featureKey: "tools.monitors", labelFa: "مانیتورها", labelEn: "Monitors", group: "integrations", component: ToolsPage },
  { path: "/integrations", featureKey: "integrations.overview", labelFa: "وضعیت کلی", labelEn: "Overview", group: "integrations", component: IntegrationsPage },
  { path: "/integrations/netbox", featureKey: "integrations.netbox", labelFa: "NetBox", labelEn: "NetBox", group: "integrations", component: IntegrationsPage },
  { path: "/integrations/wazuh", featureKey: "integrations.wazuh", labelFa: "Wazuh", labelEn: "Wazuh", group: "integrations", component: IntegrationsPage },
  { path: "/mobile-local", featureKey: "mobile.local", labelFa: "Local Mode", labelEn: "Local Mode", group: "settings", component: LocalMobileRuntimePage },
  { path: "/settings", featureKey: "settings", labelFa: "تنظیمات", labelEn: "Settings", group: "settings", component: SettingsPage }
];
