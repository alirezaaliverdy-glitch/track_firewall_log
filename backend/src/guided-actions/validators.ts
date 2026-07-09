import net from "node:net";
import type { GuidedActionField, GuidedActionStep } from "./types.js";

export type GuidedValidationIssue = {
  field: string;
  messageFa: string;
};

function isBlank(value: unknown) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

export function maskGuidedSecrets(values: Record<string, unknown>, fields: GuidedActionField[]) {
  const secretKeys = new Set(fields.filter((field) => field.secret || field.type === "password" || field.type === "generatedSecret").map((field) => field.key));
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, secretKeys.has(key) ? "[secret]" : value]));
}

function validateCidr(value: string) {
  const [address, prefix] = value.split("/");
  const version = net.isIP(address);
  if (!version || prefix === undefined || !/^\d+$/.test(prefix)) return false;
  const bits = Number(prefix);
  return bits >= 0 && bits <= (version === 4 ? 32 : 128);
}

function validatePort(value: unknown) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function validateIpRange(value: unknown) {
  if (typeof value === "string") {
    const [start, end] = value.split("-").map((part) => part.trim());
    return Boolean(start && end && net.isIP(start) && net.isIP(end));
  }
  if (typeof value === "object" && value) {
    const range = value as Record<string, unknown>;
    return typeof range.startIp === "string" && typeof range.endIp === "string" && Boolean(net.isIP(range.startIp) && net.isIP(range.endIp));
  }
  return false;
}

export function activeGuidedFields(steps: GuidedActionStep[], answers: Record<string, unknown>) {
  return steps.flatMap((step) => step.fields).filter((field) => {
    if (!field.dependsOn) return true;
    return Object.entries(field.dependsOn).every(([key, value]) => answers[key] === value);
  });
}

export function validateGuidedValues(fields: GuidedActionField[], values: Record<string, unknown>): GuidedValidationIssue[] {
  const issues: GuidedValidationIssue[] = [];
  for (const field of fields) {
    const value = values[field.key];
    if (field.required && isBlank(value)) {
      issues.push({ field: field.key, messageFa: `${field.labelFa} الزامی است.` });
      continue;
    }
    if (isBlank(value)) continue;

    const allowedValues = field.validation?.allowedValues ?? field.options?.map((option) => option.value);
    if ((field.type === "select" || field.type === "multiSelect") && allowedValues?.length) {
      const submitted = Array.isArray(value) ? value.map(String) : [String(value)];
      const invalid = submitted.find((item) => !allowedValues.includes(item));
      if (invalid && field.validation?.allowCustom !== true) {
        issues.push({ field: field.key, messageFa: `${field.labelFa} باید یکی از مقدارهای مجاز باشد.` });
        continue;
      }
    }

    if (field.type === "ip" && (typeof value !== "string" || net.isIP(value) === 0)) issues.push({ field: field.key, messageFa: `${field.labelFa} باید IP معتبر باشد.` });
    if (field.type === "cidr" && (typeof value !== "string" || !validateCidr(value))) issues.push({ field: field.key, messageFa: `${field.labelFa} باید CIDR معتبر باشد.` });
    if (field.type === "cidrList") {
      const valuesList = Array.isArray(value) ? value : String(value).split(",");
      if (valuesList.some((item) => typeof item !== "string" || !validateCidr(item.trim()))) issues.push({ field: field.key, messageFa: `${field.labelFa} باید لیست CIDR معتبر باشد.` });
    }
    if (field.type === "ipList") {
      const valuesList = Array.isArray(value) ? value : String(value).split(",");
      if (valuesList.some((item) => typeof item !== "string" || net.isIP(item.trim()) === 0)) issues.push({ field: field.key, messageFa: `${field.labelFa} باید لیست IP معتبر باشد.` });
    }
    if (field.type === "ipRange" && !validateIpRange(value)) issues.push({ field: field.key, messageFa: `${field.labelFa} باید بازه IP معتبر باشد.` });
    if (field.validation?.pattern && typeof value === "string" && !new RegExp(field.validation.pattern).test(value)) issues.push({ field: field.key, messageFa: `${field.labelFa} قالب معتبر ندارد.` });
    if (field.validation?.min !== undefined && Number(value) < field.validation.min) issues.push({ field: field.key, messageFa: `${field.labelFa} کمتر از حد مجاز است.` });
    if (field.validation?.max !== undefined && Number(value) > field.validation.max) issues.push({ field: field.key, messageFa: `${field.labelFa} بیشتر از حد مجاز است.` });
    if ((field.key.toLowerCase().includes("port") || field.validation?.max === 65535) && field.type === "number" && !validatePort(value)) issues.push({ field: field.key, messageFa: `${field.labelFa} باید عددی بین 1 تا 65535 باشد.` });
  }
  return issues;
}
