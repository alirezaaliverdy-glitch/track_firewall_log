import type { AuthUser } from "./auth";

export type FrontendPermission =
  | "actions.read"
  | "actions.approve"
  | "actions.execute.low_medium"
  | "actions.execute.high_risk"
  | "credentials.manage";

const ROLE_PERMISSIONS: Record<AuthUser["role"], ReadonlySet<FrontendPermission>> = {
  viewer: new Set(["actions.read"]),
  operator: new Set(["actions.read", "actions.approve", "actions.execute.low_medium"]),
  admin: new Set(["actions.read", "actions.approve", "actions.execute.low_medium", "actions.execute.high_risk", "credentials.manage"]),
};

export function hasFrontendPermission(user: AuthUser | null | undefined, permission: FrontendPermission) {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role]?.has(permission) ?? false;
}

export function actionExecutionPermission(user: AuthUser | null | undefined, riskLevel: string, isFa = false) {
  if (!user) {
    return {
      allowed: false,
      reason: isFa ? "برای اجرای عملیات باید وارد شوید." : "Sign in to execute actions.",
    };
  }
  if (!hasFrontendPermission(user, "actions.approve")) {
    return {
      allowed: false,
      reason: isFa ? "نقش viewer فقط دسترسی خواندنی دارد." : "Viewer role is read-only.",
    };
  }
  if (["high", "critical"].includes(riskLevel) && !hasFrontendPermission(user, "actions.execute.high_risk")) {
    return {
      allowed: false,
      reason: isFa ? "اجرای پرریسک فقط برای admin فعال است." : "High-risk execution is admin-only.",
    };
  }
  if (!hasFrontendPermission(user, "actions.execute.low_medium")) {
    return {
      allowed: false,
      reason: isFa ? "این نقش مجوز اجرای عملیات را ندارد." : "This role cannot execute actions.",
    };
  }
  return { allowed: true, reason: null };
}
