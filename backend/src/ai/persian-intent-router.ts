import net from "node:net";

export type PersianIntentRouterInput = {
  text: string;
  selectedDeviceId?: string | null;
  selectedVendor?: string | null;
};

export type PersianIntentRouterOutput = {
  matched: boolean;
  actionType: string | null;
  executionTemplateRef: string | null;
  connectorType: "linux-ssh" | "mikrotik-ssh" | null;
  requiredParams: string[];
  normalizedParams: Record<string, unknown>;
  missingFields: string[];
  confidence: number;
  reasonFa: string;
  readOnly?: boolean;
};

const PERSIAN_DIGITS: Record<string, string> = {
  "\u06f0": "0", "\u06f1": "1", "\u06f2": "2", "\u06f3": "3", "\u06f4": "4",
  "\u06f5": "5", "\u06f6": "6", "\u06f7": "7", "\u06f8": "8", "\u06f9": "9",
  "\u0660": "0", "\u0661": "1", "\u0662": "2", "\u0663": "3", "\u0664": "4",
  "\u0665": "5", "\u0666": "6", "\u0667": "7", "\u0668": "8", "\u0669": "9",
};

const SERVICE_NAMES = ["nginx", "ssh", "sshd", "docker", "apache2", "apache", "httpd", "fail2ban", "postgresql", "mysql", "mariadb", "redis"];

export function normalizePersianIntentText(value: string) {
  return value
    .replace(/[\u06f0-\u06f9\u0660-\u0669]/g, (digit) => PERSIAN_DIGITS[digit] ?? digit)
    .replace(/\u064a/g, "\u06cc")
    .replace(/\u0643/g, "\u06a9")
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/[؟?،,؛;:.!()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function canonicalVendor(value: string | null | undefined) {
  const text = normalizePersianIntentText(String(value ?? "")).replace(/[\s_-]+/g, "");
  if (!text) return null;
  if (["linux", "linuxedge", "linuxserver", "ubuntu", "debian"].some((alias) => text.includes(alias)) || text.includes("\u0644\u06cc\u0646\u0648\u06a9\u0633")) return "linux";
  if (["mikrotik", "routeros"].some((alias) => text.includes(alias)) || text.includes("\u0645\u06cc\u06a9\u0631\u0648\u062a\u06cc\u06a9")) return "mikrotik";
  return text;
}

function includesAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(normalizePersianIntentText(phrase)));
}

function extractIp(text: string) {
  const candidate = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0];
  return candidate && net.isIP(candidate) !== 0 ? candidate : undefined;
}

function extractPort(text: string) {
  const match = text.match(/(?:\bport\b|\u067e\u0648\u0631\u062a)\s+(\d{1,5})|(\d{1,5})\s+(?:\bport\b|\u067e\u0648\u0631\u062a)/i);
  const value = Number(match?.[1] ?? match?.[2]);
  return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : undefined;
}

function extractServiceName(text: string) {
  const service = SERVICE_NAMES.find((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
  if (!service) return undefined;
  return service === "apache" ? "apache2" : service;
}

function output(input: {
  actionType: string;
  executionTemplateRef: string;
  connectorType: "linux-ssh" | "mikrotik-ssh";
  requiredParams?: string[];
  normalizedParams?: Record<string, unknown>;
  confidence?: number;
  reasonFa?: string;
  readOnly?: boolean;
}): PersianIntentRouterOutput {
  const requiredParams = input.requiredParams ?? [];
  const normalizedParams = input.normalizedParams ?? {};
  return {
    matched: true,
    actionType: input.actionType,
    executionTemplateRef: input.executionTemplateRef,
    connectorType: input.connectorType,
    requiredParams,
    normalizedParams,
    missingFields: requiredParams.filter((field) => normalizedParams[field] === undefined || normalizedParams[field] === ""),
    confidence: input.confidence ?? 0.98,
    reasonFa: input.reasonFa ?? "\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0628\u0647 template \u0627\u062c\u0631\u0627\u06cc\u06cc \u062b\u0628\u062a\u200c\u0634\u062f\u0647 \u0646\u06af\u0627\u0634\u062a \u0634\u062f.",
    readOnly: input.readOnly ?? false,
  };
}

export function routePersianIntent(input: PersianIntentRouterInput): PersianIntentRouterOutput {
  const text = normalizePersianIntentText(input.text);
  const valueText = input.text.replace(/[\u06f0-\u06f9\u0660-\u0669]/g, (digit) => PERSIAN_DIGITS[digit] ?? digit);
  const vendor = canonicalVendor(input.selectedVendor) ?? "generic";

  if (!input.selectedDeviceId) {
    return {
      matched: false,
      actionType: null,
      executionTemplateRef: null,
      connectorType: null,
      requiredParams: [],
      normalizedParams: {},
      missingFields: ["deviceId"],
      confidence: 1,
      reasonFa: "\u0627\u0648\u0644 \u062f\u0633\u062a\u06af\u0627\u0647 \u0631\u0627 \u0627\u0646\u062a\u062e\u0627\u0628 \u06a9\u0646\u06cc\u062f.",
    };
  }

  const ipAddress = extractIp(valueText);
  const port = extractPort(text);

  if (vendor === "linux") {
    if (includesAny(text, [
      "\u0648\u0636\u0639\u06cc\u062a \u067e\u0648\u0631\u062a \u0647\u0627\u06cc \u0628\u0627\u0632 \u0631\u0648 \u0646\u0634\u0648\u0646 \u0628\u062f\u0647",
      "\u067e\u0648\u0631\u062a \u0647\u0627\u06cc \u0628\u0627\u0632 \u0631\u0648 \u0646\u0634\u0648\u0646 \u0628\u062f\u0647",
      "\u0644\u06cc\u0633\u062a \u067e\u0648\u0631\u062a \u0647\u0627\u06cc \u0628\u0627\u0632",
      "\u0686\u0647 \u067e\u0648\u0631\u062a \u0647\u0627\u06cc\u06cc \u0628\u0627\u0632\u0647",
      "\u0648\u0636\u0639\u06cc\u062a \u067e\u0648\u0631\u062a \u0647\u0627",
      "list open ports",
      "open ports",
    ])) {
      return output({ actionType: "linux_list_open_ports", executionTemplateRef: "linux_list_open_ports", connectorType: "linux-ssh", normalizedParams: {}, readOnly: true });
    }

    if (includesAny(text, ["\u0648\u0636\u0639\u06cc\u062a \u0641\u0627\u06cc\u0631\u0648\u0627\u0644", "\u0641\u0627\u06cc\u0631\u0648\u0627\u0644 \u0631\u0648 \u0686\u06a9 \u06a9\u0646", "ufw status"])) {
      return output({ actionType: "linux_check_firewall_status", executionTemplateRef: "linux_check_firewall_status", connectorType: "linux-ssh", normalizedParams: {}, readOnly: true });
    }

    const serviceName = extractServiceName(text);
    if (serviceName && includesAny(text, ["\u0648\u0636\u0639\u06cc\u062a", "\u0686\u06a9 \u06a9\u0646", "\u0633\u0631\u0648\u06cc\u0633", "status", "check"])) {
      return output({ actionType: "linux_check_service_status", executionTemplateRef: "linux_check_service_status", connectorType: "linux-ssh", requiredParams: ["serviceName"], normalizedParams: { serviceName }, readOnly: true });
    }

    if (includesAny(text, ["\u06a9\u0627\u0631\u0628\u0631\u0627\u0646 sudo", "\u0686\u0647 \u06a9\u0633\u0627\u0646\u06cc sudo \u062f\u0627\u0631\u0646", "sudo users"])) {
      return output({ actionType: "linux_check_sudo_users", executionTemplateRef: "linux_check_sudo_users", connectorType: "linux-ssh", normalizedParams: {}, readOnly: true });
    }

    if (ipAddress && includesAny(text, ["\u0628\u0644\u0627\u06a9 \u06a9\u0646", "block"])) {
      return output({ actionType: "linux_block_ip", executionTemplateRef: "linux_block_ip", connectorType: "linux-ssh", requiredParams: ["ipAddress"], normalizedParams: { ipAddress }, readOnly: false });
    }

    if (port && includesAny(text, ["\u0628\u0627\u0632 \u06a9\u0646", "open"])) {
      return output({ actionType: "linux_open_port", executionTemplateRef: "linux_open_port", connectorType: "linux-ssh", requiredParams: ["port"], normalizedParams: { port, protocol: "tcp" }, readOnly: false });
    }
  }

  if (vendor === "mikrotik") {
    if (includesAny(text, ["\u0633\u0631\u0648\u06cc\u0633 \u0647\u0627\u06cc \u0645\u062f\u06cc\u0631\u06cc\u062a\u06cc \u0645\u06cc\u06a9\u0631\u0648\u062a\u06cc\u06a9", "\u067e\u0648\u0631\u062a \u0647\u0627\u06cc \u0645\u062f\u06cc\u0631\u06cc\u062a\u06cc \u0645\u06cc\u06a9\u0631\u0648\u062a\u06cc\u06a9"])) {
      return output({ actionType: "mikrotik_list_management_services", executionTemplateRef: "mikrotik_list_management_services", connectorType: "mikrotik-ssh", normalizedParams: {}, readOnly: true });
    }

    if (includesAny(text, ["\u0644\u0627\u06af \u0644\u0627\u06af\u06cc\u0646 \u0645\u06cc\u06a9\u0631\u0648\u062a\u06cc\u06a9", "\u0648\u0631\u0648\u062f \u0646\u0627\u0645\u0648\u0641\u0642 \u0645\u06cc\u06a9\u0631\u0648\u062a\u06cc\u06a9", "login logs", "failed login"])) {
      return output({ actionType: "mikrotik_check_login_logs", executionTemplateRef: "mikrotik_check_failed_logins", connectorType: "mikrotik-ssh", normalizedParams: {}, readOnly: true });
    }

    if (ipAddress && includesAny(text, ["\u0628\u0644\u0627\u06a9 \u06a9\u0646", "block"])) {
      return output({ actionType: "mikrotik_block_ip", executionTemplateRef: "mikrotik_block_ip", connectorType: "mikrotik-ssh", requiredParams: ["ipAddress"], normalizedParams: { ipAddress }, readOnly: false });
    }
  }

  return {
    matched: false,
    actionType: null,
    executionTemplateRef: null,
    connectorType: null,
    requiredParams: [],
    normalizedParams: {},
    missingFields: [],
    confidence: 0,
    reasonFa: "\u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0647\u0646\u0648\u0632 \u0627\u062c\u0631\u0627\u06cc \u062e\u0648\u062f\u06a9\u0627\u0631 \u0622\u0645\u0627\u062f\u0647 \u0646\u06cc\u0633\u062a.",
  };
}
