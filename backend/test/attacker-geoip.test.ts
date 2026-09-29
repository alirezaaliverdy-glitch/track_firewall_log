import assert from "node:assert/strict";
import test from "node:test";
import { lookupAttackerGeo, publicGeoIp } from "../src/services/attacker-geoip.service.js";

test("Geo/ASN enrichment never queries private, loopback, documentation or multicast IPs", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.7.6", "198.51.100.4", "203.0.113.12", "224.0.0.1", "::1", "fc00::1", "2001:db8::2", "::ffff:192.0.2.1"]) {
    assert.equal(publicGeoIp(ip), false, ip);
    assert.equal((await lookupAttackerGeo(ip)).status, "not_public", ip);
  }
  assert.equal(publicGeoIp("8.8.8.8"), true);
  assert.equal(publicGeoIp("2001:4860:4860::8888"), true);
});
