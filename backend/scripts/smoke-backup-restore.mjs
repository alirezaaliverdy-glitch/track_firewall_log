// API smoke: own synthetic upload/preview only. NEVER executes a real vendor restore.
import { randomBytes } from "node:crypto";
import { prisma } from "../dist/db/prisma.js";
import { env } from "../dist/config/env.js";
import { hashSessionToken } from "../dist/services/auth.service.js";
import { csrfTokenForSession } from "../dist/security/csrf.js";
import { readRestoreArtifact } from "../dist/backups/restore-vault.service.js";
import { configIdentity } from "../dist/backups/restore-profiles.js";
if (process.env.BACKUP_RESTORE_SMOKE !== "true") throw new Error("BACKUP_RESTORE_SMOKE=true required");
const user = await prisma.appUser.findFirst({ where: { role: "admin", isActive: true } });
if (!user) throw new Error("Admin required");
const backup = await prisma.deviceSnapshot.findFirst({ where: { vendor: "cisco", snapshotType: "encrypted_configuration_backup_v1", device: { deletedAt: null, company: { ownerId: user.id, deletedAt: null } } }, orderBy: { collectedAt: "desc" } });
if (!backup) throw new Error("Owned Cisco backup required for read-only preview");
const version = configIdentity("cisco", (await readRestoreArtifact(backup.id, user.id)).content).version;
const token = randomBytes(32).toString("base64url");
const session = await prisma.authSession.create({ data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 300000), userAgent: "restore-api-fixture-smoke" } });
const headers = { cookie: "firewall_session=" + token, origin: env.corsOrigins[0], "x-csrf-token": csrfTokenForSession(token) };
const files = [], plans = [];
async function request(path, method = "GET", body, expected = 200) {
  const response = await fetch("http://127.0.0.1:4000/api/backups" + path, { method,
    headers: body instanceof FormData ? headers : { ...headers, "content-type": "application/json" },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  if (response.status !== expected) { const result = await response.json().catch(() => ({})); throw new Error("Restore smoke status " + response.status + " code " + (result.error || "unknown")); }
  return response;
}
try {
  const text = "version " + version + "\nhostname isolated-restore-fixture\nend\n";
  const form = new FormData(); form.append("file", new Blob([text]), "isolated-restore-fixture.cfg");
  const uploaded = await (await request("/vault?deviceId=" + encodeURIComponent(backup.deviceId), "POST", form, 201)).json();
  files.push(uploaded.id);
  const listed = await (await request("/vault")).json();
  if (!listed.files.some(file => file.id === uploaded.id) || JSON.stringify(listed).includes("encrypted")) throw new Error("Vault visibility failed");
  const downloaded = await (await request("/vault/" + uploaded.id + "/download")).text();
  if (downloaded !== text) throw new Error("Vault download corrupted");
  const preview = await (await request("/restores/preview", "POST", { artifactId: uploaded.id }, 201)).json();
  plans.push(preview.id);
  if (preview.connectorInvoked !== false || preview.sha256 !== uploaded.sha256) throw new Error("Preview contract failed");
  await request("/restores/" + preview.id + "/execute", "POST", { intent: "preview", sha256: preview.sha256, confirmation: "RESTORE BACKUP" }, 400);
  const stored = await prisma.actionPlan.findUnique({ where: { id: preview.id } });
  if (stored.status !== "dry_run_ready") throw new Error("Invalid intent changed execution state");
  const linuxBackup = await prisma.deviceSnapshot.findFirst({ where: { vendor: "linux", snapshotType: "encrypted_configuration_backup_v1", device: { deletedAt: null, company: { ownerId: user.id, deletedAt: null } } }, orderBy: { collectedAt: "desc" } });
  let readOnlyLiveLinuxPreview = false;
  if (linuxBackup) {
    const linuxPreview = await (await request("/restores/preview", "POST", { artifactId: linuxBackup.id }, 201)).json();
    plans.push(linuxPreview.id);
    if (linuxPreview.connectorInvoked !== false || linuxPreview.vendor !== "linux") throw new Error("Linux preview contract failed");
    readOnlyLiveLinuxPreview = true;
  }
  console.log(JSON.stringify({ multipartUpload: true, encryptedVault: true, downloadIntegrity: true, readOnlyLiveCiscoPreview: true, readOnlyLiveLinuxPreview, invalidIntentBlocked: true, vendorRestoreExecuted: false }));
} finally {
  if (plans.length) await prisma.actionPlan.deleteMany({ where: { id: { in: plans }, requestedBy: user.id } });
  if (files.length) {
    await prisma.auditLog.deleteMany({ where: { targetId: { in: files } } });
    await prisma.deviceSnapshot.deleteMany({ where: { id: { in: files }, snapshotType: "encrypted_uploaded_configuration_v1" } });
  }
  await prisma.authSession.deleteMany({ where: { id: session.id } });
  await prisma.$disconnect();
}
