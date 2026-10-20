import { isIP } from "node:net";
import { Prisma, type Finding } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { isActionableFinding } from "./attacker-intelligence.service.js";
import { buildTrustedSourceMatcher } from "./trusted-source-ip.service.js";

type Evidence = Pick<Finding, "id" | "srcIp" | "deviceId" | "vendor" | "title" | "summary" | "category" | "count" | "severity" | "firstSeen" | "evidenceJson" | "mitreTags">;
export const ANALYTICS_LIMIT = 20_000;
export const ATTACK_PATTERNS = ["authentication", "reconnaissance", "intrusion", "network_defense", "malicious_traffic", "other"] as const;
export type AttackPattern = typeof ATTACK_PATTERNS[number];
export function attackPattern(row: Pick<Evidence, "category" | "title" | "mitreTags">): AttackPattern {
  const category = row.category.toLowerCase();
  if (row.mitreTags.some(tag => tag.startsWith("T1110")) || /auth|brute.?force|failed login|vpn.*fail/.test(category)) return "authentication";
  if (row.mitreTags.includes("T1046") || /scan|reconnaissance/.test(category)) return "reconnaissance";
  if (/intrusion|threat-prevention|ids|ips\b/.test(category)) return "intrusion";
  if (/deny|drop|network-defense|firewall.*block|acl/.test(category)) return "network_defense";
  if (/malware|malicious|suspicious.outbound|botnet|command.and.control/.test(category)) return "malicious_traffic";
  return "other";
}

/** Count distinct sources, never sum overlapping rule counts or invent attempts. */
export function createAttackAnalytics(days: number, now: Date) {
  if (![1, 7, 30].includes(days) || !Number.isFinite(now.getTime())) throw new Error("INVALID_ANALYTICS_WINDOW");
  const end = now.getTime(), start = end - days * 86_400_000, bucketMs = days === 1 ? 3_600_000 : 86_400_000;
  const buckets = Array.from({length: days === 1 ? 24 : days}, () => new Map<string, boolean>());
  const patterns = new Map<AttackPattern, Set<string>>(ATTACK_PATTERNS.map(key => [key, new Set()]));
  const sources = new Set<string>(), devices = new Set<string>(), seen = new Set<string>();
  let findings = 0;
  return {
    add(row: Evidence) {
      const at = row.firstSeen.getTime(), ip = row.srcIp?.toLowerCase();
      if (!ip || !isIP(ip) || seen.has(row.id) || !Number.isFinite(at) || at < start || at >= end || !isActionableFinding(row)) return;
      seen.add(row.id); sources.add(ip); devices.add(row.deviceId); findings++;
      const bucket = buckets[Math.floor((at-start)/bucketMs)];
      bucket.set(ip, Boolean(bucket.get(ip) || ["critical", "high"].includes(row.severity.toLowerCase())));
      patterns.get(attackPattern(row))!.add(ip);
    },
    finish(complete = true, scanned = findings) {
      const series = buckets.map((bucket,index) => ({ at:new Date(start+index*bucketMs).toISOString(), until:new Date(Math.min(end,start+(index+1)*bucketMs)).toISOString(), high:[...bucket.values()].filter(Boolean).length, other:[...bucket.values()].filter(value=>!value).length, total:bucket.size }));
      const distribution = [...patterns].map(([key,ips])=>({key,sources:ips.size})).filter(row=>row.sources>0).sort((a,b)=>b.sources-a.sources||a.key.localeCompare(b.key));
      const peak = series.reduce<(typeof series)[number]|null>((best,item)=>item.total>(best?.total??0)?item:best,null);
      return { generatedAt:now.toISOString(), days, from:new Date(start).toISOString(), until:now.toISOString(), bucketSeconds:bucketMs/1000,
        basis:"distinct_source_ips_from_new_qualified_findings" as const,
        coverage:{complete,scanned,limit:ANALYTICS_LIMIT,includesResolved:true,retainedEvidenceOnly:true},
        // Refuse a plausible-looking partial chart when its safety limit is hit.
        summary:complete?{sources:sources.size,devices:devices.size,findings,peakAt:peak?.at??null,peakSources:peak?.total??0}:null,
        series:complete?series:[],patterns:complete?distribution:[] };
    }
  };
}

const active = new Map<string, Promise<Awaited<ReturnType<typeof collect>>>>();
async function collect(ownerId: string, days: number, vendor?: string, deviceId?: string) {
  const now = new Date(), builder = createAttackAnalytics(days,now);
  const trusted = await buildTrustedSourceMatcher();
  return prisma.$transaction(async tx => {
    let cursor:string|undefined, scanned=0, complete=true;
    while (true) {
      const page: Evidence[] = await tx.finding.findMany({
        where:{srcIp:{not:null},firstSeen:{gte:new Date(now.getTime()-days*86_400_000),lt:now},status:{notIn:["false_positive","suppressed"]},
          device:{deletedAt:null,company:{ownerId,deletedAt:null}},...(vendor?{vendor:{equals:vendor,mode:"insensitive"}}:{}),...(deviceId?{deviceId}:{})},
        select:{id:true,srcIp:true,deviceId:true,vendor:true,title:true,summary:true,category:true,count:true,severity:true,firstSeen:true,evidenceJson:true,mitreTags:true},
        orderBy:{id:"asc"},take:501,...(cursor?{cursor:{id:cursor},skip:1}:{})
      });
      for (const row of page.slice(0,500)) { scanned++; if(!trusted(row.srcIp,row.vendor)) builder.add(row); }
      if(page.length<=500)break;
      if(scanned>=ANALYTICS_LIMIT){complete=false;break;}
      cursor=page[499].id;
    }
    return builder.finish(complete,scanned);
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:20_000,maxWait:5_000});
}
export async function getAttackerAnalytics(ownerId: string, days=7, vendor?: string, deviceId?: string) {
  if(!ownerId)throw new Error("ATTACKER_ANALYTICS_SCOPE_REQUIRED");
  if(![1,7,30].includes(days))throw new Error("INVALID_ANALYTICS_WINDOW");
  const key=JSON.stringify([ownerId,days,vendor??"",deviceId??""]);
  const pending=active.get(key);if(pending)return pending;
  if(active.size>=16)throw new Error("ATTACKER_ANALYTICS_BUSY");
  const request=collect(ownerId,days,vendor,deviceId).finally(()=>active.delete(key));
  active.set(key,request);return request;
}
