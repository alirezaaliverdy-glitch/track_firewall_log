import assert from "node:assert/strict";
import test from "node:test";
import { dockerPublishedPortGuard, dockerUserRuleBlocksPort, parseDockerPublishedPorts } from "../src/connectors/linux/docker-port-evidence.js";

test("Docker published ports retain container, image, host and container-port evidence", () => {
  const output = JSON.stringify({
    ID: "f5cdef356a64aabbccdd",
    Names: "firewall-api",
    Image: "firewall-log-analyzer-api:latest",
    Ports: "0.0.0.0:5438->5432/tcp, [::]:5438->5432/tcp, 4000/tcp"
  });
  const rules = "-A DOCKER-USER -p tcp -m conntrack --ctorigdstport 5438 -m comment --comment firewall-log-analyzer-port-5438 -j DROP";
  const ports = parseDockerPublishedPorts(output, rules);

  assert.equal(ports.length, 2);
  assert.deepEqual(ports.map((item) => item.hostIp), ["0.0.0.0", "::"]);
  assert.ok(ports.every((item) => item.hostPort === 5438 && item.containerPort === 5432));
  assert.ok(ports.every((item) => item.containerName === "firewall-api" && item.blockedByDockerUser));
});

test("Docker guard matches the original published port in DOCKER-USER and is reversible", () => {
  const guard = dockerPublishedPortGuard(5438, "tcp");
  assert.match(guard.insert, /^iptables -I DOCKER-USER 1 /);
  assert.match(guard.insert, /--ctorigdstport 5438/);
  assert.match(guard.remove, /^iptables -D DOCKER-USER /);
  assert.equal(dockerUserRuleBlocksPort(`-A DOCKER-USER ${guard.match}`, 5438, "tcp"), true);
  assert.equal(dockerUserRuleBlocksPort(`-A INPUT -p tcp --dport 5438 -j ACCEPT`, 5438, "tcp"), false);
});
