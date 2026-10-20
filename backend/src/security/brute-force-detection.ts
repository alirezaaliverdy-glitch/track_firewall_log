export type AuthenticationEventLike = {
  srcIp?: string | null;
  vendor?: string | null;
  eventType?: string | null;
  action?: string | null;
  rawMessage?: string | null;
  rawSnippet?: string | null;
  ruleName?: string | null;
  dstPort?: number | null;
  username?: string | null;
  count?: number | null;
};

const FAILURE_ACTIONS = new Set([
  "auth_failed",
  "admin_auth_failed",
  "vpn_auth_failed",
  "sudo_failed",
  "login_failed",
  "authentication_failed",
]);
const AUTH_FAILURE_PATTERN = /auth(?:entication)?[_ -]?(?:fail(?:ed|ure)?|denied)|failed password|invalid user|login[_ -]?fail(?:ed|ure)?|pam_unix.*authentication failure|%sec_login-\d+-login_failed\b|%snmp-3-authfail|(?:webgui|ssl.?vpn).*(?:login|auth).*(?:fail|denied)|action=["']?login["']?.*status=["']?(?:fail|failed|failure)\b/i;

function eventText(event: AuthenticationEventLike) {
  return [event.vendor, event.eventType, event.action, event.ruleName, event.rawMessage, event.rawSnippet]
    .filter(Boolean)
    .join(" ");
}

export function authenticationFailureService(event: AuthenticationEventLike) {
  const text = eventText(event).toLowerCase();
  if (/ssl.?vpn|ipsec|openvpn|ovpn|l2tp|wireguard|anyconnect|webvpn|vpn/.test(text)) return "vpn";
  if (/snmp/.test(text)) return "snmp";
  if (/winbox/.test(text)) return "winbox";
  if (/sudo|privilege/.test(text)) return "privilege";
  if (/webgui|administrator|admin.*login|https|rest.?api/.test(text)) return "management";
  if (/ssh|sshd|failed password/.test(text) || event.dstPort === 22 || event.dstPort === 22022) return "ssh";
  return "authentication";
}

export function isAuthenticationFailureEvent(event: AuthenticationEventLike) {
  if (!event.srcIp) return false;
  const action = String(event.action ?? "").trim().toLowerCase();
  if (["auth_success", "login_success", "session_lifecycle"].includes(action)) return false;
  if (FAILURE_ACTIONS.has(action)) return true;
  if (AUTH_FAILURE_PATTERN.test(eventText(event))) return true;
  // A packet denied on an SSH port never reached authentication. Port alone is
  // not evidence of a failed login (and must not inflate brute-force counts).
  return false;
}

export function authenticationAttemptCount(events: AuthenticationEventLike[]) {
  return events.reduce((total, event) => total + Math.max(1, Number(event.count) || 1), 0);
}
