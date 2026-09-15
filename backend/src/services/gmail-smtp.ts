import type { SmtpConfig } from "./smtp-client.js";

export const GMAIL_SMTP_HOST = "smtp.gmail.com";
export const GMAIL_SMTP_PORT = 587;

export function normalizeGmailAppPassword(value: unknown) {
  const normalized = String(value ?? "").replace(/\s+/g, "");
  if (!/^[a-z0-9]{16}$/i.test(normalized)) throw new Error("INVALID_GMAIL_APP_PASSWORD");
  return normalized;
}

export function gmailSmtpConfig(senderEmail: string, appPassword: string): SmtpConfig {
  return {
    host: GMAIL_SMTP_HOST,
    port: GMAIL_SMTP_PORT,
    secure: false,
    startTls: true,
    username: senderEmail,
    password: appPassword,
    from: senderEmail
  };
}
