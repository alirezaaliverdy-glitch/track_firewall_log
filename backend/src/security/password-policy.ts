const COMMON_PASSWORDS = new Set([
  "123456789012",
  "admin12345678",
  "password1234",
  "qwerty123456",
  "letmein123456"
]);

export function passwordPolicyViolations(password: string, username = "") {
  const normalized = password.toLowerCase();
  const violations: string[] = [];
  if (password.length < 12) violations.push("PASSWORD_TOO_SHORT");
  if (password.length > 128) violations.push("PASSWORD_TOO_LONG");
  if (username.trim().length >= 3 && normalized.includes(username.trim().toLowerCase())) violations.push("PASSWORD_CONTAINS_USERNAME");
  if (COMMON_PASSWORDS.has(normalized)) violations.push("PASSWORD_TOO_COMMON");
  return violations;
}
