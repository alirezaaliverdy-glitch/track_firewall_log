# Vendor connection methods

The application separates the management/control connection from event and telemetry channels. A device is onboarded through one tested management method; Syslog, SNMPv3, gNMI, or an agent complement that connection instead of replacing it.

| Vendor | Management path available now | Recommended companion channels | Notes |
| --- | --- | --- | --- |
| Linux | SSH with a private key | Agent, Syslog over TLS | SSH is used for bootstrap, read-only discovery, and controlled operations. |
| Cisco IOS / IOS-XE | SSH/CLI | RESTCONF or NETCONF on supported IOS-XE, gNMI, SNMPv3, Syslog | The current connector keeps broad IOS compatibility. Model-driven channels must first be enabled on the device. |
| MikroTik RouterOS | SSH/CLI; HTTPS REST inventory on RouterOS 7 | SNMPv3, remote Syslog | REST is intentionally read-only in this release. Controlled changes remain on the existing SSH connector. |
| FortiGate | SSH/CLI | REST API token (planned connector), SNMPv3, Syslog over TLS | API tokens must use least privilege and trusted hosts. |
| Sophos Firewall | Firewall XML API | Current REST API (planned connector), SNMPv3, Syslog | API access must permit the application server endpoint. |

## Security defaults

- Credentials are referenced from the encrypted credential store; onboarding payloads reject plaintext secrets.
- Discovery and connection tests execute read-only requests.
- A telemetry method is never presented as a management method.
- RouterOS REST uses HTTPS. Certificate verification can be enforced with the stored `mikrotikTlsVerify` capability; deployments should install a trusted certificate before production use.
- Write actions continue through the existing allowlisted command/action plans, approval, audit, and rollback contracts.

## Official references

- MikroTik RouterOS REST API: https://help.mikrotik.com/docs/spaces/ROS/pages/47579162/REST%2BAPI
- MikroTik RouterOS services: https://help.mikrotik.com/docs/spaces/ROS/pages/103841820/Services
- MikroTik SSH: https://help.mikrotik.com/docs/spaces/ROS/pages/132350014/SSH
- Cisco RESTCONF: https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/prog/configuration/1718/b-1718-programmability-cg/restconf_protocol.html
- Cisco NETCONF and model-driven telemetry: https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/prog/configuration/177/b_177_programmability_cg/m_177_prog_ietf_telemetry.html
- Cisco gNMI: https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/prog/configuration/1718/b-1718-programmability-cg/m-1718-prog-gnmi.html
- FortiGate APIs: https://docs.fortinet.com/document/fortigate/latest/administration-guide/940602/using-apis
- FortiGate SNMPv3: https://docs.fortinet.com/document/fortigate/latest/administration-guide/614237/snmp-examples
- Sophos Firewall REST API: https://docs.sophos.com/nsg/sophos-firewall/rest-api/index.html
