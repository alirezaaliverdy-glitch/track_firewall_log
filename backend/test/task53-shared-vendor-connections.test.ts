import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { once } from "node:events";
import net from "node:net";
import { afterEach, test } from "node:test";
import ssh2, { type Client as SshClient } from "ssh2";
import {
  closeSharedSshSessions,
  probeSharedSsh,
  withSharedSsh
} from "../src/services/shared-ssh-session.service.ts";
import { vendorHttpsAgent } from "../src/services/shared-https-agent.service.ts";

const hostKey = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey;
const { Server } = ssh2;

afterEach(() => closeSharedSshSessions());

test("API vendors reuse a bounded HTTPS agent per certificate policy", () => {
  assert.equal(vendorHttpsAgent(true), vendorHttpsAgent(true));
  assert.equal(vendorHttpsAgent(false), vendorHttpsAgent(false));
  assert.notEqual(vendorHttpsAgent(true), vendorHttpsAgent(false));
  assert.equal(vendorHttpsAgent(true).maxSockets, 2);
});

async function startServer(allowAuth: boolean) {
  let connections = 0;
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    connections += 1;
    client.on("authentication", (context) => allowAuth ? context.accept() : context.reject());
    client.on("ready", () => client.on("session", (accept) => {
      const session = accept();
      session.on("exec", (acceptExec) => {
        const stream = acceptExec();
        stream.write("ok\n");
        stream.exit(0);
        stream.end();
      });
    }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test SSH port was not assigned.");
  return { server, port: address.port, connections: () => connections };
}

function command(client: SshClient): Promise<string> {
  return new Promise((resolve, reject) => {
    client.exec("show", (error, stream) => {
      if (error) return reject(error);
      let output = "";
      stream.on("data", (data: Buffer) => { output += data.toString(); });
      stream.on("close", () => resolve(output.trim()));
      stream.on("error", reject);
    });
  });
}

test("sensor and two collectors reuse one authenticated SSH transport", async () => {
  const target = await startServer(true);
  try {
    const config = { host: "127.0.0.1", port: target.port, username: "test", password: "test", readyTimeout: 3000 };
    assert.equal((await probeSharedSsh("shared-device", config)).reachable, true);
    assert.equal(await withSharedSsh("shared-device", config, command), "ok");
    assert.equal(await withSharedSsh("shared-device", config, command), "ok");
    assert.equal(target.connections(), 1);
  } finally {
    closeSharedSshSessions();
    target.server.close();
  }
});

test("authentication failure is distinct and reconnect is backed off", async () => {
  const target = await startServer(false);
  try {
    const config = { host: "127.0.0.1", port: target.port, username: "test", password: "wrong", readyTimeout: 3000 };
    const first = await probeSharedSsh("rejected-device", config);
    const second = await probeSharedSsh("rejected-device", config);
    assert.equal(first.code, "SSH_AUTH_FAILED");
    assert.equal(second.code, "SSH_AUTH_FAILED");
    assert.equal(target.connections(), 1);
  } finally {
    closeSharedSshSessions();
    target.server.close();
  }
});

test("a silent TCP peer cannot hold the sensor cycle indefinitely", async () => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test TCP port was not assigned.");
  try {
    const started = Date.now();
    const result = await probeSharedSsh("silent-device", { host: "127.0.0.1", port: address.port, username: "test", password: "test", readyTimeout: 1000 });
    assert.equal(result.code, "SSH_HANDSHAKE_TIMEOUT");
    assert.ok(Date.now() - started < 5_000);
  } finally {
    closeSharedSshSessions();
    for (const socket of sockets) socket.destroy();
    server.close();
  }
});
