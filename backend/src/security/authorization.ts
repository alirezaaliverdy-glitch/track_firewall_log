import type { Permission } from "./permissions.js";

export type RoutePermissionPolicy = {
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  permission: Permission;
};

export const MUTATION_PERMISSION_POLICIES: readonly RoutePermissionPolicy[] = [
  { method: "POST", path: "/api/auth/logout", permission: "auth.session.manage" },
  { method: "POST", path: "/api/auth/logout-all", permission: "auth.session.terminate" },
  { method: "POST", path: "/api/auth/change-password", permission: "auth.session.manage" },
  { method: "DELETE", path: "/api/auth/sessions/:id", permission: "auth.session.terminate" },
  { method: "POST", path: "/api/admin/users", permission: "users.manage" },
  { method: "PATCH", path: "/api/admin/users/:id", permission: "users.manage" },
  { method: "DELETE", path: "/api/admin/users/:id", permission: "users.manage" },
  { method: "POST", path: "/api/admin/users/:id/reset-password", permission: "users.manage" },
  { method: "POST", path: "/api/companies", permission: "devices.manage" },
  { method: "PATCH", path: "/api/companies/:id", permission: "devices.manage" },
  { method: "DELETE", path: "/api/companies/:id", permission: "devices.manage" },
  { method: "POST", path: "/api/companies/:id/restore", permission: "devices.manage" },
  { method: "DELETE", path: "/api/admin/companies/:id/permanent", permission: "users.manage" },
  { method: "POST", path: "/api/security/attackers-allowlist", permission: "security.policy.manage" },
  { method: "DELETE", path: "/api/security/attackers-allowlist/:id", permission: "security.policy.manage" },
  { method: "POST", path: "/api/action-sessions/start", permission: "actions.propose" },
  { method: "POST", path: "/api/action-sessions/:id/answers", permission: "actions.propose" },
  { method: "POST", path: "/api/action-sessions/:id/build-plan", permission: "actions.propose" },
  { method: "POST", path: "/api/action-sessions/:id/cancel", permission: "actions.propose" },
  { method: "POST", path: "/api/actions/propose", permission: "actions.propose" },
  { method: "DELETE", path: "/api/action-center/history", permission: "security.policy.manage" },
  { method: "POST", path: "/api/action-center/:id/cancel", permission: "actions.approve" },
  { method: "POST", path: "/api/action-center/:id/retry", permission: "actions.propose" },
  { method: "PATCH", path: "/api/action-center/:id/target", permission: "actions.propose" },
  { method: "POST", path: "/api/actions/match", permission: "actions.propose" },
  { method: "POST", path: "/api/actions/:id/validate", permission: "actions.propose" },
  { method: "PATCH", path: "/api/actions/:id/parameters", permission: "actions.propose" },
  { method: "POST", path: "/api/actions/:id/dry-run", permission: "actions.propose" },
  { method: "POST", path: "/api/actions/:id/approve", permission: "actions.approve" },
  { method: "POST", path: "/api/actions/:id/reject", permission: "actions.approve" },
  { method: "POST", path: "/api/actions/:id/execute", permission: "actions.execute.write" },
  { method: "POST", path: "/api/actions/:id/quick-execute", permission: "actions.execute.write" },
  { method: "POST", path: "/api/scheduled-tasks", permission: "actions.execute.write" },
  { method: "PATCH", path: "/api/scheduled-tasks/:id", permission: "actions.execute.write" },
  { method: "POST", path: "/api/scheduled-tasks/:id/pause", permission: "actions.execute.write" },
  { method: "POST", path: "/api/scheduled-tasks/:id/resume", permission: "actions.execute.write" },
  { method: "POST", path: "/api/scheduled-tasks/:id/run-now", permission: "actions.execute.write" },
  { method: "POST", path: "/api/scheduled-tasks/:id/cancel", permission: "actions.execute.write" },
  { method: "POST", path: "/api/ai/chat", permission: "assistant.chat" },
  { method: "DELETE", path: "/api/ai/chat/sessions/:id/messages", permission: "assistant.chat" },
  { method: "PATCH", path: "/api/ai/intents/:id", permission: "actions.propose" },
  { method: "POST", path: "/api/ai/action-requests/:id/complete", permission: "actions.propose" },
  { method: "POST", path: "/api/analysis/upload", permission: "uploads.create" },
  { method: "POST", path: "/api/assessments/full-analysis", permission: "security.policy.manage" },
  { method: "POST", path: "/api/assessments/hardening-suggestions", permission: "security.policy.manage" },
  { method: "POST", path: "/api/assessments/:id/hardening-suggestions", permission: "security.policy.manage" },
  { method: "POST", path: "/api/recommendations/:id/create-action-plan", permission: "actions.propose" },
  { method: "DELETE", path: "/api/assets/:id", permission: "devices.manage" },
  { method: "POST", path: "/api/assets/import/preview", permission: "devices.manage" },
  { method: "POST", path: "/api/assets/import/apply", permission: "devices.manage" },
  { method: "POST", path: "/api/assets/sync/devices", permission: "devices.manage" },
  { method: "POST", path: "/api/assets/port-topology/discover", permission: "devices.manage" },
  { method: "POST", path: "/api/assets/port-topology/listeners/refresh", permission: "devices.manage" },
  { method: "PATCH", path: "/api/assets/port-topology/:deviceId/ports/:portName", permission: "devices.manage" },
  { method: "DELETE", path: "/api/assets/port-topology/:deviceId/ports/:portName", permission: "devices.manage" },
  { method: "PATCH", path: "/api/assets/port-topology/:deviceId/services/:endpointKey", permission: "devices.manage" },
  { method: "DELETE", path: "/api/assets/port-topology/:deviceId/services/:endpointKey", permission: "devices.manage" },
  { method: "POST", path: "/api/integrations/netbox/sync", permission: "devices.manage" },
  { method: "POST", path: "/api/collectors/:deviceId/enable", permission: "devices.manage" },
  { method: "POST", path: "/api/collectors/:deviceId/disable", permission: "devices.manage" },
  { method: "POST", path: "/api/collectors/:deviceId/run-once", permission: "devices.manage" },
  { method: "POST", path: "/api/commands/catalog/:id/create-action-plan", permission: "actions.propose" },
  { method: "POST", path: "/api/commands/ai-propose", permission: "actions.propose" },
  { method: "POST", path: "/api/actions/:id/plan", permission: "actions.propose" },
  { method: "POST", path: "/api/credentials", permission: "credentials.manage" },
  { method: "PATCH", path: "/api/credentials/:id", permission: "credentials.manage" },
  { method: "DELETE", path: "/api/credentials/:id", permission: "credentials.manage" },
  { method: "POST", path: "/api/detections/run", permission: "security.policy.manage" },
  { method: "POST", path: "/api/detection/run", permission: "security.policy.manage" },
  { method: "PATCH", path: "/api/detection-rules/:id", permission: "security.policy.manage" },
  { method: "POST", path: "/api/device-onboarding/sessions", permission: "devices.manage" },
  { method: "POST", path: "/api/device-onboarding/sessions/:sessionId/answers", permission: "devices.manage" },
  { method: "POST", path: "/api/device-onboarding/sessions/:sessionId/test", permission: "devices.manage" },
  { method: "POST", path: "/api/device-onboarding/sessions/:sessionId/test-connection", permission: "devices.manage" },
  { method: "POST", path: "/api/device-onboarding/sessions/:sessionId/detect", permission: "devices.manage" },
  { method: "POST", path: "/api/device-onboarding/sessions/:sessionId/detect-platform", permission: "devices.manage" },
  { method: "POST", path: "/api/device-onboarding/sessions/:sessionId/discover", permission: "devices.manage" },
  { method: "POST", path: "/api/device-onboarding/sessions/:sessionId/preview", permission: "devices.manage" },
  { method: "POST", path: "/api/device-onboarding/sessions/:sessionId/build-preview", permission: "devices.manage" },
  { method: "POST", path: "/api/device-onboarding/sessions/:sessionId/commit", permission: "devices.manage" },
  { method: "POST", path: "/api/device-onboarding/sessions/:sessionId/register-unverified", permission: "devices.manage" },
  { method: "POST", path: "/api/device-onboarding/sessions/:sessionId/retry", permission: "devices.manage" },
  { method: "POST", path: "/api/device-onboarding/sessions/:sessionId/cancel", permission: "devices.manage" },
  { method: "POST", path: "/api/devices/:deviceId/connection-test", permission: "devices.manage" },
  { method: "POST", path: "/api/devices/:deviceId/verification/retry", permission: "devices.manage" },
  { method: "POST", path: "/api/devices/:deviceId/verification/commit", permission: "devices.manage" },
  { method: "POST", path: "/api/devices", permission: "devices.manage" },
  { method: "PATCH", path: "/api/devices/:id", permission: "devices.manage" },
  { method: "DELETE", path: "/api/devices/:id", permission: "devices.manage" },
  { method: "POST", path: "/api/devices/:id/test-connection", permission: "devices.manage" },
  { method: "POST", path: "/api/diagnostics/sessions", permission: "devices.read" },
  { method: "POST", path: "/api/diagnostics/nmap", permission: "devices.read" },
  { method: "POST", path: "/api/events/retention/run", permission: "security.policy.manage" },
  { method: "PATCH", path: "/api/incidents/:id", permission: "security.policy.manage" },
  { method: "POST", path: "/api/monitoring/linux/devices/:deviceId/refresh", permission: "devices.read" },
  { method: "POST", path: "/api/devices/:deviceId/telemetry/linux/snapshot", permission: "devices.read" },
  { method: "POST", path: "/api/devices/:deviceId/telemetry/linux/analyze", permission: "devices.read" },
  { method: "POST", path: "/api/devices/:deviceId/telemetry/linux/stream/start", permission: "devices.read" },
  { method: "POST", path: "/api/devices/:deviceId/telemetry/linux/stream/stop", permission: "devices.read" },
  { method: "POST", path: "/api/security/events", permission: "security.policy.manage" },
  { method: "PATCH", path: "/api/security/findings/:id/status", permission: "security.policy.manage" },
  { method: "POST", path: "/api/security/findings/:id/action-plan", permission: "actions.propose" },
  { method: "POST", path: "/api/security/rules/:id/enable", permission: "security.policy.manage" },
  { method: "POST", path: "/api/security/rules/:id/disable", permission: "security.policy.manage" },
  { method: "POST", path: "/api/security/rules/test", permission: "security.policy.manage" },
  { method: "POST", path: "/api/security/detections/run", permission: "security.policy.manage" },
  { method: "PUT", path: "/api/security/alerts/email", permission: "security.policy.manage" },
  { method: "POST", path: "/api/security/alerts/email/test", permission: "security.policy.manage" },
  { method: "POST", path: "/api/security/alerts/email/test-vendors", permission: "security.policy.manage" },
  { method: "PUT", path: "/api/security/alerts/email/gmail", permission: "security.policy.manage" },
  { method: "DELETE", path: "/api/security/alerts/email/gmail", permission: "security.policy.manage" },
  { method: "POST", path: "/api/integrations/wazuh/sync", permission: "security.policy.manage" },
  { method: "PATCH", path: "/api/findings/:id", permission: "security.policy.manage" },
  { method: "POST", path: "/api/findings/:id/action-plan", permission: "actions.propose" },
  { method: "POST", path: "/api/uploads", permission: "uploads.create" },
  { method: "POST", path: "/api/devices/:deviceId/capabilities/refresh", permission: "devices.read" }
] as const;

const policyMatchers = MUTATION_PERMISSION_POLICIES.map((policy) => ({
  policy,
  regex: new RegExp(`^${policy.path.replace(/:[^/]+/g, "[^/]+")}$`)
}));

export function isMutationMethod(method: string) {
  return method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE";
}

export function findMutationPermission(method: string, pathname: string): Permission | null {
  if (!isMutationMethod(method)) return null;
  const match = policyMatchers.find(({ policy, regex }) => policy.method === method && (policy.path === pathname || regex.test(pathname)));
  return match?.policy.permission ?? null;
}

export function requiredExecutionPermissionForRisk(riskLevel: string | null | undefined): Permission {
  return riskLevel === "high" || riskLevel === "critical"
    ? "actions.execute.high_risk"
    : "actions.execute.write";
}
