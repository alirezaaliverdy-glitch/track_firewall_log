import { API_BASE_URL } from "@/config/frontendEnv";

export { API_BASE_URL };
export const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export type ApiTransport = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export const webCookieTransport: ApiTransport = {
  fetch(input, init) {
    const headers = init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers;
    return fetch(input, { ...init, credentials: "include", headers });
  }
};

export function requestUrl(input: RequestInfo | URL) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function isApiRequest(input: RequestInfo | URL) {
  const value = requestUrl(input);
  return API_BASE_URL.startsWith("http") ? value.startsWith(API_BASE_URL) : value.startsWith(API_BASE_URL);
}

export function apiPath(input: RequestInfo | URL) {
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

export function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === "object" && "method" in input && input.method) return input.method.toUpperCase();
  return "GET";
}

export async function apiRequest(path: string, init?: RequestInit, transport = webCookieTransport) {
  return transport.fetch(apiUrl(path), init);
}
