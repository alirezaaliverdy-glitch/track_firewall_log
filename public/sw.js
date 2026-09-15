const CACHE_VERSION = "mobile-readiness-v2";
const SHELL_CACHE = `firewall-shell-${CACHE_VERSION}`;
const SAFE_API_CACHE = `firewall-readonly-api-${CACHE_VERSION}`;
const API_PREFIX = "/firewall-api";
const APP_BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/?$/, "/");
const appAsset = (path = "") => `${APP_BASE_PATH}${path}`;
const APP_SHELL = [appAsset(), appAsset("index.html"), appAsset("manifest.webmanifest"), appAsset("pwa-icon.svg"), appAsset("pwa-icon-maskable.svg")];
const SAFE_API_CACHE_PATHS = [
  /^\/firewall-api\/devices(?:\?.*)?$/,
  /^\/firewall-api\/actions(?:\?.*)?$/,
  /^\/firewall-api\/actions\/[^/]+(?:\?.*)?$/,
  /^\/firewall-api\/actions\/[^/]+\/result(?:\?.*)?$/,
  /^\/firewall-api\/action-center(?:\?.*)?$/,
  /^\/firewall-api\/action-center\/[^/]+(?:\?.*)?$/
];
const UNSAFE_API_CACHE_PATHS = [
  /^\/firewall-api\/auth(?:\/|$)/,
  /^\/firewall-api\/credentials(?:\/|$)/,
  /^\/firewall-api\/ai(?:\/|$)/,
  /^\/firewall-api\/connectors(?:\/|$)/
];
const SENSITIVE_FIELD_PATTERN = /password|passphrase|private.?key|ssh.?key|api.?key|token|secret|credential|raw.?command|commandPreview|connectorResult|dryRun|stdout|stderr|audit/i;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL_CACHE, SAFE_API_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => clients.forEach((client) => client.postMessage({ type: "PWA_READY" })))
  );
});

function offlineMutationResponse() {
  return new Response(JSON.stringify({
    ok: false,
    error: {
      code: "OFFLINE_MUTATION_BLOCKED",
      message: "Network connection is required for approvals, execution, and other operational changes."
    }
  }), {
    status: 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function isSafeReadonlyApiPath(pathnameWithSearch) {
  return SAFE_API_CACHE_PATHS.some((pattern) => pattern.test(pathnameWithSearch))
    && !UNSAFE_API_CACHE_PATHS.some((pattern) => pattern.test(pathnameWithSearch));
}

function sanitizeForOfflineCache(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeForOfflineCache(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_FIELD_PATTERN.test(key))
      .map(([key, entry]) => [key, sanitizeForOfflineCache(entry)])
  );
}

async function cacheSanitizedApiResponse(request, response) {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!response.ok || !contentType.includes("application/json")) return;
  const body = sanitizeForOfflineCache(await response.clone().json());
  const sanitized = new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "max-age=300",
      "X-Offline-Readonly": "true"
    }
  });
  await caches.open(SAFE_API_CACHE).then((cache) => cache.put(request, sanitized));
}

function offlineApiFallback(request) {
  return caches.match(request).then((cached) => cached ?? new Response(JSON.stringify({
    ok: false,
    error: {
      code: "OFFLINE_READONLY_CACHE_MISS",
      message: "This read-only view is unavailable offline until it has been loaded safely online."
    }
  }), {
    status: 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Offline-Readonly": "true" }
  }));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isApi = sameOrigin && url.pathname.startsWith(API_PREFIX);

  if (isApi) {
    if (request.method !== "GET") {
      event.respondWith(fetch(request).catch(offlineMutationResponse));
      return;
    }

    const pathnameWithSearch = `${url.pathname}${url.search}`;
    if (isSafeReadonlyApiPath(pathnameWithSearch)) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            void cacheSanitizedApiResponse(request, response);
            return response;
          })
          .catch(() => offlineApiFallback(request))
      );
      return;
    }

    event.respondWith(fetch(request));
    return;
  }

  if (request.method !== "GET") {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => caches.match(appAsset("index.html")))
    );
    return;
  }

  if (!sameOrigin) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      const copy = response.clone();
      if (response.ok && ["script", "style", "image", "font"].includes(request.destination)) {
        void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
