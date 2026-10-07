import type { SecurityEvent } from "@prisma/client";
import { attributedAccountName, classifyAccountEvent } from "../services/vendor-user-activity.service.js";

export type AccountDetectionRuleDefinition = {
  key: string;
  name: string;
  description: string;
  severity: "medium" | "high";
  threshold: number;
  windowMinutes: number;
  category: string;
  mitreTags: string[];
};

// These rules complement device/vendor rules. A finding is attributed to an
// account only when the event actually identifies its actor; an IP or a target
// account name alone is not enough.
export const ACCOUNT_DETECTION_RULES: AccountDetectionRuleDefinition[] = [
  {
    key: "account.risky-privileged-command",
    name: "Account: sensitive privileged command",
    description: "A named account executed a privileged command that can change access, services, firewall rules, or system availability. Review the command and its authorization.",
    severity: "high", threshold: 1, windowMinutes: 15, category: "account-privileged-activity", mitreTags: ["T1548.003"]
  },
  {
    key: "account.identity-change",
    name: "Account: user or administrator changed",
    description: "A named operator changed a local user or administrator account. Review the audit event and change approval.",
    severity: "high", threshold: 1, windowMinutes: 15, category: "account-identity-change", mitreTags: ["T1098"]
  },
  {
    key: "account.configuration-change",
    name: "Account: configuration changed",
    description: "A configuration change was recorded with an attributable account. Review the change against the approved baseline.",
    severity: "medium", threshold: 1, windowMinutes: 15, category: "account-configuration-change", mitreTags: []
  }
];

export function accountRuleActor(event: Pick<SecurityEvent, "username" | "rawSnippet" | "rawMessage" | "action" | "eventType" | "tags">) {
  const classification = classifyAccountEvent(event);
  if (!classification || classification.kind === "login" || classification.kind === "failed_login" || classification.kind === "logout") return null;
  return attributedAccountName(event);
}

export function eventMatchesAccountRule(key: string, event: SecurityEvent) {
  if (!event.deviceId || !accountRuleActor(event)) return false;
  const classification = classifyAccountEvent(event);
  const raw = event.rawSnippet ?? event.rawMessage ?? "";
  if (key === "account.risky-privileged-command") return classification?.kind === "privileged" && classification.risk === "high";
  if (key === "account.identity-change") return classification?.kind === "change" && /\b(?:admin(?:istrator)?|account|user)\b.{0,100}\b(?:added|removed|created|deleted|disabled|group changed|privilege changed)\b/i.test(raw);
  if (key === "account.configuration-change") return classification?.kind === "change" && !/\b(?:admin(?:istrator)?|account|user)\b.{0,100}\b(?:added|removed|created|deleted|disabled|group changed|privilege changed)\b/i.test(raw);
  return false;
}
