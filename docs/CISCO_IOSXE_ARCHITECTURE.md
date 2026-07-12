# Cisco IOS-XE Architecture

Milestone 18.2A implements a safe read-only Cisco IOS-XE foundation.

Implemented:

- Cisco platform-family detection from `show version` output.
- IOS-XE vs IOS classic vs NX-OS/IOS-XR/ASA/FTD rejection logic.
- Read-only command registry for system, interfaces, VLAN, trunk, EtherChannel, STP, routing and ACL visibility.
- Parser fixtures for key read outputs.
- Prompt state helpers and output cleanup.

Not implemented yet:

- Broad Cisco mutations.
- Live IOS-XE SSH command execution as a success path.
- RESTCONF/NETCONF structured operations.

IOS-XE templates must not be sent to NX-OS, IOS-XR, ASA, FTD or unknown platforms.
