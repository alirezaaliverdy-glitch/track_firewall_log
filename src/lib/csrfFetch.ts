import { API_BASE_URL, MUTATION_METHODS, apiPath, isApiRequest, requestMethod } from "./apiTransport";

const CSRF_EXEMPT_PATHS = new Set(["/auth/login"]);

let csrfToken: string | null = null;
let csrfTokenRequest: Promise<string> | null = null;

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
