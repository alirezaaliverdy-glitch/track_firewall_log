import fs from "node:fs/promises";
import net from "node:net";

const PHASE = process.argv[2] ?? "phase1";
const STATE_FILE = "/tmp/security-email-restart-smoke.json";
const DEVICE_NAME = "security-email-restart-smoke";

async function smtpFixture() {
  let messages = 0;
  let body = "";
  let inData = false;
  const server = net.createServer((socket) => {
    socket.write("220 local restart smoke\r\n");
    socket.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (inData) {
        body += text;
        if (text.includes("\r\n.\r\n")) { messages += 1; inData = false; socket.write("250 accepted\r\n"); }
        return;
      }
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        if (line.startsWith("EHLO")) socket.write("250-localhost\r\n250 OK\r\n");
        else if (line.startsWith("MAIL FROM")) socket.write("250 sender ok\r\n");
        else if (line.startsWith("RCPT TO")) socket.write("250 recipient ok\r\n");
        else if (line === "DATA") { inData = true; socket.write("354 end data\r\n"); }
        else if (line === "QUIT") socket.write("221 bye\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("SMTP_FIXTURE_FAILED");
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(address.port);
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_STARTTLS = "false";
  process.env.SMTP_FROM = "alerts@example.test";
  delete process.env.SMTP_USERNAME;
  delete process.env.SMTP_PASSWORD;
  return { server, messages: () => messages, body: () => body };
}

const smtp = await smtpFixture();
const { prisma, shutdownDatabase } = await import("../db/prisma.js");
const { createSecurityEvent, ensureSeededSecurityRules, runSecurityDetection } = await import("../assets/asset-intelligence.service.js");

try {
  if (PHASE === "phase1") {
    await prisma.finding.deleteMany({ where: { device: { name: DEVICE_NAME } } });
    await prisma.securityEvent.deleteMany({ where: { device: { name: DEVICE_NAME } } });
    await prisma.device.deleteMany({ where: { name: DEVICE_NAME } });
    const original = await prisma.securityAlertChannel.findUnique({ where: { id: "primary-email" } });
    const channelEnabledStates = await prisma.securityAlertChannel.findMany({ select: { id: true, enabled: true } });
    await fs.writeFile(STATE_FILE, JSON.stringify(original ? { exists: true, enabled: original.enabled, recipientEmail: original.recipientEmail, minimumSeverity: original.minimumSeverity, lastTestedAt: original.lastTestedAt, lastTestStatus: original.lastTestStatus, lastErrorCode: original.lastErrorCode, channelEnabledStates } : { exists: false, channelEnabledStates }), "utf8");
    await prisma.securityAlertChannel.updateMany({ data: { enabled: false } });
    await prisma.securityAlertChannel.upsert({ where: { id: "primary-email" }, update: { enabled: true, recipientEmail: "operator@example.test", minimumSeverity: "high" }, create: { id: "primary-email", enabled: true, recipientEmail: "operator@example.test", minimumSeverity: "high" } });
    await ensureSeededSecurityRules();
    const rule = await prisma.detectionRule.findFirstOrThrow({ where: { queryJson: { path: ["ruleKey"], equals: "linux.auth-failure-burst" } } });
    const savedState = JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as Record<string, unknown>;
    await fs.writeFile(STATE_FILE, JSON.stringify({ ...savedState, ruleId: rule.id, ruleEnabled: rule.enabled }), "utf8");
    await prisma.detectionRule.update({ where: { id: rule.id }, data: { enabled: true } });
    const device = await prisma.device.create({ data: { name: DEVICE_NAME, vendor: "Linux", type: "linux_edge", host: "192.0.2.229", managementPort: 22, protocol: "ssh", environment: "lab" } });
    for (let index = 0; index < 5; index += 1) await createSecurityEvent({ deviceId: device.id, vendor: "linux", eventType: "auth", srcIp: "198.51.100.229", rawMessage: `sshd: Failed password for invalid user restart-${index}` });
    await runSecurityDetection({ deviceId: device.id });
    await runSecurityDetection({ deviceId: device.id });
    await createSecurityEvent({ deviceId: device.id, vendor: "linux", eventType: "auth", srcIp: "198.51.100.229", rawMessage: "sshd: Failed password for invalid user restart-new" });
    await runSecurityDetection({ deviceId: device.id });
    for (let index = 0; index < 3; index += 1) {
      await createSecurityEvent({ deviceId: device.id, vendor: "linux", eventType: "privilege", username: "operator", rawMessage: `sudo: authentication failure for operator non-priority-${index}` });
    }
    await runSecurityDetection({ deviceId: device.id });
    const findingIds = (await prisma.finding.findMany({ where: { deviceId: device.id, source: "seeded_detection_rule" }, select: { id: true } })).map((item) => item.id);
    const deliveries = await prisma.securityAlertDelivery.count({ where: { findingId: { in: findingIds } } });
    if (smtp.messages() !== 2 || deliveries !== 2 || !smtp.body().includes("هشدار امنیتی جدید")) throw new Error("EMAIL_PHASE1_FAILED");
    console.log(JSON.stringify({ ok: true, phase: 1, smtpMessages: smtp.messages(), deliveries, persianBody: true, allHighSeverityRulesAlert: true }));
  } else {
    const device = await prisma.device.findFirstOrThrow({ where: { name: DEVICE_NAME } });
    const findingIds = (await prisma.finding.findMany({ where: { deviceId: device.id, source: "seeded_detection_rule" }, select: { id: true } })).map((item) => item.id);
    const before = await prisma.securityAlertDelivery.count({ where: { findingId: { in: findingIds } } });
    await runSecurityDetection({ deviceId: device.id });
    const after = await prisma.securityAlertDelivery.count({ where: { findingId: { in: findingIds } } });
    if (before !== 2 || after !== 2 || smtp.messages() !== 0) throw new Error("EMAIL_RESTART_DEDUPE_FAILED");
    const original = JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as { exists: boolean; enabled?: boolean; recipientEmail?: string | null; minimumSeverity?: string; lastTestedAt?: string | null; lastTestStatus?: string | null; lastErrorCode?: string | null; ruleId?: string; ruleEnabled?: boolean; channelEnabledStates?: Array<{ id: string; enabled: boolean }> };
    await prisma.securityAlertDelivery.deleteMany({ where: { findingId: { in: findingIds } } });
    await prisma.finding.deleteMany({ where: { deviceId: device.id } });
    await prisma.securityEvent.deleteMany({ where: { deviceId: device.id } });
    await prisma.asset.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    if (original.exists) await prisma.securityAlertChannel.update({ where: { id: "primary-email" }, data: { enabled: original.enabled, recipientEmail: original.recipientEmail, minimumSeverity: original.minimumSeverity, lastTestedAt: original.lastTestedAt ? new Date(original.lastTestedAt) : null, lastTestStatus: original.lastTestStatus, lastErrorCode: original.lastErrorCode } });
    else await prisma.securityAlertChannel.delete({ where: { id: "primary-email" } });
    for (const channel of original.channelEnabledStates ?? []) {
      if (channel.id !== "primary-email") await prisma.securityAlertChannel.updateMany({ where: { id: channel.id }, data: { enabled: channel.enabled } });
    }
    if (original.ruleId) await prisma.detectionRule.update({ where: { id: original.ruleId }, data: { enabled: original.ruleEnabled } });
    await fs.unlink(STATE_FILE).catch(() => undefined);
    console.log(JSON.stringify({ ok: true, phase: 2, deliveriesBeforeRestart: before, deliveriesAfterRestart: after, smtpMessagesAfterRestart: smtp.messages(), restored: true }));
  }
} finally {
  await new Promise<void>((resolve) => smtp.server.close(() => resolve()));
  await shutdownDatabase();
}
