import type { AiActionDebug, AiActionIntent } from "@/lib/ai";
import type { Device } from "@/lib/devices";
import type { AssistantPlanningInput, AssistantPlanningMode } from "./types";

export const safeNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const formatNumber = (value: unknown) => safeNumber(value).toLocaleString();

export const formatDateTime = (value: unknown): string => {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};

export function riskClass(risk: string) {
  if (risk === "critical") return "border-red-700 bg-red-950/60 text-red-200";
  if (risk === "high") return "border-red-800 bg-red-950/40 text-red-300";
  if (risk === "medium") return "border-yellow-800 bg-yellow-950/40 text-yellow-300";
  return "border-blue-800 bg-blue-950/40 text-blue-200";
}

export function normalizedVendor(value: unknown, intentType?: string) {
  const token = typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_-]+/g, "") : "";
  if (["mikrotik", "routeros", "mt", "mkt"].includes(token) || intentType?.startsWith("mikrotik_")) return "mikrotik";
  if (["fortigate", "fortinet", "fortios"].includes(token) || intentType?.startsWith("fortigate_")) return "fortigate";
  if (["linux", "linuxedge", "ubuntu"].includes(token) || intentType?.startsWith("linux_")) return "linux_edge";
  return null;
}

export function vendorOfDevice(device?: Device | null) {
  if (!device) return "";
  if (device.type === "linux_edge") return "linux";
  if (device.type === "generic_firewall" || device.type === "generic_syslog_source") return "generic";
  return device.type;
}

export function connectorTypeOf(vendor: string) {
  if (vendor === "fortigate") return "fortigate-ssh";
  if (vendor === "mikrotik") return "mikrotik-ssh";
  if (vendor === "linux") return "linux-ssh";
  return null;
}

export function classifyPlanningMode(input: AssistantPlanningInput): AssistantPlanningMode {
  if (input.backendMode === "guided_workflow" || input.guidedStart) return "guided_workflow";
  if (input.createdPlanId || input.actionIntent || input.actionDebug || input.executionState?.lifecycle) return "direct_action";
  return "chat";
}

export function canSurfaceActionPlan(mode: string | null): mode is "action_request" {
  return mode === "action_request";
}

export function actionPlanSourceLabel(actionType: string | null | undefined, source: unknown, isFa: boolean) {
  const normalizedSource = String(source ?? "");
  if (normalizedSource === "ai_custom" || actionType === "custom_vendor_action") {
    return isFa ? "AI Generated Action" : "AI Generated Action";
  }
  return isFa ? "Catalog Action" : "Catalog Action";
}

export type AssistantIntentLike = AiActionIntent | AiActionDebug | null;
