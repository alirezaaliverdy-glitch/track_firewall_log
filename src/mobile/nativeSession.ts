import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { isNativeAndroidApp } from "./nativeServerConfig";

const SESSION_KEY = "firewall.android.session.v1";
let sessionToken: string | null = null;

export async function initializeNativeSession() {
  if (!isNativeAndroidApp()) return;
  try {
    sessionToken = (await SecureStoragePlugin.get({ key: SESSION_KEY })).value || null;
  } catch {
    sessionToken = null;
  }
}

export function getNativeSessionToken() {
  return isNativeAndroidApp() ? sessionToken : null;
}

export async function setNativeSessionToken(token: string) {
  if (!isNativeAndroidApp()) return;
  sessionToken = token;
  await SecureStoragePlugin.set({ key: SESSION_KEY, value: token });
}

export async function clearNativeSessionToken() {
  if (!isNativeAndroidApp()) return;
  sessionToken = null;
  await SecureStoragePlugin.remove({ key: SESSION_KEY }).catch(() => undefined);
}
