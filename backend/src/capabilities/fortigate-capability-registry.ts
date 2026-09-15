export type FortiGateCapabilityMode = "read-only" | "dry-run" | "execution" | "not-implemented";
export type FortiGateCapabilityRisk = "low" | "medium" | "high" | "critical";

export type FortiGateCapability = {
  id: string;
  category: string;
  supported: boolean;
  mode: FortiGateCapabilityMode;
  risk: FortiGateCapabilityRisk;
  currentFiles: string[];
  missingPieces: string[];
  notes: string;
};

const CONNECTOR = "backend/src/connectors/fortigate-ssh.connector.ts";
const PLANNER = "backend/src/connectors/vendors/fortigate.planner.ts";
const CATALOG = "backend/src/actions/fortigate-action-catalog.ts";
const COMPILER = "backend/src/services/fortigate-command-compiler.ts";
const GUARD = "backend/src/services/fortigate-policy-guard.service.ts";

const CONTROLLED_ACTION_FILES = [CONNECTOR, PLANNER, CATALOG, COMPILER, GUARD];
const READ_ONLY_FILES = [CONNECTOR, "backend/src/services/device.service.ts"];

const capabilities: FortiGateCapability[] = [
  {
    id: "address_objects",
    category: "Address objects",
    supported: true,
    mode: "execution",
    risk: "medium",
    currentFiles: CONTROLLED_ACTION_FILES,
    missingPieces: ["Automatic rollback execution; rollback is currently stored as metadata/instructions."],
    notes: "Create, update, and managed-only delete are compiled from structured parameters with automatic command planning."
  },
  {
    id: "address_groups",
    category: "Address groups",
    supported: true,
    mode: "execution",
    risk: "medium",
    currentFiles: CONTROLLED_ACTION_FILES,
    missingPieces: ["Automatic rollback execution."],
    notes: "Create groups and add/remove members through controlled catalog commands."
  },
  {
    id: "services",
    category: "Services",
    supported: true,
    mode: "execution",
    risk: "medium",
    currentFiles: CONTROLLED_ACTION_FILES,
    missingPieces: ["Automatic rollback execution."],
    notes: "Custom TCP, UDP, and TCP/UDP services plus service groups use controlled execution templates."
  },
  {
    id: "schedules",
    category: "Schedules",
    supported: true,
    mode: "execution",
    risk: "medium",
    currentFiles: CONTROLLED_ACTION_FILES,
    missingPieces: ["One-time schedule actions are not in the current catalog.", "Automatic rollback execution."],
    notes: "Recurring schedule create/update is supported through automatic command planning."
  },
  {
    id: "firewall_policies",
    category: "Firewall policies",
    supported: true,
    mode: "execution",
    risk: "high",
    currentFiles: CONTROLLED_ACTION_FILES,
    missingPieces: ["Automatic rollback execution.", "Broader policy feature coverage remains intentionally outside the controlled catalog."],
    notes: "Create, update, enable/disable, move, comment, and managed-only delete are supported. Some operations become critical and require break-glass confirmation."
  },
  {
    id: "nat",
    category: "NAT",
    supported: true,
    mode: "execution",
    risk: "high",
    currentFiles: CONTROLLED_ACTION_FILES,
    missingPieces: ["Automatic rollback execution.", "General-purpose raw NAT editing is intentionally unsupported."],
    notes: "Controlled egress/SNAT and destination-NAT policy templates are available with controlled approval. Automatic backup/export is disabled in Quick Controlled execution; use a manual backup when needed."
  },
  {
    id: "vip_port_forward",
    category: "VIP / port forward",
    supported: true,
    mode: "execution",
    risk: "high",
    currentFiles: CONTROLLED_ACTION_FILES,
    missingPieces: ["Automatic rollback execution."],
    notes: "VIP and VIP-group creation plus destination-NAT policy creation are supported with controlled approval. Automatic backup/export is disabled in Quick Controlled execution."
  },
  {
    id: "static_routes",
    category: "Static routes",
    supported: true,
    mode: "read-only",
    risk: "low",
    currentFiles: READ_ONLY_FILES,
    missingPieces: ["Structured create/update/delete route actions.", "Route-specific compiler, guard, and rollback plan."],
    notes: "Connection discovery reads the routing table. No route change command is currently planned or executed."
  },
  {
    id: "interfaces",
    category: "Interfaces",
    supported: true,
    mode: "execution",
    risk: "critical",
    currentFiles: CONTROLLED_ACTION_FILES,
    missingPieces: ["Automatic rollback execution."],
    notes: "Discovery, aliases, roles, enable/disable, VLAN creation, IP updates, and zones are covered. Lockout-sensitive changes retain PolicyGuard checks; automatic backup/export is disabled in Quick Controlled execution and remains optional/manual."
  },
  {
    id: "dns",
    category: "DNS",
    supported: false,
    mode: "not-implemented",
    risk: "high",
    currentFiles: [],
    missingPieces: ["Read-only discovery.", "Structured action catalog and compiler.", "PolicyGuard rules and rollback design."],
    notes: "No FortiGate DNS capability is exposed by the current connector."
  },
  {
    id: "dhcp",
    category: "DHCP",
    supported: false,
    mode: "not-implemented",
    risk: "high",
    currentFiles: [],
    missingPieces: ["Read-only discovery.", "Structured action catalog and compiler.", "PolicyGuard rules and rollback design."],
    notes: "No FortiGate DHCP scope or lease capability is currently implemented."
  },
  {
    id: "vpn",
    category: "VPN",
    supported: false,
    mode: "not-implemented",
    risk: "critical",
    currentFiles: [],
    missingPieces: ["Sanitized read-only discovery.", "VPN-specific data model and validation.", "Compiler, PolicyGuard, backup, and rollback design."],
    notes: "VPN inspection and changes are intentionally outside the current catalog."
  },
  {
    id: "security_profiles",
    category: "Security profiles",
    supported: false,
    mode: "not-implemented",
    risk: "high",
    currentFiles: [],
    missingPieces: ["Profile discovery.", "Profile-aware policy schema.", "Compiler, validation, and rollback design."],
    notes: "Web filter, IPS, antivirus, application control, SSL inspection, and related profiles are not currently managed."
  },
  {
    id: "logs_monitoring",
    category: "Logs / monitoring",
    supported: true,
    mode: "read-only",
    risk: "low",
    currentFiles: [CONNECTOR, CATALOG, COMPILER],
    missingPieces: ["Pagination/filter controls for large FortiGate command output.", "Dedicated monitoring API beyond device discovery/action results."],
    notes: "Controlled read-only log and session commands are available; they do not change FortiGate configuration."
  },
  {
    id: "backup_config_read",
    category: "Backup / config read",
    supported: true,
    mode: "read-only",
    risk: "medium",
    currentFiles: [CONNECTOR, CATALOG, COMPILER, GUARD],
    missingPieces: ["External backup destination/version retention workflow.", "Automated restore is intentionally not implemented."],
    notes: "Full/sanitized configuration read and preflight backup metadata are available. Sensitive output is sanitized by the connector."
  },
  {
    id: "system_status",
    category: "System status",
    supported: true,
    mode: "read-only",
    risk: "low",
    currentFiles: READ_ONLY_FILES,
    missingPieces: ["Dedicated historical status/health series."],
    notes: "Test/Discover reads system status, HA status, model, version, serial, hostname, VDOM state, and inventory summaries."
  }
];

export function getFortiGateCapabilities() {
  const summary = capabilities.reduce(
    (counts, capability) => {
      if (capability.mode === "execution") counts.execution += 1;
      else if (capability.mode === "dry-run") counts.dryRunOnly += 1;
      else if (capability.mode === "read-only") counts.readOnly += 1;
      else counts.notImplemented += 1;
      if (capability.risk === "high" || capability.risk === "critical") counts.dangerous += 1;
      return counts;
    },
    { execution: 0, dryRunOnly: 0, readOnly: 0, notImplemented: 0, dangerous: 0 }
  );

  return {
    vendor: "fortigate" as const,
    registryVersion: 1,
    executionRequiresApproval: true,
    summary,
    capabilities
  };
}
