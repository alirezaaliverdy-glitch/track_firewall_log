const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");
const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const CSRF_EXEMPT_PATHS = new Set(["/auth/login"]);

let csrfToken: string | null = null;
let csrfTokenRequest: Promise<string> | null = null;

function isApiRequest(input: RequestInfo | URL) {
  const value = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  if (API_BASE_URL.startsWith("http")) return value.startsWith(API_BASE_URL);
  return value.startsWith(API_BASE_URL);
}

function requestUrl(input: RequestInfo | URL) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function apiPath(input: RequestInfo | URL) {
  const value = requestUrl(input);
  const path = (() => {
    try {
      return new URL(value, window.location.origin).pathname;
    } catch {
      return value;
    }
  })();
  const basePath = API_BASE_URL.startsWith("http")
    ? new URL(API_BASE_URL).pathname
    : API_BASE_URL;
  return path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === "object" && "method" in input && input.method) return input.method.toUpperCase();
  return "GET";
}

async function getCsrfToken(fetchImpl: typeof fetch) {
  if (csrfToken) return csrfToken;
  csrfTokenRequest ??= fetchImpl(`${API_BASE_URL}/auth/csrf`, { credentials: "include" })
    .then(async (response) => {
      if (!response.ok) throw new Error("csrf_unavailable");
      const body = await response.json() as { csrfToken?: string };
      if (!body.csrfToken) throw new Error("csrf_unavailable");
      csrfToken = body.csrfToken;
      return csrfToken;
    })
    .finally(() => {
      csrfTokenRequest = null;
    });
  return csrfTokenRequest;
}

export function resetCsrfToken() {
  csrfToken = null;
}

export function installCsrfFetch() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const method = requestMethod(input, init);
    if (!MUTATION_METHODS.has(method) || !isApiRequest(input) || CSRF_EXEMPT_PATHS.has(apiPath(input))) {
      return originalFetch(input, init);
    }

    const token = await getCsrfToken(originalFetch);
    const headers = new Headers(init.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined));
    headers.set("X-CSRF-Token", token);
    const response = await originalFetch(input, { ...init, method, headers });
    if (response.status === 403) resetCsrfToken();
    return response;
  };
}
