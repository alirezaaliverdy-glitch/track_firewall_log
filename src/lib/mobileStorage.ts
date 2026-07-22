const MOBILE_STORAGE_NAMESPACE = "firewall.mobile.";
const SENSITIVE_KEY_PARTS = [
  "password",
  "passphrase",
  "privatekey",
  "sshkey",
  "apikey",
  "token",
  "secret",
  "credential",
  "rawcommand",
  "commandpreview",
  "connectorresult"
];

export type MobilePreferenceKey = "locale" | "sidebarCollapsed" | "lastRoute" | "theme";

export function setMobilePreference(key: MobilePreferenceKey, value: string) {
  assertSafeMobileStorageKey(key);
  window.localStorage.setItem(`${MOBILE_STORAGE_NAMESPACE}${key}`, value);
}

export function getMobilePreference(key: MobilePreferenceKey) {
  assertSafeMobileStorageKey(key);
  return window.localStorage.getItem(`${MOBILE_STORAGE_NAMESPACE}${key}`);
}

export function removeMobilePreference(key: MobilePreferenceKey) {
  assertSafeMobileStorageKey(key);
  window.localStorage.removeItem(`${MOBILE_STORAGE_NAMESPACE}${key}`);
}

export function assertSafeMobileStorageKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))) {
    throw new Error("unsafe_mobile_storage_key");
  }
}
