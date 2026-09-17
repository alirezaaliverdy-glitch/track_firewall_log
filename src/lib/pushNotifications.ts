export type PushReadiness = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  canRequest: boolean;
  reason: "ready" | "unsupported" | "denied";
};

export function getPushReadiness(): PushReadiness {
  const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  if (!supported) {
    return { supported: false, permission: "unsupported", canRequest: false, reason: "unsupported" };
  }
  const permission = Notification.permission;
  return {
    supported: true,
    permission,
    canRequest: permission === "default",
    reason: permission === "denied" ? "denied" : "ready"
  };
}

export async function requestPushPermissionReadiness(): Promise<PushReadiness> {
  const readiness = getPushReadiness();
  if (!readiness.supported || !readiness.canRequest) return readiness;
  await Notification.requestPermission();
  return getPushReadiness();
}
