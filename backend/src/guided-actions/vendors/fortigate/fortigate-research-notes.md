# FortiGate Guided Workflow Research Notes

Official documentation checked:

- Fortinet FortiOS 7.4 CLI reference, `config firewall address`: verified that address objects expose a controlled `type` field including documented values such as `ipmask`, `iprange`, and FQDN-related variants. Project blueprints map the default subnet workflow to the existing compiler's `subnet` value and mark the remaining supported address types with source metadata.

Project templates/connectors checked:

- `backend/src/fortigate/full-control-registry.ts`
- `backend/src/services/fortigate-command-compiler.ts`
- `backend/src/commands/execution/execution-template-registry.ts`
- `backend/src/connectors/fortigate-ssh.connector.ts`

Implementation decisions:

- Firewall policy, address object, service object, static route, and VLAN interface workflows are executable only where the current compiler already supports the target `fortigate_*` action.
- VIP port forwarding is partial because the current compiler supports a single VIP action but not the optional follow-up firewall policy creation inside one generalized multi-step execution model.
- IPsec VPN and SSL VPN are partial. The registry collects controlled values and protects PSK through `pskSecretRef`, but it does not fake a complete executable tunnel/portal workflow until Phase1/Phase2/portal templates are fully modeled.
- Runtime selectors are declared for FortiGate interfaces, address objects, service objects, user groups, zones, IP pools, and policies. If a provider cannot fetch from the device, the UI can allow manual input only for fields marked `allowCustom=true` and must show the Persian warning defined by the workflow help text.
