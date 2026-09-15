import { DeviceCredentialType, Prisma, type DeviceCredential } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { decryptSecret, encryptSecret } from "./credential-crypto.service.js";
import { credentialUsageCount } from "./credential-usage.js";

export type ResolvedDeviceCredential = {
  name?: string;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  sudo: boolean;
};

const CREDENTIAL_TYPES = new Set<string>(Object.values(DeviceCredentialType));

export class DuplicateCredentialNameError extends Error {
  readonly code = "CREDENTIAL_NAME_CONFLICT";

  constructor() {
    super("A credential with this name already exists.");
    this.name = "DuplicateCredentialNameError";
  }
}

export class CredentialInUseError extends Error {
  readonly code = "CREDENTIAL_IN_USE";

  constructor(readonly deviceCount: number) {
    super("Credential is assigned to one or more devices.");
    this.name = "CredentialInUseError";
  }
}

function mapCredentialWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
    if (target.length === 0 || target.some((field) => field.toLowerCase().includes("name"))) {
      throw new DuplicateCredentialNameError();
    }
  }
  throw error;
}

function text(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeCredential(credential: DeviceCredential, deviceCount = 0) {
  return {
    id: credential.id,
    name: credential.name,
    type: credential.type,
    username: credential.username,
    sudo: credential.sudo,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
    deviceCount
  };
}

function typeValue(value: unknown) {
  const type = typeof value === "string" ? value.trim() : "";
  if (!CREDENTIAL_TYPES.has(type)) throw new Error("type must be password or private_key");
  return type as DeviceCredentialType;
}

function createData(input: Record<string, unknown>): Prisma.DeviceCredentialCreateInput {
  const type = typeValue(input.type);
  const username = text(input.username, "username");
  const name = text(input.name, "name");
  const password = optionalText(input.password);
  const privateKey = optionalText(input.privateKey);
  const passphrase = optionalText(input.passphrase);

  if (type === DeviceCredentialType.password && !password) {
    throw new Error("password is required for password credentials");
  }
  if (type === DeviceCredentialType.private_key && !privateKey) {
    throw new Error("privateKey is required for private_key credentials");
  }

  return {
    name,
    type,
    username,
    sudo: Boolean(input.sudo),
    secretEncrypted: encryptSecret(type === DeviceCredentialType.password ? password ?? "" : "private_key"),
    privateKeyEncrypted: privateKey ? encryptSecret(privateKey) : undefined,
    passphraseEncrypted: passphrase ? encryptSecret(passphrase) : undefined
  };
}

function updateData(input: Record<string, unknown>): Prisma.DeviceCredentialUpdateInput {
  const data: Prisma.DeviceCredentialUpdateInput = {};
  const nextType = input.type !== undefined ? typeValue(input.type) : undefined;
  if (input.name !== undefined) data.name = text(input.name, "name");
  if (input.type !== undefined) data.type = nextType;
  if (input.username !== undefined) data.username = text(input.username, "username");
  if (input.sudo !== undefined) data.sudo = Boolean(input.sudo);
  if (input.password !== undefined) data.secretEncrypted = encryptSecret(text(input.password, "password"));
  if (input.privateKey !== undefined) data.privateKeyEncrypted = encryptSecret(text(input.privateKey, "privateKey"));
  if (input.passphrase !== undefined) {
    const passphrase = optionalText(input.passphrase);
    data.passphraseEncrypted = passphrase ? encryptSecret(passphrase) : null;
  }
  if (nextType === DeviceCredentialType.private_key && input.privateKey === undefined) {
    throw new Error("privateKey is required when changing type to private_key");
  }
  if (nextType === DeviceCredentialType.password && input.password === undefined) {
    throw new Error("password is required when changing type to password");
  }
  return data;
}

export async function listCredentials() {
  const [credentials, devices] = await Promise.all([
    prisma.deviceCredential.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.device.findMany({ select: { credentialId: true, capabilities: true } })
  ]);
  return credentials.map((credential) => safeCredential(credential, credentialUsageCount(devices, credential.id)));
}

export async function getCredential(id: string) {
  const credential = await prisma.deviceCredential.findUnique({ where: { id } });
  return credential ? safeCredential(credential) : null;
}

export async function createCredential(input: Record<string, unknown>) {
  try {
    const credential = await prisma.deviceCredential.create({ data: createData(input) });
    return safeCredential(credential);
  } catch (error) {
    return mapCredentialWriteError(error);
  }
}

export async function updateCredential(id: string, input: Record<string, unknown>) {
  try {
    const credential = await prisma.deviceCredential.update({ where: { id }, data: updateData(input) });
    return safeCredential(credential);
  } catch (error) {
    return mapCredentialWriteError(error);
  }
}

export async function deleteCredential(id: string, force = false) {
  const devices = await prisma.device.findMany({ select: { id: true, credentialId: true, capabilities: true } });
  const deviceCount = credentialUsageCount(devices, id);
  if (deviceCount > 0 && !force) throw new CredentialInUseError(deviceCount);

  const enableReferences = devices.filter((device) => {
    const capabilities = device.capabilities && typeof device.capabilities === "object" && !Array.isArray(device.capabilities)
      ? device.capabilities as Record<string, unknown>
      : {};
    return capabilities.enableCredentialId === id;
  });
  const detachEnableReferences = enableReferences.map((device) => {
    const capabilities = { ...(device.capabilities as Record<string, unknown>) };
    delete capabilities.enableCredentialId;
    return prisma.device.update({ where: { id: device.id }, data: { capabilities: capabilities as Prisma.InputJsonValue } });
  });
  await prisma.$transaction([...detachEnableReferences, prisma.deviceCredential.delete({ where: { id } })]);
  return { deleted: true, detachedDeviceCount: deviceCount };
}

export async function resolveCredentialById(id: string): Promise<ResolvedDeviceCredential | null> {
  const credential = await prisma.deviceCredential.findUnique({ where: { id } });
  return credential ? decryptCredential(credential) : null;
}

export async function resolveCredentialByName(name: string): Promise<ResolvedDeviceCredential | null> {
  const credential = await prisma.deviceCredential.findUnique({ where: { name } });
  return credential ? decryptCredential(credential) : null;
}

function decryptCredential(credential: DeviceCredential): ResolvedDeviceCredential {
  return {
    name: credential.name,
    username: credential.username,
    password: credential.type === DeviceCredentialType.password ? decryptSecret(credential.secretEncrypted) : undefined,
    privateKey: credential.type === DeviceCredentialType.private_key ? decryptSecret(credential.privateKeyEncrypted) : undefined,
    passphrase: decryptSecret(credential.passphraseEncrypted),
    sudo: credential.sudo
  };
}
