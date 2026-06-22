import {
  AiActionIntentStatus,
  AiIntentType,
  AiRiskLevel,
  type AiActionIntent,
  type Prisma
} from "@prisma/client";
import { prisma } from "../db/prisma.js";

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

function containsAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function targetHint(text: string, nums: number[]) {
  if (text.includes("ubuntu lab")) return "ubuntu lab";
  if (text.includes("ubuntu")) return "ubuntu";
  const port = nums.find((num) => num >= 1 && num <= 65535);
  const extra = nums.find((num) => num !== port);
  return extra ? String(extra) : undefined;
}

export function parseAiIntent(message: string): ParsedIntent | null {
  const text = normalizeText(message);
  const nums = numbers(text);
  const ip = ipAddress(text);

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
        comment: "Proposed egress policy from AI intent. Requires device, interfaces, services, dry-run, approval, and audit before execution."
      },
      explanation: "Creating an egress policy can alter outbound access. Backend PolicyGuard and vendor planners must validate device, interfaces, services, schedule, dry-run, approval, and rollback before any future execution."
    };
  }

  if ((text.includes("ssh") || text.includes("پورت 22") || text.includes("پورت ۲۲") || nums.includes(22)) &&
      (text.includes("عوض") || text.includes("change") || text.includes("روی") || text.includes("to port")) &&
      nums.length >= 2) {
    return {
      intentType: AiIntentType.change_ssh_port,
      riskLevel: AiRiskLevel.high,
      parameters: { fromPort: nums[0], toPort: nums[1] },
      explanation: "Changing the SSH management port can break administrator access. It requires validation, dry-run, manual approval, and rollback metadata before any future execution."
    };
  }

  if ((text.includes("ببند") || text.includes("close") || text.includes("block port")) && nums.length >= 1) {
    return {
      intentType: AiIntentType.close_port,
      riskLevel: nums[0] === 22 || nums[0] === 3389 || nums[0] === 8080 ? AiRiskLevel.high : AiRiskLevel.medium,
      parameters: { port: nums[0], protocol: "tcp", ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {}) },
      explanation: "Closing a port may interrupt services. A future action plan must validate target device, affected rules, dry-run result, approval, and rollback."
    };
  }

  if ((text.includes("باز کن") || text.includes("open port") || text.includes("open")) && nums.length >= 1) {
    return {
      intentType: AiIntentType.open_port,
      riskLevel: AiRiskLevel.high,
      parameters: { port: nums[0], protocol: "tcp", ...(targetHint(text, nums) ? { targetDeviceHint: targetHint(text, nums) } : {}) },
      explanation: "Opening a port can expose services. A future action plan must validate business need, target device, dry-run, approval, and rollback."
    };
  }

  if ((text.includes("block") || text.includes("بلاک") || text.includes("مسدود")) && (ip || text.includes("ip"))) {
    const duration = nums.find((n) => n > 0 && n <= 10080) ?? 30;
    return {
      intentType: AiIntentType.block_source_ip_temporary,
      riskLevel: AiRiskLevel.medium,
      parameters: { ...(ip ? { srcIp: ip } : {}), durationMinutes: duration },
      explanation: "Temporarily blocking a source IP requires target device selection, validation, dry-run, approval, audit logging, and expiry/rollback metadata."
    };
  }

  if (text.includes("unblock") || text.includes("رفع بلاک")) {
    return {
      intentType: AiIntentType.unblock_source_ip,
      riskLevel: AiRiskLevel.medium,
      parameters: { ...(ip ? { srcIp: ip } : {}) },
      explanation: "Unblocking a source IP can re-enable traffic. It requires approval and audit logging in a future action plan."
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

  return null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

export async function createAiActionIntent(input: {
  sessionId: string;
  messageId?: string;
  deviceId?: string;
  parsedIntent: ParsedIntent;
}) {
  const deviceId = input.deviceId ?? await resolveDeviceHint(input.parsedIntent.parameters);
  return prisma.aiActionIntent.create({
    data: {
      sessionId: input.sessionId,
      messageId: input.messageId,
      deviceId,
      intentType: input.parsedIntent.intentType,
      status: AiActionIntentStatus.proposed,
      riskLevel: input.parsedIntent.riskLevel,
      parametersJson: toJson(input.parsedIntent.parameters),
      explanation: input.parsedIntent.explanation
    }
  });
}

async function resolveDeviceHint(parameters: Record<string, unknown>) {
  const hint = typeof parameters.targetDeviceHint === "string" ? parameters.targetDeviceHint.trim().toLowerCase() : "";
  if (!hint) return undefined;

  const devices = await prisma.device.findMany({
    select: { id: true, name: true, vendor: true, host: true }
  });
  const matched = devices.find((device) => {
    const values = [device.name, device.vendor, device.host].map((value) => value.toLowerCase());
    return values.some((value) => value.includes(hint) || hint.includes(value));
  });
  return matched?.id;
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
