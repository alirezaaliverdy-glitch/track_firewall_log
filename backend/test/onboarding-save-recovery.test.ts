import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { prisma, shutdownDatabase } from "../src/db/prisma.js";
import { createCredential } from "../src/services/credential.service.js";
import { esxiSshConnector } from "../src/connectors/esxi-ssh.connector.js";
import { syncDeviceRecordToAsset } from "../src/assets/asset-intelligence.service.js";
import { buildApp } from "../src/app.js";
import {
  createOnboardingSession, answerOnboardingSession, testOnboardingConnection,
  detectOnboardingPlatform, discoverOnboardingInventory, previewOnboardingSession,
  commitOnboardingSession, getOnboardingSession, resetOnboardingSessionsForTest,
  OnboardingCommitNotReadyError, OnboardingManagementIpConflictError
} from "../src/services/device-onboarding.service.js";

let ownerId = "", companyId = "", credentialId = "", connectorCalls = 0;
const siteIds: string[] = [];
test.before(async () => {
  const suffix = Date.now().toString(36);
  const user = await prisma.appUser.create({data:{username:`onboarding-recovery-${suffix}`,passwordHash:"test-invalid-hash",displayName:"Test"}});
  ownerId = user.id;
  companyId = (await prisma.company.create({data:{ownerId,name:"Isolated test",code:"RECOVERY"}})).id;
  credentialId = (await createCredential({name:`onboarding-recovery-${suffix}`,type:"password",username:"test",password:"test-only"})).id;
});
test.after(async () => {
  try {
    if (ownerId) {
      await prisma.deviceOnboardingSession.deleteMany({where:{ownerId}});
      await prisma.appUser.deleteMany({where:{id:ownerId}});
    }
    if (credentialId) await prisma.deviceCredential.deleteMany({where:{id:credentialId}});
    if (siteIds.length) await prisma.assetSite.deleteMany({where:{id:{in:siteIds}}});
  } finally {await shutdownDatabase();}
});
test.beforeEach(t => {
  resetOnboardingSessionsForTest();
  t.mock.method(esxiSshConnector,"testConnection",async () => {
    connectorCalls++;
    return {connected:true,hostname:"esxi.example.test",os:"ESXi 8.0.3",capabilities:{canConnect:true,canReadSystem:true},warnings:[]};
  });
});

async function ready(host: string, site = "") {
  let session = await createOnboardingSession({companyId,vendor:"esxi",platform:"esxi-standalone",connectionMethod:"ssh",name:"Test ESXi",host,managementPort:22,credentialId,site,esxiSshFingerprint:"SHA256:"+Buffer.alloc(32,1).toString("base64").replace(/=+$/u,"")},ownerId);
  session = await answerOnboardingSession(session.id,session.draft,ownerId);
  session = await testOnboardingConnection(session.id,ownerId);
  session = await detectOnboardingPlatform(session.id,ownerId);
  session = await discoverOnboardingInventory(session.id,ownerId);
  return previewOnboardingSession(session.id,ownerId);
}

test("archived Linux identity is reused when replaced by ESXi on a different SSH port",async () => {
  const device = await prisma.device.create({data:{companyId,name:"Old Linux",vendor:"linux",type:"linux_edge",protocol:"ssh",environment:"lab",host:"192.0.2.15",managementPort:22022,deletedAt:new Date(),capabilities:{inventoryStatus:"archived"}}});
  const {asset} = await prisma.$transaction(tx => syncDeviceRecordToAsset(tx,device));
  await prisma.asset.update({where:{id:asset.id},data:{managedState:"archived"}});
  const audit = await prisma.auditLog.create({data:{deviceId:device.id,action:"test.old-history",targetType:"Device",targetId:device.id,dryRun:false,approvalStatus:"not_required"}});
  const session = await ready(device.host);
  const saved = await commitOnboardingSession(session.id,ownerId);
  assert.equal(saved.status,"completed");
  assert.equal(saved.result?.deviceId,device.id);
  assert.equal(saved.result?.assetId,asset.id);
  const current = await prisma.device.findUniqueOrThrow({where:{id:device.id}});
  assert.equal(current.vendor,"esxi"); assert.equal(current.managementPort,22);
  assert.equal(current.deletedAt,null);
  assert.equal(await prisma.asset.count({where:{companyId,managementIp:device.host}}),1);
  assert.ok(await prisma.auditLog.findUnique({where:{id:audit.id}}),"Old history is preserved");
});

test("an active device's address cannot be taken by another vendor",async () => {
  const device = await prisma.device.create({data:{companyId,name:"Active Linux",vendor:"linux",type:"linux_edge",protocol:"ssh",environment:"lab",host:"192.0.2.16",managementPort:22022}});
  await prisma.$transaction(tx => syncDeviceRecordToAsset(tx,device));
  const session = await ready(device.host);
  await assert.rejects(commitOnboardingSession(session.id,ownerId),e => e instanceof OnboardingManagementIpConflictError && e.deviceId===device.id);
  assert.equal((await prisma.device.findUniqueOrThrow({where:{id:device.id}})).vendor,"linux");
  assert.equal(await prisma.device.count({where:{companyId,host:device.host}}),1);
});

test("a failed save can be retried with intact verified evidence without reconnecting",async () => {
  const site = `recovery-site-${Date.now()}`;
  siteIds.push((await prisma.assetSite.create({data:{name:`Original ${site}`,slug:site}})).id);
  const conflictingSite = await prisma.assetSite.create({data:{name:site,slug:`other-${site}`}});
  siteIds.push(conflictingSite.id);
  const session = await ready("192.0.2.17",site);
  const calls = connectorCalls;
  await assert.rejects(commitOnboardingSession(session.id,ownerId),/Unique constraint/i);
  assert.equal(await prisma.device.count({where:{companyId,host:"192.0.2.17"}}),0,"Failed transaction leaves no partial registration");
  await prisma.assetSite.delete({where:{id:conflictingSite.id}});
  resetOnboardingSessionsForTest();
  const failed = await getOnboardingSession(session.id,ownerId);
  assert.equal(failed.status,"save_failed"); assert.equal(failed.test?.connected,true);
  const saved = await commitOnboardingSession(session.id,ownerId);
  assert.equal(saved.result?.verificationStatus,"verified");
  assert.equal(connectorCalls,calls,"Retrying a database save does not open another vendor connection");
});

test("all evidence is mandatory even in save_failed state",async () => {
  for (const patch of [
    {testJson:{connected:false,connectorInvoked:true}},
    {testJson:{connected:true,connectorInvoked:false}},
    {detectionJson:{supported:false}},
    {discoveryJson:{connectorInvoked:false}},
    {previewJson:Prisma.DbNull}
  ]) {
    const session = await ready("192.0.2.18");
    await prisma.deviceOnboardingSession.update({where:{id:session.id},data:{status:"save_failed",...patch}});
    resetOnboardingSessionsForTest();
    await assert.rejects(commitOnboardingSession(session.id,ownerId),OnboardingCommitNotReadyError);
  }
  assert.equal(await prisma.device.count({where:{companyId,host:"192.0.2.18"}}),0);
});

test("changing answers invalidates verification and commit returns a precise 400, not a network error",async () => {
  const session = await ready("192.0.2.19");
  await answerOnboardingSession(session.id,{...session.draft,managementPort:22022},ownerId);
  await assert.rejects(commitOnboardingSession(session.id,ownerId),OnboardingCommitNotReadyError);
  const app = await buildApp({authRequired:false});
  try {
    const response = await app.inject({method:"POST",url:`/api/device-onboarding/sessions/${session.id}/commit`,payload:{}});
    assert.equal(response.statusCode,400);
    assert.equal(response.json().error.code,"ONBOARDING_COMMIT_NOT_READY");
  } finally {await app.close();}
});
