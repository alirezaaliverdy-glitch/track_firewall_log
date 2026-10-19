import { PAGE_GRANTS, canAccessPage, effectivePageGrants, expandPageGrants, type AccessUser, type PageKey } from "./page-access.js";

const LEGACY_SECTIONS = [
  "dashboard",
  "assets",
  "security",
  "monitoring",
  "actions",
  "assistant",
  "attackers"
] as const;

export const APPLICATION_SECTIONS = PAGE_GRANTS;
export type ApplicationSection = (typeof LEGACY_SECTIONS)[number];

const SECTION_PATHS: Array<{ section: ApplicationSection; patterns: RegExp[] }> = [
  { section: "assets", patterns: [/^\/api\/terminal-sessions(?:\/|$)/] },
  { section: "assets", patterns: [/^\/api\/vpn(?:\/|$)/] },
  { section: "actions", patterns: [/^\/api\/cameras\/[^/]+\/actions(?:\/|$)/] },
  { section: "assets", patterns: [/^\/api\/cameras(?:\/|$)/] },
  { section: "attackers", patterns: [/^\/api\/security\/attackers(?:\/|$)/] },
  { section: "monitoring", patterns: [/^\/api\/devices\/[^/]+\/telemetry(?:\/|$)/] },
  { section: "security", patterns: [/^\/api\/devices\/[^/]+\/findings(?:\/|$)/] },
  { section: "dashboard", patterns: [/^\/api\/dashboard(?:\/|$)/] },
  { section: "assets", patterns: [/^\/api\/(?:assets|companies|devices|device-onboarding|device-workspaces|vendors|credentials|collectors|sites|vlans|prefixes|reports|backups)(?:\/|$)/, /^\/api\/integrations\/netbox(?:\/|$)/] },
  { section: "security", patterns: [/^\/api\/(?:security|findings|detection|detections|detection-rules|incidents|events|event-batches|assessments|recommendations|analysis|analysis-runs|uploads)(?:\/|$)/, /^\/api\/integrations\/wazuh(?:\/|$)/] },
  { section: "monitoring", patterns: [/^\/api\/(?:monitoring|daily-check|linux-health|telemetry)(?:\/|$)/] },
  { section: "actions", patterns: [/^\/api\/(?:actions|action-center|action-sessions|commands|connector-plans|connectors|diagnostics|scheduled-tasks)(?:\/|$)/] },
  { section: "assistant", patterns: [/^\/api\/ai(?:\/|$)/] }
];

export function normalizeApplicationSections(input: unknown, options: { allowEmpty?: boolean } = {}) {
  const raw = Array.isArray(input) ? input : [];
  const values = raw.map(String);
  if (values.some((value) => !PAGE_GRANTS.includes(value as typeof PAGE_GRANTS[number]) && !LEGACY_SECTIONS.includes(value as ApplicationSection))) throw new Error("INVALID_SECTION_ACCESS");
  const sections = expandPageGrants(values);
  if (!options.allowEmpty && !sections.length) throw new Error("SECTION_ACCESS_REQUIRED");
  return sections;
}

export function sectionForApiPath(pathname: string): ApplicationSection | null {
  return SECTION_PATHS.find(({ patterns }) => patterns.some((pattern) => pattern.test(pathname)))?.section ?? null;
}

export function hasSectionAccess(user: { role: string; allowedSections?: readonly string[] }, section: ApplicationSection) {
  const key: Record<ApplicationSection, PageKey> = { dashboard: "dashboard.overview", assets: "assets.devices", security: "security.overview", monitoring: "monitoring.overview", actions: "actions.center", assistant: "assistant", attackers: "attackers.overview" };
  return canAccessPage(user, key[section]);
}

/** Page-owned endpoints and explicit read dependencies; never infer grants from a menu group. */
export function pagesForApiPath(path: string, method = "GET"): PageKey[] | null {
  const read = method === "GET" || method === "HEAD";
  if (/^\/api\/ai\/provider(?:\/|$)/.test(path)) return ["settings"];
  if (read && path === "/api/assets") return ["assets.overview", "assets.devices", "dashboard.overview", "security.overview", "reports.company_status"];
  if (read && path === "/api/security/findings") return ["security.findings", "security.overview", "dashboard.overview", "attackers.overview"];
  if (read && path === "/api/security/monitoring/status") return ["security.overview", "dashboard.overview"];
  if (read && ["/api/linux-health/summary", "/api/monitoring/linux/summary"].includes(path)) return ["monitoring.overview", "dashboard.overview"];
  if (read && /^\/api\/commands(?:\/|$)/.test(path)) return ["actions.center", "actions.scheduled", "assistant"];
  if (/^\/api\/jobs(?:\/|$)/.test(path)) return ["security.overview"];
  if (/^\/api\/admin\/companies(?:\/|$)/.test(path)) return ["settings"];
  if (/^\/api\/vpn(?:\/|$)/.test(path)) return ["tools.vpn"];
  if (/^\/api\/cameras(?:\/|$)/.test(path)) return ["assets.cameras"];
  if (/^\/api\/community(?:\/|$)/.test(path)) return ["community"];
  if (/^\/api\/(?:terminal-sessions|device-workspaces)(?:\/|$)/.test(path)) return ["assets.devices"];
  if (/^\/api\/(?:admin\/users|credentials)(?:\/|$)/.test(path)) return ["settings"];
  if (/^\/api\/diagnostics(?:\/|$)/.test(path)) return ["tools.network_lab"];
  if (/^\/api\/scheduled-tasks(?:\/|$)/.test(path)) return ["actions.scheduled"];
  if (/^\/api\/(?:backups|backup-restores)(?:\/|$)/.test(path)) return ["backups.devices"];
  if (/^\/api\/reports(?:\/|$)/.test(path)) return ["reports.company_status"];
  if (/^\/api\/assets\/port-topology(?:\/|$)/.test(path)) return ["assets.topology"];
  if (/^\/api\/(?:device-onboarding|collectors)(?:\/|$)/.test(path)) return ["assets.device_onboarding_new"];
  if (/^\/api\/vendors(?:\/|$)/.test(path)) return ["assets.vendors", ...(read ? ["assets.device_onboarding_new" as const] : [])];
  if (/^\/api\/security\/attackers(?:[-/]|$)/.test(path)) return ["attackers.overview"];
  if (/^\/api\/security\/vendor-users(?:\/|$)/.test(path)) return ["security.vendor_users"];
  if (/^\/api\/(?:security\/)?(?:detection-rules|rules)(?:\/|$)/.test(path)) return ["security.rules"];
  if (/^\/api\/security\/(?:email(?:[-/]|$)|alerts\/email(?:\/|$))/.test(path)) return ["security.email_alerts"];
  if (/^\/api\/(?:security\/)?findings(?:\/|$)/.test(path) || /^\/api\/devices\/[^/]+\/findings(?:\/|$)/.test(path)) return ["security.findings"];
  if (/^\/api\/devices\/[^/]+\/telemetry(?:\/|$)/.test(path)) return ["monitoring.overview"];
  if (/^\/api\/companies(?:\/|$)/.test(path)) return ["assets.overview", "assets.devices", "assets.device_onboarding_new", "assets.cameras", "reports.company_status"];
  if (/^\/api\/devices(?:\/|$)/.test(path)) return read
    ? ["assets.devices", "assets.device_onboarding_new", "assets.topology", "assets.vendors", "security.overview", "security.findings", "security.vendor_users", "monitoring.overview", "actions.center", "actions.scheduled", "tools.network_lab", "reports.company_status", "backups.devices", "assistant"]
    : method === "POST" && path === "/api/devices" ? ["assets.device_onboarding_new"] : ["assets.devices"];
  const section = sectionForApiPath(path);
  const defaults: Record<ApplicationSection, PageKey> = { dashboard: "dashboard.overview", assets: "assets.overview", security: "security.overview", monitoring: "monitoring.overview", actions: "actions.center", assistant: "assistant", attackers: "attackers.overview" };
  return section ? [defaults[section]] : null;
}

export function canAccessApi(user: AccessUser, path: string, method = "GET"): boolean {
  if (user.role === "admin") return true;
  const pages = pagesForApiPath(path, method);
  const grants = effectivePageGrants(user);
  if (pages) return pages.some(page => grants.includes(`page:${page}`));
  // Fail closed for new/unclassified application endpoints. Session/CSRF/logout
  // and filtered product metadata are needed independently of page selection.
  return /^\/api\/(?:auth|health|product-state)(?:\/|$)/.test(path) || path === "/health";
}
