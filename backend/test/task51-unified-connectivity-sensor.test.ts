import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import net from "node:net";
import test from "node:test";
import { DeviceProtocol, DeviceStatus } from "@prisma/client";
import { deriveConnectivityStatus, probeDeviceConnectivity, probeIntervalSeconds, probeMode } from "../src/services/device-connectivity-sensor.service.js";

test("connectivity state becomes degraded once and offline at the configured threshold", () => {
  assert.equal(deriveConnectivityStatus(true, 0, 2), DeviceStatus.online);
  assert.equal(deriveConnectivityStatus(false, 1, 2), DeviceStatus.error);
  assert.equal(deriveConnectivityStatus(false, 2, 2), DeviceStatus.offline);
});

test("vendor probes verify the service layer instead of treating every open port as online", () => {
  assert.equal(probeMode(DeviceProtocol.ssh, "ssh", 22), "ssh_banner");
  assert.equal(probeMode(DeviceProtocol.api, "rest_api", 443), "tls_handshake");
  assert.equal(probeMode(DeviceProtocol.api, "rest_api", 80), "tcp_connect");
});

test("SSH probes use a throttled cadence so the sensor does not trigger server rate limits", () => {
  const interval = probeIntervalSeconds({ protocol: DeviceProtocol.ssh, connectionChannels: [] });
  assert.ok(interval >= 10);
});

test("SSH reachability requires a real service banner", async () => {
  const server = net.createServer((socket) => socket.end("SSH-2.0-test-sensor\r\n"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const result = await probeDeviceConnectivity({
      id: "sensor-test",
      host: "127.0.0.1",
      managementPort: address.port,
      protocol: DeviceProtocol.ssh,
      connectionChannels: []
    } as never);
    assert.equal(result.reachable, true);
    assert.equal(result.code, "SSH_BANNER_VERIFIED");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("runtime, compose and live UI refresh are wired to the unified sensor", () => {
  const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  const compose = readFileSync(new URL("../../docker-compose.yml", import.meta.url), "utf8");
  const assets = readFileSync(new URL("../../src/features/assets/hooks/useAssets.ts", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../../src/features/assets/pages/AssetDetailPage.tsx", import.meta.url), "utf8");
  assert.match(server, /startDeviceConnectivitySensor/);
  assert.match(compose, /DEVICE_CONNECTIVITY_INTERVAL_SECONDS/);
  assert.match(compose, /DEVICE_CONNECTIVITY_SSH_INTERVAL_SECONDS/);
  assert.match(assets, /5_000/);
  assert.match(workspace, /5_000/);
});

test("pull collectors are not presented as an installed standalone agent", () => {
  const ingestion = readFileSync(new URL("../src/services/event-ingestion.service.ts", import.meta.url), "utf8");
  const channels = readFileSync(new URL("../src/services/device-connection-channel.service.ts", import.meta.url), "utf8");
  assert.match(ingestion, /EventSourceType\.api/);
  assert.doesNotMatch(ingestion, /type:\s*EventSourceType\.agent/);
  assert.match(channels, /channel\.method === "agent"/);
  assert.match(channels, /status: "setup_required"/);
});
