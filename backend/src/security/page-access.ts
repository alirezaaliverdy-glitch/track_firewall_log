// Keep this dependency-free contract identical in backend/src/security/page-access.ts and src/lib/pageAccess.ts.
export const PAGE_ACCESS = [
  ["dashboard.overview", "dashboard", "/dashboard", "داشبورد", "Dashboard"],
  ["assets.overview", "assets", "/assets", "نمای کلی دارایی‌ها", "Assets overview"],
  ["assets.devices", "assets", "/assets/devices", "تجهیزات", "Devices"],
  ["assets.device_onboarding_new", "assets", "/assets/devices/new", "ثبت دستگاه", "Register device"],
  ["assets.topology", "assets", "/assets/topology", "پورت‌ها و اتصالات", "Ports & connections"],
  ["assets.cameras", "assets", "/assets/cameras", "دوربین‌ها و NVR", "Cameras & NVR"],
  ["assets.vendors", "assets", "/assets/vendors", "وندورها", "Vendors"],
  ["security.overview", "security", "/security", "نمای کلی امنیت", "Security overview"],
  ["security.findings", "security", "/security/findings", "یافته‌ها", "Findings"],
  ["security.vendor_users", "security", "/security/vendor-users", "کاربران و فعالیت‌ها", "Vendor users & activity"],
  ["security.rules", "security", "/security/rules", "قوانین تشخیص", "Detection rules"],
  ["security.email_alerts", "security", "/security/email-alerts", "اعلان‌های ایمیلی", "Email alerts"],
  ["monitoring.overview", "monitoring", "/monitoring", "پایش", "Monitoring"],
  ["actions.center", "actions", "/actions", "مرکز اقدامات", "Action center"],
  ["actions.scheduled", "actions", "/actions/scheduled", "زمان‌بندی عملیات", "Scheduled tasks"],
  ["tools.network_lab", "tools", "/tools/network-lab", "آزمایشگاه شبکه", "Network lab"],
  ["tools.vpn", "tools", "/tools/vpn", "اتصال VPN", "VPN connections"],
  ["reports.company_status", "reports", "/reports", "گزارش‌گیری", "Reports"],
  ["assistant", "assistant", "/assistant", "دستیار هوشمند", "AI assistant"],
  ["attackers.overview", "attackers", "/attackers", "مهاجمان", "Attackers"],
  ["backups.devices", "backups", "/backups", "بک‌آپ", "Backups"],
  ["settings", "settings", "/settings", "تنظیمات", "Settings"],
  ["community", "community", "/community", "گفت‌وگو و پشتیبانی", "Community & support"]
] as const;
export type PageKey = (typeof PAGE_ACCESS)[number][0];
export type PageGrant = `page:${PageKey}`;
export const PAGE_GRANTS = PAGE_ACCESS.map(([key]) => `page:${key}` as PageGrant);
export type AccessUser = { role: string; allowedSections?: readonly string[] };
const legacyGroups = ["dashboard", "assets", "security", "monitoring", "actions", "assistant", "attackers"];
export function expandPageGrants(values: readonly string[] = []): PageGrant[] {
  if (values.some(value => value.startsWith("page:"))) return PAGE_GRANTS.filter(value => values.includes(value));
  const groups = new Set(values.filter(value => legacyGroups.includes(value)));
  if (groups.has("assets")) { groups.add("reports"); groups.add("backups"); }
  // Legacy tools lived under Actions; legacy VPN API access also required Assets.
  return PAGE_ACCESS.filter(([key, group]) => groups.has(group)
    || (key === "tools.network_lab" && groups.has("actions"))
    || (key === "tools.vpn" && groups.has("assets") && groups.has("actions"))
    || (groups.size > 0 && ["settings", "community"].includes(group)))
    .map(([key]) => `page:${key}` as PageGrant);
}
export function effectivePageGrants(user: AccessUser): PageGrant[] {
  if (user.role === "admin") return [...PAGE_GRANTS];
  // Old viewer grants were ignored entirely. Preserve their existing effective access
  // until the manager explicitly saves the new page-level selection.
  if (user.role === "viewer" && !user.allowedSections?.some(value => value.startsWith("page:"))) return [...PAGE_GRANTS];
  return expandPageGrants(user.allowedSections);
}
export function canAccessPage(user: AccessUser | null | undefined, key: PageKey): boolean {
  return Boolean(user && effectivePageGrants(user).includes(`page:${key}`));
}
export function pageForFeature(key: string, group: string): PageKey | null {
  if (PAGE_ACCESS.some(([page]) => page === key)) return key as PageKey;
  if (key === "assets.device_terminal") return "assets.devices";
  if (key.startsWith("assets.device_onboarding") || key.endsWith("_new") && group === "assets") return "assets.device_onboarding_new";
  if (key.startsWith("assets.vendor")) return "assets.vendors";
  if (group === "assets") return "assets.devices";
  if (key.startsWith("security.finding")) return "security.findings";
  if (key.startsWith("security.rule")) return "security.rules";
  const defaults: Record<string, PageKey> = { dashboard: "dashboard.overview", security: "security.overview",
    monitoring: "monitoring.overview", actions: "actions.center", tools: "tools.network_lab",
    reports: "reports.company_status", assistant: "assistant", attackers: "attackers.overview",
    backups: "backups.devices", settings: "settings", community: "community" };
  return defaults[group] ?? null;
}
export function pageForLocation(pathname: string, search = ""): PageKey | null {
  if (/^\/assets\/devices\/nvr-[^/]+\/?$/.test(pathname)
    || pathname === "/assets/devices/new" && new URLSearchParams(search).get("vendor") === "nvr") return "assets.cameras";
  if (/^\/assets\/vendors\/[^/]+\/devices\/new\/?$/.test(pathname) || /^\/assets\/devices\/[^/]+\/setup\/?$/.test(pathname) || pathname === "/assets/onboarding") return "assets.device_onboarding_new";
  const exact = PAGE_ACCESS.find(([, , route]) => route === pathname.replace(/\/$/, ""));
  if (exact) return exact[0];
  const parents = [...PAGE_ACCESS].sort((a, b) => b[2].length - a[2].length);
  return parents.find(([, , route]) => pathname.startsWith(route + "/"))?.[0]
    ?? (/^\/(action-library|guided-actions)(\/|$)/.test(pathname) ? "actions.center" : pageForFeature("", pathname.split("/")[1] ?? ""));
}
export function firstAccessibleRoute(user: AccessUser | null | undefined): string {
  return PAGE_ACCESS.find(([key]) => canAccessPage(user, key))?.[2] ?? "/access-unavailable";
}
