import { API_BASE_URL, MUTATION_METHODS, apiPath, isApiRequest, requestMethod } from "./apiTransport";
import { isNativeAndroidApp } from "@/mobile/nativeServerConfig";
import { clearNativeSessionToken, getNativeSessionToken } from "@/mobile/nativeSession";

const CSRF_EXEMPT_PATHS = new Set(["/auth/login"]);
const UNAUTHORIZED_EVENT = "auth:unauthorized";

function announceUnauthorized() {
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

let csrfToken: string | null = null;
let csrfTokenRequest: Promise<string> | null = null;

async function getCsrfToken(fetchImpl: typeof fetch) {
  if (csrfToken) return csrfToken;
  csrfTokenRequest ??= fetchImpl(`${API_BASE_URL}/auth/csrf`, { credentials: "include" })
    .then(async (response) => {
      if (response.status === 401) announceUnauthorized();
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
    if (!isApiRequest(input)) {
      return originalFetch(input, init);
    }
    const pathname = apiPath(input);
    if (isNativeAndroidApp()) {
      const headers = new Headers(init.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined));
      headers.set("X-Firewall-Client", "android");
      const sessionToken = getNativeSessionToken();
      if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
      const response = await originalFetch(input, { ...init, method, headers });
      if (response.status === 401 && pathname !== "/auth/login") {
        await clearNativeSessionToken();
        announceUnauthorized();
      }
      return response;
    }
    const needsCsrf = MUTATION_METHODS.has(method) && !CSRF_EXEMPT_PATHS.has(pathname);
    const requestInit = needsCsrf
      ? await (async () => {
          const token = await getCsrfToken(originalFetch);
          const headers = new Headers(init.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined));
          headers.set("X-CSRF-Token", token);
          return { ...init, method, headers };
        })()
      : init;
    const response = await originalFetch(input, requestInit);
    if (response.status === 403) resetCsrfToken();
    if (response.status === 401 && pathname !== "/auth/login") announceUnauthorized();
    return response;
  };
}
