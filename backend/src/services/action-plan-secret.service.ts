import { prisma } from "../db/prisma.js";
import { decryptSecret, encryptSecret } from "./credential-crypto.service.js";

export const ACTION_PLAN_SECRET_KEYS = {
  linuxInitialPassword: "linux.initialPassword",
} as const;

export async function storeActionPlanSecret(actionPlanId: string, key: string, value: string) {
  const secretEncrypted = encryptSecret(value);
  await prisma.actionPlanSecret.upsert({
    where: { actionPlanId_key: { actionPlanId, key } },
    create: { actionPlanId, key, secretEncrypted },
    update: { secretEncrypted },
  });
}

export async function hasActionPlanSecret(actionPlanId: string, key: string) {
  return Boolean(await prisma.actionPlanSecret.findUnique({
    where: { actionPlanId_key: { actionPlanId, key } },
    select: { id: true },
  }));
}

export async function resolveActionPlanSecret(actionPlanId: string, key: string) {
  const stored = await prisma.actionPlanSecret.findUnique({
    where: { actionPlanId_key: { actionPlanId, key } },
    select: { secretEncrypted: true },
  });
  return stored ? decryptSecret(stored.secretEncrypted) : undefined;
}

export async function copyActionPlanSecrets(sourceActionPlanId: string, targetActionPlanId: string) {
  const stored = await prisma.actionPlanSecret.findMany({
    where: { actionPlanId: sourceActionPlanId },
    select: { key: true, secretEncrypted: true },
  });
  if (!stored.length) return;
  await prisma.actionPlanSecret.createMany({
    data: stored.map((item) => ({ actionPlanId: targetActionPlanId, ...item })),
    skipDuplicates: true,
  });
}
