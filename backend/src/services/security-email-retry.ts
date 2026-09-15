const RETRYABLE_EMAIL_ERROR_CODES = new Set([
  "SMTP_TIMEOUT",
  "SMTP_HOST_UNREACHABLE",
  "SMTP_CONNECTION_FAILED",
  "SMTP_TEMPORARY_REJECTED",
  "SMTP_SEND_FAILED"
]);

export function isRetryableSecurityEmailError(code: string) {
  return RETRYABLE_EMAIL_ERROR_CODES.has(code);
}

export function securityEmailRetryDelayMinutes(attemptCount: number) {
  const exponent = Math.min(10, Math.max(0, attemptCount - 1));
  return Math.min(30, 2 ** exponent);
}

export function nextSecurityEmailRetryAt(attemptCount: number, now = Date.now()) {
  return new Date(now + securityEmailRetryDelayMinutes(attemptCount) * 60_000);
}
