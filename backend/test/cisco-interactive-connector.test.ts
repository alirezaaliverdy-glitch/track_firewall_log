import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ssh2 from "ssh2";
import { DeviceEnvironment, DeviceProtocol, DeviceStatus, DeviceType, type Device } from "@prisma/client";
import {
  CISCO_LEGACY_IOS_COMPATIBILITY_PROFILE,
  CiscoConnectorError,
  CiscoInteractiveSession,
  CiscoIosXeSshConnector,
  ciscoCompatibilityProfile,
  ciscoConnectConfig,
  ciscoConnectionSemantic
} from "../src/connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { createCredential } from "../src/services/credential.service.js";
import { prisma } from "../src/db/prisma.js";

const { Server } = ssh2;

test.after(async () => { await prisma.$disconnect(); });

class ScriptedShell extends EventEmitter {
  writes: string[] = [];
  closed = false;
  constructor(private readonly responder: (value: string, shell: ScriptedShell) => void) { super(); }
  write(value: string | Buffer) { const text = value.toString(); this.writes.push(text); this.responder(text, this); return true; }
  end() { this.closed = true; this.emit("close"); return this; }
  close() { this.closed = true; this.emit("close"); return this; }
  send(value: string) { queueMicrotask(() => this.emit("data", Buffer.from(value))); }
}

const state = { connectorInvoked: true, transportConnected: true, authenticated: true, shellOpened: true, compatibilityProfile: "modern" as const, legacyCompatibilityRequested: false, legacyCompatibilityApplied: false, connectionPhase: "command" as const };

test("interactive session handles privileged prompt, disables paging, and strips command echo", async () => {
  const shell = new ScriptedShell((value, target) => {
    if (value === "terminal length 0\n") target.send("terminal length 0\r\nrouter#");
    if (value === "show version\n") target.send("show version\r\nCisco IOS XE Software, Version 17.9\r\nrouter#");
  });
  const session = new CiscoInteractiveSession(shell as never, state, 10_000, 100, 100);
  shell.send("Authorized users only\r\nrouter#");
  const initialized = await session.initialize();
  assert.equal(initialized.promptMode, "privileged");
  const result = await session.runCommand("show version");
  assert.equal(result.stdout, "Cisco IOS XE Software, Version 17.9");
  assert.deepEqual(shell.writes.slice(0, 2), ["terminal length 0\n", "show version\n"]);
  session.close();
  assert.equal(shell.closed, true);
});

test("interactive session distinguishes enable-required and successful enable mode", async () => {
  const withoutSecret = new ScriptedShell(() => undefined);
  const blocked = new CiscoInteractiveSession(withoutSecret as never, state, 10_000, 100, 100);
  withoutSecret.send("router>");
  await assert.rejects(blocked.initialize(), (error: unknown) => error instanceof CiscoConnectorError && error.code === "CISCO_ENABLE_SECRET_REQUIRED" && error.stage === "privilege");

  const shell = new ScriptedShell((value, target) => {
    if (value === "enable\n") target.send("Password:");
    if (value === `${enableSecret}\n`) target.send("\r\nrouter#");
    if (value === "terminal length 0\n") target.send("terminal length 0\r\nrouter#");
  });
  const enableSecret = randomUUID();
  const session = new CiscoInteractiveSession(shell as never, state, 10_000, 100, 100);
  shell.send("router>");
  const initialized = await session.initialize(enableSecret);
  assert.equal(initialized.promptMode, "privileged");
  assert.deepEqual(shell.writes, ["enable\n", `${enableSecret}\n`, "terminal length 0\n"]);
});

test("interactive session handles More paging and closes after a prompt timeout", async () => {
  const shell = new ScriptedShell((value, target) => {
    if (value === "terminal length 0\n") target.send("terminal length 0\r\nrouter#");
    if (value === "show inventory\n") target.send("show inventory\r\nNAME: chassis\r\n--More--");
    if (value === " ") target.send("PID: C9300\r\nrouter#");
  });
  const session = new CiscoInteractiveSession(shell as never, state, 10_000, 100, 100);
  shell.send("router#");
  await session.initialize();
  const result = await session.runCommand("show inventory");
  assert.match(result.stdout, /NAME: chassis/);
  assert.match(result.stdout, /PID: C9300/);
  assert.doesNotMatch(result.stdout, /More/);
  assert.ok(shell.writes.includes(" "));

  const silent = new ScriptedShell(() => undefined);
  const timed = new CiscoInteractiveSession(silent as never, state, 10_000, 5, 5);
  await assert.rejects(timed.initialize(), (error: unknown) => error instanceof CiscoConnectorError && error.code === "CISCO_PROMPT_TIMEOUT");
  timed.close();
  assert.equal(silent.closed, true);
});

test("platform semantics preserve connected-but-unsupported classic IOS and NX-OS", () => {
  const classic = readFileSync(new URL("../src/connectors/cisco/ios-xe/fixtures/show-version-classic-ios.txt", import.meta.url), "utf8");
  const nxos = readFileSync(new URL("../src/connectors/cisco/ios-xe/fixtures/show-version-nxos.txt", import.meta.url), "utf8");
  const iosxe = readFileSync(new URL("../src/connectors/cisco/ios-xe/fixtures/show-version-iosxe.txt", import.meta.url), "utf8");
  assert.equal(ciscoConnectionSemantic(classic), "connected_unsupported");
  assert.equal(ciscoConnectionSemantic(nxos), "connected_unsupported");
  assert.equal(ciscoConnectionSemantic(iosxe), "connected_supported");
});

test("legacy compatibility algorithms are opt-in per device and modern remains default", () => {
  const modernDevice = { capabilities: {} };
  const legacyDevice = { capabilities: { sshCompatibilityProfile: "legacy_cisco" } };
  assert.equal(ciscoCompatibilityProfile(modernDevice), "modern");
  assert.equal(ciscoCompatibilityProfile(legacyDevice), "legacy_cisco");
  const credential = { username: "operator", password: randomUUID(), sudo: false };
  assert.equal(ciscoConnectConfig({ host: "192.0.2.1", managementPort: 22 }, credential, "modern").algorithms, undefined);
  const legacyAlgorithms = ciscoConnectConfig({ host: "192.0.2.1", managementPort: 22 }, credential, "legacy_cisco").algorithms;
  assert.equal(CISCO_LEGACY_IOS_COMPATIBILITY_PROFILE.label, "Legacy Cisco IOS Compatibility Profile");
  assert.deepEqual(legacyAlgorithms?.kex, { append: ["diffie-hellman-group14-sha1"], prepend: [], remove: [] });
  assert.deepEqual(legacyAlgorithms?.serverHostKey, { append: ["ssh-rsa"], prepend: [], remove: [] });
  assert.deepEqual(legacyAlgorithms?.hmac, { append: ["hmac-sha1", "hmac-sha1-96"], prepend: [], remove: [] });
});

function device(credentialId: string, port: number): Device {
  const timestamp = new Date();
  return { id: `test-${Date.now()}`, name: "Cisco fixture", vendor: "cisco", type: DeviceType.generic_firewall, host: "127.0.0.1", managementPort: port, protocol: DeviceProtocol.ssh, credentialId, credentialRef: null, environment: DeviceEnvironment.lab, tags: [], status: DeviceStatus.unknown, capabilities: { platform: "cisco-ios-xe" }, createdAt: timestamp, updatedAt: timestamp };
}

async function startFakeCiscoServer(auth: "password" | "publickey" | "reject", expectedPassword?: string) {
  const hostKey = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "pkcs1", format: "pem" } }).privateKey;
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    client.on("authentication", (context) => {
      if (auth === "password" && context.method === "password" && context.password === expectedPassword) context.accept();
      else if (auth === "publickey" && context.method === "publickey") context.accept();
      else context.reject();
    });
    client.on("ready", () => client.on("session", (accept) => {
      const session = accept();
      session.on("pty", (acceptPty) => acceptPty?.());
      session.on("shell", (acceptShell) => {
        const stream = acceptShell();
        stream.write("fixture#");
        let pending = "";
        stream.on("data", (chunk: Buffer) => {
          pending += chunk.toString();
          while (pending.includes("\n")) {
            const index = pending.indexOf("\n");
            const command = pending.slice(0, index).trim();
            pending = pending.slice(index + 1);
            if (command === "terminal length 0") stream.write("terminal length 0\r\nfixture#");
            else if (command === "show version") stream.write("show version\r\nCisco IOS XE Software, Version 17.09\r\nfixture uptime is 1 day\r\nfixture#");
          }
        });
      });
    }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, port: address.port };
}

test("real SSH2 fixture accepts password and key authentication and reports auth failure structurally", async (t) => {
  const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "pkcs1", format: "pem" } });
  const password = randomUUID();
  const passwordCredential = await createCredential({ name: `cisco-password-${Date.now()}`, type: "password", username: "operator", password });
  const keyCredential = await createCredential({ name: `cisco-key-${Date.now()}`, type: "private_key", username: "operator", privateKey: keyPair.privateKey });
  const badCredential = await createCredential({ name: `cisco-bad-${Date.now()}`, type: "password", username: "operator", password: randomUUID() });
  t.after(async () => { await prisma.deviceCredential.deleteMany({ where: { id: { in: [passwordCredential.id, keyCredential.id, badCredential.id] } } }); });

  for (const [mode, credentialId] of [["password", passwordCredential.id], ["publickey", keyCredential.id]] as const) {
    const fixture = await startFakeCiscoServer(mode, password);
    try {
      const result = await new CiscoIosXeSshConnector().runReadOnlyCommands(device(credentialId, fixture.port), ["platform"]);
      assert.equal(result.connection.semantic, "connected_supported");
      assert.equal(result.connection.diagnostic.authenticated, true);
      assert.equal(result.connection.diagnostic.shellOpened, true);
    } finally { await new Promise<void>((resolve) => fixture.server.close(() => resolve())); }
  }

  const rejected = await startFakeCiscoServer("reject");
  try {
    await assert.rejects(new CiscoIosXeSshConnector().runReadOnlyCommands(device(badCredential.id, rejected.port), ["platform"]), (error: unknown) => error instanceof CiscoConnectorError && error.code === "CISCO_SSH_AUTH_FAILED" && error.stage === "authentication" && error.transportConnected === true);
  } finally { await new Promise<void>((resolve) => rejected.server.close(() => resolve())); }
});

test("TCP timeout and SSH negotiation mismatch keep distinct structured stages", async (t) => {
  const credential = await createCredential({ name: `cisco-stage-${Date.now()}`, type: "password", username: "operator", password: randomUUID() });
  t.after(async () => { await prisma.deviceCredential.deleteMany({ where: { id: credential.id } }); });
  const tcpConnector = new CiscoIosXeSshConnector({
    clientFactory: () => { throw new Error("client must not be created"); },
    tcpConnect: async () => { throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); }
  });
  await assert.rejects(tcpConnector.runReadOnlyCommands(device(credential.id, 22), ["platform"]), (error: unknown) => error instanceof CiscoConnectorError && error.code === "CISCO_TCP_TIMEOUT" && error.stage === "tcp");

  class NegotiationClient extends EventEmitter {
    connect() { queueMicrotask(() => this.emit("error", Object.assign(new Error("no matching algorithm"), { level: "client-handshake" }))); return this; }
    end() { return this; }
    shell() { return this; }
  }
  const socket = { destroyed: false, destroy() { this.destroyed = true; } };
  const negotiation = new CiscoIosXeSshConnector({ clientFactory: () => new NegotiationClient() as never, tcpConnect: async () => socket as never });
  await assert.rejects(negotiation.runReadOnlyCommands(device(credential.id, 22), ["platform"]), (error: unknown) => error instanceof CiscoConnectorError && error.code === "CISCO_SSH_NEGOTIATION_FAILED" && error.stage === "ssh_negotiation");
  assert.equal(socket.destroyed, true);
});
