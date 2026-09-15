import { timingSafeEqual, createHmac } from "node:crypto";
import { env } from "../config/env.js";

export const CSRF_HEADER_NAME = "x-csrf-token";

export function csrfTokenForSession(sessionToken: string) {
  const sessionHash = createHmac("sha256", env.authSessionSecret).update(sessionToken).digest("hex");
  return createHmac("sha256", env.authSessionSecret).update(`${sessionHash}:csrf`).digest("base64url");
}

export function validateCsrfToken(sessionToken: string | undefined, token: string | undefined) {
  if (!sessionToken || !token) return false;
  const expected = csrfTokenForSession(sessionToken);
  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);
  return expectedBuffer.length === tokenBuffer.length && timingSafeEqual(expectedBuffer, tokenBuffer);
}
