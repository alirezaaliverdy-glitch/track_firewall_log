import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/db/prisma.js";
import { securityChangePage } from "../src/services/security-change-page.js";
import { reconcileResourceIssues } from "../src/services/resource-issues.service.js";
import { monitoringOperations } from "../src/monitoring/operations.service.js";
import { createFindingActionPlan } from "../src/assets/asset-intelligence.service.js";
import { buildApp } from "../src/app.js";
import { createSession } from "../src/services/auth.service.js";

test("actual SQL sweep visits 205 devices despite hundreds of repeated events on the first device",async t=>{
  const tag=randomUUID(),ids=Array.from({length:205},(_,i)=>`${tag}-${String(i).padStart(3,"0")}`), now=new Date();
  t.after(async()=>{await prisma.securityEvent.deleteMany({where:{deviceId:{in:ids}}});await prisma.device.deleteMany({where:{id:{in:ids}}});});
  await prisma.device.createMany({data:ids.map(id=>({id,name:"Synthetic sweep",vendor:"fixture",host:"192.0.2.1",type:"linux_edge",managementPort:22,protocol:"ssh",environment:"lab"}))});
  await prisma.securityEvent.createMany({data:[...ids,...Array.from({length:300},()=>ids[0])].map(deviceId=>({deviceId,eventType:"fixture",receivedAt:now,normalizedJson:{}}))});
  const visited:string[]=[];let after:string|undefined;
  for(;;){const page=await securityChangePage(new Date(now.getTime()-1),now,after);visited.push(...page.map(row=>row.deviceId!));if(page.length<100)break;after=page.at(-1)!.deviceId!;}
  assert.deepEqual(visited,ids);
});
test("resource lifecycle persists real evidence, does not clear on silence, reopens on new samples; unsupported fixes create no plan",async t=>{
  const tag=randomUUID();const owner=await prisma.appUser.create({data:{username:tag,displayName:"Fixture owner",role:"admin",passwordHash:"not-a-real-login"}});
  const company=await prisma.company.create({data:{ownerId:owner.id,name:"Fixture company",code:tag}});
  const device=await prisma.device.create({data:{companyId:company.id,name:"Fixture resource",vendor:"fixture-vendor",host:"192.0.2.1",type:"generic_firewall",managementPort:22,protocol:"ssh",environment:"lab"}});
  t.after(async()=>{await prisma.auditLog.deleteMany({where:{deviceId:device.id}});await prisma.appUser.delete({where:{id:owner.id}});});
  const base=Date.now(),add=async(value:number,offset:number)=>prisma.metricSample.create({data:{deviceId:device.id,metricKey:"cpu.usage_percent",value,unit:"percent",source:"fixture-collector",timestamp:new Date(base+offset)}});
  await add(99,-2000);await reconcileResourceIssues(device.id);assert.equal(await prisma.finding.count({where:{deviceId:device.id}}),0);
  await add(98,-1000);await reconcileResourceIssues(device.id);const finding=await prisma.finding.findFirstOrThrow({where:{deviceId:device.id}});
  assert.equal(finding.source,"measured_resource");assert.equal(finding.status,"active");assert.equal(finding.severity,"critical");
  await reconcileResourceIssues(device.id);assert.equal((await prisma.finding.findUniqueOrThrow({where:{id:finding.id}})).count,1,"re-polling is not a new observation");
  const count=await prisma.actionPlan.count({where:{deviceId:device.id}});await assert.rejects(createFindingActionPlan(finding.id,owner.id),error=>(error as {code:string}).code==="FINDING_ACTION_UNSUPPORTED");assert.equal(await prisma.actionPlan.count({where:{deviceId:device.id}}),count);
  await add(40,1000);await reconcileResourceIssues(device.id);assert.equal((await prisma.finding.findUniqueOrThrow({where:{id:finding.id}})).status,"active");
  await add(42,2000);await reconcileResourceIssues(device.id);assert.equal((await prisma.finding.findUniqueOrThrow({where:{id:finding.id}})).status,"resolved");
  assert.equal(await prisma.auditLog.count({where:{deviceId:device.id,action:"monitoring.resource.resolved"}}),1);
  await add(96,3000);await add(97,4000);await reconcileResourceIssues(device.id);assert.equal((await prisma.finding.findUniqueOrThrow({where:{id:finding.id}})).status,"active");
  const view=await monitoringOperations(owner.id,0);assert.equal(view.devices.length,1);assert.equal(view.devices[0].issues[0].id,finding.id);assert.equal(view.devices[0].coverage?.state,"unsupported");
  assert.equal(JSON.stringify(view).includes("passwordHash"),false);
});
test("monitoring-only account gets a scoped operational view, camera-only account cannot see it",async t=>{
  const tag=randomUUID(),app=await buildApp();
  const owner=await prisma.appUser.create({data:{username:tag,displayName:"Fixture owner",role:"admin",passwordHash:"fixture"}});
  t.after(async()=>{await app.close();await prisma.appUser.deleteMany({where:{OR:[{id:owner.id},{workspaceOwnerId:owner.id}]}});});
  const company=await prisma.company.create({data:{ownerId:owner.id,name:"Owned fixture",code:tag}});
  await prisma.device.create({data:{companyId:company.id,name:"Visible fixture",vendor:"fixture",host:"192.0.2.1",type:"linux_edge",managementPort:22,protocol:"ssh",environment:"lab"}});
  for(const page of ["monitoring.overview","assets.cameras"]){
    const user=await prisma.appUser.create({data:{username:`${tag}-${page}`,displayName:"Fixture viewer",role:"viewer",workspaceOwnerId:owner.id,passwordHash:"fixture",allowedSections:[`page:${page}`]}});
    const {token}=await createSession(user.id,{}),headers={cookie:`firewall_session=${token}`};
    const response=await app.inject({url:"/api/monitoring/operations",headers});
    assert.equal(response.statusCode,page==="monitoring.overview"?200:403);
    if(response.statusCode===200){assert.equal(response.json().total,1);assert.equal(response.json().devices[0].name,"Visible fixture");assert.equal((await app.inject({url:"/api/admin/users",headers})).statusCode,403);}
  }
});
