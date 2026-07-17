# Cisco IOS-XE Capability Coverage Matrix

This file defines the required product coverage. Codex must convert this matrix into the application's registered capability system and update implementation status honestly.

Legend:

- `I` implemented and executable/tested
- `R` implemented read-only
- `P` partial
- `L` planned
- `U` unsupported for this platform/version

## Platform and inventory

| Capability | Target |
|---|---|
| Detect IOS-XE / IOS / NX-OS / IOS-XR / ASA / FTD | I |
| Version/model/serial/inventory | R |
| CPU/memory/uptime | R |
| Environment/power/fan/temperature | R/P by platform |
| License summary | R/P |
| Running/startup config summary | R |
| Config diff | R |
| Secure config backup | I |
| Save running config | I with confirmation |
| Config rollback/replace | P until lab verified |

## Interfaces

| Capability | Target |
|---|---|
| List/status/counters/errors | R |
| IP interface brief | R |
| Transceiver details | R/P |
| Shutdown/no shutdown | I |
| Description | I |
| Speed/duplex | I/P by platform |
| Access mode/VLAN | I |
| Trunk mode | I |
| Allowed VLAN set/add/remove | I |
| Native VLAN | I |
| Routed interface IP | I |
| MTU | I/P |
| Port security | I/P |

## VLAN and STP

| Capability | Target |
|---|---|
| VLAN list/status/membership | R |
| VLAN create/rename/delete | I |
| VTP status | R |
| STP summary/per-VLAN | R |
| Root/roles/inconsistent ports | R |
| PortFast/BPDU guard/root guard | I |
| STP mode/priority | P until lab verified |

## EtherChannel

| Capability | Target |
|---|---|
| List/summary/detail | R |
| LACP active/passive | I |
| PAgP desirable/auto | I when supported |
| Static mode on | I |
| L2 access Port-Channel | I |
| L2 trunk Port-Channel | I |
| L3 Port-Channel | I |
| Add/remove member | I |
| Update VLAN/native VLAN | I |
| Delete safely | I |
| Preflight compatibility | I |
| Backup/diff/verification/rollback | I |

## Layer 3

| Capability | Target |
|---|---|
| Routing table/ARP/ND | R |
| Static route add/remove | I |
| Default route | I |
| VRF list | R |
| VRF create/assign | P |
| OSPF read | R |
| OSPF selected mutations | P |
| EIGRP read | R/P |
| BGP read | R/P |
| BGP mutations | L/high-risk |
| HSRP/VRRP/GLBP read | R/P |

## ACL and security

| Capability | Target |
|---|---|
| ACL list/detail/binding | R |
| Named standard/extended ACL lifecycle | I/P |
| Sequence add/remove | I |
| Bind/unbind interface ACL | I |
| Port-security read/change | I/P |
| DHCP snooping/DAI/source guard | P |
| Management lockout detection | I |

## Services

| Capability | Target |
|---|---|
| CDP/LLDP read/change | I |
| NTP read/change | I |
| Syslog read/change | I |
| SNMP read/change | I/P |
| SSH status/hardening | I/P |
| AAA read | R |
| AAA mutation | L/high-risk |
| DHCP pools/bindings | R/P |
| DHCP pool mutations | P |
| Archive/config lifecycle | I/P |

## Troubleshooting

| Capability | Target |
|---|---|
| Interface health workflow | I |
| VLAN/trunk workflow | I |
| EtherChannel troubleshooting | I |
| Route-neighbor troubleshooting | I/P |
| High CPU/memory workflow | I |
| Config drift | I |
| Neighbor/topology discovery | I |
| Unbounded debug commands | U by default |

## Acceptance rule

A capability can be marked `implemented` only when:

1. official source is recorded;
2. platform/version gate exists;
3. parameter schema exists;
4. connector template exists;
5. parser/structured output exists;
6. tests exist;
7. mutation has preflight, preview, confirmation, backup, verification and rollback status;
8. UI exposes it correctly;
9. Playwright MCP validates the user flow.
