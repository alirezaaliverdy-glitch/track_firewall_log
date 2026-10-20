import { prisma } from "../db/prisma.js";
/** SQL GROUP BY, not Prisma's post-query distinct/take combination. */
export function securityChangePage(since: Date, through: Date, after?: string) {
  return prisma.securityEvent.groupBy({ by: ["deviceId"], where: { deviceId: { not: null, ...(after ? { gt: after } : {}) }, receivedAt: { gt: since, lte: through } }, orderBy: { deviceId: "asc" }, take: 100 });
}
