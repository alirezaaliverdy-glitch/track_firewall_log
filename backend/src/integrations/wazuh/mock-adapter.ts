export function mockWazuhAssets() {
  return [
    {
      externalId: "wazuh:agent-001",
      name: "wazuh-linux-01",
      hostname: "wazuh-linux-01",
      managementIp: "192.0.2.30",
      vendor: "Linux",
      platform: "Debian",
      role: "Server",
      site: "Wazuh Agents",
      managedState: "unmanaged",
      healthState: "online",
      tags: ["wazuh", "agent"]
    }
  ];
}

export function mockWazuhEvents(deviceId?: string, assetId?: string) {
  return [
    {
      deviceId,
      assetId,
      vendor: "linux",
      eventType: "auth_failure",
      action: "denied",
      severity: "medium",
      srcIp: "203.0.113.44",
      dstPort: 22,
      username: "admin",
      rawMessage: "sshd: Failed password for invalid user admin from 203.0.113.44"
    }
  ];
}

export function mockWazuhHealth() {
  return { status: "ok", adapter: "mock_wazuh", executable: false, message: "Mock Wazuh adapter maps sample agents and alerts without external calls." };
}
