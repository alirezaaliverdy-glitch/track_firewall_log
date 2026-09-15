import { DeviceType } from "@prisma/client";
import { createSecurityEvent, ensureSeededSecurityRules, runSecurityDetection } from "../assets/asset-intelligence.service.js";
import { prisma, shutdownDatabase } from "../db/prisma.js";

const marker = `security-rule-smoke-${Date.now()}`;
let deviceId = "";

try {
  await ensureSeededSecurityRules();
  const rule = await prisma.detectionRule.findFirstOrThrow({ where: { queryJson: { path: ["ruleKey"], equals: "linux.auth-failure-burst" } } });
  const originalEnabled = rule.enabled;
  await prisma.detectionRule.update({ where: { id: rule.id }, data: { enabled: false } });
  await ensureSeededSecurityRules();
  const disabledPersisted = (await prisma.detectionRule.findUniqueOrThrow({ where: { id: rule.id } })).enabled === false;
  await prisma.detectionRule.update({ where: { id: rule.id }, data: { enabled: true } });

  const device = await prisma.device.create({ data: { name: marker, vendor: "Linux", type: DeviceType.linux_edge, host: "192.0.2.228", managementPort: 22, protocol: "ssh", environment: "lab" } });
  deviceId = device.id;
  for (let index = 0; index < 5; index += 1) {
    await createSecurityEvent({ deviceId, vendor: "linux", eventType: "auth", srcIp: "198.51.100.228", username: "invalid", rawMessage: `sshd: Failed password for invalid user smoke-${index}` });
  }
  const firstRun = await runSecurityDetection({ deviceId });
  const finding = await prisma.finding.findFirstOrThrow({ where: { deviceId, source: "seeded_detection_rule" } });
  const countAfterFirstRun = finding.count;
  await runSecurityDetection({ deviceId });
  const countAfterDuplicateRun = (await prisma.finding.findUniqueOrThrow({ where: { id: finding.id } })).count;
  await createSecurityEvent({ deviceId, vendor: "linux", eventType: "auth", srcIp: "198.51.100.228", username: "invalid", rawMessage: "sshd: Failed password for invalid user smoke-new" });
  await runSecurityDetection({ deviceId });
  const countAfterNewEvent = (await prisma.finding.findUniqueOrThrow({ where: { id: finding.id } })).count;
  await prisma.detectionRule.update({ where: { id: rule.id }, data: { enabled: originalEnabled } });

  if (!disabledPersisted || countAfterFirstRun !== 5 || countAfterDuplicateRun !== 5 || countAfterNewEvent !== 6) throw new Error("SECURITY_DETECTION_SMOKE_FAILED");
  console.log(JSON.stringify({ ok: true, vendorRuleCount: await prisma.detectionRule.count({ where: { queryJson: { path: ["implementation"], equals: "event_backed" } } }), disabledPersisted, firstRunCreated: firstRun.findingsCreated, countAfterFirstRun, countAfterDuplicateRun, countAfterNewEvent }));
} finally {
  if (deviceId) {
    await prisma.finding.deleteMany({ where: { deviceId } });
    await prisma.securityEvent.deleteMany({ where: { deviceId } });
    await prisma.asset.deleteMany({ where: { deviceId } });
    await prisma.device.deleteMany({ where: { id: deviceId } });
  }
  await shutdownDatabase();
}
