import crypto from "node:crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function key() {
  if (!env.credentialEncryptionKey) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is required to store or read device credentials.");
  }
  return crypto.createHash("sha256").update(env.credentialEncryptionKey).digest();
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64")
  ].join(":");
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return undefined;
  const [version, ivValue, tagValue, encryptedValue] = value.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Encrypted credential payload is invalid.");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final()
  ]).toString("utf8");
}
