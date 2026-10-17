import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import ssh2 from "ssh2";
process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.LOG_LEVEL = "silent";

test("RouterOS SSH containment writes only the source list, requires a prepared rule and fails without read-back proof", async () => {
  const { prisma, shutdownDatabase } = await import("../src/db/prisma.js");
  const { createCredential } = await import("../src/services/credential.service.js");
  const { mikrotikSshConnector } = await import("../src/connectors/mikrotik-ssh.connector.js");
  const { closeSharedSshSessions } = await import("../src/services/shared-ssh-session.service.js");
  const hostKey = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "pkcs1", format: "pem" } }).privateKey;
  let rulePrepared = false, entryPresent = false, returnProof = true, writes = 0;
  const received: string[] = [], fixtureErrors: string[] = [];
  const server = new ssh2.Server({ hostKeys: [hostKey] }, client => {
    client.on("error", () => undefined);
    client.on("authentication", context => { if (context.method === "password") context.accept(); else context.reject(); });
    client.on("ready", () => client.on("session", accept => accept().on("exec", (acceptExec, _reject, info) => {
      const stream = acceptExec(), command = info.command; received.push(command);
      let output = "", exit = 0;
      if (command.includes("EOSNET_DROP_RULE_VERIFIED")) { if (rulePrepared) output = "EOSNET_DROP_RULE_VERIFIED\n"; else exit = 1; }
      else if (command.includes("EOSNET_SOURCE_ENTRY_VERIFIED")) { if (entryPresent && returnProof) output = "EOSNET_SOURCE_ENTRY_VERIFIED\n"; else exit = 1; }
      else if (command.startsWith("/ip firewall address-list print")) output = entryPresent ? '0 list="firewall-log-analyzer-blocked" address=203.0.113.8 timeout=1h\n' : "";
      else if (/^\/ip firewall address-list (?:add|set) /.test(command)) { writes++; entryPresent = true; }
      else { fixtureErrors.push("Unexpected command"); exit = 1; }
      stream.write(output); stream.exit(exit); stream.end();
    })));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const endpoint = server.address(); assert.ok(endpoint && typeof endpoint === "object");
  const tag = `mikro-response-${randomUUID()}`;
  const credential = await createCredential({ name: tag, type: "password", username: "fixture", password: randomUUID() });
  const device = await prisma.device.create({ data: { name: tag, host: "127.0.0.1", vendor: "mikrotik", type: "mikrotik", protocol: "ssh", managementPort: endpoint.port, credentialId: credential.id, environment: "lab" } });
  const plan = { id: tag, actionType: "mikrotik_block_ip", riskLevel: "high", parametersJson: { address: "203.0.113.8", listName: "firewall-log-analyzer-blocked", timeout: "1h", requireDropRule: true } } as never;
  try {
    await assert.rejects(() => mikrotikSshConnector.execute(plan, device), /قانون Drop/); assert.equal(writes, 0, "no write before the existing rule is verified");
    rulePrepared = true;
    const result = await mikrotikSshConnector.execute(plan, device); assert.equal(result.executed, true); assert.equal(writes, 1);
    assert.equal((result.rollbackJson?.verification as { ok: boolean }).ok, true); assert.equal(result.commands.length, 5);
    returnProof = false;
    await assert.rejects(() => mikrotikSshConnector.execute(plan, device), /راستی‌آزمایی/);
    assert.ok(received.every(command => !/\/ip firewall filter (?:add|enable|set|move|remove)/.test(command)));
    assert.deepEqual(fixtureErrors, []);
  } finally {
    closeSharedSshSessions(); await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.device.delete({ where: { id: device.id } }); await prisma.deviceCredential.delete({ where: { id: credential.id } }); await shutdownDatabase();
  }
});
