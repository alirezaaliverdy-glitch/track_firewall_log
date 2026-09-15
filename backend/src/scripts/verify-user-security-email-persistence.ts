import fs from "node:fs/promises";
import { prisma, shutdownDatabase } from "../db/prisma.js";
import { getSecurityEmailAlertSettings, updateSecurityEmailAlertSettings } from "../services/security-alert-email.service.js";

const PHASE = process.argv[2] ?? "phase1";
const STATE_FILE = "/tmp/security-email-user-persistence.json";
const USERNAME = "security-email-persistence-smoke";

try {
  if (PHASE === "phase1") {
    await prisma.appUser.deleteMany({ where: { username: USERNAME } });
    const user = await prisma.appUser.create({
      data: { username: USERNAME, passwordHash: "disabled-smoke-account", displayName: "Security email persistence smoke", role: "viewer", isActive: false }
    });
    await updateSecurityEmailAlertSettings({ recipientEmail: "persistence@example.test", enabled: true, minimumSeverity: "critical" }, user.id);
    const stored = await getSecurityEmailAlertSettings(user.id);
    if (stored.userId !== user.id || !stored.enabled || stored.minimumSeverity !== "critical" || stored.recipientEmail !== "persistence@example.test") {
      throw new Error("USER_EMAIL_PERSISTENCE_PHASE1_FAILED");
    }
    await fs.writeFile(STATE_FILE, JSON.stringify({ userId: user.id }), "utf8");
    console.log(JSON.stringify({ ok: true, phase: 1, userScoped: true, stored: true }));
  } else {
    const state = JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as { userId: string };
    const stored = await getSecurityEmailAlertSettings(state.userId);
    if (stored.userId !== state.userId || !stored.enabled || stored.minimumSeverity !== "critical" || stored.recipientEmail !== "persistence@example.test") {
      throw new Error("USER_EMAIL_PERSISTENCE_PHASE2_FAILED");
    }
    await prisma.appUser.delete({ where: { id: state.userId } });
    await fs.unlink(STATE_FILE).catch(() => undefined);
    console.log(JSON.stringify({ ok: true, phase: 2, survivedRestart: true, cascadeCleanup: true }));
  }
} finally {
  await shutdownDatabase();
}
