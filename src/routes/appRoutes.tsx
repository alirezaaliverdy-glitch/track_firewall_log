import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { PlannedState } from "@/components/ui/PlannedState";

export type RouteComponentProps = { params: Record<string, string> };
type RouteComponent = ComponentType<RouteComponentProps> | LazyExoticComponent<ComponentType<RouteComponentProps>>;
export type AppRoute = {
  path: string;
  featureKey: string;
  labelFa: string;
  labelEn: string;
  group: string;
  component: RouteComponent;
};

const DashboardPage = lazy(() => import("@/features/dashboard/pages/DashboardPage"));
const AssetsOverviewPage = lazy(() => import("@/features/assets/pages/AssetsOverviewPage"));
const AssetListPage = lazy(() => import("@/features/assets/pages/AssetListPage"));
const AssetDetailPage = lazy(() => import("@/features/assets/pages/AssetDetailPage"));
const AssetSyncPage = lazy(() => import("@/features/assets/pages/AssetSyncPage"));
const PortTopologyPage = lazy(() => import("@/features/assets/pages/PortTopologyPage"));
const SecurityOverviewPage = lazy(() => import("@/features/security/pages/SecurityOverviewPage"));
const FindingsPage = lazy(() => import("@/features/security/pages/FindingsPage"));
const FindingDetailPage = lazy(() => import("@/features/security/pages/FindingDetailPage"));
const DetectionRulesPage = lazy(() => import("@/features/security/pages/DetectionRulesPage"));
const EmailAlertsPage = lazy(() => import("@/features/security/pages/EmailAlertsPage"));
const ActionsPage = lazy(() => import("@/features/actions/pages/ActionsPage"));
const ScheduledTasksPage = lazy(() => import("@/features/actions/pages/ScheduledTasksPage"));
const ActionConfigurePage = lazy(() => import("@/features/actions/pages/ActionConfigurePage"));
const AssistantPage = lazy(() => import("@/features/assistant/pages/AssistantPage"));
const AttackersPage = lazy(() => import("@/features/attackers/pages/AttackersPage"));
const ToolsPage = lazy(() => import("@/features/tools/pages/ToolsPage"));
const MonitoringPage = lazy(() => import("@/features/monitoring/pages/MonitoringPage"));
const LinuxMonitoringPage = lazy(() => import("@/features/monitoring/pages/LinuxMonitoringPage"));
const CiscoOverviewPage = lazy(() => import("@/features/vendors/cisco/pages/CiscoOverviewPage"));
const SettingsPage = lazy(() => import("@/features/settings/pages/SettingsPage"));
const DeviceOnboardingPage = lazy(() => import("@/features/assets/pages/DeviceOnboardingPage"));
const VendorDetailPage = lazy(() => import("@/features/vendors/pages/VendorDetailPage"));
const LocalMobileRuntimePage = lazy(() => import("@/features/mobile-local/pages/LocalMobileRuntimePage"));
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
  { path: "/assets/topology", featureKey: "assets.topology", labelFa: "پورت‌ها و اتصالات", labelEn: "Ports & connections", group: "assets", component: PortTopologyPage },
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
  { path: "/security/email-alerts", featureKey: "security.email_alerts", labelFa: "اعلان‌های ایمیلی", labelEn: "Email alerts", group: "security", component: EmailAlertsPage },
  { path: "/security/rules/:ruleId", featureKey: "security.rule_detail", labelFa: "جزئیات قانون", labelEn: "Rule detail", group: "security", component: planned("جزئیات قانون") },
  { path: "/attackers", featureKey: "attackers.overview", labelFa: "مهاجمان", labelEn: "Attackers", group: "attackers", component: AttackersPage },
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
  { path: "/actions/scheduled", featureKey: "actions.scheduled", labelFa: "زمان‌بندی عملیات", labelEn: "Scheduled tasks", group: "actions", component: ScheduledTasksPage },
  { path: "/actions/:actionId/configure", featureKey: "actions.configure", labelFa: "تنظیم ActionPlan", labelEn: "Configure ActionPlan", group: "actions", component: ActionConfigurePage },
  { path: "/actions/:actionId", featureKey: "actions.detail", labelFa: "جزئیات Action", labelEn: "Action detail", group: "actions", component: ActionsPage },
  { path: "/assistant", featureKey: "assistant", labelFa: "دستیار هوشمند", labelEn: "Assistant", group: "assistant", component: AssistantPage },
  { path: "/tools", featureKey: "tools.overview", labelFa: "ابزارهای تشخیصی", labelEn: "Diagnostic tools", group: "tools", component: ToolsPage },
  { path: "/tools/network-check", featureKey: "tools.network_check", labelFa: "تست سریع شبکه", labelEn: "Network quick check", group: "tools", component: ToolsPage },
  { path: "/tools/domain-check", featureKey: "tools.domain_check", labelFa: "بررسی دامنه", labelEn: "Domain check", group: "tools", component: ToolsPage },
  { path: "/tools/ip-check", featureKey: "tools.ip_check", labelFa: "بررسی IP", labelEn: "IP check", group: "tools", component: ToolsPage },
  { path: "/tools/nmap", featureKey: "tools.nmap", labelFa: "Nmap", labelEn: "Nmap", group: "tools", component: ToolsPage },
  { path: "/tools/dns", featureKey: "tools.dns", labelFa: "DNS", labelEn: "DNS", group: "tools", component: ToolsPage },
  { path: "/tools/http", featureKey: "tools.http", labelFa: "HTTP و TLS", labelEn: "HTTP and TLS", group: "tools", component: ToolsPage },
  { path: "/tools/ports", featureKey: "tools.ports", labelFa: "پورت‌ها", labelEn: "Ports", group: "tools", component: ToolsPage },
  { path: "/tools/traceroute", featureKey: "tools.traceroute", labelFa: "مسیر", labelEn: "Traceroute", group: "tools", component: ToolsPage },
  { path: "/tools/ip-info", featureKey: "tools.ip_info", labelFa: "اطلاعات IP", labelEn: "IP info", group: "tools", component: ToolsPage },
  { path: "/tools/subnet", featureKey: "tools.subnet", labelFa: "Subnet", labelEn: "Subnet", group: "tools", component: ToolsPage },
  { path: "/tools/history", featureKey: "tools.history", labelFa: "تاریخچه", labelEn: "History", group: "tools", component: ToolsPage },
  { path: "/tools/monitors", featureKey: "tools.monitors", labelFa: "مانیتورها", labelEn: "Monitors", group: "tools", component: ToolsPage },
  { path: "/mobile-local", featureKey: "mobile.local", labelFa: "Local Mode", labelEn: "Local Mode", group: "settings", component: LocalMobileRuntimePage },
  { path: "/settings", featureKey: "settings", labelFa: "تنظیمات", labelEn: "Settings", group: "settings", component: SettingsPage }
];
