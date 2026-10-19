export type Role = "admin" | "operator" | "viewer";

export type Permission =
  | "vpn.manage"
  | "devices.terminal"
  | "community.participate"
  | "community.moderate"
  | "assistant.chat"
  | "devices.read"
  | "devices.manage"
  | "credentials.manage"
  | "actions.read"
  | "actions.propose"
  | "actions.approve"
  | "actions.execute.readonly"
  | "actions.execute.write"
  | "actions.execute.high_risk"
  | "audit.read"
  | "security.policy.manage"
  | "uploads.create"
  | "users.manage"
  | "auth.session.terminate"
  | "auth.session.manage";

export const ALL_PERMISSIONS: readonly Permission[] = [
  "vpn.manage",
  "devices.terminal",
  "community.participate",
  "community.moderate",
  "assistant.chat",
  "devices.read",
  "devices.manage",
  "credentials.manage",
  "actions.read",
  "actions.propose",
  "actions.approve",
  "actions.execute.readonly",
  "actions.execute.write",
  "actions.execute.high_risk",
  "audit.read",
  "security.policy.manage",
  "uploads.create",
  "users.manage",
  "auth.session.terminate",
  "auth.session.manage"
] as const;

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  viewer: new Set<Permission>([
    "community.participate",
    "devices.read",
    "actions.read",
    "audit.read",
    "auth.session.manage"
  ]),
  operator: new Set<Permission>([
    "vpn.manage",
    "community.participate",
    "assistant.chat",
    "devices.read",
    "devices.manage",
    "actions.read",
    "actions.propose",
    "actions.approve",
    "actions.execute.readonly",
    "actions.execute.write",
    "audit.read",
    "uploads.create",
    "auth.session.manage"
  ]),
  admin: new Set<Permission>(ALL_PERMISSIONS)
};

export function hasPermission(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsForRole(role: Role) {
  return Array.from(ROLE_PERMISSIONS[role]);
}
