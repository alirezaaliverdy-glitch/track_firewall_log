import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
test("analytics reads beyond the IP-list cap, respects workspace/page grants and never returns raw evidence",async()=>{
  const {prisma,shutdownDatabase}=await import("../src/db/prisma.js"),{buildApp}=await import("../src/app.js"),{createSession}=await import("../src/services/auth.service.js");
  const app=await buildApp(),tag=`attack-analytics-${randomUUID()}`,users:string[]=[],devices:string[]=[];
  async function identity(role:"admin"|"viewer",workspaceOwnerId?:string,allowedSections=["page:attackers.overview"]){const user=await prisma.appUser.create({data:{username:`${tag}-${users.length}`,displayName:"Analytics fixture",role,workspaceOwnerId,allowedSections,passwordHash:"not-a-login"}});users.push(user.id);const session=await createSession(user.id,{});return{id:user.id,headers:{cookie:`firewall_session=${session.token}`}};}
  async function device(ownerId:string){const company=await prisma.company.create({data:{ownerId,name:tag,code:randomUUID()}});const d=await prisma.device.create({data:{name:tag,vendor:"Linux",type:"linux_edge",host:"192.0.2.1",companyId:company.id,protocol:"ssh",managementPort:22,environment:"lab"}});devices.push(d.id);return d;}
  const path="/api/security/attackers/analytics?days=7";
  try{
    const owner=await identity("admin"),other=await identity("admin"),viewer=await identity("viewer",owner.id),denied=await identity("viewer",owner.id,["page:assets.cameras"]);
    const one=await device(owner.id),two=await device(other.id),at=new Date(Date.now()-3600000);
    const finding=(deviceId:string,index:number)=>({deviceId,vendor:"linux",title:"Repeated failed logins",severity:"high",category:"authentication",confidence:.8,summary:"Synthetic evidence",evidenceJson:{password:"SYNTHETIC_MUST_NOT_LEAK"},rawRefsJson:[],source:"fixture",firstSeen:at,lastSeen:at,count:999,mitreTags:["T1110"],srcIp:`10.120.${Math.floor(index/250)}.${index%250+1}`,recommendedActions:[],fingerprint:`${tag}-${index}`});
    await prisma.finding.createMany({data:Array.from({length:2001},(_,i)=>finding(one.id,i))});
    await prisma.finding.create({data:finding(two.id,9999)});
    for(const status of ["false_positive","suppressed"])await prisma.finding.create({data:{...finding(one.id,status==="suppressed"?9998:9997),status}});
    assert.equal((await app.inject({url:path})).statusCode,401);
    assert.equal((await app.inject({url:path,headers:denied.headers})).statusCode,403);
    const result=await app.inject({url:path,headers:viewer.headers});assert.equal(result.statusCode,200);const body=result.json();
    assert.equal(body.coverage.complete,true);assert.equal(body.coverage.scanned,2001);assert.equal(body.summary.sources,2001);assert.equal(body.summary.findings,2001);assert.equal(body.series.reduce((sum:number,x:{total:number})=>sum+x.total,0),2001);
    assert.equal(body.patterns[0].sources,2001);assert.equal(result.body.includes("SYNTHETIC_MUST_NOT_LEAK"),false);
    assert.equal((await app.inject({url:path,headers:other.headers})).json().summary.sources,1);
    assert.equal((await app.inject({url:path+"&vendor=mikrotik",headers:viewer.headers})).json().summary.sources,0);
    assert.equal((await app.inject({url:"/api/security/attackers/analytics?days=365",headers:viewer.headers})).statusCode,400);
    const forged=await app.inject({url:path+"&ownerId="+other.id,headers:viewer.headers});
    assert.equal(forged.statusCode,200);assert.equal(forged.json().summary.sources,2001,"unrecognized owner query never overrides the authenticated scope");
  }finally{await app.close();await prisma.device.deleteMany({where:{id:{in:devices}}});await prisma.company.deleteMany({where:{ownerId:{in:users}}});await prisma.appUser.deleteMany({where:{id:{in:users}}});await shutdownDatabase();}
});
