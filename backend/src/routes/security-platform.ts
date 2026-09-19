import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db/prisma.js";
import { parseEventFilters, listSecurityEvents } from "../services/event.service.js";
import {
  createFindingActionPlan,
  createSecurityEvent,
  ensureSeededSecurityRules,
  listSecurityFindings,
  runSecurityDetection,
  validateRuleDsl
} from "../assets/asset-intelligence.service.js";
import { mockWazuhAssets, mockWazuhEvents, mockWazuhHealth } from "../integrations/wazuh/mock-adapter.js";
import { applyAssetImport, previewAssetImport } from "../assets/asset-intelligence.service.js";
import { getFindingEvidence, listPublicVendorTelemetryProfiles } from "../services/finding-evidence.service.js";
import { getAttackerDetails, listAttackers } from "../services/attacker-intelligence.service.js";
import { connectGmailSecuritySender, disconnectGmailSecuritySender, getSecurityEmailAlertSettings, sendSecurityEmailTest, sendSecurityVendorEmailTests, updateSecurityEmailAlertSettings } from "../services/security-alert-email.service.js";
import { getSecurityMonitorStatus } from "../services/security-monitor.service.js";
import { createTrustedSourceIp, deleteTrustedSourceIp, listTrustedSourceIps, TRUSTED_SOURCE_VENDORS } from "../services/trusted-source-ip.service.js";
import { scheduleSecurityDetection } from "../services/security-detection-dispatcher.service.js";

export const securityPlatformRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: Record<string, unknown> }>("/api/security/events", async (request) => listSecurityEvents(parseEventFilters(request.query ?? {})));

  app.post<{ Body: Record<string, unknown> }>("/api/security/events", async (request, reply) => {
    const event = await createSecurityEvent(request.body ?? {});
    const detection = await scheduleSecurityDetection({ deviceId: event.deviceId ?? undefined, assetId: event.assetId ?? undefined });
    return reply.code(201).send({ event, detection });
  });

  app.get<{ Querystring: { vendor?: string; deviceId?: string; status?: string } }>("/api/security/findings", async (request) => listSecurityFindings(request.query ?? {}));

  app.get("/api/security/vendor-profiles", async () => ({ profiles: listPublicVendorTelemetryProfiles() }));

  app.get<{ Querystring: { query?: string; vendor?: string; deviceId?: string; severity?: string; scope?: string; includeResolved?: string } }>("/api/security/attackers", async (request) => {
    return listAttackers({
      ...request.query,
      includeResolved: request.query?.includeResolved === "true"
    });
  });

  app.get<{ Params: { ip: string }; Querystring: { vendor?: string; deviceId?: string; includeResolved?: string } }>("/api/security/attackers/:ip", async (request, reply) => {
    const result = await getAttackerDetails(request.params.ip, {
      ...request.query,
      includeResolved: request.query?.includeResolved === "true"
    });
    return result ?? reply.code(404).send({ error: "Qualified attacker IP not found" });
  });

  app.get("/api/security/attackers-allowlist", async (request, reply) => {
    if (request.authUser?.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
    return { entries: await listTrustedSourceIps(), vendors: TRUSTED_SOURCE_VENDORS };
  });

  app.post<{ Body: { ip?: unknown; vendor?: unknown; label?: unknown } }>("/api/security/attackers-allowlist", async (request, reply) => {
    if (request.authUser?.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
    try {
      const entry = await createTrustedSourceIp(request.body ?? {}, request.authUser.username);
      void prisma.auditLog.create({ data: { actor: request.authUser.username, action: "security.trusted_source.create", targetType: "trusted_source_ip", targetId: entry.id, dryRun: false, approvalStatus: "not_required", metadata: { ip: entry.ip, vendor: entry.vendor } } }).catch(() => undefined);
      return reply.code(201).send({ entry });
    } catch (error) {
      const code = error instanceof Error ? error.message : "TRUSTED_SOURCE_CREATE_FAILED";
      return reply.code(400).send({ error: code });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/security/attackers-allowlist/:id", async (request, reply) => {
    if (request.authUser?.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
    try {
      const entry = await deleteTrustedSourceIp(request.params.id);
      void prisma.auditLog.create({ data: { actor: request.authUser.username, action: "security.trusted_source.delete", targetType: "trusted_source_ip", targetId: entry.id, dryRun: false, approvalStatus: "not_required", metadata: { ip: entry.ip, vendor: entry.vendor } } }).catch(() => undefined);
      return { ok: true };
    } catch {
      return reply.code(404).send({ error: "TRUSTED_SOURCE_NOT_FOUND" });
    }
  });

  app.get<{ Params: { id: string } }>("/api/security/findings/:id", async (request, reply) => {
    const finding = await prisma.finding.findUnique({ where: { id: request.params.id }, include: { asset: true, device: true } });
    return finding ? finding : reply.code(404).send({ error: "Finding not found" });
  });

  app.get<{ Params: { id: string } }>("/api/security/findings/:id/evidence", async (request, reply) => {
    const evidence = await getFindingEvidence(request.params.id);
    return evidence ?? reply.code(404).send({ error: "Finding not found" });
  });

  app.patch<{ Params: { id: string }; Body: { status?: string } }>("/api/security/findings/:id/status", async (request, reply) => {
    const allowed = new Set(["active", "acknowledged", "resolved", "false_positive", "accepted_risk", "suppressed", "investigating"]);
    if (!request.body?.status || !allowed.has(request.body.status)) return reply.code(400).send({ error: "Invalid finding status" });
    return prisma.finding.update({ where: { id: request.params.id }, data: { status: request.body.status } });
  });

  app.post<{ Params: { id: string } }>("/api/security/findings/:id/action-plan", async (request, reply) => {
    const result = await createFindingActionPlan(request.params.id);
    return result ? reply.code(201).send(result) : reply.code(404).send({ error: "Finding not found" });
  });

  app.get("/api/security/rules", async () => {
    await ensureSeededSecurityRules();
    return { rules: await prisma.detectionRule.findMany({ orderBy: [{ enabled: "desc" }, { name: "asc" }] }) };
  });

  app.post<{ Params: { id: string } }>("/api/security/rules/:id/enable", async (request, reply) => {
    try { return await prisma.detectionRule.update({ where: { id: request.params.id }, data: { enabled: true } }); }
    catch { return reply.code(404).send({ error: "Detection rule not found" }); }
  });

  app.post<{ Params: { id: string } }>("/api/security/rules/:id/disable", async (request, reply) => {
    try { return await prisma.detectionRule.update({ where: { id: request.params.id }, data: { enabled: false } }); }
    catch { return reply.code(404).send({ error: "Detection rule not found" }); }
  });

  app.post<{ Body: Record<string, unknown> }>("/api/security/rules/test", async (request, reply) => {
    const result = validateRuleDsl(request.body ?? {});
    return result.valid ? result : reply.code(400).send(result);
  });

  app.post<{ Body: { deviceId?: string; assetId?: string } }>("/api/security/detections/run", async (request) => runSecurityDetection(request.body ?? {}));

  app.get("/api/security/monitoring/status", async () => getSecurityMonitorStatus());

  app.get("/api/security/alerts/email", async (request) => getSecurityEmailAlertSettings(request.authUser?.id));

  app.put<{ Body: { recipientEmail?: unknown; recipientEmails?: unknown; enabled?: unknown; minimumSeverity?: unknown } }>("/api/security/alerts/email", async (request, reply) => {
    if (request.authUser && request.authUser.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
    try { return await updateSecurityEmailAlertSettings(request.body ?? {}, request.authUser?.id); }
    catch (error) {
      const code = error instanceof Error ? error.message : "EMAIL_SETTINGS_FAILED";
      return reply.code(400).send({ error: code });
    }
  });

  app.put<{ Body: { senderEmail?: unknown; appPassword?: unknown } }>("/api/security/alerts/email/gmail", async (request, reply) => {
    if (request.authUser?.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
    try { return await connectGmailSecuritySender(request.body ?? {}, request.authUser.id); }
    catch (error) {
      const code = error instanceof Error ? error.message : "GMAIL_CONNECTION_FAILED";
      return reply.code(code === "SMTP_TIMEOUT" || code === "SMTP_HOST_UNREACHABLE" || code === "SMTP_CONNECTION_FAILED" ? 503 : 400).send({ error: code });
    }
  });

  app.delete("/api/security/alerts/email/gmail", async (request, reply) => {
    if (request.authUser?.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
    return disconnectGmailSecuritySender(request.authUser.id);
  });

  app.post("/api/security/alerts/email/test", async (request, reply) => {
    if (request.authUser && request.authUser.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
    try { return await sendSecurityEmailTest(request.authUser?.id); }
    catch (error) {
      const code = error instanceof Error ? error.message : "EMAIL_TEST_FAILED";
      return reply.code(code === "SMTP_NOT_CONFIGURED" ? 503 : 400).send({ error: code });
    }
  });

  app.post("/api/security/alerts/email/test-vendors", async (request, reply) => {
    if (request.authUser?.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
    try { return await sendSecurityVendorEmailTests(request.authUser.id); }
    catch (error) {
      const code = error instanceof Error ? error.message : "VENDOR_EMAIL_TEST_FAILED";
      return reply.code(code === "SMTP_NOT_CONFIGURED" ? 503 : 400).send({ error: code });
    }
  });

  app.get("/api/integrations/wazuh/health", async () => mockWazuhHealth());
  app.get("/api/integrations/wazuh/sync-preview", async () => previewAssetImport({ sourceType: "wazuh", assets: mockWazuhAssets() }));
  app.post<{ Body: { idempotencyKey?: string; deviceId?: string; assetId?: string } }>("/api/integrations/wazuh/sync", async (request) => {
    const imported = await applyAssetImport({ sourceType: "wazuh", idempotencyKey: request.body?.idempotencyKey ?? "mock-wazuh-default", assets: mockWazuhAssets() });
    for (const event of mockWazuhEvents(request.body?.deviceId, request.body?.assetId)) await createSecurityEvent(event);
    const detection = await runSecurityDetection({ deviceId: request.body?.deviceId, assetId: request.body?.assetId });
    return { imported, detection };
  });
};
