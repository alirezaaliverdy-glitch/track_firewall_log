import type { SecurityFinding } from "@/lib/platform";
export function groupFindings(findings: SecurityFinding[]) {
  const groups = new Map<string, { finding: SecurityFinding; members: SecurityFinding[]; ips: string[] }>();
  for (const finding of findings) {
    const bucket = Math.floor(new Date(finding.lastSeen).getTime() / (15 * 60_000));
    const key = JSON.stringify([finding.deviceId, finding.vendor, finding.source, finding.title, finding.category, finding.status, finding.dstPort ?? null, bucket]);
    const group = groups.get(key) ?? { finding, members: [], ips: [] };
    group.members.push(finding);
    if (finding.srcIp && !group.ips.includes(finding.srcIp)) group.ips.push(finding.srcIp);
    if (new Date(finding.lastSeen) > new Date(group.finding.lastSeen)) group.finding = finding;
    groups.set(key, group);
  }
  return [...groups.values()];
}
