const SAFE_APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/assistant",
  "/actions",
  "/action-library",
  "/guided-actions",
  "/assets",
  "/security",
  "/monitoring",
  "/integrations",
  "/settings",
  "/tools/workflow-lab"
];

export function normalizeAppDeepLink(input: string) {
  const fallback = "/dashboard";
  const trimmed = input.trim();
  if (!trimmed || /^(javascript|data|file|blob):/i.test(trimmed)) return fallback;

  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return isSafeAppPath(url.pathname) ? path : fallback;
  } catch {
    return fallback;
  }
}

export function dispatchAppNavigation(to: string) {
  window.dispatchEvent(new CustomEvent("app:navigate", { detail: { to: normalizeAppDeepLink(to) } }));
}

function isSafeAppPath(pathname: string) {
  return SAFE_APP_ROUTE_PREFIXES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
