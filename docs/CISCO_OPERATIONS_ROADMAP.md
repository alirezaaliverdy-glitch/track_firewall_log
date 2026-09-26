# Cisco operations: staged management architecture

## Product flow

Select an active Cisco device → choose an operation category → enter typed parameters → inspect the exact command preview → explicitly confirm → PolicyGuard → Cisco SSH connector → verification evidence and audit. A preview never changes the device. A connector failure or rejected CLI command must never be shown as a successful operation.

## Categories and rollout

| Category | Current usable scope | Next controlled increments |
| --- | --- | --- |
| Inspect and diagnose | Platform, inventory, health, interfaces, VLAN, EtherChannel, routes, logs, ping/traceroute | Diff and drift views with evidence freshness |
| Interfaces and switching | Description, enable/disable, access VLAN, trunk VLAN list, LACP access EtherChannel | Trunk EtherChannel, member removal, STP guard, template-backed port profiles |
| Routing and network services | Static route, NTP, syslog | Dynamic routing and DHCP only with platform-specific validation |
| Security and access | Read ACLs | Typed ACL entries, management access and AAA with credential-safe rollback |
| Configuration lifecycle | Read/backup running config, save, controlled reload | Encrypted backup references, diff, restore with maintenance-window controls |

The registry remains the source of truth. An item is executable only when its template, parameter validator, planner, connector and verification exist. Planned entries are visible but cannot be dispatched. Cisco IOS Classic and IOS-XE must be tested separately; model/feature support must be confirmed from a live collection before adding model-specific write operations.

## First parameterized change: LACP access EtherChannel

`cisco.create-access-etherchannel` accepts a group (1–24 for the current Catalyst 2960-X target), 2–8 unique physical ports of the same Ethernet family, an active access VLAN, and explicit acknowledgement of possible traffic interruption. It supports only Layer-2 access ports and LACP active mode. Before configuration, the connector checks that the Port-channel is unused, the VLAN is active, and every selected port exists without trunk, Layer-3, voice-VLAN, authentication, or existing channel-group configuration. Any failed precheck stops before the first write. Cisco CLI rejection stops subsequent steps. The final `show etherchannel` response is stored as evidence; peer-side negotiation and traffic continuity still require operator verification. No configuration is applied to a live switch by the implementation or tests.

## Connectivity semantics

The same explicit legacy Cisco SSH compatibility profile used by the collector must be used by the shared monitoring session. Connection-pool identity includes SSH algorithms and authentication mode so a changed profile cannot reuse an incompatible connection. A fresh authenticated session marks recovery online; failed attempts continue to follow the existing two-sample offline threshold. Live status must come from sensor evidence, not a manual database flag.

## Remaining work before claiming full Cisco management

Per-platform capability negotiation, tested rollback or configuration restore, interface compatibility checks for speed/duplex/native VLAN/allowed VLANs, peer negotiation verification, configuration diff, and integration tests on each supported IOS variant are required. These are not implied by the first EtherChannel workflow.

Reference: [Cisco Catalyst 2960-X IOS 15.2(7)E EtherChannel guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst2960x/software/15-2_7_e/configuration_guide/b_1527e_consolidated_2960x_cg/m_lay2_ethchl_cg_2960.html).
