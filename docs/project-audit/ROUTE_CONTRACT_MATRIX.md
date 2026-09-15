# ماتریس مسیرها و قرارداد صفحه

- تعداد مسیرهای فرانت: **53**
- وضعیت‌ها: {'implemented': 17, 'planned': 13, 'partial': 20, 'unverified': 1, 'not_configured': 2}

## کامپوننت‌های بیش‌ازحد مشترک

- `ToolsPage`: 13 مسیر
- `DeviceOnboardingPage`: 4 مسیر
- `MonitoringPage`: 4 مسیر
- `ActionsPage`: 4 مسیر
- `CiscoOverviewPage`: 3 مسیر
- `IntegrationsPage`: 3 مسیر
- `AssetDetailPage`: 2 مسیر
- `LinuxMonitoringPage`: 2 مسیر

## مسیرها

| مسیر | کلید قابلیت | کامپوننت | وضعیت | ناوبری | Backend | API | UI |
|---|---|---|---|---:|---:|---:|---:|
| `/dashboard` | `dashboard.overview` | `DashboardPage` | implemented | true | true | true | true |
| `/assets` | `assets.overview` | `AssetsOverviewPage` | implemented | true | true | true | true |
| `/assets/devices` | `assets.devices` | `AssetListPage` | implemented | true | true | true | true |
| `/assets/devices/new` | `assets.device_onboarding_new` | `DeviceOnboardingPage` | implemented | true | true | true | true |
| `/assets/onboarding` | `assets.device_onboarding` | `DeviceOnboardingPage` | implemented | false | true | true | true |
| `/assets/vendors/:vendorKey/devices/new` | `assets.vendor_device_onboarding` | `DeviceOnboardingPage` | implemented | false | true | true | true |
| `/assets/devices/:deviceId/setup` | `assets.device_setup` | `DeviceOnboardingPage` | implemented | false | true | true | true |
| `/assets/devices/:deviceId` | `assets.device_detail` | `AssetDetailPage` | implemented | false | true | true | true |
| `/assets/devices/:deviceId/:section` | `assets.device_workspace_section` | `AssetDetailPage` | implemented | false | true | true | true |
| `/assets/sites` | `assets.sites` | `planned("سایت‌ها", "این مسیر تا تکمیل گردش کار سایت‌ها از ناوبری اصلی خارج شده است.")` | planned | false | true | true | false |
| `/assets/networks` | `assets.networks` | `planned("شبکه‌ها و VLANها", "شبکه و VLAN فعلا فقط در مدل داده وجود دارد و صفحه عملیاتی ندارد.")` | planned | false | true | true | false |
| `/assets/topology` | `assets.topology` | `planned("توپولوژی", "توپولوژی در جزئیات دارایی قابل توسعه است؛ نمای گراف عمومی هنوز فعال نیست.")` | planned | false | true | true | false |
| `/assets/sync` | `assets.sync` | `AssetSyncPage` | partial | false | true | true | true |
| `/assets/vendors` | `assets.vendors` | `CiscoOverviewPage` | implemented | true | true | true | true |
| `/assets/vendors/cisco` | `assets.vendors.cisco` | `CiscoOverviewPage` | partial | false | true | true | true |
| `/assets/vendors/cisco/devices` | `assets.vendors.cisco_devices` | `CiscoOverviewPage` | unverified | false | true | true | true |
| `/assets/vendors/:vendorKey` | `assets.vendor_detail` | `VendorDetailPage` | implemented | false | true | true | true |
| `/security` | `security.overview` | `SecurityOverviewPage` | implemented | true | true | true | true |
| `/security/findings` | `security.findings` | `FindingsPage` | implemented | true | true | true | true |
| `/security/findings/:findingId` | `security.finding_detail` | `FindingDetailPage` | implemented | false | true | true | true |
| `/security/events` | `security.events` | `planned("رویدادها", "رویدادها در یافته‌ها و پایش مصرف می‌شوند؛ صفحه مستقل هنوز آماده نیست.")` | planned | false | true | true | false |
| `/security/rules` | `security.rules` | `DetectionRulesPage` | partial | true | true | true | true |
| `/security/rules/:ruleId` | `security.rule_detail` | `planned("جزئیات قانون")` | planned | false | true | false | false |
| `/monitoring` | `monitoring.overview` | `MonitoringPage` | implemented | true | true | true | true |
| `/monitoring/linux` | `monitoring.linux` | `LinuxMonitoringPage` | partial | true | true | true | true |
| `/monitoring/linux/:deviceId` | `monitoring.linux_detail` | `LinuxMonitoringPage` | partial | false | true | true | true |
| `/monitoring/devices` | `monitoring.devices` | `MonitoringPage` | partial | false | true | true | true |
| `/monitoring/devices/:deviceId` | `monitoring.device_detail` | `MonitoringPage` | partial | false | true | true | true |
| `/monitoring/connectors` | `monitoring.connectors` | `planned("سلامت Connectorها", "وضعیت Connectorها فعلا در صفحات پایش و اقدام‌ها نمایش داده می‌شود.")` | planned | false | true | false | false |
| `/monitoring/daily-check` | `monitoring.daily_check` | `MonitoringPage` | partial | false | true | true | true |
| `/actions` | `actions.center` | `ActionsPage` | implemented | true | true | true | true |
| `/actions/guided` | `actions.guided` | `planned("اقدام راهنما", "جلسه‌های موجود با مسیر /guided-actions/:sessionId باز می‌مانند.")` | planned | false | true | true | false |
| `/actions/pending` | `actions.pending` | `ActionsPage` | partial | false | true | true | true |
| `/actions/history` | `actions.history` | `ActionsPage` | partial | false | true | true | true |
| `/actions/:actionId` | `actions.detail` | `ActionsPage` | implemented | false | true | true | true |
| `/assistant` | `assistant` | `AssistantPage` | partial | true | true | true | true |
| `/tools` | `tools.overview` | `ToolsPage` | partial | false | true | true | true |
| `/tools/network-check` | `tools.network_check` | `ToolsPage` | partial | false | true | true | true |
| `/tools/domain-check` | `tools.domain_check` | `ToolsPage` | partial | false | true | true | true |
| `/tools/ip-check` | `tools.ip_check` | `ToolsPage` | partial | false | true | true | true |
| `/tools/nmap` | `tools.nmap` | `ToolsPage` | planned | false | false | false | true |
| `/tools/dns` | `tools.dns` | `ToolsPage` | partial | false | true | true | true |
| `/tools/http` | `tools.http` | `ToolsPage` | partial | false | true | true | true |
| `/tools/ports` | `tools.ports` | `ToolsPage` | partial | false | true | true | true |
| `/tools/traceroute` | `tools.traceroute` | `ToolsPage` | planned | false | false | false | true |
| `/tools/ip-info` | `tools.ip_info` | `ToolsPage` | planned | false | false | false | true |
| `/tools/subnet` | `tools.subnet` | `ToolsPage` | planned | false | false | false | true |
| `/tools/history` | `tools.history` | `ToolsPage` | partial | false | true | true | true |
| `/tools/monitors` | `tools.monitors` | `ToolsPage` | planned | false | false | false | true |
| `/integrations` | `integrations.overview` | `IntegrationsPage` | partial | true | true | true | true |
| `/integrations/netbox` | `integrations.netbox` | `IntegrationsPage` | not_configured | false | true | true | true |
| `/integrations/wazuh` | `integrations.wazuh` | `IntegrationsPage` | not_configured | false | true | true | true |
| `/settings` | `settings` | `SettingsPage` | planned | false | false | false | false |