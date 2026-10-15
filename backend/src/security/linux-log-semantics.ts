import { isIP } from "node:net";

export type LinuxLogMeaning = {
  kind: "ssh_success" | "ssh_failure" | "sudo_command" | "sudo_failure" | "session" | "other";
  program?: string; hostname?: string; actor?: string; effectiveUser?: string;
  sourceIp?: string; sourcePort?: number; command?: string; method?: string;
};

/** Interpret the producer/message before inspecting data quoted inside a command. */
export function parseLinuxSecurityLog(raw: string): LinuxLogMeaning {
  const line = raw.trim().replace(/^<\d+>/, "")
    .replace(/^(?:\d{4}-\d\d-\d\d[T ]\S+|[A-Z][a-z]{2}\s+\d{1,2}\s+\d\d:\d\d:\d\d)\s+/, "");
  const header = /^(?:(\S+)\s+)?([\w./-]+)(?:\[\d+\])?:\s+([\s\S]*)$/.exec(line);
  const plainAuth = /^(?:Accepted (?:password|publickey|keyboard-interactive)|Failed (?:password|publickey)|Invalid user|pam_unix\(sshd:)/i.test(line);
  const program = plainAuth ? undefined : header?.[2];
  const message = plainAuth ? line : header?.[3] ?? line;
  const base = { program, hostname: plainAuth ? undefined : header?.[1] };
  if (program === "sudo" || program === "sudoedit") {
    const commandAt = message.search(/\bCOMMAND\s*=/);
    const metadata = commandAt < 0 ? message : message.slice(0, commandAt);
    const actor = /^([^\s:]+)\s*:/.exec(metadata)?.[1] ?? /\bruser=([^\s;]+)/.exec(metadata)?.[1];
    const effectiveUser = /\bUSER=([^\s;]+)/.exec(metadata)?.[1];
    if (commandAt >= 0) return { ...base, kind: "sudo_command", actor, effectiveUser, command: message.slice(commandAt).replace(/^COMMAND\s*=\s*/, "") };
    if (/authentication failure|incorrect password|not in the sudoers|permission denied|NOT in sudoers/i.test(metadata)) return { ...base, kind: "sudo_failure", actor, effectiveUser };
    return { ...base, kind: /session (?:opened|closed)/i.test(message) ? "session" : "other", actor, effectiveUser };
  }
  if (program && !/^(?:sshd|sshd-session)$/.test(program)) return { ...base, kind: "other" };
  const auth = /^(Accepted|Failed) (password|publickey|keyboard-interactive(?:\/pam)?) (?:for|\[REDACTED\]) (?:invalid user )?(\S+) from (\S+) port (\d+)(?:\s|$)/i.exec(message);
  if (auth && isIP(auth[4]) && Number(auth[5]) > 0 && Number(auth[5]) <= 65535) return { ...base, kind: auth[1].toLowerCase() === "accepted" ? "ssh_success" : "ssh_failure", actor: auth[3], sourceIp: auth[4], sourcePort: Number(auth[5]), method: auth[2] };
  const invalid = /^Invalid user (\S+) from (\S+)(?: port (\d+))?/i.exec(message);
  if (invalid && isIP(invalid[2])) return { ...base, kind: "ssh_failure", actor: invalid[1], sourceIp: invalid[2], sourcePort: invalid[3] ? Number(invalid[3]) : undefined };
  if (/^pam_unix\(sshd:auth\): authentication failure/.test(message)) {
    const sourceIp = /\brhost=([^\s;]+)/.exec(message)?.[1];
    return { ...base, kind: "ssh_failure", actor: /\buser=([^\s;]+)/.exec(message)?.[1], sourceIp: sourceIp && isIP(sourceIp) ? sourceIp : undefined };
  }
  return { ...base, kind: /^(?:pam_unix\(sshd:session\): )?session (?:opened|closed)|^(?:Disconnected from|Timeout, client not responding)/i.test(message) ? "session" : "other" };
}

export function linuxEventAction(meaning: LinuxLogMeaning) {
  return ({ ssh_success: "auth_success", ssh_failure: "auth_failed", sudo_command: "sudo_command", sudo_failure: "sudo_failed", session: "session_lifecycle", other: "unknown" })[meaning.kind];
}

export function isLinuxRemoteRootLogin(raw: string) {
  const meaning = parseLinuxSecurityLog(raw);
  return meaning.kind === "ssh_success" && meaning.actor === "root";
}
