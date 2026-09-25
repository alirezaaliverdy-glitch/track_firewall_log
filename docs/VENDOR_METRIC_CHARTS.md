# Device overview charts and evidence

The overview shows at most three charts: management reachability, one interface's received/transmitted traffic, and one vendor-specific operational metric. Full readings, timestamps, and source are in the expandable sensor section and monitoring tab. A chart without verified samples displays an empty state, never estimated data.

| Vendor | Main metric | Traffic evidence |
| --- | --- | --- |
| Linux | CPU, then disk or memory | RX/TX byte counters from the selected non-loopback interface in `ip -s link`; Mbps is the byte delta over elapsed time. |
| MikroTik RouterOS | CPU load | Per-interface `rx-byte`/`tx-byte` from REST or read-only SSH `/interface print stats terse`; Mbps is the byte delta over elapsed time. |
| FortiGate | Active sessions, then memory or CPU | Per-interface `rxb`/`txb` from read-only `diagnose netlink interface list`; Mbps is the byte delta over elapsed time. |
| Cisco IOS XE | CPU utilisation | `show interfaces` reports five-minute input/output rates; the graph retains that five-minute measurement, not an instantaneous counter. |
| Sophos Firewall | Active interfaces or VPN connections | The current connector reads configuration and link/VPN states but does not collect authenticated traffic counters. No throughput chart is claimed until a supported source is added. |

Counter resets, unsafe numeric values, intervals below 5 seconds or above one hour, and missing interface identity do not produce a traffic rate. The UI marks old measurements as stale and does not present historical resource readings as current during a connection outage. Connector collections are authenticated and on demand; the five-second connectivity sensor is not a five-second full telemetry collector.

Official references: [Linux kernel interface statistics](https://www.kernel.org/doc/html/latest/networking/statistics.html), [MikroTik interface statistics](https://help.mikrotik.com/docs/spaces/ROS/pages/139526175/Interface%2Bstats%2Band%2Bmonitor-traffic), [FortiGate interface counters](https://docs.fortinet.com/document/fortigate/7.4.2/administration-guide/306050/displaying-detail-hardware-nic-information), [Cisco interface input/output rates](https://www.cisco.com/c/en/us/support/docs/routers/asr-1000-series-ios-xe-sd-wan/224129-troubleshoot-interface-packet-drops-in.html), [Sophos interface graphs](https://docs.sophos.com/nsg/sophos-firewall/20.0/Help/en-us/webhelp/onlinehelp/AdministratorHelp/Diagnostics/SystemGraphs/InterfaceInfoGraphs/index.html).
