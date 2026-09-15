import { createHash } from "node:crypto";

export class SshHostKeyTrustError extends Error {
  code: "SSH_HOST_KEY_UNKNOWN" | "SSH_HOST_KEY_MISMATCH";
  fingerprint: string;

  constructor(code: "SSH_HOST_KEY_UNKNOWN" | "SSH_HOST_KEY_MISMATCH", fingerprint: string) {
    super(code === "SSH_HOST_KEY_UNKNOWN"
      ? `SSH_HOST_KEY_UNKNOWN:${fingerprint}`
      : `SSH_HOST_KEY_MISMATCH:${fingerprint}`);
    this.name = "SshHostKeyTrustError";
    this.code = code;
    this.fingerprint = fingerprint;
  }
}

export function sshHostKeySha256Fingerprint(key: Buffer | string) {
  const buffer = Buffer.isBuffer(key) ? key : Buffer.from(key, "utf8");
  return `SHA256:${createHash("sha256").update(buffer).digest("base64").replace(/=+$/g, "")}`;
}

function normalizeFingerprint(value: string | undefined | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.startsWith("SHA256:") ? text : `SHA256:${text}`;
}

export function buildSshHostKeyVerifier(input: { pinnedSha256?: string | null }) {
  const pinned = normalizeFingerprint(input.pinnedSha256);
  return {
    verify(key: Buffer | string) {
      const fingerprint = sshHostKeySha256Fingerprint(key);
      if (!pinned) throw new SshHostKeyTrustError("SSH_HOST_KEY_UNKNOWN", fingerprint);
      if (fingerprint !== pinned) throw new SshHostKeyTrustError("SSH_HOST_KEY_MISMATCH", fingerprint);
      return true;
    }
  };
}
