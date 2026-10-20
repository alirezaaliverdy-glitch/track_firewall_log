import assert from "node:assert/strict";
import test from "node:test";
import type {Finding,SecurityEvent} from "@prisma/client";
import {createAttackAnalytics} from "../src/services/attacker-analytics.service.js";
import {deduplicateDetectionEvents,eventMatchesVendorRule,VENDOR_DETECTION_RULES} from "../src/security/vendor-detection-rule-library.js";
import {isAuthenticationFailureEvent} from "../src/security/brute-force-detection.js";

const now=new Date("2026-10-20T12:00:00Z");
const row=(id:string,values:Partial<Finding>={})=>({id,srcIp:"203.0.113.7",deviceId:"device-a",vendor:"linux",title:"Repeated failed logins",summary:"Evidence-based finding",category:"authentication",count:900,severity:"medium",firstSeen:new Date("2026-10-20T10:00:00Z"),evidenceJson:[],mitreTags:["T1110"],...values});
test("analytics counts distinct source IPs, not inflated rule counts, duplicates or stacked severity twice",()=>{
  const b=createAttackAnalytics(1,now);
  b.add(row("one"));b.add(row("one"));b.add(row("two",{severity:"high"}));b.add(row("three",{srcIp:"203.0.113.8",category:"network_scan",mitreTags:["T1046"]}));
  const out=b.finish();assert.equal(out.summary?.sources,2);assert.equal(out.summary?.findings,3);assert.equal(out.series.reduce((sum,x)=>sum+x.total,0),2);
  const bucket=out.series.find(x=>x.total>0)!;assert.equal(bucket.high,1);assert.equal(bucket.other,1);assert.equal(bucket.high+bucket.other,bucket.total);
  assert.deepEqual(out.patterns.map(x=>[x.key,x.sources]),[["authentication",1],["reconnaissance",1]]);
});
test("time range is half-open and future, invalid source and operational/success-only findings are excluded",()=>{
  const b=createAttackAnalytics(1,now);
  b.add(row("old",{firstSeen:new Date(now.getTime()-86400001)}));b.add(row("future",{firstSeen:now}));b.add(row("bad",{srcIp:"not-ip"}));
  b.add(row("success",{title:"Linux: remote root login"}));b.add(row("admin",{title:"MikroTik: administrator account changed"}));
  b.add(row("edge",{firstSeen:new Date(now.getTime()-86400000)}));assert.equal(b.finish().summary?.sources,1);
  assert.equal(b.finish().series[0].total,1);assert.throws(()=>createAttackAnalytics(365,now));
});
test("analysis limit refuses partial charts; no-data is an explicit complete empty result",()=>{
  const b=createAttackAnalytics(7,now);b.add(row("one"));const partial=b.finish(false,20000);assert.equal(partial.summary,null);assert.deepEqual(partial.series,[]);assert.deepEqual(partial.patterns,[]);
  const empty=createAttackAnalytics(7,now).finish();assert.equal(empty.summary?.sources,0);assert.equal(empty.series.length,7);assert.ok(empty.series.every(x=>x.total===0));
});
const event=(vendor:string,index:number,text:string)=>({id:`${vendor}-${index}`,deviceId:"device",vendor,srcIp:"203.0.113.7",username:"admin",eventType:"auth_failed",action:"auth_failed",timestamp:new Date(now.getTime()+index*1000),rawMessage:text} as SecurityEvent);
test("independent repeated Cisco/FortiGate/RouterOS failures are not collapsed across time",()=>{
  for(const [vendor,key,text]of [["cisco","cisco.login-failure-burst","%SEC_LOGIN-4-LOGIN_FAILED: Login failed [user: admin]"],["fortigate","fortigate.admin-login-failure","Admin login failed"],["mikrotik","mikrotik.login-failure-burst","login failure for user admin from 203.0.113.7 via winbox"]]){
    const rule=VENDOR_DETECTION_RULES.find(x=>x.key===key)!,rows=Array.from({length:6},(_,i)=>event(vendor,i,text));
    assert.equal(deduplicateDetectionEvents(rule,[...rows,{...rows[0],id:"transport-copy"}]).length,6);assert.ok(rows.every(x=>eventMatchesVendorRule(key,x)));
  }
});
test("Linux complementary PAM lines pair once without collapsing a sustained primary failure burst",()=>{
  const rule=VENDOR_DETECTION_RULES.find(x=>x.key==="linux.auth-failure-burst")!;
  const rows=Array.from({length:6},(_,i)=>event("linux",i,`sshd[900]: Failed password for admin from 203.0.113.7 port ${51000+i}`));
  const pairs=rows.map((r,i)=>({...r,id:`pam-${i}`,timestamp:new Date(r.timestamp!.getTime()+100),rawMessage:"pam_unix(sshd:auth)[900]: authentication failure; user=admin rhost=203.0.113.7"}));
  assert.equal(deduplicateDetectionEvents(rule,[...rows,...pairs]).length,6);
  const withoutPid=rows.map((r,i)=>({...r,rawMessage:`authentication failure attempt ${i}`}));assert.equal(deduplicateDetectionEvents(rule,withoutPid).length,6);
});
test("SSH packet drops and successful logins are not authentication failures",()=>{
  for(const dstPort of [22,22022])assert.equal(isAuthenticationFailureEvent({srcIp:"203.0.113.7",action:"denied",dstPort,rawMessage:"policy deny TCP SYN"}),false);
  assert.equal(isAuthenticationFailureEvent({srcIp:"203.0.113.7",action:"auth_success",rawMessage:"login success for user auth_failed"}),false);
  assert.equal(isAuthenticationFailureEvent({srcIp:"203.0.113.7",rawMessage:"SSL VPN handshake failed: certificate expired"}),false);
  assert.equal(isAuthenticationFailureEvent({srcIp:"203.0.113.7",rawMessage:'interface status="failed"'}),false);
});
