import net from "node:net";
import {
  DeviceEnvironment,
  DeviceProtocol,
  DeviceStatus,
  DeviceType,
  type Prisma
} from "@prisma/client";
import { prisma } from "../db/prisma.js";

const DEVICE_TYPES = new Set<string>(Object.values(DeviceType));
const DEVICE_PROTOCOLS = new Set<string>(Object.values(DeviceProtocol));
const DEVICE_ENVIRONMENTS = new Set<string>(Object.values(DeviceEnvironment));
const DEVICE_STATUSES = new Set<string>(Object.values(DeviceStatus));

const SENSITIVE_INPUT_KEYS = new Set([
  "password",
  "passphrase",
  "privateKey",
  "private_key",
  "token",
  "apiKey",
  "api_key",
  "secret"
]);

type DeviceInput = {
  name?: unknown;
  vendor?: unknown;
  type?: unknown;
  host?: unknown;
  managementPort?: unknown;
  protocol?: unknown;
  environment?: unknown;
  tags?: unknown;
  status?: unknown;
  capabilities?: unknown;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function assertNoPlaintextSecrets(input: Record<string, unknown>) {
  for (const key of Object.keys(input)) {
    if (SENSITIVE_INPUT_KEYS.has(key)) {
      throw new Error(
        "Plaintext credentials are not accepted. Store only a credential reference; encryption/vault integration is a future TODO."
      );
    }
  }
}

function asNonEmptyString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function asEnum<T extends string>(value: unknown, allowed: Set<string>, field: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!allowed.has(normalized)) {
    throw new Error(`${field} is invalid`);
  }
  return normalized as T;
}

function asPort(value: unknown) {
  const port = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("managementPort must be between 1 and 65535");
  }
  return port;
}

function asTags(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("tags must be an array");
  return value.map((tag) => asNonEmptyString(tag, "tag")).slice(0, 25);
}

function asCapabilities(value: unknown) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("capabilities must be a JSON object");
  }
  return value;
}

function normalizeCreateInput(input: DeviceInput) {
  const type = asEnum<DeviceType>(input.type, DEVICE_TYPES, "type");
  return {
    name: asNonEmptyString(input.name, "name"),
    vendor: typeof input.vendor === "string" && input.vendor.trim() !== "" ? input.vendor.trim() : type,
    type,
    host: asNonEmptyString(input.host, "host"),
    managementPort: asPort(input.managementPort),
    protocol: asEnum<DeviceProtocol>(input.protocol, DEVICE_PROTOCOLS, "protocol"),
    environment:
      input.environment === undefined
        ? DeviceEnvironment.lab
        : asEnum<DeviceEnvironment>(input.environment, DEVICE_ENVIRONMENTS, "environment"),
    tags: asTags(input.tags),
    status:
      input.status === undefined ? DeviceStatus.unknown : asEnum<DeviceStatus>(input.status, DEVICE_STATUSES, "status"),
    capabilities: toJson(asCapabilities(input.capabilities))
  };
}

function normalizePatchInput(input: DeviceInput) {
  const data: Prisma.DeviceUpdateInput = {};

  if (input.name !== undefined) data.name = asNonEmptyString(input.name, "name");
  if (input.vendor !== undefined) data.vendor = asNonEmptyString(input.vendor, "vendor");
  if (input.type !== undefined) data.type = asEnum<DeviceType>(input.type, DEVICE_TYPES, "type");
  if (input.host !== undefined) data.host = asNonEmptyString(input.host, "host");
  if (input.managementPort !== undefined) data.managementPort = asPort(input.managementPort);
  if (input.protocol !== undefined) data.protocol = asEnum<DeviceProtocol>(input.protocol, DEVICE_PROTOCOLS, "protocol");
  if (input.environment !== undefined) {
    data.environment = asEnum<DeviceEnvironment>(input.environment, DEVICE_ENVIRONMENTS, "environment");
  }
  if (input.tags !== undefined) data.tags = asTags(input.tags);
  if (input.status !== undefined) data.status = asEnum<DeviceStatus>(input.status, DEVICE_STATUSES, "status");
  if (input.capabilities !== undefined) data.capabilities = toJson(asCapabilities(input.capabilities));

  return data;
}

function toDeviceResponse(device: NonNullable<Awaited<ReturnType<typeof getDeviceById>>>) {
  return {
    id: device.id,
    name: device.name,
    vendor: device.vendor,
    type: device.type,
    host: device.host,
    managementPort: device.managementPort,
    protocol: device.protocol,
    environment: device.environment,
    tags: device.tags,
    status: device.status,
    capabilities: device.capabilities ?? {},
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
    statusChecks: device.statusChecks
  };
}

async function writeAudit(input: {
  deviceId?: string;
  action: string;
  targetId?: string;
  metadata?: unknown;
  dryRun?: boolean;
}) {
  return prisma.auditLog.create({
    data: {
      deviceId: input.deviceId,
      action: input.action,
      targetType: "device",
      targetId: input.targetId ?? input.deviceId,
      dryRun: input.dryRun ?? true,
      approvalStatus: "not_required",
      metadata: toJson({
        ...(typeof input.metadata === "object" && input.metadata !== null ? input.metadata : {}),
        safety:
          "Future device actions must be audited, support dry-run, and require manual approval for dangerous changes."
      })
    }
  });
}

export async function listDevices() {
  const devices = await prisma.device.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      statusChecks: {
        orderBy: { checkedAt: "desc" },
        take: 1
      }
    }
  });
  return devices.map(toDeviceResponse);
}

export async function getDeviceById(id: string) {
  return prisma.device.findUnique({
    where: { id },
    include: {
      statusChecks: {
        orderBy: { checkedAt: "desc" },
        take: 5
      }
    }
  });
}

export async function createDevice(rawInput: Record<string, unknown>) {
  assertNoPlaintextSecrets(rawInput);
  const input = normalizeCreateInput(rawInput);

  const device = await prisma.device.create({
    data: {
      ...input,
      deviceCapabilities: {
        create: [
          {
            name: "log_ingest",
            category: "telemetry",
            enabled: true,
            dryRunSupported: true,
            manualApprovalRequired: false,
            metadata: toJson({ description: "Receive or import logs from this device." })
          },
          {
            name: "controlled_change",
            category: "future_action",
            enabled: false,
            dryRunSupported: true,
            manualApprovalRequired: true,
            metadata: toJson({
              description: "Placeholder for future approved firewall changes. No commands are executed in this task."
            })
          }
        ]
      }
    },
    include: {
      statusChecks: {
        orderBy: { checkedAt: "desc" },
        take: 5
      }
    }
  });

  await writeAudit({
    deviceId: device.id,
    action: "device.created",
    dryRun: true,
    metadata: { name: device.name, host: device.host, protocol: device.protocol }
  });

  return toDeviceResponse(device);
}

export async function updateDevice(id: string, rawInput: Record<string, unknown>) {
  assertNoPlaintextSecrets(rawInput);
  const input = normalizePatchInput(rawInput);

  const device = await prisma.device.update({
    where: { id },
    data: input,
    include: {
      statusChecks: {
        orderBy: { checkedAt: "desc" },
        take: 5
      }
    }
  });

  await writeAudit({
    deviceId: device.id,
    action: "device.updated",
    dryRun: true,
    metadata: { fields: Object.keys(rawInput) }
  });

  return toDeviceResponse(device);
}

export async function deleteDevice(id: string) {
  const device = await prisma.device.delete({
    where: { id }
  });

  await writeAudit({
    action: "device.deleted",
    targetId: id,
    dryRun: true,
    metadata: { name: device.name, host: device.host }
  });
}

function tcpCheck(host: string, port: number, timeoutMs = 2500) {
  const started = Date.now();

  return new Promise<{ status: DeviceStatus; message: string; latencyMs: number }>((resolve) => {
    const socket = net.createConnection({ host, port });

    const finish = (status: DeviceStatus, message: string) => {
      const latencyMs = Date.now() - started;
      socket.removeAllListeners();
      socket.destroy();
      resolve({ status, message, latencyMs });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(DeviceStatus.online, "TCP connection succeeded."));
    socket.once("timeout", () => finish(DeviceStatus.offline, "TCP connection timed out."));
    socket.once("error", (error) => finish(DeviceStatus.error, error.message));
  });
}

export async function testDeviceConnection(id: string) {
  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) return null;

  const result = await tcpCheck(device.host, device.managementPort);

  const statusCheck = await prisma.deviceStatusCheck.create({
    data: {
      deviceId: device.id,
      status: result.status,
      message: result.message,
      latencyMs: result.latencyMs
    }
  });

  await prisma.device.update({
    where: { id },
    data: { status: result.status }
  });

  await writeAudit({
    deviceId: device.id,
    action: "device.test_connection",
    dryRun: true,
    metadata: {
      protocol: device.protocol,
      host: device.host,
      port: device.managementPort,
      status: result.status,
      message: result.message
    }
  });

  return {
    deviceId: device.id,
    status: result.status,
    message: result.message,
    latencyMs: result.latencyMs,
    checkedAt: statusCheck.checkedAt
  };
}

// TODO: Add encrypted credential storage through a KMS/vault-backed secret provider.
// TODO: Route every future firewall-changing action through AuditLog with dry-run and manual approval gates.
