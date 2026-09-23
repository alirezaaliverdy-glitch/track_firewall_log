const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ALERT_RECIPIENTS = 10;

export function normalizeSecurityAlertRecipients(input: unknown) {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[;,\n]/) : [];
  const recipients = [...new Set(raw.map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
  if (recipients.length > MAX_ALERT_RECIPIENTS) throw new Error("TOO_MANY_RECIPIENT_EMAILS");
  if (recipients.some((email) => !EMAIL_PATTERN.test(email))) throw new Error("INVALID_RECIPIENT_EMAIL");
  return recipients;
}

export type SecurityAlertRecipientPreference = { email: string; enabled: boolean };

export function normalizeSecurityAlertRecipientPreferences(input: unknown): SecurityAlertRecipientPreference[] {
  if (!Array.isArray(input)) return [];
  const rawEmails = input.map((item) => item && typeof item === "object" ? (item as Record<string, unknown>).email : item);
  const emails = normalizeSecurityAlertRecipients(rawEmails);
  const enabledByEmail = new Map<string, boolean>();
  for (const item of input) {
    const email = String(item && typeof item === "object" ? (item as Record<string, unknown>).email ?? "" : item).trim().toLowerCase();
    if (!email) continue;
    enabledByEmail.set(email, item && typeof item === "object" ? (item as Record<string, unknown>).enabled !== false : true);
  }
  return emails.map((email) => ({ email, enabled: enabledByEmail.get(email) !== false }));
}
