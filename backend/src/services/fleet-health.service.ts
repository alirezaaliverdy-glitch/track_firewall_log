import { prisma } from "../db/prisma.js";
import { selectDeviceConnector } from "../connectors/connector-registry.service.js";
import { refreshLinuxHealth } from "../monitoring/linux/linux-health.service.js";
import { ciscoIosXeSshConnector } from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { recordCiscoMetricSamples, recordVendorMetricSamples } from "./vendor-metric-samples.service.js";
import { projectFleetResources } from "./fleet-health-projection.js";

const PERIOD_MS = 120_000;
let timer: NodeJS.Timeout | undefined;
let cycle: Promise<void> | undefined;
let cursor: string | undefined;
const attempts = new Map<string, number>();
const inFlight = new Set<string>();

export async function listFleetHealth(ownerId: string, page = 0) {
  const where = { deletedAt: null, company: { ownerId, deletedAt: null } };
  const [total, devices] = await Promise.all([
    prisma.device.count({ where }),
    prisma.device.findMany({ where, orderBy: { id: "asc" }, skip: page * 12, take: 12,
      select: { id:true,name:true,vendor:true,host:true,status:true,
        statusChecks:{orderBy:{checkedAt:"desc"},take:1,select:{status:true,checkedAt:true}},
        metricSamples:{where:{metricKey:{in:["cpu.usage_percent","memory.usage_percent","disk.usage_percent","datastore.usage_percent","interfaces.down_count","vpn.active_count","sessions.count"]},timestamp:{gte:new Date(Date.now()-24*3600_000)}},orderBy:{timestamp:"desc"},take:128,select:{metricKey:true,value:true,unit:true,timestamp:true}}
      } })
  ]);
  return { total, page, pageSize:12, collectionIntervalSeconds:PERIOD_MS/1000, generatedAt:new Date().toISOString(), devices: devices.map(({metricSamples,statusChecks,...device}) => ({...device,...projectFleetResources(metricSamples), connection:statusChecks[0]?.status ?? device.status, checkedAt:statusChecks[0]?.checkedAt ?? null, collecting:inFlight.has(device.id)})) };
}

async function collect(id: string) {
  if (inFlight.has(id) || Date.now() - (attempts.get(id) ?? 0) < PERIOD_MS) return;
  inFlight.add(id); attempts.set(id,Date.now());
  try {
    const device = await prisma.device.findFirst({where:{id,deletedAt:null,company:{deletedAt:null}}});
    if (!device || device.status === "offline") return;
    if (/linux/i.test(device.vendor)) { await refreshLinuxHealth(id); return; }
    if (/cisco/i.test(device.vendor)) {
      const result = await ciscoIosXeSshConnector.runReadOnlyCommands(device,["cpu","interfacesDetailed"]);
      if (result.connectorInvoked) await recordCiscoMetricSamples(id,Object.fromEntries(result.results.map(r=>[r.commandId,r.stdout])));
      return;
    }
    const connector = selectDeviceConnector(device);
    if (connector) await recordVendorMetricSamples(id,await connector.testConnection(device));
  } catch {
    // A resource failure is NOT proof that the host is offline. Connectivity has its own sensor.
  } finally { inFlight.delete(id); }
}

async function tick() {
  const devices = await prisma.device.findMany({where:{deletedAt:null,company:{deletedAt:null}},select:{id:true},orderBy:{id:"asc"},take:24,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  cursor = devices.length === 24 ? devices[23].id : undefined;
  const current = new Set(devices.map(d=>d.id));
  for (const [id,time] of attempts) if (!current.has(id) && Date.now()-time>3600_000) attempts.delete(id);
  for(let i=0;i<devices.length;i+=2) await Promise.all(devices.slice(i,i+2).map(d=>collect(d.id)));
}
export function startFleetHealthMonitor() {
  if (timer) return;
  const run = () => { if (!cycle) cycle = tick().catch(()=>undefined).finally(()=>{cycle=undefined;}); };
  timer = setInterval(run,15_000); timer.unref(); run();
}
export async function stopFleetHealthMonitor() { if(timer) clearInterval(timer); timer=undefined; await cycle; }
