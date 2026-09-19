export type FrontendAppEnvironment = "development" | "staging" | "production";

export const FRONTEND_APP_ENV = (import.meta.env.VITE_APP_ENV ?? "development") as FrontendAppEnvironment;
export const FRONTEND_BASE_PATH = import.meta.env.VITE_BASE_PATH ?? "/";
const nativeServerUrl = typeof window !== "undefined" ? window.localStorage.getItem("firewall.native.server.v1") : null;
export const API_BASE_URL = (nativeServerUrl ?? import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");
