# Standalone ESXi host support

The ESXi integration targets the **standalone host**, not vCenter. SOAP uses `https://<host>:<port>/sdk`; the separately selectable SSH path provides fixed read-only inventory with a pinned RSA-SHA2 host key. It does not change or power-cycle individual VMs. See the [Persian SSH/API setup guide](ESXI_CONNECTION_SETUP_FA.md). The host operations below apply to API devices only.

## Register a host

1. Open **Assets → Register device**, choose **VMware ESXi**, and select its company.
2. Enter the ESXi management DNS name or IP and HTTPS port (normally 443).
3. Select or create a username/password credential with the minimum privileges needed for inventory; grant additional host privileges only for actions you intend to use.
4. If the host certificate is not trusted by the application server, paste its PEM certificate or trusted CA PEM. TLS certificate and hostname verification stay enabled. Prefer a DNS name matching the certificate SAN.
5. Run the connection test. Save the verified asset, then use **Collect fresh data** in its overview.

The host overview records collection time and reports ESXi version/build, model/serial/BIOS, connection/maintenance/lockdown state, CPU and memory, VM count and a bounded VM list, datastore capacity, hardware sensors, services, physical and VMkernel NICs, vSwitches, port groups, DNS/NTP, storage adapters/devices and host firewall rulesets. Empty fields mean the API did not return that value; they are not fabricated.

## Host operations

The action catalog exposes read-only inventory, enter/exit maintenance mode, start/stop a discovered host service, and set NTP servers. Each write goes through preview and explicit approval, re-reads host state immediately before execution, and verifies the result. The app refuses to stop a required or management service. Maintenance entry is refused when any listed VM is powered on, VM state is unknown, or the VM list is truncated. A standalone host does not migrate or shut down VMs automatically.

No automatic rollback is claimed. Network, DNS, datastore, firewall, account, reboot and shutdown changes are **not yet executable** in this integration. VM details are read-only context for capacity and maintenance safety; VM management is intentionally out of scope.

## Security and validation

### SSH host monitoring and workspace

The fixed SSH collector additionally reads typed `vim-cmd hostsvc/hostsummary` quick statistics (CPU MHz divided by (MHz/core × cores); memory MB divided by (physical bytes/1024²)), host services, virtual switches, DNS/NTP configuration, storage adapters and firewall rulesets. Up to 16 strictly validated discovered `vmnic` names get RX/TX byte counters; the existing labelled counter-delta pipeline persists these alongside real CPU/RAM readings for Highcharts. Missing/negative/unsafe numeric readings and unknown schemas are not zero. The total inventory deadline remains 30 seconds; commands use the shared pinned, authenticated SSH session, not a new login per reading. SOAP API traffic counters are not yet collected; missing traffic is explicit.

Optional command failures or malformed CSV do not turn an authenticated ESXi host into an offline device. Per-domain coverage is persisted and projected; incomplete/truncated inventory is explicit. The responsive host panel prioritizes four measured resource values and groups storage, network, services, firewall and hardware health in stable disclosures. SSH mutations and full hardware/VM discovery remain unsupported; API is needed for the existing reviewed host operations. Maintenance requires known maintenance and complete VM state; service changes require a known current service state.

References: [QuickStats units](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.host.Summary.QuickStats.html), [ESXCLI networking](https://developer.broadcom.com/xapis/esxcli-command-reference/latest/namespace/esxcli_network.html), [ESXCLI system/NTP](https://developer.broadcom.com/xapis/esxcli-command-reference/latest/namespace/esxcli_system.html).

Credentials are read from the application's credential vault. SOAP XML is escaped and parsed with DTD, response-size and node-count limits. Only cataloged methods and bounded object references are permitted; arbitrary SOAP calls are not exposed to users. HTTPS uses verified TLS 1.2+ and an optional explicit trusted certificate. Network timeout is 15 seconds per request.

Unit tests cover XML fault/DTD rejection, certificate validation, inventory parsing, host-action catalog registration, and maintenance/service prechecks. The catalog validator and TypeScript build pass. A live standalone ESXi host was not available for end-to-end verification; before production use, test a least-privilege account and approved non-disruptive action against the actual ESXi version.

API references: [vSphere Web Services API](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/index.html), [HostSystem](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.HostSystem.html), [HostServiceSystem](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.host.ServiceSystem.html), [HostConfigInfo](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.host.ConfigInfo.html).
