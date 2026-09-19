import { Capacitor } from "@capacitor/core";

export const NATIVE_SERVER_STORAGE_KEY = "firewall.native.server.v1";

export function isNativeAndroidApp() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function getNativeServerUrl() {
  if (!isNativeAndroidApp()) return null;
  return window.localStorage.getItem(NATIVE_SERVER_STORAGE_KEY)?.replace(/\/$/, "") || null;
}

export function normalizeNativeServerUrl(value: string) {
  const raw = value.trim();
  if (!raw) throw new Error("server_required");
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("server_invalid");
  }
  if (parsed.protocol === "http:" && import.meta.env.VITE_MOBILE_ALLOW_HTTP !== "true") {
    throw new Error("https_required");
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, "") || "/firewall-api";
  return parsed.toString().replace(/\/$/, "");
}

export function saveNativeServerUrl(value: string) {
  const normalized = normalizeNativeServerUrl(value);
  window.localStorage.setItem(NATIVE_SERVER_STORAGE_KEY, normalized);
  return normalized;
}

export function clearNativeServerUrl() {
  window.localStorage.removeItem(NATIVE_SERVER_STORAGE_KEY);
}
