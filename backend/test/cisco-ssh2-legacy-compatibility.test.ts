import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import test from "node:test";
import ssh2 from "ssh2";
import { DeviceEnvironment, DeviceProtocol, DeviceStatus, DeviceType, type Device } from "@prisma/client";
import { CiscoConnectorError, CiscoIosXeSshConnector, ciscoConnectConfig } from "../src/connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";

const { Client, Server } = ssh2;

const password = "fixture-password";
const iosxeShowVersion = "Cisco IOS XE Software, Version 17.09\r\nfixture uptime is 1 day";
const classicShowVersion = "Cisco IOS Software, C2960 Software, Version 15.2\r\nlegacy uptime is 1 day";

type FakeServerOptions = {
  algorithms?: Record<string, string[]>;
  auth?: "password" | "reject";
  showVersion?: string;
};

function device(port: number, legacy = false): Device {
  const timestamp = new Date();
  return {
    id: `fixture-${randomUUID()}`,
    name: legacy ? "legacy-cisco" : "modern-cisco",
    vendor: "cisco",
    type: DeviceType.generic_firewall,
    host: "127.0.0.1",
    managementPort: port,
    protocol: DeviceProtocol.ssh,
    credentialId: "fixture-credential",
    credentialRef: null,
    environment: DeviceEnvironment.lab,
    tags: [],
    status: DeviceStatus.unknown,
    capabilities: legacy ? { platform: "cisco-ios-classic", sshCompatibilityProfile: "legacy_cisco" } : { platform: "cisco-ios-xe" },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

async function startFakeCiscoServer(options: FakeServerOptions = {}) {
  const hostKey = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "pkcs1", format: "pem" }
  }).privateKey;
  const server = new Server({ hostKeys: [hostKey], algorithms: options.algorithms as never }, (client) => {
    client.on("error", () => undefined);
    client.on("authentication", (context) => {
      if (options.auth === "reject") return context.reject();
      if (context.method === "password" && context.password === password) return context.accept();
      return context.reject();
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
            if (command === "show version") stream.write(`show version\r\n${options.showVersion ?? iosxeShowVersion}\r\nfixture#`);
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

function connector() {
  return new CiscoIosXeSshConnector({
    clientFactory: () => new Client(),
    credentialResolver: async () => ({ username: "admin", password, sudo: false })
  });
}

test("modern Cisco connection succeeds without legacy mode", async () => {
  const fixture = await startFakeCiscoServer();
  try {
    const result = await connector().runReadOnlyCommands(device(fixture.port), ["platform"]);
    assert.equal(result.connectorInvoked, true);
    assert.equal(result.connection.semantic, "connected_supported");
    assert.equal(result.connection.legacyCompatibilityRequested, false);
    assert.equal(result.connection.legacyCompatibilityApplied, false);
    assert.equal(result.connection.diagnostic.connectionPhase, "command");
  } finally {
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
  }
});

test("legacy Cisco fails negotiation when disabled and succeeds when explicitly enabled", async () => {
  const legacyAlgorithms = {
    kex: ["diffie-hellman-group14-sha1"],
    serverHostKey: ["ssh-rsa"],
    cipher: ["aes128-cbc"],
    hmac: ["hmac-sha1"]
  };
  const modernFixture = await startFakeCiscoServer({ algorithms: legacyAlgorithms, showVersion: classicShowVersion });
  try {
    await assert.rejects(connector().runReadOnlyCommands(device(modernFixture.port), ["platform"]), (error: unknown) => {
      return error instanceof CiscoConnectorError && error.stage === "ssh_negotiation" && error.connectorInvoked === true && error.legacyCompatibilityRequested === false && error.legacyCompatibilityApplied === false;
    });
  } finally {
    await new Promise<void>((resolve) => modernFixture.server.close(() => resolve()));
  }

  const legacyFixture = await startFakeCiscoServer({ algorithms: legacyAlgorithms, showVersion: classicShowVersion });
  try {
    const result = await connector().runReadOnlyCommands(device(legacyFixture.port, true), ["platform"]);
    assert.equal(result.connectorInvoked, true);
    assert.equal(result.connection.semantic, "connected_supported");
    assert.equal(result.connection.legacyCompatibilityRequested, true);
    assert.equal(result.connection.legacyCompatibilityApplied, true);
    assert.equal(result.connection.compatibilityProfile, "legacy_cisco");
    assert.equal(result.connection.diagnostic.code, "CISCO_CONNECTED_SUPPORTED");
    assert.match(result.results[0].stdout, /Cisco IOS Software/);
  } finally {
    await new Promise<void>((resolve) => legacyFixture.server.close(() => resolve()));
  }
});

test("legacy compatibility reaches SSH2 connect options as append-only algorithms", () => {
  const algorithms = ciscoConnectConfig({ host: "192.0.2.12", managementPort: 22 }, { username: "admin", password, sudo: false }, "legacy_cisco").algorithms;
  assert.deepEqual(algorithms?.kex, { append: ["diffie-hellman-group14-sha1"], prepend: [], remove: [] });
  assert.deepEqual(algorithms?.serverHostKey, { append: ["ssh-rsa"], prepend: [], remove: [] });
  assert.deepEqual(algorithms?.hmac, { append: ["hmac-sha1", "hmac-sha1-96"], prepend: [], remove: [] });
});

test("authentication failure is structured and does not look like legacy negotiation", async () => {
  const fixture = await startFakeCiscoServer({ auth: "reject" });
  try {
    await assert.rejects(connector().runReadOnlyCommands(device(fixture.port, true), ["platform"]), (error: unknown) => {
      return error instanceof CiscoConnectorError && error.code === "CISCO_SSH_AUTH_FAILED" && error.stage === "authentication" && error.connectorInvoked === true && error.legacyCompatibilityRequested === true;
    });
  } finally {
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
  }
});
