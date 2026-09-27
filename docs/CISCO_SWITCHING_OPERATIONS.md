# Controlled Cisco switching operations

## Scope and UI

Actions -> Cisco -> choose a catalog operation and device -> parameter wizard -> Preview -> user Confirm -> PolicyGuard -> connector -> audit/result.
The wizard suggests real interface names from the last collected workspace; these are not treated as fresh execution evidence. Every selected interface is checked again on the actual device before writing.

The 15 implemented switching workflows cover:

- LACP Layer-2 Access/Trunk group creation, adding/removing members, same-mode VLAN/native/allowed-list edits, and group deletion.
- Standalone Trunk configuration, replacing the whole allowed list, or adding/removing selected VLANs without discarding the rest. Allowed-list edits may target Port-channel; mode/native edits must use the dedicated group operation so members are synchronized.
- VLAN creation, renaming, guarded deletion, and physical Access-port assignment.

This is not universal Cisco management: PAgP, static EtherChannel, Layer-3 groups, cross-device groups, Access/Trunk conversion of an existing group, and NX-OS switching are not supported here. Conservative limits are group 1..24 and up to eight same-family physical ports. Creation requires at least two ports; editing/deleting requires the exact complete existing member list. Actual model/firmware CLI support is still checked by strict command handling.

## Execution guarantees and limits

- A fresh encrypted running-configuration backup and its action-audit reference are required before switching writes. Failure stops execution. Startup-config is not saved implicitly.
- Authenticated show-version verifies supported IOS/IOS XE before changes. Running-config, VLAN database, membership, port existence and speed/duplex evidence are evaluated before the first configuration command. Routed/voice/private-VLAN/port-security/authentication ports require manual review.
- LACP creation/addition verifies the requested group settings and exact members; success requires Layer-2 `SU`, LACP and every expected member `(P)`. Merely accepting CLI commands is not success. The peer must be prepared; Passive requires an Active peer.
- Selected explicit VLAN lists and the native VLAN are checked for availability for group workflows; `all` means permitted IDs rather than requiring all 4094 IDs to exist. Standalone allowed-list operations can allow future VLANs; read-back verifies configuration, not end-to-end traffic or peer settings.
- Only the final LACP summary may retry up to five times, one second apart. Configuration commands are never automatically replayed. A failed post-write check reports verification failure; partial changes may remain and must be reviewed before retrying.
- Removing/deleting members shuts detached ports down first and leaves them shut down, with their prior switchport configuration intact. This prevents automatically activating parallel standalone links.
- VLAN database changes require VTP Transparent/Off. Reserved/default VLANs cannot be modified. Deletion checks Access/Voice/Native/SVI and allowed-Trunk references; private-VLAN/SPAN configurations fail closed for manual dependency review.
- Automatic rollback is not claimed. The safety backup supports a separate controlled restore. The process-local per-device lock prevents concurrent switching workflows in this API process, not external operator changes or multiple API replicas.

## Verification

Isolated registry/planner/validation and interactive-transport regression tests check injection rejection, pre-write stops, exact settings/membership, dependency rejection, preservation of unrelated VLANs, read-only settling retries and explicit post-write failure. Catalog validation and production builds are required. No destructive/mutative operation is exercised on user equipment without specific target/parameter confirmation; model-specific lab execution acceptance remains required.

Official references:

- https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr2-fwd/etherchannel/etherchannel-configuration-guide/etherchannels.html
- https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-13/configuration_guide/vlan/b_1713_vlan_9300_cg/configuring_vlan_trunks.html
- https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-13/configuration_guide/vlan/b_1713_vlan_9300_cg/configuring_vlans.html
