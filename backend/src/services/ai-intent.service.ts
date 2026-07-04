import {
  AiActionIntentStatus,
  AiIntentType,
  AiRiskLevel,
  type AiActionIntent,
  type Prisma
} from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { proposeActionPlan } from "./action-plan.service.js";
import { normalizeIntentType, normalizeVendor, resolveDeviceIdFromCandidates } from "./ai-normalization.js";
import { normalizeIntent } from "../actions/intent-normalizer.js";

export type ParsedIntent = {
  intentType: AiIntentType;
  riskLevel: AiRiskLevel;
  parameters: Record<string, unknown>;
  explanation: string;
};

const PERSIAN_DIGITS: Record<string, string> = {
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9"
};

function normalizeText(value: string) {
  return value
    .replace(/[۰-۹٠-٩]/g, (digit) => PERSIAN_DIGITS[digit] ?? digit)
    .toLowerCase();
}

function numbers(text: string) {
  return Array.from(text.matchAll(/\b\d{1,5}\b/g)).map((match) => Number.parseInt(match[0], 10));
}

function ipAddress(text: string) {
  return text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0];
}

function ipv4OrCidr(text: string) {
  return text.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/(?:[0-9]|[12][0-9]|3[0-2]))?\b/)?.[0];
}

function containsAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function customAction(input: {
  vendor: "mikrotik" | "fortigate" | "linux" | "pfsense" | "cisco" | "generic" | "unknown";
  requestedOperation: string;
  category?: string;
  critical?: boolean;
  destructive?: boolean;
  targetDeviceHint?: string;
  expectedImpact?: string;
}): ParsedIntent {
  const destructive = Boolean(input.destructive || input.critical);
  return {
    intentType: AiIntentType.custom_vendor_action,
    riskLevel: input.critical ? AiRiskLevel.critical : AiRiskLevel.high,
    parameters: {
      vendor: input.vendor,
      targetDeviceHint: input.targetDeviceHint ?? input.vendor,
      requestedOperation: input.requestedOperation,
      operationCategory: input.category ?? "other",
      destructive,
      requiresExplicitReview: destructive || Boolean(input.critical),
      executionSupport: input.vendor === "unknown" ? "unsupported_vendor" : "manual_or_not_implemented",
      expectedImpact: input.expectedImpact ?? "The requested change may alter device security, availability, or connectivity.",
      requiredParameters: [],
      providedParameters: {},
      missingFields: [],
      clarificationQuestions: [],
      suggestedPrechecks: ["Confirm the target device and capture the current configuration state."],
      suggestedVerification: ["Verify the requested state and confirm management connectivity after the change."],
      suggestedRollback: ["Restore the previous configuration or revert the specific change if verification fails."]
    },
    explanation: "A reviewable custom action proposal was created because no controlled catalog execution path is available."
  };
}

function normalizeUnicodePersian(value: string) {
  return value.replace(/[\u06f0-\u06f9\u0660-\u0669]/g, (digit) => {
    if (digit >= "\u06f0" && digit <= "\u06f9") return String(digit.charCodeAt(0) - 0x06f0);
    return String(digit.charCodeAt(0) - 0x0660);
  });
}

function persianNumber(text: string) {
  if (containsAny(text, ["\u06cc\u06a9", "\u064a\u06a9"])) return 1;
  if (text.includes("\u062f\u0648")) return 2;
  if (text.includes("\u0633\u0647")) return 3;
  return undefined;
}

function durationTimeoutFromText(text: string, nums: number[]) {
  if (containsAny(text, ["\u0646\u06cc\u0645 \u0633\u0627\u0639\u062a", "\u0646\u064a\u0645 \u0633\u0627\u0639\u062a"])) return "30m";
  const amount = nums.find((num) => num > 0 && num <= 3650) ?? persianNumber(text);
  if (!amount) return durationText(text, nums);
  if (containsAny(text, ["hour", "Ø³Ø§Ø¹Øª", "\u0633\u0627\u0639\u062a"])) return `${amount}h`;
  if (containsAny(text, ["day", "Ø±ÙˆØ²", "\u0631\u0648\u0632"])) return `${amount}d`;
  if (containsAny(text, ["week", "Ù‡ÙØªÙ‡", "\u0647\u0641\u062a\u0647"])) return `${amount}w`;
  return `${amount}m`;
}

function durationMinutesFromText(text: string, nums: number[]) {
  const timeout = durationTimeoutFromText(text, nums);
  const match = timeout?.match(/^(\d+)([mhdw])$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (match[2] === "m") return amount;
  if (match[2] === "h") return amount * 60;
  if (match[2] === "d") return amount * 1440;
  return amount * 10080;
}

function explicitTimeout(text: string) {
  const withoutIps = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, " ");
  const compact = withoutIps.match(/\b\d+[smhdw]\b/)?.[0];
  if (compact) return compact;
  const amount = withoutIps.match(/\b\d+\b/)?.[0];
  if (!amount) return undefined;
  if (text.includes("hour") || text.includes("ساعت")) return `${amount}h`;
  if (text.includes("day") || text.includes("روز")) return `${amount}d`;
  if (text.includes("week") || text.includes("هفته")) return `${amount}w`;
  if (text.includes("minute") || text.includes("دقیقه")) return `${amount}m`;
  return undefined;
}

function commentFromText(text: string) {
  const quoted = text.match(/["']([^"']{1,120})["']/)?.[1];
  if (quoted) return quoted;
  return text.match(/\bupdated-by-[A-Za-z0-9_.:-]{1,100}\b/)?.[0] ??
    text.match(/\b[A-Za-z0-9_.:-]{1,120}\b(?=\s*(?:بذار|کن)$)/)?.[0];
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value)).filter(Boolean)));
}

function targetHint(text: string, nums: number[]) {
  if (text.includes("fortigate") || text.includes("fortinet") || text.includes("fortios")) return "fortigate";
  if (text.includes("linux") || text.includes("\u0644\u06cc\u0646\u0648\u06a9\u0633")) return "linux";
  if (text.includes("mikrotik") || text.includes("routeros") || text.includes("میکروتیک")) return "mikrotik";
  if (text.includes("ubuntu lab")) return "ubuntu lab";
  if (text.includes("ubuntu")) return "ubuntu";
  const port = nums.find((num) => num >= 1 && num <= 65535);
  const extra = nums.find((num) => num !== port);
  return extra ? String(extra) : undefined;
}

function durationText(text: string, nums: number[]) {
  const amount = nums.find((num) => num > 0 && num <= 3650);
  if (!amount) return undefined;
  if (containsAny(text, ["hour", "ساعت"])) return `${amount}h`;
  if (containsAny(text, ["day", "روز"])) return `${amount}d`;
  if (containsAny(text, ["week", "هفته"])) return `${amount}w`;
  return `${amount}m`;
}

export function parseAiIntent(message: string): ParsedIntent | null {
  const text = normalizeUnicodePersian(normalizeText(message));
  const ip = ipAddress(text);
  const nums = numbers(ip ? text.replace(ip, " ") : text);
  const fortigate = containsAny(text, ["fortigate", "fortinet", "fortios"]);
  const username = text.match(/(?:user|یوزر|کاربر)\s+([a-z_][a-z0-9_.-]{0,31})\b/i)?.[1];

  const linuxUserIntent = (intentType: AiIntentType, riskLevel: AiRiskLevel, explanation: string): ParsedIntent => ({
    intentType, riskLevel,
    parameters: { vendor: "linux", targetDeviceHint: "linux", username, executionSupport: "connector", missingFields: username ? [] : ["username"], clarificationQuestions: username ? [] : ["نام کاربر لینوکس چیست؟"] },
    explanation
  });
  if (containsAny(text, ["sudo", "wheel"]) && containsAny(text, ["خارج", "حذف", "remove"])) return linuxUserIntent(AiIntentType.linux_remove_user_from_sudo, AiRiskLevel.high, "کاربر از گروه sudo با template کنترل‌شده حذف می‌شود.");
  if (containsAny(text, ["sudo", "wheel"]) && containsAny(text, ["اضافه", "add"])) return linuxUserIntent(AiIntentType.linux_add_user_to_sudo, AiRiskLevel.high, "کاربر با template کنترل‌شده به گروه sudo افزوده می‌شود.");
  if (containsAny(text, ["گروه", "groups"]) && containsAny(text, ["چک", "بررسی", "check"])) return linuxUserIntent(AiIntentType.linux_check_user_groups, AiRiskLevel.low, "گروه‌های کاربر با template فقط‌خواندنی بررسی می‌شوند.");
  if ((text.includes("قفل") || /\bunlock\b/.test(text)) && containsAny(text, ["باز", "unlock"])) return linuxUserIntent(AiIntentType.linux_unlock_user, AiRiskLevel.high, "قفل کاربر با template کنترل‌شده باز می‌شود.");
  if (text.includes("قفل") || /\block\b/.test(text)) return linuxUserIntent(AiIntentType.linux_lock_user, AiRiskLevel.high, "کاربر با template کنترل‌شده قفل می‌شود.");

  if (text.trim().startsWith("/") || containsAny(text, ["raw cli", "raw command", "execute command", "run command"])) {
    const vendor = containsAny(text, ["mikrotik", "routeros", "/ip ", "/system "]) ? "mikrotik"
      : containsAny(text, ["fortigate", "fortios", "config "]) ? "fortigate"
        : containsAny(text, ["cisco", "ios "]) ? "cisco"
          : containsAny(text, ["linux", "bash", "shell"]) ? "linux" : "unknown";
    return customAction({
      vendor,
      requestedOperation: message,
      critical: true,
      destructive: containsAny(text, ["reset", "remove all", "delete all", "erase", "factory"]),
      category: containsAny(text, ["reset", "factory"]) ? "system" : "other",
      expectedImpact: "The raw or vendor-specific operation could cause configuration loss, service disruption, or loss of connectivity. It is proposed for explicit review only and will not execute as a raw command."
    });
  }

  if (containsAny(text, ["linux", "\u0644\u06cc\u0646\u0648\u06a9\u0633"]) && containsAny(text, ["status", "check", "\u0648\u0636\u0639\u06cc\u062a", "\u0686\u06a9"])) {
    const serviceName = text.includes("nginx") ? "nginx" : text.match(/\b(?:apache2?|httpd|ssh|sshd|ufw|docker|postgresql|mysql|mariadb|redis)\b/)?.[0];
    return {
      intentType: AiIntentType.linux_check_service_status,
      riskLevel: AiRiskLevel.low,
      parameters: {
        serviceName,
        missingFields: serviceName ? [] : ["serviceName"],
        clarificationQuestions: serviceName ? [] : ["Which Linux service should be checked?"],
        ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {})
      },
      explanation: "Checks Linux service status through a controlled read-only systemctl template. Execute automatically validates and builds the command plan."
    };
  }

  if (fortigate && containsAny(text, ["factory reset", "factoryreset", "raw cli", "execute ", "config "])) {
    return customAction({ vendor: "fortigate", requestedOperation: message, category: "system", critical: true, destructive: text.includes("reset") });
  }

  if (fortigate && containsAny(text, ["vip", "443", "port 443"])) {
    const vipIps = Array.from(text.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)).map((match) => match[0]);
    const vipPorts = numbers(vipIps.reduce((value, address) => value.replace(address, " "), text));
    const externalIp = vipIps.length > 1 ? vipIps[0] : undefined;
    const mappedIp = vipIps.length > 1 ? vipIps[1] : vipIps[0];
    const externalPort = vipPorts[0] ?? 443;
    const mappedPort = vipPorts[1] ?? vipPorts[0] ?? 443;
    return {
      intentType: AiIntentType.fortigate_create_vip,
      riskLevel: AiRiskLevel.high,
      parameters: {
        name: mappedIp ? `vip_${mappedIp.replace(/\./g, "_")}_${externalPort}` : undefined,
        externalIp,
        mappedIp,
        externalPort,
        mappedPort,
        missingFields: uniqueStrings([...(mappedIp ? [] : ["mappedIp"])]),
        clarificationQuestions: mappedIp ? [] : ["Which destination/internal IP should receive TCP/443?"],
        ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {})
      },
      explanation: "Creates a structured FortiGate VIP intent. Execute automatically compiles the controlled plan, verifies backup safeguards, and records audit evidence."
    };
  }

  if (fortigate && containsAny(text, ["disable"]) && containsAny(text, ["policy", "rule"])) {
    const id = nums.find((num) => num > 0);
    return {
      intentType: AiIntentType.fortigate_disable_policy,
      riskLevel: AiRiskLevel.medium,
      parameters: {
        policyId: id ? String(id) : undefined,
        missingFields: id ? [] : ["policyId"],
        clarificationQuestions: id ? [] : ["Which FortiGate policy ID should be disabled?"],
        ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {})
      },
      explanation: "Disables only an explicitly selected managed FortiGate policy through a validated command plan."
    };
  }

  if (fortigate && containsAny(text, ["block", "deny"]) && ip) {
    const sourceObject = `src_${ip.replace(/\./g, "_")}`;
    return {
      intentType: AiIntentType.fortigate_create_deny_policy,
      riskLevel: AiRiskLevel.high,
      parameters: {
        sourceObject,
        srcaddr: [sourceObject],
        dstaddr: ["all"],
        services: ["ALL"],
        schedule: "always",
        disabled: true,
        missingFields: ["srcintf", "dstintf"],
        clarificationQuestions: ["Which source interface/zone should the deny policy use?", "Which destination interface/zone should the deny policy use?"],
        comment: "FortiGate deny policy proposed by AI. Create address object first if it does not exist.",
        ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {})
      },
      explanation: "Maps to a FortiGate deny policy plan. Interfaces are required from discovery and are not guessed."
    };
  }

  if (fortigate && containsAny(text, ["address object", "object"]) && ipv4OrCidr(text)) {
    const addressValue = ipv4OrCidr(text)!;
    return {
      intentType: AiIntentType.fortigate_create_address_object,
      riskLevel: AiRiskLevel.low,
      parameters: {
        name: `addr_${addressValue.replace(/[./]/g, "_")}`,
        ...(addressValue.includes("/") ? { sourceCidr: addressValue } : { sourceIp: addressValue }),
        comment: "FortiGate address object proposed by AI.",
        ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {})
      },
      explanation: "Creates a structured FortiGate address object through the controlled catalog."
    };
  }

  if (fortigate && containsAny(text, ["create firewall policy", "add firewall policy", "create policy", "add policy"])) {
    const interfaceMatch = text.match(/\bfrom\s+([a-z0-9_.:-]+)\s+to\s+([a-z0-9_.:-]+)\b/);
    const services = Array.from(text.matchAll(/\b(https|http|ssh|dns|all)\b/g)).map((match) => match[1].toUpperCase());
    const source = ipv4OrCidr(text);
    const srcintf = interfaceMatch?.[1];
    const dstintf = interfaceMatch?.[2];
    return {
      intentType: AiIntentType.fortigate_create_policy,
      riskLevel: AiRiskLevel.high,
      parameters: {
        name: "firewall-log-analyzer-policy", srcintf, dstintf,
        dstaddr: ["all"], services: services.length > 0 ? Array.from(new Set(services)) : ["ALL"], schedule: "always",
        ...(source?.includes("/") ? { sourceCidr: source } : source ? { sourceIp: source } : {}),
        action: containsAny(text, ["deny", "block"]) ? "deny" : "accept",
        nat: containsAny(text, [" nat", "internet", "outbound"]), logTraffic: true, disabled: true,
        missingFields: uniqueStrings([...(srcintf ? [] : ["srcInterface"]), ...(dstintf ? [] : ["dstInterface"])]),
        clarificationQuestions: [...(!srcintf ? ["Which source interface/zone should the policy use?"] : []), ...(!dstintf ? ["Which destination interface/zone should the policy use?"] : [])],
        ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {})
      },
      explanation: "Creates a disabled FortiGate firewall policy through the controlled catalog with automatic validation, audit, and rollback metadata."
    };
  }

  if (fortigate && (
    containsAny(text, ["egress", "outbound", "internet", "business", "office", "schedule"]) ||
    (containsAny(text, ["allow", "deny"]) && containsAny(text, ["internet", "outbound"]))
  )) {
    const sourceObject = ip ? `src_${ip.replace(/\./g, "_")}` : undefined;
    return {
      intentType: AiIntentType.fortigate_create_egress_policy,
      riskLevel: AiRiskLevel.high,
      parameters: {
        ...(sourceObject ? { sourceObject, srcaddr: [sourceObject] } : {}),
        dstaddr: ["all"],
        services: ["ALL"],
        schedule: containsAny(text, ["business", "office"]) ? "business_hours" : "always",
        nat: true,
        disabled: true,
        missingFields: ["srcintf", "dstintf", ...(sourceObject ? [] : ["source IP or source address object"])],
        clarificationQuestions: ["Which source interface/zone should the policy use?", "Which destination interface/zone should the policy use?", "Should services remain ALL or be narrowed?"],
        comment: "FortiGate egress policy proposed by AI. Created disabled until a separate enable action is approved.",
        ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {})
      },
      explanation: "Maps to a FortiGate egress policy intent. Missing interfaces/services must be confirmed from discovery; the AI will not guess silently."
    };
  }
  const mikrotik = containsAny(text, ["mikrotik", "routeros", "میکروتیک", "ميکروتيک"]);

  if (mikrotik && containsAny(text, ["ssh", "secure shell"]) && containsAny(text, ["change", "set", "move", "بکن", "کن", "عوض", "تغییر"])) {
    const trustedSource = ipv4OrCidr(text);
    const portCandidates = numbers(trustedSource ? text.replace(trustedSource, " ") : text);
    const newPort = portCandidates.length > 0 ? portCandidates[portCandidates.length - 1] : undefined;
    const missingFields = uniqueStrings([
      ...(newPort ? [] : ["newPort"])
    ]);
    return {
      intentType: AiIntentType.mikrotik_change_service_port,
      riskLevel: AiRiskLevel.high,
      parameters: {
        vendor: "mikrotik",
        service: "ssh",
        serviceName: "ssh",
        newPort,
        ...(trustedSource?.includes("/") ? { trustedSourceCidr: trustedSource } : trustedSource ? { trustedSourceIp: trustedSource } : {}),
        missingFields,
        clarificationQuestions: [
          ...(!newPort ? ["Which new MikroTik SSH port (1-65535) should be used?"] : [])
        ],
        targetDeviceHint: targetHint(text, nums) ?? "mikrotik"
      },
      explanation: "Proposes a controlled MikroTik SSH port change. Read-only preflight discovers the current port and allowed source when possible, then the backend creates the allow rule before changing and verifying the service port."
    };
  }

  if ((mikrotik || containsAny(text, ["address-list", "address list", "ai_blocklist"])) &&
      ip &&
      containsAny(text, ["update", "set", "timeout", "comment", "عوض", "بذار"])) {
    return {
      intentType: AiIntentType.mikrotik_update_address_list_entry,
      riskLevel: AiRiskLevel.medium,
      parameters: {
        address: ip,
        listName: text.match(/\b[a-zA-Z0-9_.:-]*blocklist[a-zA-Z0-9_.:-]*\b/)?.[0] ?? "ai_blocklist",
        timeout: explicitTimeout(text) ?? durationTimeoutFromText(text, nums) ?? "10m",
        comment: commentFromText(text) ?? "created-by-firewall-log-analyzer",
        ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : { targetDeviceHint: "mikrotik" })
      },
      explanation: "Updates an existing MikroTik address-list entry timeout/comment through the controlled catalog only."
    };
  }

  if (mikrotik && containsAny(text, ["reset-configuration", "show-sensitive", "/user", "/certificate"])) {
    return customAction({
      vendor: "mikrotik",
      requestedOperation: message,
      category: text.includes("reset") ? "system" : text.includes("/user") ? "user_management" : "other",
      critical: true,
      destructive: text.includes("reset"),
      expectedImpact: text.includes("reset")
        ? "Resetting the MikroTik may erase configuration and immediately interrupt management and network connectivity."
        : "This sensitive MikroTik operation can affect access, identity, or device security and requires explicit review."
    });
  }

  if (mikrotik && containsAny(text, ["reboot", "/system reboot", "restart", "schedule reboot"])) {
    return {
      intentType: containsAny(text, ["schedule", "scheduled"]) ? AiIntentType.mikrotik_schedule_reboot : AiIntentType.mikrotik_reboot,
      riskLevel: AiRiskLevel.critical,
      parameters: { ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {}) },
      explanation: "MikroTik reboot is a critical action and remains subject to PolicyGuard, backup/export safeguards, controlled execution, and audit logging."
    };
  }

  if (mikrotik && containsAny(text, ["summary", "خلاصه", "firewall rules", "قوانین فایروال"])) {
    return {
      intentType: AiIntentType.mikrotik_read_firewall_summary,
      riskLevel: AiRiskLevel.low,
      parameters: { ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {}) },
      explanation: "Read-only MikroTik firewall summary request. No write command is needed."
    };
  }

  if (mikrotik && containsAny(text, ["allow", "accept", "deny", "drop"]) && containsAny(text, ["tcp", "udp"])) {
    const source = ipv4OrCidr(text);
    const dstPort = numbers(source ? text.replace(source, " ") : text).find((value) => value >= 1 && value <= 65535);
    return {
      intentType: AiIntentType.mikrotik_create_filter_rule,
      riskLevel: AiRiskLevel.medium,
      parameters: {
        chain: "forward",
        action: containsAny(text, ["allow", "accept"]) ? "accept" : "drop",
        protocol: text.includes("udp") ? "udp" : "tcp",
        dstPort,
        port: dstPort,
        ...(source?.includes("/") ? { sourceCidr: source } : source ? { sourceIp: source } : {}),
        disabled: true,
        comment: "managed filter rule",
        missingFields: uniqueStrings([...(dstPort ? [] : ["port"]), ...(source ? [] : ["sourceIp"])]),
        clarificationQuestions: [...(!dstPort ? ["Which destination port should the rule match?"] : []), ...(!source ? ["Which source IPv4 address or CIDR should the rule match?"] : [])],
        targetDeviceHint: targetHint(text, nums) ?? "mikrotik"
      },
      explanation: "Creates a disabled MikroTik firewall rule from validated source, protocol, and port fields using a controlled command plan."
    };
  }

  if (mikrotik && containsAny(text, ["add firewall rule", "create firewall rule", "add filter rule", "create filter rule"])) {
    const dstPort = nums.find((value) => value >= 1 && value <= 65535);
    return {
      intentType: AiIntentType.mikrotik_create_filter_rule,
      riskLevel: containsAny(text, ["input"]) ? AiRiskLevel.high : AiRiskLevel.medium,
      parameters: {
        chain: containsAny(text, ["input"]) ? "input" : "forward",
        action: containsAny(text, ["allow", "accept"]) ? "accept" : "drop",
        protocol: containsAny(text, ["udp"]) ? "udp" : "tcp",
        dstPort,
        disabled: true,
        comment: "managed filter rule",
        missingFields: dstPort ? [] : ["port"],
        clarificationQuestions: dstPort ? [] : ["Which destination port should the firewall rule match?"],
        targetDeviceHint: targetHint(text, nums) ?? "mikrotik"
      },
      explanation: "Creates a disabled, managed MikroTik filter rule through the controlled catalog."
    };
  }

  if (mikrotik && containsAny(text, ["drop rule", "managed drop", "رول drop", "رول دراپ"])) {
    return {
      intentType: AiIntentType.mikrotik_create_managed_drop_rule,
      riskLevel: containsAny(text, ["input"]) ? AiRiskLevel.high : AiRiskLevel.medium,
      parameters: {
        chain: containsAny(text, ["input"]) ? "input" : containsAny(text, ["forward"]) ? "forward" : undefined,
        listName: text.match(/\b[a-zA-Z0-9_.:-]*blocklist[a-zA-Z0-9_.:-]*\b/)?.[0] ?? "ai_blocklist",
        ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {})
      },
      explanation: "Creates a disabled firewall-log-analyzer managed drop rule after automatic PolicyGuard validation."
    };
  }

  if (mikrotik && containsAny(text, ["enable", "فعال"])) {
    return {
      intentType: AiIntentType.mikrotik_enable_managed_rule,
      riskLevel: AiRiskLevel.high,
      parameters: { comment: "firewall-log-analyzer managed drop", ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {}) },
      explanation: "Enables only a firewall-log-analyzer managed MikroTik rule through a controlled plan."
    };
  }

  if (mikrotik && containsAny(text, ["disable", "غیرفعال"])) {
    return {
      intentType: AiIntentType.mikrotik_disable_managed_rule,
      riskLevel: AiRiskLevel.medium,
      parameters: { comment: "firewall-log-analyzer managed drop", ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {}) },
      explanation: "Disables only a firewall-log-analyzer managed MikroTik rule through a controlled plan."
    };
  }

  if (mikrotik && containsAny(text, ["remove", "delete", "حذف"]) && ip) {
    return {
      intentType: AiIntentType.mikrotik_remove_address_list_entry,
      riskLevel: AiRiskLevel.medium,
      parameters: {
        address: ip,
        listName: text.match(/\b[a-zA-Z0-9_.:-]*blocklist[a-zA-Z0-9_.:-]*\b/)?.[0] ?? "ai_blocklist",
        ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {})
      },
      explanation: "Removes only an exact managed MikroTik address-list entry. It never removes a whole list."
    };
  }

  if (mikrotik && containsAny(text, ["address-list", "address list", "لیست"]) && ip) {
    return {
      intentType: containsAny(text, ["block", "بلاک", "مسدود"]) ? AiIntentType.mikrotik_block_ip_temporary : AiIntentType.mikrotik_add_address_list_entry,
      riskLevel: AiRiskLevel.medium,
      parameters: {
        address: ip,
        listName: text.match(/\b[a-zA-Z0-9_.:-]*blocklist[a-zA-Z0-9_.:-]*\b/)?.[0] ?? "ai_blocklist",
        timeout: durationTimeoutFromText(text, nums),
        ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {})
      },
      explanation: "Adds an IP to a MikroTik address-list through the controlled catalog only."
    };
  }

  if (mikrotik && containsAny(text, ["block", "بلاک", "مسدود"]) && ip) {
    return {
      intentType: AiIntentType.mikrotik_block_ip_temporary,
      riskLevel: AiRiskLevel.medium,
      parameters: {
        address: ip,
        listName: "ai_blocklist",
        timeout: durationTimeoutFromText(text, nums) ?? "10m",
        ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {})
      },
      explanation: "Adds the IP to the MikroTik ai_blocklist with a timeout. A firewall rule using that list is required for actual blocking."
    };
  }

  if (
    containsAny(text, ["egress", "outbound", "internet", "business", "office", "schedule", "خروج", "اینترنت", "اداری", "اجازه"]) ||
    (containsAny(text, ["allow", "deny"]) && containsAny(text, ["internet", "outbound"]))
  ) {
    return {
      intentType: AiIntentType.create_egress_policy,
      riskLevel: AiRiskLevel.high,
      parameters: {
        ...(ip ? { sourceIp: ip } : {}),
        destination: "internet",
        scheduleName: containsAny(text, ["business", "office", "اداری"]) ? "business_hours" : undefined,
        action: containsAny(text, ["deny"]) ? "deny" : "allow",
        nat: true,
        log: true,
        comment: "Proposed egress policy from AI intent. Requires device, interfaces, services, controlled planning, and audit before execution."
      },
      explanation: "Creating an egress policy can alter outbound access. PolicyGuard and vendor planners validate device, interfaces, services, schedule, and rollback before execution."
    };
  }

  if ((text.includes("ssh") || text.includes("پورت 22") || text.includes("پورت ۲۲") || nums.includes(22)) &&
      (text.includes("عوض") || text.includes("change") || text.includes("روی") || text.includes("to port")) &&
      nums.length >= 2) {
    return {
      intentType: AiIntentType.change_ssh_port,
      riskLevel: AiRiskLevel.high,
      parameters: { fromPort: nums[0], toPort: nums[1] },
      explanation: "Changing the SSH management port can break administrator access. Execute requires automatic validation and rollback metadata."
    };
  }

  if ((text.includes("ببند") || text.includes("close") || text.includes("block port")) && nums.length >= 1) {
    return {
      intentType: AiIntentType.close_port,
      riskLevel: nums[0] === 22 || nums[0] === 3389 || nums[0] === 8080 ? AiRiskLevel.high : AiRiskLevel.medium,
      parameters: { port: nums[0], protocol: "tcp", ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {}) },
      explanation: "Closing a port may interrupt services. The controlled ActionPlan validates the device, affected rules, and rollback."
    };
  }

  if ((text.includes("باز کن") || text.includes("open port") || text.includes("open")) && nums.length >= 1) {
    return {
      intentType: AiIntentType.open_port,
      riskLevel: AiRiskLevel.high,
      parameters: { port: nums[0], protocol: "tcp", ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {}) },
      explanation: "Opening a port can expose services. The controlled ActionPlan validates the target device and rollback."
    };
  }

  if ((text.includes("\u0628\u0644\u0627\u06a9") || text.includes("\u0645\u0633\u062f\u0648\u062f")) && (ip || text.includes("\u0622\u06cc \u067e\u06cc") || text.includes("\u0627\u06cc \u067e\u06cc"))) {
    const duration = durationMinutesFromText(text, nums) ?? nums.find((n) => n > 0 && n <= 10080) ?? 30;
    return {
      intentType: AiIntentType.block_source_ip_temporary,
      riskLevel: AiRiskLevel.medium,
      parameters: { ...(ip ? { srcIp: ip } : {}), durationMinutes: duration },
      explanation: "Temporarily blocking a source IP requires target device selection, validation, audit logging, and expiry/rollback metadata."
    };
  }

  if ((text.includes("block") || text.includes("بلاک") || text.includes("مسدود")) && (ip || text.includes("ip"))) {
    const duration = durationMinutesFromText(text, nums) ?? nums.find((n) => n > 0 && n <= 10080) ?? 30;
    return {
      intentType: AiIntentType.block_source_ip_temporary,
      riskLevel: AiRiskLevel.medium,
      parameters: { ...(ip ? { srcIp: ip } : {}), durationMinutes: duration },
      explanation: "Temporarily blocking a source IP requires target device selection, validation, audit logging, and expiry/rollback metadata."
    };
  }

  if (text.includes("unblock") || text.includes("رفع بلاک")) {
    return {
      intentType: AiIntentType.unblock_source_ip,
      riskLevel: AiRiskLevel.medium,
      parameters: { ...(ip ? { srcIp: ip } : {}) },
      explanation: "Unblocking a source IP can re-enable traffic and is always recorded in the ActionPlan audit trail."
    };
  }

  if (text.includes("خلاصه") || text.includes("summary") || text.includes("وضعیت") || text.includes("status")) {
    return {
      intentType: AiIntentType.explain_security_status,
      riskLevel: AiRiskLevel.low,
      parameters: {},
      explanation: "This is an explanatory request only. No device action is required."
    };
  }

  const vendor = containsAny(text, ["cisco", "ios xe", "nx-os"]) ? "cisco"
    : containsAny(text, ["pfsense", "pf sense"]) ? "pfsense"
      : containsAny(text, ["fortigate", "fortinet", "fortios"]) ? "fortigate"
        : containsAny(text, ["mikrotik", "routeros"]) ? "mikrotik"
          : containsAny(text, ["linux", "ubuntu", "debian", "centos"]) ? "linux" : "unknown";
  const operational = containsAny(text, [
    "add", "create", "set", "change", "remove", "delete", "disable", "enable", "reset",
    "block", "allow", "deny", "configure", "apply", "restore", "backup",
    "\u0627\u0636\u0627\u0641\u0647", "\u0628\u0633\u0627\u0632", "\u062a\u063a\u06cc\u06cc\u0631", "\u062d\u0630\u0641", "\u0641\u0639\u0627\u0644", "\u063a\u06cc\u0631\u0641\u0639\u0627\u0644"
  ]);
  if (!operational) return null;
  const destructive = containsAny(text, ["reset", "factory", "remove all", "delete all", "erase"]);
  const category = containsAny(text, ["acl", "firewall", "policy", "rule"]) ? "firewall"
    : text.includes("nat") ? "nat"
      : text.includes("vpn") ? "vpn"
        : containsAny(text, ["ssh", "service", "port"]) ? "service_management"
          : destructive ? "system" : "other";
  return customAction({ vendor, requestedOperation: message, category, critical: destructive, destructive });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function createAiActionIntent(input: {
  sessionId: string;
  messageId?: string;
  deviceId?: string;
  parsedIntent: ParsedIntent;
}) {
  const canonical = normalizeIntent({ ...input.parsedIntent.parameters, actionType: input.parsedIntent.intentType });
  const vendor = normalizeVendor(canonical.vendor) ?? normalizeVendor(input.parsedIntent.parameters.targetDeviceHint) ?? (input.parsedIntent.intentType.startsWith("mikrotik_") ? "mikrotik" : input.parsedIntent.intentType.startsWith("fortigate_") ? "fortigate" : null);
  const intentType = normalizeIntentType(input.parsedIntent.intentType, vendor) ?? AiIntentType.unknown;
  const parameterDeviceId = typeof input.parsedIntent.parameters.deviceId === "string" ? input.parsedIntent.parameters.deviceId.trim() : undefined;
  const intentParameters = { ...input.parsedIntent.parameters, ...canonical };
  delete intentParameters.actionType;
  delete intentParameters.deviceId;
  delete intentParameters.targetDeviceId;
  const parameters = intentType === AiIntentType.mikrotik_change_service_port
    ? {
        ...intentParameters,
        vendor: "mikrotik",
        service: "ssh",
        serviceName: "ssh"
      }
    : intentParameters;
  const deviceId = input.deviceId ?? parameterDeviceId ?? await resolveDeviceHint(parameters, intentType);
  const persistedParameters: Record<string, unknown> = { ...parameters };
  if (deviceId) delete persistedParameters.targetDeviceHint;
  return prisma.aiActionIntent.create({
    data: {
      sessionId: input.sessionId,
      messageId: input.messageId,
      deviceId,
      intentType,
      status: AiActionIntentStatus.proposed,
      riskLevel: input.parsedIntent.riskLevel,
      parametersJson: toJson(persistedParameters),
      explanation: input.parsedIntent.explanation
    }
  });
}

async function resolveDeviceHint(parameters: Record<string, unknown>, intentType: AiIntentType) {
  const devices = await prisma.device.findMany({
    select: { id: true, name: true, vendor: true, host: true, type: true }
  });
  const vendor = normalizeVendor(parameters.vendor) ?? normalizeVendor(parameters.targetDeviceHint) ?? (intentType.startsWith("mikrotik_") ? "mikrotik" : null);
  return resolveDeviceIdFromCandidates(devices, {
    deviceId: parameters.deviceId,
    vendor,
    deviceHint: parameters.targetDeviceHint
  });
}

export async function listAiActionIntents() {
  return prisma.aiActionIntent.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      device: { select: { id: true, name: true, type: true } },
      session: { select: { id: true, title: true } }
    }
  });
}

export async function getAiActionIntent(id: string) {
  return prisma.aiActionIntent.findUnique({
    where: { id },
    include: {
      device: { select: { id: true, name: true, type: true } },
      session: { select: { id: true, title: true } },
      message: { select: { id: true, role: true, content: true } }
    }
  });
}

export async function updateAiActionIntent(id: string, input: Record<string, unknown>): Promise<AiActionIntent> {
  const data: Prisma.AiActionIntentUpdateInput = {};
  if (typeof input.status === "string" && input.status in AiActionIntentStatus) {
    data.status = input.status as AiActionIntentStatus;
  }
  if (input.parametersJson !== undefined) {
    data.parametersJson = toJson(input.parametersJson);
  }
  if (typeof input.explanation === "string") {
    data.explanation = input.explanation;
  }

  return prisma.aiActionIntent.update({
    where: { id },
    data
  });
}

function normalizeCompletionFields(fields: Record<string, unknown>) {
  const next = { ...fields };
  if (next.address === undefined) {
    const address = next.srcIP ?? next.srcIp ?? next.sourceIp ?? next.sourceIP ?? next.ip;
    if (typeof address === "string" && address.trim()) next.address = address.trim();
  }
  if (next.durationMinutes !== undefined && next.timeout === undefined) {
    const minutes = Number(next.durationMinutes);
    if (Number.isFinite(minutes) && minutes > 0) next.timeout = minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
  }
  if (next.duration !== undefined && next.timeout === undefined) {
    const duration = String(next.duration).trim().toLowerCase();
    const amount = duration.includes("\u06cc\u06a9") || duration.includes("\u064a\u06a9")
      ? 1
      : duration.includes("\u0646\u06cc\u0645 \u0633\u0627\u0639\u062a") || duration.includes("\u0646\u064a\u0645 \u0633\u0627\u0639\u062a")
        ? 0.5
        : Number(duration.match(/\d+/)?.[0]);
    if (Number.isFinite(amount) && amount > 0) {
      if (duration.includes("hour") || duration.includes("\u0633\u0627\u0639\u062a")) next.timeout = amount === 0.5 ? "30m" : `${amount}h`;
      else next.timeout = `${amount}m`;
    }
  }
  return next;
}

function remainingMissingFields(parameters: Record<string, unknown>, fields: Record<string, unknown>) {
  const missing = Array.isArray(parameters.missingFields) ? parameters.missingFields.map(String) : [];
  const provided = new Set(Object.entries(fields).filter(([, value]) => String(value ?? "").trim()).map(([key]) => key));
  return missing.filter((field) => {
    if (field === "deviceId") return !provided.has("deviceId");
    if (field === "durationMinutes") return !provided.has("durationMinutes") && !provided.has("timeout");
    return !provided.has(field);
  });
}

export async function completeAiActionRequest(id: string, input: { fields?: Record<string, unknown> }) {
  const intent = await prisma.aiActionIntent.findUnique({ where: { id }, include: { device: { select: { id: true, name: true, type: true, host: true } } } });
  if (!intent) throw new Error("AiActionIntent not found");

  const fields = normalizeCompletionFields(input.fields && typeof input.fields === "object" ? input.fields : {});
  const deviceId = typeof fields.deviceId === "string" && fields.deviceId.trim() ? fields.deviceId.trim() : intent.deviceId;
  const currentParameters = asRecord(intent.parametersJson);
  const nextParameters = {
    ...currentParameters,
    ...Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "deviceId"))
  };
  delete nextParameters.deviceId;
  delete nextParameters.targetDeviceId;
  if (deviceId) delete nextParameters.targetDeviceHint;
  const missingFields = remainingMissingFields(currentParameters, fields);
  if (missingFields.length > 0) nextParameters.missingFields = missingFields;
  else delete nextParameters.missingFields;

  const updatedIntent = await prisma.aiActionIntent.update({
    where: { id },
    data: {
      deviceId,
      parametersJson: toJson(nextParameters),
      status: intent.status === AiActionIntentStatus.discarded ? AiActionIntentStatus.discarded : AiActionIntentStatus.proposed
    },
    include: { device: { select: { id: true, name: true, type: true, host: true } } }
  });

  const canCreateActionPlan = updatedIntent.status === AiActionIntentStatus.proposed &&
    updatedIntent.intentType !== AiIntentType.unknown &&
    (Boolean(updatedIntent.deviceId) || updatedIntent.intentType === AiIntentType.custom_vendor_action || updatedIntent.intentType === AiIntentType.generic_security_action) &&
    missingFields.length === 0;

  if (!canCreateActionPlan) {
    return {
      canCreateActionPlan: false,
      actionPlanId: null,
      status: updatedIntent.status,
      missingFields: [
        ...missingFields,
        ...(!updatedIntent.deviceId && updatedIntent.intentType !== AiIntentType.custom_vendor_action && updatedIntent.intentType !== AiIntentType.generic_security_action ? ["deviceId"] : [])
      ],
      blockedReason: updatedIntent.status === AiActionIntentStatus.discarded || updatedIntent.intentType === AiIntentType.unknown
        ? "not_supported_yet"
        : "missing_fields",
      intent: updatedIntent
    };
  }

  const plan = await proposeActionPlan({ aiIntentId: updatedIntent.id });
  await prisma.aiActionIntent.update({
    where: { id },
    data: { status: AiActionIntentStatus.converted_to_action_plan }
  });

  return {
    canCreateActionPlan: true,
    actionPlanId: plan.id,
    status: plan.status,
    missingFields: [],
    blockedReason: null,
    intent: updatedIntent,
    actionPlan: plan
  };
}
