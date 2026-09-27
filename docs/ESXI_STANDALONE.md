# Standalone ESXi host support

The ESXi integration targets the **standalone host**, not vCenter. It uses the vSphere Web Services SOAP endpoint at `https://<host>:<port>/sdk`. It does not change or power-cycle individual VMs.

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

Credentials are read from the application's credential vault. SOAP XML is escaped and parsed with DTD, response-size and node-count limits. Only cataloged methods and bounded object references are permitted; arbitrary SOAP calls are not exposed to users. HTTPS uses verified TLS 1.2+ and an optional explicit trusted certificate. Network timeout is 15 seconds per request.

Unit tests cover XML fault/DTD rejection, certificate validation, inventory parsing, host-action catalog registration, and maintenance/service prechecks. The catalog validator and TypeScript build pass. A live standalone ESXi host was not available for end-to-end verification; before production use, test a least-privilege account and approved non-disruptive action against the actual ESXi version.

API references: [vSphere Web Services API](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/index.html), [HostSystem](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.HostSystem.html), [HostServiceSystem](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.host.ServiceSystem.html), [HostConfigInfo](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.host.ConfigInfo.html).
