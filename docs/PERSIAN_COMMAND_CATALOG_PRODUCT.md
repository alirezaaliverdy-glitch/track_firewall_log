# Ù…Ø­ØµÙˆÙ„ Ú©Ø§ØªØ§Ù„ÙˆÚ¯ Ø¯Ø³ØªÙˆØ±Ø§Øª ÙØ§Ø±Ø³ÛŒ

## Ø¬Ù‡Øª Ù…Ø­ØµÙˆÙ„

Ø¯Ø± `PRODUCT_MODE=persian_command_catalog` Ù…Ø³ÛŒØ± Ø§ØµÙ„ÛŒ ÙØ§Ø±Ø³ÛŒâ€ŒÙ…Ø­ÙˆØ± Ùˆ backend-first Ø§Ø³Øª:

`Device -> Command Catalog -> validated ActionPlan -> Preview -> User Confirm -> PolicyGuard -> Connector -> Audit/Result`

Ø¨Ø±Ø§ÛŒ Ø¹Ù…Ù„ÛŒØ§Øª Ú†Ù†Ø¯Ù…Ø±Ø­Ù„Ù‡â€ŒØ§ÛŒ:

`Persian intent -> Resolver -> GuidedActionBlueprint -> ActionSession -> ActionPlan preview -> Action Center confirmation -> Connector`

Task 17.2B rule: multi-step creation requests such as VPN, VDOM, Zone, Policy/Rule, VIP/NAT/Port Forward, Interface/VLAN/Subinterface, and Route/Gateway must return `guided_workflow` before generic AI/manual fallback. No selected device is not a chat error. The app starts an ActionSession anyway, opens `/guided-actions/:sessionId`, and the wizard's first step is `device_selection` (`Ø§Ù†ØªØ®Ø§Ø¨ Ø¯Ø³ØªÚ¯Ø§Ù‡`). Only after the wizard has all required fields and the user builds a preview may an ActionPlan be created. These requests must never become `custom_vendor_action`, `generic_security_action`, `unsupported_vendor`, or `manual_or_not_implemented` while a guided blueprint exists.

Task 17.2C rule: when the wizard has valid required fields but the executable backend template is not complete, build-plan must create a preview-only ActionPlan instead of returning a useless 409. For FortiGate VPN, the preview plan is non-executable (`executionSupport=planned_or_partial`, `executable=false`), includes Persian summary, safe CLI outline, missing templates, verification and rollback plans, and disables Action Center execution. Secrets such as PSK/password are masked and are not persisted as raw values.


Ú©Ø§ØªØ§Ù„ÙˆÚ¯ Ù†Ù‚Ø·Ù‡ Ø´Ø±ÙˆØ¹ Ø¹Ù…Ù„ÛŒØ§Øª Ø§Ø³Øª Ùˆ AI ÙÙ‚Ø· ÙˆÙ‚ØªÛŒ Ø¯Ø³ØªÙˆØ± Ù…Ù†Ø§Ø³Ø¨ Ù¾ÛŒØ¯Ø§ Ù†Ø´ÙˆØ¯ØŒ draft ÛŒØ§ ActionPlan Ù¾ÛŒØ´Ù†Ù‡Ø§Ø¯ÛŒ Ù…ÛŒâ€ŒØ³Ø§Ø²Ø¯. Ù‡ÛŒÚ† endpoint Ú©Ø§ØªØ§Ù„ÙˆÚ¯ ÛŒØ§ AI Ù†Ø¨Ø§ÛŒØ¯ Ø®ÙˆØ¯Ú©Ø§Ø± Ø§Ø¬Ø±Ø§ Ú©Ù†Ø¯ ÛŒØ§ Ù…ØªÙ† Ø®Ø§Ù… shell ØªÙˆÙ„ÛŒØ¯Ø´Ø¯Ù‡ ØªÙˆØ³Ø· AI Ø±Ø§ Ø§Ø¬Ø±Ø§ Ú©Ù†Ø¯.

## Ù‚Ø±Ø§Ø±Ø¯Ø§Ø¯ ÙˆØ¶Ø¹ÛŒØª

- `implemented`: plannerØŒ template Ùˆ connector Ø«Ø¨Øªâ€ŒØ´Ø¯Ù‡ Ø¯Ø§Ø±Ø¯ Ùˆ Ø¨Ø§ Ù¾Ø§Ø±Ø§Ù…ØªØ±Ù‡Ø§ÛŒ Ú©Ø§Ù…Ù„ Ù…ÛŒâ€ŒØªÙˆØ§Ù†Ø¯ ActionPlan Ø§Ø¬Ø±Ø§ÛŒÛŒ Ø¨Ø³Ø§Ø²Ø¯.
- `manualOnly`: ÙÙ‚Ø· plan Ø¨Ø§Ø²Ø¨ÛŒÙ†ÛŒ ØºÛŒØ±Ù‚Ø§Ø¨Ù„â€ŒØ§Ø¬Ø±Ø§ Ù…ÛŒâ€ŒØ³Ø§Ø²Ø¯.
- `planned` Ùˆ `unsupported`: ActionPlan Ù†Ù…ÛŒâ€ŒØ³Ø§Ø²Ù†Ø¯ Ùˆ Ø§Ø¬Ø±Ø§ÛŒÛŒ Ù†Ù…Ø§ÛŒØ´ Ø¯Ø§Ø¯Ù‡ Ù†Ù…ÛŒâ€ŒØ´ÙˆÙ†Ø¯.

ÙˆØ¶Ø¹ÛŒØª ÙØ¹Ù„ÛŒ Ú©Ø§ØªØ§Ù„ÙˆÚ¯: 51 Ø¢ÛŒØªÙ…Ø› 22 Ù…ÙˆØ±Ø¯ `implemented` Ø´Ø§Ù…Ù„ 15 Linux Ùˆ 7 MikroTik (Ø¨Ø§ Ø§Ø­ØªØ³Ø§Ø¨ Daily Check)ØŒ 28 Ù…ÙˆØ±Ø¯ `manualOnly` Ùˆ ÛŒÚ© Ù…ÙˆØ±Ø¯ `planned` Ø¨Ø±Ø§ÛŒ MikroTik.

## Ù…Ø±Ø² Ø§Ø¬Ø±Ø§

- metadata Ú©Ø§ØªØ§Ù„ÙˆÚ¯ Ø¨Ø§ÛŒØ¯ sourceØŒ ID/versionØŒ action type Ø¯Ù‚ÛŒÙ‚ØŒ template/connectorØŒ implementation stateØŒ execution supportØŒ Ù¾Ø§Ø±Ø§Ù…ØªØ±Ù‡Ø§ÛŒ Ù†Ø±Ù…Ø§Ù„ Ùˆ Ú©Ø§Ù…Ù„â€ŒØ¨ÙˆØ¯Ù† Ø¢Ù†â€ŒÙ‡Ø§ Ø±Ø§ Ù†Ú¯Ù‡ Ø¯Ø§Ø±Ø¯.
- preview Ù‡Ø±Ú¯Ø² Ù†ØªÛŒØ¬Ù‡ Ø§Ø¬Ø±Ø§ Ù†ÛŒØ³Øª Ùˆ ØªØ§ Ù¾ÛŒØ´ Ø§Ø² connector ÙˆØ§Ù‚Ø¹ÛŒØŒ `metadata.executed=false` Ù…ÛŒâ€ŒÙ…Ø§Ù†Ø¯.
- Ø¯Ø±Ø®ÙˆØ§Ø³Øª ØªØ£ÛŒÛŒØ¯ Ø¨Ø§ÛŒØ¯ `intent=execute` Ø¨ÙØ±Ø³ØªØ¯. fingerprint ØªØ§Ø²Ú¯ÛŒ preview ÙÙ‚Ø· Ø§Ø² ÙˆØ±ÙˆØ¯ÛŒâ€ŒÙ‡Ø§ÛŒ Ù¾Ø§ÛŒØ¯Ø§Ø± Ø§Ø¬Ø±Ø§ Ø³Ø§Ø®ØªÙ‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯.
- ÙÙ‚Ø· Ù¾Ø³ Ø§Ø² Ø§Ø¬Ø±Ø§ÛŒ Ù…ÙˆÙÙ‚ connectorØŒ Ø«Ø¨Øª output/exit code/executor/timestamps Ùˆ `connectorInvoked=true` Ù…ÛŒâ€ŒØªÙˆØ§Ù† plan Ø±Ø§ `succeeded` Ú©Ø±Ø¯.
- Ù†ØªÛŒØ¬Ù‡ Ù…ÙˆÙÙ‚ Ø¯Ø± `/actions/:id/result` Ù†Ù…Ø§ÛŒØ´ Ø¯Ø§Ø¯Ù‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯. preview-only Ø¨Ø§ÛŒØ¯ Ø®Ø·Ø§ Ø¨Ø§Ø´Ø¯ØŒ Ù†Ù‡ Ù…ÙˆÙÙ‚ÛŒØª.

## Ø­Ø§Ù„Øª Ø¢Ø²Ù…Ø§ÛŒØ´Ú¯Ø§Ù‡ Ù…Ø­Ø§ÙØ¸Øªâ€ŒØ´Ø¯Ù‡

Ø¯Ø± ØªØ±Ú©ÛŒØ¨ `ACTION_EXECUTION_MODE=quick_controlled` Ùˆ `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`ØŒ Ø¨Ø±Ø§ÛŒ template Ù¾Ø´ØªÛŒØ¨Ø§Ù†ÛŒâ€ŒØ´Ø¯Ù‡ Ùˆ Ø«Ø¨Øªâ€ŒØ´Ø¯Ù‡ Linux/MikroTik ÛŒÚ© ØªØ£ÛŒÛŒØ¯ Ú©Ø§Ø±Ø¨Ø± Ú©Ø§ÙÛŒ Ø§Ø³Øª. deviceØŒ Ù¾Ø§Ø±Ø§Ù…ØªØ± Ù…Ø¹ØªØ¨Ø±ØŒ template/connectorØŒ PolicyGuardØŒ `intent=execute`ØŒ invocation ÙˆØ§Ù‚Ø¹ÛŒØŒ audit Ùˆ Ù†ØªÛŒØ¬Ù‡ ÙˆØ§Ù‚Ø¹ÛŒ Ù‡Ù…Ú†Ù†Ø§Ù† Ø§Ù„Ø²Ø§Ù…ÛŒâ€ŒØ§Ù†Ø¯.

## ÙØ§ÛŒÙ„â€ŒÙ‡Ø§ÛŒ Ø§ØµÙ„ÛŒ

- Ù‚Ø±Ø§Ø±Ø¯Ø§Ø¯ Ùˆ Ø¯Ø§Ø¯Ù‡: `backend/src/commands/catalog/types.ts`, `backend/src/commands/catalog/index.ts`
- validation/resolution: `command-catalog-validator.ts`, `catalog-action-resolver.ts`
- guided actions: `backend/src/guided-actions/`, `backend/src/routes/action-sessions.ts`
- template registry: `backend/src/commands/execution/execution-template-registry.ts`
- API: `backend/src/routes/command-catalog.ts`
- UI: `src/components/commands/CommandCatalogPanel.tsx`
- Ø§Ø¬Ø±Ø§ Ùˆ Ù†ØªÛŒØ¬Ù‡: `backend/src/services/action-plan.service.ts`, `src/components/actions/ActionResultView.tsx`

Ø¨Ø¹Ø¯ Ø§Ø² ØªØºÛŒÛŒØ± Ú©Ø§ØªØ§Ù„ÙˆÚ¯ØŒ Ø¯Ø± `backend` Ø¯Ø³ØªÙˆØ± `npm run validate:command-catalog` Ø§Ø¬Ø±Ø§ Ø´ÙˆØ¯. vendorÙ‡Ø§ÛŒ ØºÛŒØ± Linux/MikroTik ØªØ§ Ø²Ù…Ø§Ù† ÙˆØ¬ÙˆØ¯ connector Ùˆ verification ÙˆØ§Ù‚Ø¹ÛŒØŒ manual/planned Ø¨Ø§Ù‚ÛŒ Ù…ÛŒâ€ŒÙ…Ø§Ù†Ù†Ø¯.
# FortiGate Read-only Management Foundation (Task 17.0)

FortiGate operational intelligence follows the same catalog-first path as other implemented vendors. The supported read-only families are system status, interfaces, routing/DNS, admin access, policies/NAT/VIP, VPN, and HA/VDOM/zone. Each family compiles only fixed CLI commands and produces the shared structured contract: Persian summary, status, sourced evidence, findings, tables, and a reference to collapsed raw output.

The Daily Check combines those families into eight sections: Ø³Ù„Ø§Ù…Øª Ø³ÛŒØ³ØªÙ…ØŒ ÙˆØ¶Ø¹ÛŒØª Ù„Ø§ÛŒØ³Ù†Ø³ Ùˆ FortiGuardØŒ Ø§ÛŒÙ†ØªØ±ÙÛŒØ³â€ŒÙ‡Ø§ Ùˆ Ø¯Ø³ØªØ±Ø³ÛŒ Ù…Ø¯ÛŒØ±ÛŒØªÛŒØŒ Ù…Ø³ÛŒØ± Ùˆ DNSØŒ Ø³ÛŒØ§Ø³Øªâ€ŒÙ‡Ø§/NAT/VIPØŒ Ø´Ø¨Ú©Ù‡ Ø®ØµÙˆØµÛŒØŒ Ø§ÙØ²ÙˆÙ†Ú¯ÛŒ/VDOM/ZoneØŒ Ùˆ Ø§Ù…Ù†ÛŒØª Ù…Ø¯ÛŒØ±Ø§Ù†. Missing evidence is not treated as a confirmed fault. Invalid licensing on a lab VM is `needs_review` unless device output proves that a required feature is blocked.

Both `/api/commands/ai-propose` and operational chat use the central AI template resolver. With a selected FortiGate device, Persian interface/port requests resolve to the implemented `fortigate_show_interfaces` action and `fortigate_show_interfaces` execution template on `fortigate-ssh`; raw AI CLI is never executable.

## FortiGate Full Control Engine (Task 17.1)

FortiGate is now a connector-backed management target, not a read-only vendor. The full-control registry is `backend/src/fortigate/full-control-registry.ts` and records action metadata: `actionType`, `titleFa`, `category`, `risk`, `readCommand`, create/update/delete/enable/disable templates, required params, prechecks, preview diff, execution template, verification commands, rollback template, parser, and UI hints.

Implemented FortiGate actions use the same controlled path:

`Persian intent -> FortiGate device -> ActionPlan -> config snapshot/preflight -> CLI preview/diff -> user confirmation -> PolicyGuard -> fortigate-ssh -> verification -> Persian result -> audit/rollback reference`

The registry covers interface/VLAN, zone, address/service objects, firewall policy, VIP/IP pool, routing/DNS/NTP, VPN, admin/access/security, VDOM, HA, and SD-WAN actions. Command Search Ask AI and the bottom chatbot both use the central resolver, so supported Persian requests produce executable FortiGate ActionPlans instead of generic prose or `generic_security_action`.

Secret handling remains strict. Plain PSK/API token/password/certificate material must never appear in params, prompts, logs, docs, or UI; VPN PSK flows require `secretRef`/`pskSecretRef`.

## Global Guided Actions (Task 17.2)

The resolver can now return `guided_workflow` for multi-step operational requests. The frontend opens `Ø³Ø§Ø®Øª Ù…Ø±Ø­Ù„Ù‡â€ŒØ§ÛŒ Ø§Ú©Ø´Ù†`, collects Persian-labeled fields, validates fixed dropdowns and IP/CIDR/port values, and calls `/api/action-sessions/:id/build-plan`. The session API builds only backend template-backed ActionPlans and never executes directly.

FortiGate workflows added:

- Policy creation, address object creation, service object creation, static route, and VLAN interface are executable when all required values are supplied.
- VIP/port forward is partial because optional policy creation remains a separate workflow.
- IPsec VPN, SSL VPN, and policy enable/disable/move are partial/planned until deeper CLI/template coverage is complete.

The port-status intent bug is fixed. With a selected FortiGate device, `ÙˆØ¶Ø¹ÛŒØª Ù¾ÙˆØ±Øª Ù‡Ø§Ù…Ùˆ Ù†Ø´ÙˆÙ† Ø¨Ø¯Ù‡` maps to `fortigate_show_interfaces` without `srcInterface`. With a selected Linux device it maps to the listening/open-port template. Without a vendor/device, the UI gets a Persian clarification between physical interfaces and TCP/UDP listening ports.
