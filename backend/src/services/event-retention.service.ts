import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

function cutoff(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function dateWhere(days: number): Prisma.SecurityEventWhereInput {
  return {
    OR: [
      { lastSeen: { lt: cutoff(days) } },
      { lastSeen: null, receivedAt: { lt: cutoff(days) } }
    ]
  };
}

export async function getRetentionStatus() {
  const [total, bySeverity] = await Promise.all([
    prisma.securityEvent.count(),
    prisma.securityEvent.groupBy({
      by: ["severity"],
      _count: { _all: true },
      orderBy: { _count: { severity: "desc" } }
    })
  ]);

  return {
    totalEvents: total,
    maxRows: env.eventMaxRows,
    policy: {
      lowDays: env.eventRetentionLowDays,
      mediumDays: env.eventRetentionMediumDays,
      highDays: env.eventRetentionHighDays,
      criticalDays: env.eventRetentionCriticalDays,
      rawSnippetChars: env.eventMaxRawSnippetChars,
      dedupWindowMinutes: env.eventDedupWindowMinutes,
      runIntervalMinutes: env.eventRetentionRunIntervalMinutes
    },
    countBySeverity: bySeverity.map((row) => ({
      severity: row.severity ?? "unknown",
      count: row._count._all
    }))
  };
}

async function deleteOldBySeverity(severity: string, days: number) {
  const result = await prisma.securityEvent.deleteMany({
    where: {
      severity,
      ...dateWhere(days)
    }
  });
  return result.count;
}

async function trimByMaxRows() {
  let total = await prisma.securityEvent.count();
  let deleted = 0;
  for (const severity of ["low", "medium"]) {
    if (total <= env.eventMaxRows) break;
    const overflow = total - env.eventMaxRows;
    const victims = await prisma.securityEvent.findMany({
      where: { severity },
      orderBy: [{ lastSeen: "asc" }, { receivedAt: "asc" }],
      take: overflow,
      select: { id: true }
    });
    if (victims.length === 0) continue;
    const result = await prisma.securityEvent.deleteMany({
      where: { id: { in: victims.map((event) => event.id) } }
    });
    deleted += result.count;
    total -= result.count;
  }
  return deleted;
}

export async function runRetention() {
  const deletedLow = await deleteOldBySeverity("low", env.eventRetentionLowDays);
  const deletedMedium = await deleteOldBySeverity("medium", env.eventRetentionMediumDays);
  const deletedHigh = await deleteOldBySeverity("high", env.eventRetentionHighDays);
  const deletedCritical = await deleteOldBySeverity("critical", env.eventRetentionCriticalDays);
  const deletedByMaxRows = await trimByMaxRows();
  const status = await getRetentionStatus();

  return {
    deletedLow,
    deletedMedium,
    deletedHigh,
    deletedCritical,
    deletedByMaxRows,
    status
  };
}
