import { isIP } from "node:net";
import { prisma } from "../db/prisma.js";

export const TRUSTED_SOURCE_VENDORS = ["all", "linux", "mikrotik", "fortigate", "cisco", "pfsense"] as const;
const TRUSTED_SOURCE_VENDOR_SET = new Set<string>(TRUSTED_SOURCE_VENDORS);

function normalizeIp(input: unknown) {
  const ip = String(input ?? "").trim().toLowerCase();
  if (!isIP(ip)) throw new Error("INVALID_TRUSTED_SOURCE_IP");
  return ip;
}

function normalizeVendor(input: unknown) {
  const vendor = String(input ?? "all").trim().toLowerCase();
  if (!TRUSTED_SOURCE_VENDOR_SET.has(vendor)) throw new Error("INVALID_TRUSTED_SOURCE_VENDOR");
  return vendor;
}

function normalizeLabel(input: unknown) {
  const label = String(input ?? "").trim();
  if (label.length > 80) throw new Error("TRUSTED_SOURCE_LABEL_TOO_LONG");
  return label || null;
}

export async function listTrustedSourceIps() {
  return prisma.trustedSourceIp.findMany({ orderBy: [{ vendor: "asc" }, { createdAt: "desc" }] });
}

export async function createTrustedSourceIp(input: { ip?: unknown; vendor?: unknown; label?: unknown }, createdBy?: string) {
  const ip = normalizeIp(input.ip);
  const vendor = normalizeVendor(input.vendor);
  const label = normalizeLabel(input.label);
  const entry = await prisma.trustedSourceIp.upsert({
    where: { ip_vendor: { ip, vendor } },
    create: { ip, vendor, label, createdBy, enabled: true },
    update: { label, createdBy, enabled: true }
  });
  await prisma.finding.updateMany({
    where: {
      srcIp: ip,
      ...(vendor === "all" ? {} : { vendor: { equals: vendor, mode: "insensitive" } }),
      status: { notIn: ["resolved", "false_positive", "accepted_risk", "suppressed"] }
    },
    data: { status: "suppressed", suppressionReason: `trusted_source_allowlist:${vendor}` }
  });
  return entry;
}

export async function deleteTrustedSourceIp(id: string) {
  return prisma.trustedSourceIp.delete({ where: { id } });
}

export type TrustedSourceMatcher = (ip: string | null | undefined, vendor: string | null | undefined) => boolean;

export async function buildTrustedSourceMatcher(ips: string[] = []): Promise<TrustedSourceMatcher> {
  const entries = await prisma.trustedSourceIp.findMany({
    where: { enabled: true, ...(ips.length ? { ip: { in: [...new Set(ips.map((ip) => ip.toLowerCase()))] } } : {}) },
    select: { ip: true, vendor: true }
  });
  const trusted = new Set(entries.map((entry) => `${entry.ip.toLowerCase()}|${entry.vendor.toLowerCase()}`));
  return (ip, vendor) => {
    const normalizedIp = String(ip ?? "").trim().toLowerCase();
    const normalizedVendor = String(vendor ?? "").trim().toLowerCase();
    return Boolean(normalizedIp) && (trusted.has(`${normalizedIp}|all`) || trusted.has(`${normalizedIp}|${normalizedVendor}`));
  };
}
