# Traffic volume collection (NetFlow v5/v9)

The dashboard distinguishes three sources:

- **Interface Mbps:** a rate calculated from two fresh device byte counters, or Cisco's reported five-minute interface average. A missing, reset, or stale counter is not shown as live traffic.
- **IP/port bytes:** unsummed raw bytes are not inferred from event counts. The dashboard uses per-device NetFlow v5 or v9 records when present; otherwise it uses explicit byte fields in allowed flow logs (including FortiGate `sentbyte` and `rcvdbyte`). These sources are not added together because they may describe the same packets. If both NetFlow formats appear, only the most recently used format is shown to avoid counting the same packets twice.
- **Log counts:** shown separately as observations, never as traffic volume.

## Enable one device

1. Open Dashboard → Device traffic, select the device, expand **Flow collection setup**.
2. Enter the source IPv4 address from which its UDP export reaches the server. This may differ from the management IP because of NAT. Enable and save as an administrator. The same exporter IP cannot be assigned to two devices.
3. In the router/firewall, enable **NetFlow version 5 or 9** export for the relevant interfaces, preferably without sampling. For v9, the template must contain IPv4 source/destination and a byte counter (`IN_BYTES` or `OUT_BYTES`); unsupported templates are not interpreted. Set the destination to the server's **direct IP**, UDP port **2055**. A hostname behind an HTTP CDN is not a UDP collector endpoint.
4. The Docker host port binds to `127.0.0.1` by default. For a remote exporter, set `NETFLOW_BIND_IP` in the deployment environment to a server interface address before redeploying the API. Restrict UDP/2055 on the host/network firewall to the specific exporter IP. Do not expose it broadly.
5. Return to the device card. The most recent received flow and per-device dropped-packet count appear in the setup panel. Refresh the dashboard to see measured IP/port bytes. No re-registration is needed if the existing device is correct; only the exporter source IP must match.

This receiver accepts NetFlow **v5 and IPv4 v9**. V9 is template-based: the exporter must resend its template after a collector restart before data can be decoded. Unknown, expired, malformed, and non-IPv4 templates do not produce traffic rows. IPFIX and sFlow packets are rejected rather than guessed. NetFlow is pushed by the exporter; the application cannot pull historical flows from a device. Both formats report interface numbers (`ifIndex`), not interface names; interface names and Mbps still come from the device's separate telemetry.

Vendor fit: [MikroTik Traffic Flow](https://help.mikrotik.com/docs/spaces/ROS/pages/21102653/Traffic%2BFlow) supports v5/v9 but cannot observe hardware-offloaded traffic; [Cisco IOS XE](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/fnetflow/configuration/xe-16-12/fnf-xe-17-book.pdf) can export v5/v9 when the platform and flow record support it; [FortiGate NetFlow](https://docs.fortinet.com/document/fortigate/latest/administration-guide/998643/netflow) uses a collector and per-interface configuration, commonly v9. Linux/ESXi interface rates work independently; an ESXi IPFIX-only exporter is not yet supported by this receiver. Check the exact device firmware and platform capabilities before changing exporter settings.

The receiver batches flow bytes by device, dimension, and minute in `MetricSample` and keeps these rollups for seven days. The dashboard shows the last 24 hours. V5 exposes a sampling interval; v9 sampling status is not decoded from options templates. In either case, packet loss, exporter filters, hardware offload, and device resets can make totals incomplete. The app shows no fabricated full-traffic estimate. Received flows are telemetry, **not security events** and do not automatically create attack findings or vendor actions.

Source-IP matching is not cryptographic authentication. Keep the UDP port behind an exporter-IP firewall rule or a private network/VPN. Normal device command execution, PolicyGuard, approval, and audit behavior are unchanged.
