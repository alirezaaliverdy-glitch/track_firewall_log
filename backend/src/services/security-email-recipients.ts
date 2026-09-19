const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ALERT_RECIPIENTS = 10;

export function normalizeSecurityAlertRecipients(input: unknown) {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[;,\n]/) : [];
  const recipients = [...new Set(raw.map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
  if (recipients.length > MAX_ALERT_RECIPIENTS) throw new Error("TOO_MANY_RECIPIENT_EMAILS");
  if (recipients.some((email) => !EMAIL_PATTERN.test(email))) throw new Error("INVALID_RECIPIENT_EMAIL");
  return recipients;
}
