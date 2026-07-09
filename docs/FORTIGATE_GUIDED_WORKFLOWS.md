# FortiGate Guided Workflows

Last updated: 2026-07-09

## Global Guided Action Architecture

Guided actions are backend-owned blueprints under `backend/src/guided-actions/`. They are not FortiGate-only. A blueprint describes fixed vendor options, dynamic option providers, prerequisites, Persian labels/help, validation, verification, rollback hints, and the backend-only `buildActionPlan` function.

Resolver modes are now:

- `executable_action_plan`: simple implemented template with complete params.
- `needs_input`: simple implemented template with declared missing params.
- `guided_workflow`: multi-step action that should open the Persian builder.
- `clarification`: ambiguous request that needs a Persian choice.
- `manual_or_not_supported`: no implemented template/blueprint is available.

ActionSession lifecycle:

1. `POST /api/action-sessions/start`
2. `GET /api/action-sessions/:id`
3. `POST /api/action-sessions/:id/answers`
4. `POST /api/action-sessions/:id/build-plan`
5. `POST /api/action-sessions/:id/cancel`

Execution still happens only through the existing Action Center quick-execute path after user confirmation. ActionSession never executes connector commands directly.

Task 17.2B hard routing: clear multi-step requests must open a guided wizard even when the main chat has no selected device. `/api/commands/ai-propose` and `/api/ai/chat` return `mode=guided_workflow`; the frontend starts `/api/action-sessions/start` and navigates to `/guided-actions/:sessionId`. If no device was supplied, the session is pending and the first wizard step is `device_selection` (`انتخاب دستگاه`). Choosing a device resolves its vendor from the database and switches to the matching vendor blueprint before action-specific steps. No ActionPlan is created until the wizard fields are complete and the user clicks build preview.

## FortiGate Workflow Registry

Registry file: `backend/src/guided-actions/vendors/fortigate/fortigate-blueprints.ts`.

Option metadata file: `backend/src/guided-actions/vendors/fortigate/fortigate-options.ts`.

Research notes: `backend/src/guided-actions/vendors/fortigate/fortigate-research-notes.md`.

Implemented/executable where compiler-backed:

- `fortigate_guided_firewall_policy_create`
- `fortigate_guided_zone_create`
- `fortigate_guided_address_object_create`
- `fortigate_guided_service_object_create`
- `fortigate_guided_static_route_create`
- `fortigate_guided_interface_vlan_create`

Partial/planned, no fake executable success:

- `fortigate_guided_vpn_setup`: public VPN workflow ID for IPsec site-to-site, SSL VPN, and partial remote-access setup. It collects `vpnType`, networks, WAN/Gateway, auth/PSK, policy access choices, and preview metadata; it does not build a complete executable VPN ActionPlan yet.
- `fortigate_guided_vdom_create`: planned high-risk VDOM workflow. It collects VDOM name, mode, optional interface assignment, planned resource limits, and planned inter-VDOM link settings. Executable VDOM creation must require double confirmation when promoted.
- `fortigate_guided_vip_port_forward_create`: VIP creation is compiler-backed, optional follow-up policy creation remains separate.
- `fortigate_guided_ipsec_vpn_setup` and `fortigate_guided_ssl_vpn_setup`: legacy/internal IDs from the first guided pass; new resolver routing uses `fortigate_guided_vpn_setup`.
- `fortigate_guided_policy_enable_disable_or_move`: metadata and selectors exist, but branch-specific build is not complete.

## Fixed Dropdowns

Fixed FortiGate fields use `select`/`multiSelect`:

- Policy action: `accept`, `deny`
- Policy logging: `all`, `disable`
- Service protocol: `TCP`, `UDP`, `TCP-UDP`
- Address type: `subnet`, `iprange`, `fqdn`, `wildcard-fqdn`, `geography`
- Interface allowaccess: `ping`, `https`, `ssh`, `http`, `fgfm`, `snmp`, `radius-acct`, `probe-response`, `fabric`
- VIP protocol: currently executable as `tcp` only in the existing template
- VPN type: `ipsec_site_to_site`, `ssl_vpn`, `ipsec_remote_access` (remote access is partial)
- VPN auth method: `psk`, `certificate` (certificate is partial)
- VPN PSK mode: `generate`, `manual`
- VPN proposal values: only existing-template/project-verified dropdown values

Guided routing keywords include Persian/English forms for `vpn`, `ipsec`, `ssl vpn`, tunnel creation, `vdom`, `zone`, policy/rule creation, VIP/NAT/port forward, interface/VLAN/subinterface, and route/static route/gateway changes. These keywords must not be handled by generic AI fallback when a selected FortiGate device exists.

Variable user-entered values are validated: name patterns, IP, CIDR, CIDR lists, IP ranges, ports, VLAN ID, and free-text comments.

## Research Status

Official Fortinet documentation checked:

- FortiOS 7.4 CLI reference for `config firewall address`: https://docs.fortinet.com/document/fortigate/7.4.0/cli-reference/225620/config-firewall-address

Existing project templates checked:

- `backend/src/fortigate/full-control-registry.ts`
- `backend/src/services/fortigate-command-compiler.ts`
- `backend/src/commands/execution/execution-template-registry.ts`
- `backend/src/connectors/fortigate-ssh.connector.ts`

Where official docs were not verified, enum sources are marked `verified_from_existing_templates`, `partial`, or `project_default`. No workflow is marked executable unless the backend compiler/template can build a registered FortiGate ActionPlan.

## Known Limitations

- ActionSession storage is currently in-memory.
- Dynamic runtime option providers are declared, but fetching live interfaces/objects/groups/policies is not yet fully wired into the UI.
- General multi-step execution metadata is present, but automatic sequential multi-step connector execution is not promoted beyond the existing single ActionPlan execution path.
- VPN and SSL VPN setup need deeper official FortiOS CLI research before becoming full executable workflows.
