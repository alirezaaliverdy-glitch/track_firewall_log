import crypto from "node:crypto";
import { Prisma, type DetectionRule, type Finding, type SecurityAlertChannel } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { PRIORITY_EMAIL_RULE_LABELS_FA } from "../security/vendor-detection-rule-library.js";
import { decryptSecret, encryptSecret } from "./credential-crypto.service.js";
import { sendSmtpMail, verifySmtpConnection, type SmtpConfig } from "./smtp-client.js";
import { gmailSmtpConfig, normalizeGmailAppPassword } from "./gmail-smtp.js";
import { normalizeSecurityAlertRecipients } from "./security-email-recipients.js";
import { isRetryableSecurityEmailError, nextSecurityEmailRetryAt } from "./security-email-retry.js";

const LEGACY_CHANNEL_ID = "primary-email";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEVERITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

function channelRecipients(channel: SecurityAlertChannel) {
  const recipients = normalizeSecurityAlertRecipients(channel.recipientEmails);
  if (channel.recipientEmail && !recipients.includes(channel.recipientEmail.toLowerCase())) recipients.unshift(channel.recipientEmail.toLowerCase());
  return recipients;
}

function serverSmtpConfig(): SmtpConfig | null {
  const credentialsComplete = (!env.smtpUsername && !env.smtpPassword) || Boolean(env.smtpUsername && env.smtpPassword);
  const from = env.smtpFrom || (env.smtpUsername && EMAIL_PATTERN.test(env.smtpUsername) ? env.smtpUsername : undefined);
  if (!env.smtpHost || !from || !credentialsComplete) return null;
  return {
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    startTls: env.smtpStartTls,
    username: env.smtpUsername,
    password: env.smtpPassword,
    from
  };
}

function personalGmailSmtpConfig(channel: SecurityAlertChannel): SmtpConfig | null {
  if (channel.senderProvider === "gmail" && channel.senderEmail && channel.senderSecretEncrypted) {
    try {
      const appPassword = decryptSecret(channel.senderSecretEncrypted);
      if (appPassword) return gmailSmtpConfig(channel.senderEmail, appPassword);
    } catch {
      return null;
    }
  }
  return null;
}

function channelSmtpConfig(channel: SecurityAlertChannel): SmtpConfig | null {
  return personalGmailSmtpConfig(channel) ?? serverSmtpConfig();
}

function hasChannelSmtpConfig(channel: SecurityAlertChannel) {
  return Boolean(channelSmtpConfig(channel));
}

function errorCode(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  if (/SMTP_RESPONSE_535/.test(value)) return "SMTP_AUTH_FAILED";
  if (/SMTP_RESPONSE_(421|450|451|452)/.test(value)) return "SMTP_TEMPORARY_REJECTED";
  if (/SMTP_TIMEOUT/.test(value)) return "SMTP_TIMEOUT";
  if (/ENOTFOUND|EAI_AGAIN/.test(value)) return "SMTP_HOST_UNREACHABLE";
  if (/ECONNREFUSED|CONNECTION_CLOSED/.test(value)) return "SMTP_CONNECTION_FAILED";
  if (/CREDENTIAL_ENCRYPTION_KEY/.test(value)) return "SECRET_ENCRYPTION_NOT_CONFIGURED";
  if (/INVALID_GMAIL_APP_PASSWORD/.test(value)) return "INVALID_GMAIL_APP_PASSWORD";
  return "SMTP_SEND_FAILED";
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function channelIdForUser(userId: string) {
  return `user-email-${crypto.createHash("sha256").update(userId).digest("hex").slice(0, 24)}`;
}

async function getOrCreateChannel(userId?: string) {
  if (!userId) {
    return prisma.securityAlertChannel.upsert({ where: { id: LEGACY_CHANNEL_ID }, update: {}, create: { id: LEGACY_CHANNEL_ID } });
  }
  const existing = await prisma.securityAlertChannel.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.securityAlertChannel.create({ data: { id: channelIdForUser(userId), userId } });
}

export async function getSecurityEmailAlertSettings(userId?: string) {
  let channel = await getOrCreateChannel(userId);
  if (!["high", "critical"].includes(channel.minimumSeverity)) {
    channel = await prisma.securityAlertChannel.update({ where: { id: channel.id }, data: { minimumSeverity: "high" } });
  }
  const deliveries = await prisma.securityAlertDelivery.findMany({ where: { channelId: channel.id }, orderBy: { attemptedAt: "desc" }, take: 30, select: { id: true, status: true, errorCode: true, attemptCount: true, nextAttemptAt: true, attemptedAt: true, sentAt: true, findingId: true, ruleId: true, recipientEmail: true, metadataJson: true } });
  const [findings, rules] = await Promise.all([
    prisma.finding.findMany({ where: { id: { in: [...new Set(deliveries.map((item) => item.findingId))] } }, select: { id: true, title: true, vendor: true, severity: true, device: { select: { name: true } } } }),
    prisma.detectionRule.findMany({ where: { id: { in: [...new Set(deliveries.map((item) => item.ruleId).filter((id): id is string => Boolean(id)))] } }, select: { id: true, name: true, queryJson: true } })
  ]);
  const findingById = new Map(findings.map((item) => [item.id, item]));
  const ruleById = new Map(rules.map((item) => [item.id, item]));
  const personalGmail = personalGmailSmtpConfig(channel);
  const serverSmtp = serverSmtpConfig();
  return {
    id: channel.id,
    userId: channel.userId,
    enabled: channel.enabled,
    recipientEmail: channel.recipientEmail,
    recipientEmails: channelRecipients(channel),
    minimumSeverity: channel.minimumSeverity,
    smtpConfigured: Boolean(personalGmail ?? serverSmtp),
    sender: {
      provider: channel.senderProvider,
      email: channel.senderEmail,
      connected: Boolean(personalGmail),
      connectedAt: channel.senderConnectedAt,
      testedAt: channel.senderTestedAt,
      testStatus: channel.senderTestStatus,
      source: personalGmail ? "personal_gmail" : serverSmtp ? "server" : "none"
    },
    lastTestedAt: channel.lastTestedAt,
    lastTestStatus: channel.lastTestStatus,
    lastErrorCode: channel.lastErrorCode,
    deliveries: deliveries.map((delivery) => {
      const finding = findingById.get(delivery.findingId);
      const rule = delivery.ruleId ? ruleById.get(delivery.ruleId) : undefined;
      const query = rule?.queryJson && typeof rule.queryJson === "object" ? rule.queryJson as Record<string, unknown> : null;
      const ruleKey = String(query?.ruleKey ?? "");
      return {
        ...delivery,
        reason: {
          titleFa: PRIORITY_EMAIL_RULE_LABELS_FA[ruleKey] ?? rule?.name ?? finding?.title ?? "هشدار امنیتی",
          titleEn: rule?.name ?? finding?.title ?? "Security alert",
          findingTitle: finding?.title ?? null,
          deviceName: finding?.device.name ?? null,
          vendor: finding?.vendor ?? null,
          severity: finding?.severity ?? null
        }
      };
    })
  };
}

export async function updateSecurityEmailAlertSettings(input: { recipientEmail?: unknown; recipientEmails?: unknown; enabled?: unknown; minimumSeverity?: unknown }, userId?: string) {
  const recipientEmails = normalizeSecurityAlertRecipients(input.recipientEmails ?? input.recipientEmail);
  const recipientEmail = recipientEmails[0] ?? null;
  const minimumSeverity = String(input.minimumSeverity ?? "high").toLowerCase();
  if (!["high", "critical"].includes(minimumSeverity)) throw new Error("INVALID_MINIMUM_SEVERITY");
  const enabled = input.enabled === true;
  if (enabled && !recipientEmails.length) throw new Error("RECIPIENT_EMAIL_REQUIRED");
  const channel = await getOrCreateChannel(userId);
  if (enabled && !hasChannelSmtpConfig(channel)) throw new Error("EMAIL_SENDER_NOT_CONNECTED");
  await prisma.securityAlertChannel.update({ where: { id: channel.id }, data: { recipientEmail, recipientEmails, enabled, minimumSeverity, lastErrorCode: null } });
  return getSecurityEmailAlertSettings(userId);
}

export async function connectGmailSecuritySender(input: { senderEmail?: unknown; appPassword?: unknown }, userId?: string) {
  const senderEmail = String(input.senderEmail ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(senderEmail)) throw new Error("INVALID_SENDER_EMAIL");
  const appPassword = normalizeGmailAppPassword(input.appPassword);
  if (!env.credentialEncryptionKey) throw new Error("SECRET_ENCRYPTION_NOT_CONFIGURED");
  const channel = await getOrCreateChannel(userId);
  const existingRecipients = channelRecipients(channel);
  const testedAt = new Date();
  try {
    await verifySmtpConnection(gmailSmtpConfig(senderEmail, appPassword));
    await prisma.securityAlertChannel.update({
      where: { id: channel.id },
      data: {
        senderProvider: "gmail",
        senderEmail,
        senderSecretEncrypted: encryptSecret(appPassword),
        senderConnectedAt: testedAt,
        senderTestedAt: testedAt,
        senderTestStatus: "succeeded",
        lastErrorCode: null,
        ...(existingRecipients.length ? {} : { recipientEmail: senderEmail, recipientEmails: [senderEmail] })
      }
    });
    return getSecurityEmailAlertSettings(userId);
  } catch (error) {
    const code = errorCode(error);
    await prisma.securityAlertChannel.update({ where: { id: channel.id }, data: { senderTestedAt: testedAt, senderTestStatus: "failed", lastErrorCode: code } });
    throw new Error(code);
  }
}

export async function disconnectGmailSecuritySender(userId?: string) {
  const channel = await getOrCreateChannel(userId);
  await prisma.securityAlertChannel.update({
    where: { id: channel.id },
    data: {
      enabled: false,
      senderProvider: null,
      senderEmail: null,
      senderSecretEncrypted: null,
      senderConnectedAt: null,
      senderTestedAt: null,
      senderTestStatus: null,
      lastErrorCode: null
    }
  });
  return getSecurityEmailAlertSettings(userId);
}

export async function sendSecurityEmailTest(userId?: string) {
  const channel = await getOrCreateChannel(userId);
  const config = channelSmtpConfig(channel);
  const recipients = channelRecipients(channel);
  if (!recipients.length) throw new Error("RECIPIENT_EMAIL_REQUIRED");
  if (!config) throw new Error("SMTP_NOT_CONFIGURED");
  try {
    await Promise.all(recipients.map((to) => sendSmtpMail(config, {
      to,
      subject: "تست اعلان امنیتی Mini-SOAR",
      text: "ارسال ایمیل امنیتی با موفقیت آزمایش شد. این پیام یک هشدار واقعی نیست.",
      html: "<div dir=\"rtl\"><h2>تست اعلان امنیتی</h2><p>ارسال ایمیل با موفقیت آزمایش شد. این پیام یک هشدار واقعی نیست.</p></div>"
    })));
    await prisma.securityAlertChannel.update({ where: { id: channel.id }, data: { lastTestedAt: new Date(), lastTestStatus: "succeeded", lastErrorCode: null } });
    return { ok: true };
  } catch (error) {
    const code = errorCode(error);
    await prisma.securityAlertChannel.update({ where: { id: channel.id }, data: { lastTestedAt: new Date(), lastTestStatus: "failed", lastErrorCode: code } });
    throw new Error(code);
  }
}

async function sendFindingMessage(config: SmtpConfig, input: { finding: Finding; rule: DetectionRule; recipientEmail: string }) {
  const ruleQuery = input.rule.queryJson && typeof input.rule.queryJson === "object" ? input.rule.queryJson as Record<string, unknown> : null;
  const device = await prisma.device.findUnique({ where: { id: input.finding.deviceId }, select: { name: true, host: true } });
  const url = `${env.publicAppUrl}/security/findings/${encodeURIComponent(input.finding.id)}`;
  const severityFa: Record<string, string> = { critical: "بحرانی", high: "مهم", medium: "متوسط", low: "کم" };
  const vendorFa: Record<string, string> = { linux: "Linux", mikrotik: "MikroTik", fortigate: "FortiGate", cisco: "Cisco", pfsense: "pfSense" };
  const ruleKey = String(ruleQuery?.ruleKey ?? "");
  const ruleTitleFa = PRIORITY_EMAIL_RULE_LABELS_FA[ruleKey] ?? input.rule.name ?? "رخداد امنیتی";
  const deviceLabel = device?.name ? `${device.name}${device.host ? ` (${device.host})` : ""}` : input.finding.deviceId;
  const summaryFa = `قانون «${ruleTitleFa}» بر اساس شواهد واقعی ثبت‌شده برای این دستگاه فعال شده است.`;
  await sendSmtpMail(config, {
    to: input.recipientEmail,
    subject: `[هشدار ${severityFa[input.finding.severity] ?? "امنیتی"}] ${ruleTitleFa}`,
    text: ["هشدار امنیتی جدید", `قانون: ${ruleTitleFa}`, `وندور: ${vendorFa[String(input.finding.vendor).toLowerCase()] ?? input.finding.vendor}`, `شدت: ${severityFa[input.finding.severity] ?? input.finding.severity}`, `دستگاه: ${deviceLabel}`, summaryFa, `بررسی یافته: ${url}`].join("\n"),
    html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9"><h2>هشدار امنیتی جدید</h2><p><strong>${escapeHtml(ruleTitleFa)}</strong></p><p>${escapeHtml(summaryFa)}</p><ul><li>وندور: ${escapeHtml(vendorFa[String(input.finding.vendor).toLowerCase()] ?? input.finding.vendor)}</li><li>شدت: ${escapeHtml(severityFa[input.finding.severity] ?? input.finding.severity)}</li><li>دستگاه: ${escapeHtml(deviceLabel)}</li></ul><p><a href="${escapeHtml(url)}">مشاهده و بررسی یافته</a></p></div>`
  });
}

async function notifyChannel(channel: SecurityAlertChannel, config: SmtpConfig, input: { finding: Finding; rule: DetectionRule; eventIds: string[] }) {
  const recipients = channelRecipients(channel);
  if (!recipients.length) return [{ status: "skipped" as const }];
  if ((SEVERITY_RANK[input.finding.severity] ?? 0) < (SEVERITY_RANK[channel.minimumSeverity] ?? 3)) return [{ status: "below_threshold" as const }];
  const uniqueEventIds = [...new Set(input.eventIds)].sort();
  if (!uniqueEventIds.length) return [{ status: "duplicate" as const }];
  const threshold = input.rule.thresholdJson && typeof input.rule.thresholdJson === "object" ? input.rule.thresholdJson as Record<string, unknown> : {};
  const configuredWindow = Number(threshold.windowMinutes ?? 15);
  const cooldownMinutes = Math.max(5, Number.isFinite(configuredWindow) ? configuredWindow : 15);
  const results = await Promise.all(recipients.map(async (recipientEmail) => {
    const recentDelivery = await prisma.securityAlertDelivery.findFirst({
      where: { channelId: channel.id, findingId: input.finding.id, recipientEmail, status: { in: ["sending", "sent", "pending", "failed", "blocked"] }, attemptedAt: { gte: new Date(Date.now() - cooldownMinutes * 60_000) } },
      select: { id: true }
    });
    if (recentDelivery) return { status: "cooldown" as const };
    const eventFingerprint = crypto.createHash("sha256").update(`${channel.id}|${recipientEmail}|${uniqueEventIds.join("|")}`).digest("hex");
    try {
      await prisma.securityAlertDelivery.create({ data: { channelId: channel.id, findingId: input.finding.id, ruleId: input.rule.id, eventFingerprint, recipientEmail, status: "sending", metadataJson: { vendor: input.finding.vendor, severity: input.finding.severity, eventCount: uniqueEventIds.length, eventIds: uniqueEventIds.slice(0, 100), ruleName: input.rule.name, findingTitle: input.finding.title } as Prisma.InputJsonValue } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { status: "duplicate" as const };
      throw error;
    }
    try {
      await sendFindingMessage(config, { ...input, recipientEmail });
      await prisma.securityAlertDelivery.update({ where: { eventFingerprint }, data: { status: "sent", sentAt: new Date(), errorCode: null, nextAttemptAt: null } });
      return { status: "sent" as const };
    } catch (error) {
      const code = errorCode(error);
      const retryable = isRetryableSecurityEmailError(code);
      await prisma.securityAlertDelivery.update({ where: { eventFingerprint }, data: { status: retryable ? "pending" : "blocked", errorCode: code, nextAttemptAt: retryable ? nextSecurityEmailRetryAt(1) : null } });
      return { status: "failed" as const, errorCode: code };
    }
  }));
  const attempted = results.filter((result) => result.status === "sent" || result.status === "failed");
  if (attempted.length) {
    const failed = attempted.find((result): result is Extract<(typeof attempted)[number], { status: "failed" }> => result.status === "failed");
    await prisma.securityAlertChannel.update({ where: { id: channel.id }, data: { lastErrorCode: failed?.errorCode ?? null } });
  }
  return results;
}

export async function notifySecurityFinding(input: { finding: Finding; rule?: DetectionRule | null; eventIds: string[] }) {
  if (!input.rule) return { status: "rule_unavailable" as const, delivered: 0 };
  const channels = (await prisma.securityAlertChannel.findMany({ where: { enabled: true } })).filter((channel) => channelRecipients(channel).length > 0);
  if (!channels.length) return { status: "skipped" as const, delivered: 0 };
  const results = (await Promise.all(channels.map(async (channel) => {
    const config = channelSmtpConfig(channel);
    return config ? notifyChannel(channel, config, { ...input, rule: input.rule! }) : [{ status: "skipped" as const }];
  }))).flat();
  const delivered = results.filter((result) => result.status === "sent").length;
  const failed = results.filter((result) => result.status === "failed").length;
  return { status: failed ? "partial_failure" as const : delivered ? "sent" as const : "skipped" as const, delivered, failed };
}

export async function retryFailedSecurityAlertDeliveries(limit = 10) {
  const deliveries = await prisma.securityAlertDelivery.findMany({
    where: {
      status: { in: ["pending", "failed"] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }]
    },
    orderBy: { nextAttemptAt: "asc" },
    take: Math.max(1, Math.min(limit, 50))
  });
  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries) {
    const [channel, finding, rule] = await Promise.all([
      prisma.securityAlertChannel.findUnique({ where: { id: delivery.channelId } }),
      prisma.finding.findUnique({ where: { id: delivery.findingId } }),
      delivery.ruleId ? prisma.detectionRule.findUnique({ where: { id: delivery.ruleId } }) : null
    ]);
    if (!channel?.enabled || !finding || !rule) {
      await prisma.securityAlertDelivery.update({ where: { id: delivery.id }, data: { status: "cancelled", nextAttemptAt: null } });
      continue;
    }
    const config = channelSmtpConfig(channel);
    if (!config) {
      await prisma.securityAlertDelivery.update({ where: { id: delivery.id }, data: { status: "cancelled", nextAttemptAt: null, errorCode: "EMAIL_SENDER_NOT_CONNECTED" } });
      continue;
    }
    const attemptCount = delivery.attemptCount + 1;
    await prisma.securityAlertDelivery.update({ where: { id: delivery.id }, data: { status: "sending", attemptCount, attemptedAt: new Date(), nextAttemptAt: null } });
    try {
      await sendFindingMessage(config, { finding, rule, recipientEmail: delivery.recipientEmail });
      await prisma.$transaction([
        prisma.securityAlertDelivery.update({ where: { id: delivery.id }, data: { status: "sent", sentAt: new Date(), errorCode: null } }),
        prisma.securityAlertChannel.update({ where: { id: channel.id }, data: { lastErrorCode: null } })
      ]);
      sent += 1;
    } catch (error) {
      const code = errorCode(error);
      const retryable = isRetryableSecurityEmailError(code);
      await prisma.$transaction([
        prisma.securityAlertDelivery.update({ where: { id: delivery.id }, data: { status: retryable ? "pending" : "blocked", errorCode: code, nextAttemptAt: retryable ? nextSecurityEmailRetryAt(attemptCount) : null } }),
        prisma.securityAlertChannel.update({ where: { id: channel.id }, data: { lastErrorCode: code } })
      ]);
      failed += 1;
    }
  }
  return { attempted: deliveries.length, sent, failed };
}

const VENDOR_EMAIL_TESTS = [
  { vendor: "linux", label: "Linux" },
  { vendor: "mikrotik", label: "MikroTik" },
  { vendor: "fortigate", label: "FortiGate" },
  { vendor: "cisco", label: "Cisco" },
  { vendor: "pfsense", label: "pfSense" }
] as const;

export async function sendSecurityVendorEmailTests(userId?: string) {
  const channel = await getOrCreateChannel(userId);
  const config = channelSmtpConfig(channel);
  const recipients = channelRecipients(channel);
  if (!recipients.length) throw new Error("RECIPIENT_EMAIL_REQUIRED");
  if (!config) throw new Error("SMTP_NOT_CONFIGURED");
  const rules = await prisma.detectionRule.findMany({ where: { enabled: true }, orderBy: { updatedAt: "desc" } });
  const results: Array<{ vendor: string; status: "sent" | "failed"; ruleName?: string; errorCode?: string }> = [];
  for (const item of VENDOR_EMAIL_TESTS) {
    const rule = rules.find((candidate) => {
      const query = candidate.queryJson && typeof candidate.queryJson === "object" ? candidate.queryJson as Record<string, unknown> : {};
      return query.vendor === item.vendor && ["high", "critical"].includes(candidate.severity);
    });
    if (!rule) {
      results.push({ vendor: item.vendor, status: "failed", errorCode: "VENDOR_RULE_NOT_AVAILABLE" });
      continue;
    }
    const query = rule.queryJson && typeof rule.queryJson === "object" ? rule.queryJson as Record<string, unknown> : {};
    const ruleKey = String(query.ruleKey ?? "");
    const ruleTitleFa = PRIORITY_EMAIL_RULE_LABELS_FA[ruleKey] ?? rule.name;
    try {
      await Promise.all(recipients.map((to) => sendSmtpMail(config, {
        to,
        subject: `[آزمایش ایمیل ${item.label}] ${ruleTitleFa}`,
        text: [`آزمایش مسیر ارسال هشدار ${item.label}`, `قانون واقعی: ${ruleTitleFa}`, "این پیام فقط تست است و Finding واقعی ایجاد نشده است.", "مسیر Gmail و قالب ایمیل این وندور با موفقیت اجرا شد."].join("\n"),
        html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9"><h2>آزمایش هشدار ${escapeHtml(item.label)}</h2><p>قانون واقعی: <strong>${escapeHtml(ruleTitleFa)}</strong></p><p>این پیام فقط تست است و Finding واقعی ایجاد نشده است.</p><p style="color:#047857">مسیر Gmail و قالب ایمیل این وندور با موفقیت اجرا شد.</p></div>`
      })));
      results.push({ vendor: item.vendor, status: "sent", ruleName: rule.name });
    } catch (error) {
      results.push({ vendor: item.vendor, status: "failed", ruleName: rule.name, errorCode: errorCode(error) });
    }
  }
  const sent = results.filter((item) => item.status === "sent").length;
  const failed = results.length - sent;
  const testedAt = new Date();
  await prisma.securityAlertChannel.update({ where: { id: channel.id }, data: { lastTestedAt: testedAt, lastTestStatus: failed ? "failed" : "succeeded", lastErrorCode: results.find((item) => item.errorCode)?.errorCode ?? null } });
  return { ok: failed === 0, sent, failed, results };
}
