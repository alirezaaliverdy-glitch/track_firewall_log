// Run inside the API container with BACKUP_SMOKE_LIVE=true.
// Creates real read-only backups for one device per supported vendor.
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../dist/db/prisma.js";
import { env } from "../dist/config/env.js";
import { hashSessionToken } from "../dist/services/auth.service.js";
import { csrfTokenForSession } from "../dist/security/csrf.js";
if (process.env.BACKUP_SMOKE_LIVE !== "true") throw new Error("Explicit BACKUP_SMOKE_LIVE=true is required.");
const user = await prisma.appUser.findFirst({ where: { role: "admin", isActive: true }, select: { id: true } });
if (!user) throw new Error("No active admin for scoped smoke test");
const token = randomBytes(32).toString("base64url");
const session = await prisma.authSession.create({ data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 300000), userAgent: "backup-smoke-test" } });
const headers = { cookie: "firewall_session=" + token, origin: env.corsOrigins[0], "x-csrf-token": csrfTokenForSession(token), "content-type": "application/json" };
try {
  const response = await fetch("http://127.0.0.1:4000/api/backups", { headers });
  if (!response.ok) throw new Error("Backup list status " + response.status);
  const data = await response.json();
  console.log(JSON.stringify({ stage: "inventory", devices: data.devices.length, files: data.history.length }));
  const candidates = [...new Map(data.devices.filter(d => d.profile.supported).map(d => [d.vendor, d])).values()];
  for (const device of candidates) {
    const result = await fetch("http://127.0.0.1:4000/api/backups", { method: "POST", headers, body: JSON.stringify({ deviceId: device.id }), signal: AbortSignal.timeout(110000) });
    const item = await result.json();
    if (!result.ok) { console.log(JSON.stringify({ vendor: device.vendor, status: result.status, error: item.error, code: item.code })); continue; }
    const file = await fetch("http://127.0.0.1:4000/api/backups/" + item.id + "/download", { headers });
    const content = Buffer.from(await file.arrayBuffer());
    const verified = file.ok && createHash("sha256").update(content).digest("hex") === item.sha256;
    console.log(JSON.stringify({ vendor: device.vendor, status: file.status, bytes: content.length, hashVerified: verified }));
    if (!verified) throw new Error("Download integrity failed");
  }
  const historyResponse = await fetch("http://127.0.0.1:4000/api/backups/activity?page=1", { headers });
  if (!historyResponse.ok) throw new Error("Backup history status " + historyResponse.status);
  const history = await historyResponse.json();
  if (history.items.some(item => "encrypted" in item || !item.createdAt || !item.actorName)) throw new Error("Invalid or unsafe history");
  console.log(JSON.stringify({ stage: "activity", total: history.total, items: history.items.length, actions: [...new Set(history.items.map(item => item.action))] }));
} finally {
  await prisma.authSession.deleteMany({ where: { id: session.id } });
  await prisma.$disconnect();
}
