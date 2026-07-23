const ACTION_APPROVAL_EXECUTION_PATTERN = /\/actions\/[^/]+\/(?:approve|execute|quick-execute)$/;

export const MOBILE_ACTION_NOTIFICATION_EVENTS = [
  "approval_requested",
  "execution_started",
  "step_failed",
  "verification_failed",
  "execution_completed",
  "device_disconnected",
] as const;

export type MobileActionNotificationEvent = typeof MOBILE_ACTION_NOTIFICATION_EVENTS[number];

export function actionDeepLink(actionPlanId: string, target: "plan" | "parameters" | "result" | "approval" = "plan") {
  const encoded = encodeURIComponent(actionPlanId);
  if (target === "parameters") return `/actions/${encoded}/configure`;
  if (target === "result") return `/actions/${encoded}/result`;
  if (target === "approval") return `/actions?selected=${encoded}&review=approval`;
  return `/actions?selected=${encoded}`;
}

export function isActionApprovalOrExecutionPath(path: string) {
  return ACTION_APPROVAL_EXECUTION_PATTERN.test(path);
}

export function assertOnlineActionMutation(path: string, online = typeof navigator === "undefined" ? true : navigator.onLine) {
  if (!online && isActionApprovalOrExecutionPath(path)) {
    throw new Error("OFFLINE_ACTION_APPROVAL_EXECUTION_BLOCKED");
  }
}

function idempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `mobile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function withIdempotencyBody(init?: RequestInit) {
  if (!init?.body || typeof init.body !== "string") return { init, key: null };
  try {
    const parsed = JSON.parse(init.body) as Record<string, unknown>;
    const key = typeof parsed.idempotencyKey === "string" && parsed.idempotencyKey.trim()
      ? parsed.idempotencyKey
      : idempotencyKey();
    return { init: { ...init, body: JSON.stringify({ ...parsed, idempotencyKey: key }) }, key };
  } catch {
    return { init, key: null };
  }
}

export function withMobileActionRequest(path: string, init?: RequestInit) {
  assertOnlineActionMutation(path);
  const method = String(init?.method ?? "GET").toUpperCase();
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return init;
  const { init: guardedInit, key } = withIdempotencyBody(init);
  return {
    ...guardedInit,
    headers: {
      ...(guardedInit?.headers ?? {}),
      ...(key ? { "X-Idempotency-Key": key } : {}),
    },
  };
}

export function dispatchMobileActionNotification(detail: {
  event: MobileActionNotificationEvent;
  actionPlanId: string;
  target?: "plan" | "parameters" | "result" | "approval";
}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("app:action-notification", {
    detail: {
      ...detail,
      route: actionDeepLink(detail.actionPlanId, detail.target),
      exposesSecrets: false,
      includesRawCommandOutput: false,
    },
  }));
}
