export function mockNetBoxAssets() {
  return [
    {
      externalId: "netbox:edge-fw-01",
      name: "edge-fw-01",
      hostname: "edge-fw-01",
      managementIp: "192.0.2.1",
      vendor: "FortiGate",
      platform: "FortiOS",
      role: "Firewall",
      site: "Tehran DC",
      location: "Rack A",
      managedState: "managed",
      healthState: "unknown",
      tags: ["netbox", "edge"],
      interfaces: [{ name: "port1", ips: ["192.0.2.1"], macAddress: "00:11:22:33:44:55" }]
    },
    {
      externalId: "netbox:linux-web-01",
      name: "linux-web-01",
      hostname: "linux-web-01",
      managementIp: "192.0.2.20",
      vendor: "Linux",
      platform: "Ubuntu",
      role: "Server",
      site: "Tehran DC",
      location: "Rack B",
      managedState: "unmanaged",
      healthState: "unknown",
      tags: ["netbox", "server"],
      interfaces: [{ name: "eth0", ips: ["192.0.2.20"] }]
    }
  ];
}

export function mockNetBoxHealth() {
  return {
    status: "ok",
    adapter: "mock_netbox",
    mode: "mock",
    production: false,
    nonProduction: true,
    executable: false,
    warning: "Non-production mock NetBox adapter; preview and idempotent sync samples only.",
    message: "Mock NetBox adapter is available for preview/idempotent sync only."
  };
}
