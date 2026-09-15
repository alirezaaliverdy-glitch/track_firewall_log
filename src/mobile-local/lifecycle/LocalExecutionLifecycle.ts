import type { AuditEvent, ExecutionResult } from "../../../packages/contracts/src/index";

export type LocalExecutionResumeAction = "resume-observation" | "show-final-result" | "mark-stale-failed";

export type LocalExecutionLifecycleDecision = {
  action: LocalExecutionResumeAction;
  reason: string;
  foregroundNotificationRequired: boolean;
};

export type LocalExecutionLifecycleSnapshot = {
  executionId: string;
  status: ExecutionResult["status"];
  connectorInvoked: boolean;
  updatedAt: string;
  appLifecycleState: "foreground" | "background" | "terminated";
  platform: "android" | "ios";
};

export function duplicateExecutionKey(planId: string, approvalHash: string) {
  return `local-exec:${planId}:${approvalHash}`;
}

export function decideLocalExecutionResume(snapshot: LocalExecutionLifecycleSnapshot): LocalExecutionLifecycleDecision {
  if (snapshot.status === "succeeded" || snapshot.status === "failed" || snapshot.status === "cancelled") {
    return { action: "show-final-result", reason: "LOCAL_EXECUTION_ALREADY_FINAL", foregroundNotificationRequired: false };
  }
  if (!snapshot.connectorInvoked) {
    return { action: "mark-stale-failed", reason: "LOCAL_EXECUTION_CONNECTOR_NOT_INVOKED", foregroundNotificationRequired: false };
  }
  return {
    action: "resume-observation",
    reason: snapshot.appLifecycleState === "foreground" ? "LOCAL_EXECUTION_ACTIVE" : "LOCAL_EXECUTION_BACKGROUND_OBSERVATION",
    foregroundNotificationRequired: snapshot.platform === "android"
  };
}

export function foregroundNotificationFor(snapshot: LocalExecutionLifecycleSnapshot) {
  if (snapshot.platform !== "android" || snapshot.status !== "executing") return null;
  return {
    channelId: "local-ssh-execution",
    notificationId: Number.parseInt(snapshot.executionId.replace(/\D/g, "").slice(-6) || "1001", 10),
    title: "Local SSH execution",
    body: "Execution is running locally and remains visible until completion."
  };
}

export function iosBackgroundExecutionStatus(snapshot: LocalExecutionLifecycleSnapshot) {
  if (snapshot.platform !== "ios") return { supported: true, reason: "LOCAL_IOS_FOREGROUND_OR_NOT_APPLICABLE" };
  if (snapshot.status !== "executing") return { supported: true, reason: "LOCAL_IOS_EXECUTION_FINAL_OR_IDLE" };
  return { supported: false, reason: "LOCAL_IOS_LONG_RUNNING_SSH_REQUIRES_FOREGROUND_SESSION" };
}

export function reconcileAuditContinuity(events: AuditEvent[]) {
  return events.every((event, index) => index === 0 ? event.previousHash === null : event.previousHash === events[index - 1].eventHash);
}
