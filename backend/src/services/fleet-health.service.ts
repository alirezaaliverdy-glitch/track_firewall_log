import { prisma } from "../db/prisma.js";
import { selectDeviceConnector } from "../connectors/connector-registry.service.js";
import { refreshLinuxHealth } from "../monitoring/linux/linux-health.service.js";
import { ciscoIosXeSshConnector } from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { recordCiscoMetricSamples, recordVendorMetricSamples } from "./vendor-metric-samples.service.js";
import { projectFleetResources } from "./fleet-health-projection.js";
import { buildDeviceTrafficSeries } from "./device-traffic-series.js";
import { recordVerifiedDeviceConnectivity } from "./device-connectivity-sensor.service.js";

const PERIOD_MS = 120_000;
let timer: NodeJS.Timeout | undefined;
let cycle: Promise<void> | undefined;
let cursor: string | undefined;
const attempts = new Map<string, number>();
const inFlight = new Set<string>();
const collectionErrors = new Map<string,string>();

export async function listFleetHealth(ownerId: string, page = 0) {
  const where = { deletedAt: null, company: { ownerId, deletedAt: null } };
  const [total, devices] = await Promise.all([
    prisma.device.count({ where }),
    prisma.device.findMany({ where, orderBy: { id: "asc" }, skip: page * 12, take: 12,
      select: { id:true,name:true,vendor:true,host:true,status:true,
        statusChecks:{orderBy:{checkedAt:"desc"},take:120,select:{status:true,checkedAt:true}},
        metricSamples:{where:{metricKey:{in:["cpu.usage_percent","memory.usage_percent","disk.usage_percent","datastore.usage_percent","interfaces.down_count","vpn.active_count","sessions.count"]},timestamp:{gte:new Date(Date.now()-24*3600_000)}},orderBy:{timestamp:"desc"},take:128,select:{metricKey:true,value:true,unit:true,timestamp:true}}
      } })
  ]);
  const charts = await Promise.all(devices.map(async device => {
    const samples = await prisma.metricSample.findMany({where:{deviceId:device.id,metricKey:{in:["cpu.usage_percent","memory.usage_percent","network.rx_bytes","network.tx_bytes","network.rx_mbps","network.tx_mbps"]},timestamp:{gte:new Date(Date.now()-2*3600_000)}},orderBy:{timestamp:"desc"},take:2048,select:{metricKey:true,value:true,unit:true,timestamp:true,labelsJson:true}});
    const resource = (key:string) => samples.filter(s=>s.metricKey===key&&Number.isFinite(s.value)&&s.value>=0&&s.value<=100).reverse().map(s=>({timestamp:s.timestamp,value:s.value,unit:"percent"}));
    const traffic=buildDeviceTrafficSeries(samples);
    return {cpu:resource("cpu.usage_percent"),memory:resource("memory.usage_percent"),traffic,availability:device.statusChecks.slice().reverse().map(s=>({timestamp:s.checkedAt,value:s.status==="online"?1:s.status==="offline"?0:.5,unit:"state"}))};
  }));
  return { total, page, pageSize:12, collectionIntervalSeconds:PERIOD_MS/1000, generatedAt:new Date().toISOString(), devices: devices.map(({metricSamples,statusChecks,...device},index) => ({...device,...projectFleetResources(metricSamples),charts:charts[index],collectionError:collectionErrors.get(device.id)??null, connection:statusChecks[0]?.status ?? device.status, checkedAt:statusChecks[0]?.checkedAt ?? null, collecting:inFlight.has(device.id)})) };
}

async function collect(id: string) {
  if (inFlight.has(id) || Date.now() - (attempts.get(id) ?? 0) < PERIOD_MS) return;
  inFlight.add(id); attempts.set(id,Date.now());
  collectionErrors.delete(id);
  try {
    const device = await prisma.device.findFirst({where:{id,deletedAt:null,company:{deletedAt:null}}});
    if (!device || device.status === "offline") return;
    if (/linux/i.test(device.vendor)) { await refreshLinuxHealth(id); return; }
    if (/cisco/i.test(device.vendor)) {
      const result = await ciscoIosXeSshConnector.runReadOnlyCommands(device,["cpu","memory","interfacesDetailed"]);
      if (result.connectorInvoked) {
        const successful=result.results.filter(r=>r.exitCode===0);
        if(successful.length)await recordVerifiedDeviceConnectivity(id,"AUTHENTICATED_COLLECTION_VERIFIED","Authenticated read-only Cisco metrics were collected.");
        await recordCiscoMetricSamples(id,Object.fromEntries(successful.map(r=>[r.commandId,r.stdout])));
      }
      return;
    }
    const connector = selectDeviceConnector(device);
    if (connector) {
      const result=await connector.testConnection(device);
      if(!result.connected)collectionErrors.set(id,/AUTH|CREDENTIAL/i.test(result.errorCode??"")?"AUTHENTICATION_FAILED":"COLLECTION_FAILED");
      else await recordVerifiedDeviceConnectivity(id,"AUTHENTICATED_COLLECTION_VERIFIED","Authenticated read-only vendor collection succeeded.");
      await recordVendorMetricSamples(id,result);
    } else collectionErrors.set(id,"CONNECTOR_UNAVAILABLE");
  } catch {
    collectionErrors.set(id,"COLLECTION_FAILED");
    // A resource failure is NOT proof that the host is offline. Connectivity has its own sensor.
  } finally { inFlight.delete(id); }
}

async function tick() {
  const devices = await prisma.device.findMany({where:{deletedAt:null,company:{deletedAt:null}},select:{id:true},orderBy:{id:"asc"},take:24,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  cursor = devices.length === 24 ? devices[23].id : undefined;
  const current = new Set(devices.map(d=>d.id));
  for (const [id,time] of attempts) if (!current.has(id) && Date.now()-time>3600_000) {attempts.delete(id);collectionErrors.delete(id);}
  for(let i=0;i<devices.length;i+=2) await Promise.all(devices.slice(i,i+2).map(d=>collect(d.id)));
}
export function startFleetHealthMonitor() {
  if (timer) return;
  const run = () => { if (!cycle) cycle = tick().catch(()=>undefined).finally(()=>{cycle=undefined;}); };
  timer = setInterval(run,15_000); timer.unref(); run();
}
export async function stopFleetHealthMonitor() { if(timer) clearInterval(timer); timer=undefined; await cycle; }
