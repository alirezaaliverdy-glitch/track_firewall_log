import { DeviceCredentialType, type DeviceCredential, type Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { decryptSecret, encryptSecret } from "./credential-crypto.service.js";

export type ResolvedDeviceCredential = {
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  sudo: boolean;
};

const CREDENTIAL_TYPES = new Set<string>(Object.values(DeviceCredentialType));

function text(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeCredential(credential: DeviceCredential) {
  return {
    id: credential.id,
    name: credential.name,
    type: credential.type,
    username: credential.username,
    sudo: credential.sudo,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt
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
  const credentials = await prisma.deviceCredential.findMany({ orderBy: { createdAt: "desc" } });
  return credentials.map(safeCredential);
}

export async function getCredential(id: string) {
  const credential = await prisma.deviceCredential.findUnique({ where: { id } });
  return credential ? safeCredential(credential) : null;
}

export async function createCredential(input: Record<string, unknown>) {
  const credential = await prisma.deviceCredential.create({ data: createData(input) });
  return safeCredential(credential);
}

export async function updateCredential(id: string, input: Record<string, unknown>) {
  const credential = await prisma.deviceCredential.update({ where: { id }, data: updateData(input) });
  return safeCredential(credential);
}

export async function deleteCredential(id: string) {
  await prisma.deviceCredential.delete({ where: { id } });
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
    username: credential.username,
    password: credential.type === DeviceCredentialType.password ? decryptSecret(credential.secretEncrypted) : undefined,
    privateKey: credential.type === DeviceCredentialType.private_key ? decryptSecret(credential.privateKeyEncrypted) : undefined,
    passphrase: decryptSecret(credential.passphraseEncrypted),
    sudo: credential.sudo
  };
}
