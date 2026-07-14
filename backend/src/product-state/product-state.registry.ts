import { VENDOR_REGISTRY } from "../vendors/vendor.registry.js";
import type { ProductFeature, ProductFeatureState, ProductIntegrationState, ProductNavigationGroup } from "./product-state.types.js";

const VERIFIED_AT = "2026-07-13";
export const PRODUCT_STATE_CONTRACT_VERSION = "19.2-A";

function feature(input: Omit<ProductFeature, "lastVerifiedAt">): ProductFeature {
  return { ...input, lastVerifiedAt: input.tested ? VERIFIED_AT : undefined };
}

export const PRODUCT_FEATURES: ProductFeature[] = [
  feature({ key: "dashboard.overview", titleFa: "داشبورد", titleEn: "Dashboard", route: "/dashboard", groupKey: "dashboard", order: 10, state: "implemented", userVisible: true, navigationVisible: true, backendReady: true, apiReady: true, uiReady: true, tested: true }),

  feature({ key: "assets.overview", titleFa: "نمای کلی", titleEn: "Overview", route: "/assets", groupKey: "assets", order: 10, state: "implemented", userVisible: true, navigationVisible: true, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "assets.devices", titleFa: "تجهیزات", titleEn: "Devices", route: "/assets/devices", groupKey: "assets", order: 20, state: "implemented", userVisible: true, navigationVisible: true, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "assets.device_onboarding_new", titleFa: "ثبت دستگاه", titleEn: "Register device", route: "/assets/devices/new", groupKey: "assets", order: 21, state: "implemented", userVisible: true, navigationVisible: true, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "assets.device_onboarding", titleFa: "راه‌اندازی دستگاه", titleEn: "Device onboarding", route: "/assets/onboarding", groupKey: "assets", order: 22, state: "implemented", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "assets.vendor_device_onboarding", titleFa: "ثبت دستگاه وندور", titleEn: "Register vendor device", route: "/assets/vendors/:vendorKey/devices/new", groupKey: "assets", order: 23, state: "implemented", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "assets.device_setup", titleFa: "راه‌اندازی اتصال", titleEn: "Device setup", route: "/assets/devices/:deviceId/setup", groupKey: "assets", order: 24, state: "implemented", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "assets.device_detail", titleFa: "فضای کاری تجهیز", titleEn: "Device workspace", route: "/assets/devices/:deviceId", groupKey: "assets", order: 25, state: "implemented", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "assets.device_workspace_section", titleFa: "بخش فضای کاری تجهیز", titleEn: "Device workspace section", route: "/assets/devices/:deviceId/:section", groupKey: "assets", order: 26, state: "implemented", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "assets.sync", titleFa: "همگام‌سازی آزمایشی", titleEn: "Demo sync", route: "/assets/sync", groupKey: "assets", order: 30, state: "partial", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true, reason: "Only explicit mock NetBox and Wazuh preview workflows are available." }),
  feature({ key: "assets.vendors", titleFa: "وندورها", titleEn: "Vendors", route: "/assets/vendors", groupKey: "assets", order: 40, state: "implemented", userVisible: true, navigationVisible: true, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "assets.vendors.cisco", titleFa: "Cisco", titleEn: "Cisco", route: "/assets/vendors/cisco", groupKey: "assets", order: 41, state: "partial", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true, reason: "IOS-XE read-only foundation exists; live device verification and mutations are not complete." }),
  feature({ key: "assets.vendors.cisco_devices", titleFa: "دستگاه‌های Cisco", titleEn: "Cisco devices", route: "/assets/vendors/cisco/devices", groupKey: "assets", order: 42, state: "unverified", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true, reason: "The API currently returns an honest empty inventory until platform detection is refreshed." }),
  feature({ key: "assets.vendor_detail", titleFa: "جزئیات وندور", titleEn: "Vendor detail", route: "/assets/vendors/:vendorKey", groupKey: "assets", order: 43, state: "implemented", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "assets.sites", titleFa: "سایت‌ها", titleEn: "Sites", route: "/assets/sites", groupKey: "assets", order: 50, state: "planned", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: false, tested: false }),
  feature({ key: "assets.networks", titleFa: "شبکه‌ها و VLANها", titleEn: "Networks and VLANs", route: "/assets/networks", groupKey: "assets", order: 60, state: "planned", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: false, tested: false }),
  feature({ key: "assets.topology", titleFa: "توپولوژی", titleEn: "Topology", route: "/assets/topology", groupKey: "assets", order: 70, state: "planned", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: false, tested: false }),

  feature({ key: "security.overview", titleFa: "نمای کلی", titleEn: "Overview", route: "/security", groupKey: "security", order: 10, state: "implemented", userVisible: true, navigationVisible: true, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "security.findings", titleFa: "یافته‌ها", titleEn: "Findings", route: "/security/findings", groupKey: "security", order: 20, state: "implemented", userVisible: true, navigationVisible: true, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "security.finding_detail", titleFa: "جزئیات یافته", titleEn: "Finding detail", route: "/security/findings/:findingId", groupKey: "security", order: 21, state: "implemented", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "security.rules", titleFa: "قوانین تشخیص", titleEn: "Detection rules", route: "/security/rules", groupKey: "security", order: 30, state: "partial", userVisible: true, navigationVisible: true, backendReady: true, apiReady: true, uiReady: true, tested: true, reason: "The seeded rule library is readable and tested; the full rule lifecycle is deferred to Milestone 19D." }),
  feature({ key: "security.rule_detail", titleFa: "جزئیات قانون", titleEn: "Rule detail", route: "/security/rules/:ruleId", groupKey: "security", order: 31, state: "planned", userVisible: true, navigationVisible: false, backendReady: true, apiReady: false, uiReady: false, tested: false }),
  feature({ key: "security.events", titleFa: "رویدادها", titleEn: "Events", route: "/security/events", groupKey: "security", order: 40, state: "planned", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: false, tested: false }),

  feature({ key: "monitoring.overview", titleFa: "وضعیت کلی", titleEn: "Overview", route: "/monitoring", groupKey: "monitoring", order: 10, state: "implemented", userVisible: true, navigationVisible: true, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "monitoring.linux", titleFa: "Linux", titleEn: "Linux", route: "/monitoring/linux", groupKey: "monitoring", order: 20, state: "partial", userVisible: true, navigationVisible: true, backendReady: true, apiReady: true, uiReady: true, tested: true, reason: "Read APIs degrade safely; persisted refresh requires the pending observability migration." }),
  feature({ key: "monitoring.linux_detail", titleFa: "جزئیات Linux", titleEn: "Linux detail", route: "/monitoring/linux/:deviceId", groupKey: "monitoring", order: 21, state: "partial", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "monitoring.devices", titleFa: "مانیتورینگ تجهیزات", titleEn: "Device monitoring", route: "/monitoring/devices", groupKey: "monitoring", order: 30, state: "partial", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true, reason: "This route currently shares the monitoring overview instead of a distinct route contract." }),
  feature({ key: "monitoring.device_detail", titleFa: "جزئیات مانیتورینگ", titleEn: "Monitoring detail", route: "/monitoring/devices/:deviceId", groupKey: "monitoring", order: 31, state: "partial", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "monitoring.daily_check", titleFa: "چک روزانه", titleEn: "Daily Check", route: "/monitoring/daily-check", groupKey: "monitoring", order: 40, state: "partial", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true, reason: "Linux and MikroTik execute; other vendor profiles remain manual-only." }),
  feature({ key: "monitoring.connectors", titleFa: "سلامت Connectorها", titleEn: "Connector health", route: "/monitoring/connectors", groupKey: "monitoring", order: 50, state: "planned", userVisible: true, navigationVisible: false, backendReady: true, apiReady: false, uiReady: false, tested: false }),

  feature({ key: "actions.center", titleFa: "اقدامات", titleEn: "Actions", route: "/actions", groupKey: "actions", order: 10, state: "implemented", userVisible: true, navigationVisible: true, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "actions.pending", titleFa: "تأییدهای منتظر", titleEn: "Pending approvals", route: "/actions/pending", groupKey: "actions", order: 20, state: "partial", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true, reason: "The route currently reuses the complete Action Center without a dedicated pending filter." }),
  feature({ key: "actions.history", titleFa: "تاریخچه اجرا", titleEn: "Execution history", route: "/actions/history", groupKey: "actions", order: 30, state: "partial", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true, reason: "The route currently reuses the complete Action Center without a dedicated history filter." }),
  feature({ key: "actions.detail", titleFa: "جزئیات Action", titleEn: "Action detail", route: "/actions/:actionId", groupKey: "actions", order: 40, state: "implemented", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true }),
  feature({ key: "actions.guided", titleFa: "اقدام راهنما", titleEn: "Guided actions", route: "/actions/guided", groupKey: "actions", order: 50, state: "planned", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: false, tested: false }),

  feature({ key: "assistant", titleFa: "دستیار هوشمند", titleEn: "AI Assistant", route: "/assistant", groupKey: "assistant", order: 10, state: "partial", userVisible: true, navigationVisible: true, backendReady: true, apiReady: true, uiReady: true, tested: true, reason: "Proposal and guided-workflow paths work; provider availability remains environment-dependent." }),

  feature({ key: "integrations.overview", titleFa: "یکپارچه‌سازی‌ها", titleEn: "Integrations", route: "/integrations", groupKey: "integrations", order: 10, state: "partial", userVisible: true, navigationVisible: true, backendReady: true, apiReady: true, uiReady: true, tested: true, reason: "The page exposes explicit mock preview workflows only." }),
  feature({ key: "integrations.netbox", titleFa: "NetBox", titleEn: "NetBox", route: "/integrations/netbox", groupKey: "integrations", order: 20, state: "not_configured", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true, reason: "Only a mock adapter is configured; production apply is disabled.", requirements: ["production endpoint", "credential reference", "health verification"] }),
  feature({ key: "integrations.wazuh", titleFa: "Wazuh", titleEn: "Wazuh", route: "/integrations/wazuh", groupKey: "integrations", order: 30, state: "not_configured", userVisible: true, navigationVisible: false, backendReady: true, apiReady: true, uiReady: true, tested: true, reason: "Only a mock adapter is configured; production apply is disabled.", requirements: ["production endpoint", "credential reference", "mapping verification"] }),

  feature({ key: "settings", titleFa: "تنظیمات", titleEn: "Settings", route: "/settings", groupKey: "settings", order: 10, state: "planned", userVisible: true, navigationVisible: false, backendReady: false, apiReady: false, uiReady: false, tested: false, reason: "Milestone 19F owns the functional Settings Center; 19A must not fake it." })
];

const NAVIGATION_GROUPS = [
  { key: "dashboard", titleFa: "داشبورد", titleEn: "Dashboard", iconKey: "dashboard", mobilePrimary: true },
  { key: "assets", titleFa: "دارایی‌ها", titleEn: "Assets", iconKey: "assets", mobilePrimary: true },
  { key: "security", titleFa: "امنیت", titleEn: "Security", iconKey: "security", mobilePrimary: true },
  { key: "monitoring", titleFa: "پایش", titleEn: "Monitoring", iconKey: "monitoring", mobilePrimary: false },
  { key: "actions", titleFa: "اقدامات", titleEn: "Actions", iconKey: "actions", mobilePrimary: true },
  { key: "assistant", titleFa: "دستیار هوشمند", titleEn: "Assistant", iconKey: "assistant", mobilePrimary: false },
  { key: "integrations", titleFa: "یکپارچه‌سازی‌ها", titleEn: "Integrations", iconKey: "integrations", mobilePrimary: false },
  { key: "settings", titleFa: "تنظیمات", titleEn: "Settings", iconKey: "settings", mobilePrimary: false }
] as const;

const FORBIDDEN_NAVIGATION_STATES = new Set<ProductFeatureState>(["planned", "unsupported", "disabled", "not_configured", "unverified"]);

export function validateProductState(features: ProductFeature[] = PRODUCT_FEATURES) {
  const keys = new Set<string>();
  const routes = new Set<string>();
  for (const item of features) {
    if (keys.has(item.key)) throw new Error(`Duplicate product feature key: ${item.key}`);
    keys.add(item.key);
    if (item.route) {
      if (routes.has(item.route)) throw new Error(`Duplicate product feature route: ${item.route}`);
      routes.add(item.route);
    }
    if (!item.navigationVisible) continue;
    if (!item.route) throw new Error(`Navigation feature ${item.key} has no route.`);
    if (!item.userVisible) throw new Error(`Navigation feature ${item.key} is not user visible.`);
    if (FORBIDDEN_NAVIGATION_STATES.has(item.state)) throw new Error(`Navigation feature ${item.key} has forbidden state ${item.state}.`);
    if (!item.backendReady || !item.apiReady || !item.uiReady || !item.tested) throw new Error(`Navigation feature ${item.key} has a backend/API/UI/test mismatch.`);
  }
  return true;
}

export function getProductNavigation(): ProductNavigationGroup[] {
  validateProductState();
  return NAVIGATION_GROUPS.flatMap((group) => {
    const features = PRODUCT_FEATURES.filter((item) => item.groupKey === group.key && item.navigationVisible).sort((a, b) => a.order - b.order);
    const landing = features[0];
    if (!landing?.route) return [];
    return [{ ...group, route: landing.route, items: features.map(({ key, titleFa, titleEn, route, state }) => ({ key, titleFa, titleEn, route, state })) }];
  });
}

export const PRODUCT_INTEGRATIONS: ProductIntegrationState[] = [
  { key: "netbox", title: "NetBox", state: "not_configured", mode: "mock", configured: false, executable: false, route: "/integrations/netbox", reason: "Mock preview adapter only; production apply is disabled." },
  { key: "wazuh", title: "Wazuh", state: "not_configured", mode: "mock", configured: false, executable: false, route: "/integrations/wazuh", reason: "Mock preview adapter only; production apply is disabled." }
];

export function getProductVendors() {
  return VENDOR_REGISTRY.map((vendor) => ({
    key: vendor.key,
    titleFa: vendor.titleFa,
    titleEn: vendor.titleEn,
    state: vendor.implementationState,
    connectorTypes: vendor.connectorTypes,
    configured: vendor.implementationState === "implemented" || vendor.implementationState === "partial"
  }));
}

export function getProductStateContract() {
  validateProductState();
  return {
    contractVersion: PRODUCT_STATE_CONTRACT_VERSION,
    verifiedAt: VERIFIED_AT,
    features: PRODUCT_FEATURES,
    navigation: getProductNavigation(),
    vendors: getProductVendors(),
    integrations: PRODUCT_INTEGRATIONS
  };
}
