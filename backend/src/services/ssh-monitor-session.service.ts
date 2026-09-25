import { Client, type ConnectConfig } from "ssh2";
import type { Device } from "@prisma/client";
import { env } from "../config/env.js";
import { resolveCredentialById, resolveCredentialByName } from "./credential.service.js";

type SessionResult = { reachable: boolean; code: string; message: string; latencyMs: number };
type Session = {
  key: string;
  client: Client | null;
  connected: boolean;
  pending: Promise<SessionResult> | null;
  failures: number;
  nextAttemptAt: number;
  lastError: SessionResult | null;
};

const sessions = new Map<string, Session>();
const MAX_RECONNECT_DELAY_MS = 5 * 60_000;

function failed(code: string, message: string, latencyMs = 0): SessionResult {
  return { reachable: false, code, message, latencyMs };
}

function disconnect(session: Session, result: SessionResult) {
  if (session.connected) {
    session.failures = 0;
  }
  session.connected = false;
  session.client = null;
  session.lastError = result;
  session.failures += 1;
  session.nextAttemptAt = Date.now() + Math.min(MAX_RECONNECT_DELAY_MS, 15_000 * 2 ** Math.min(session.failures - 1, 5));
}

export async function probeSshMonitorSession(device: Pick<Device, "id" | "credentialId" | "credentialRef">, host: string, port: number): Promise<SessionResult | null> {
  const key = `${host}:${port}:${device.credentialId ?? device.credentialRef ?? ""}`;
  let session = sessions.get(device.id);
  if (session && session.key !== key) {
    session.client?.end();
    sessions.delete(device.id);
    session = undefined;
  }
  if (!session) {
    session = { key, client: null, connected: false, pending: null, failures: 0, nextAttemptAt: 0, lastError: null };
    sessions.set(device.id, session);
  }
  if (session.connected) return { reachable: true, code: "SSH_SESSION_ALIVE", message: "Authenticated SSH session and keepalive are active.", latencyMs: 0 };
  if (session.pending) return session.pending;
  if (Date.now() < session.nextAttemptAt) return session.lastError ?? failed("SSH_RECONNECT_BACKOFF", "Waiting before the next SSH reconnect attempt.");

  const credential = device.credentialId
    ? await resolveCredentialById(device.credentialId)
    : device.credentialRef ? await resolveCredentialByName(device.credentialRef) : null;
  if (!credential) return null;
  const started = Date.now();
  const activeSession = session;
  const client = new Client();
  activeSession.client = client;
  activeSession.pending = new Promise<SessionResult>((resolve) => {
    let settled = false;
    const finish = (result: SessionResult) => {
      if (settled) return;
      settled = true;
      activeSession.pending = null;
      resolve(result);
    };
    client.once("ready", () => {
      activeSession.connected = true;
      activeSession.failures = 0;
      activeSession.nextAttemptAt = 0;
      activeSession.lastError = null;
      finish({ reachable: true, code: "SSH_SESSION_AUTHENTICATED", message: "Authenticated SSH session established.", latencyMs: Date.now() - started });
    });
    client.on("error", (error: Error) => {
      const code = /auth/i.test(error.message) ? "SSH_AUTH_FAILED" : /timeout/i.test(error.message) ? "SSH_HANDSHAKE_TIMEOUT" : "SSH_SESSION_ERROR";
      const result = failed(code, "Authenticated SSH session failed.", Date.now() - started);
      if (sessions.get(device.id) === activeSession && activeSession.client === client) disconnect(activeSession, result);
      finish(result);
    });
    client.on("close", () => {
      const result = failed("SSH_SESSION_CLOSED", "SSH session or keepalive closed.", Date.now() - started);
      if (sessions.get(device.id) === activeSession && activeSession.client === client) disconnect(activeSession, result);
      finish(result);
    });
    const config: ConnectConfig = {
      host, port, username: credential.username,
      readyTimeout: env.sshHandshakeTimeoutMs,
      keepaliveInterval: 10_000,
      keepaliveCountMax: 2
    };
    if (credential.password) config.password = credential.password;
    if (credential.privateKey) config.privateKey = credential.privateKey;
    if (credential.passphrase) config.passphrase = credential.passphrase;
    try {
      client.connect(config);
    } catch {
      const result = failed("SSH_SESSION_CONNECT_FAILED", "Could not start authenticated SSH session.", Date.now() - started);
      disconnect(activeSession, result);
      finish(result);
    }
  });
  return activeSession.pending;
}

export function closeSshMonitorSessions() {
  for (const session of sessions.values()) session.client?.end();
  sessions.clear();
}
