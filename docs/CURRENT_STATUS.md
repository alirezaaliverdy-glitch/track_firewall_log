# Current Project Status

Last updated: 2026-07-07

Branch: `product-persian-command-catalog`

Product mode: `PRODUCT_MODE=persian_command_catalog`

## Product State

The project now behaves as a Persian-first Network & Security Command Center with the controlled path:

`AI/Catalog -> ActionPlan -> Preview -> User Confirm -> Connector -> Audit/Result`

Task 16 is functionally complete for:

- AI resolver / AI assistant contract / honest catalog AI fallback
- vendor-aware Daily Check foundations and Persian UI
- Linux Service Health templates, connector coverage, and UI
- result navigation in a new tab with popup-block fallback
- structured Action Result formatting for key Linux and MikroTik actions

Task 16.2 is complete for Command Catalog AI fallback: no-result `Ask AI` requests now use the central AI template resolver first and create executable ActionPlans when a registered template exists.

Task 16.3 is complete for deterministic Persian intent routing across AI chat and Command Search AI fallback. Simple Persian admin requests now map to executable template-backed ActionPlans before generic AI/manual fallback.

## What Works

- AI-supported Persian requests that map to registered templates create executable ActionPlans instead of vague manual proposals.
- Command Catalog AI fallback maps Persian Linux port-status phrases such as `وضعیت پورت های رو میخوام ببینم` to `linux_list_open_ports` with `executionTemplateRef=linux_list_open_ports` and `connectorType=linux-ssh`.
- Persian deterministic intent routing maps `وضعیت پورت های باز رو نشون بده` to executable `linux_list_open_ports` with empty params, `executionTemplateRef=linux_list_open_ports`, `connectorType=linux-ssh`, and metadata source `ai_mapped_template`.
- Linux mapped requests for firewall status, service status, sudo users, block IP, and open port now validate only the resolved template params. Open-port listing no longer requires `sourceIp`, `ipAddress`, or `port`.
- MikroTik mapped requests for management services, login logs, and block IP now use executable alias action types backed by registered RouterOS templates.
- Command Catalog AI fallback now returns honest modes: `executable_action_plan`, `needs_input`, `manual_proposal`.
- Daily Check now uses vendor-aware profiles across Linux, MikroTik, FortiGate, Cisco, pfSense, Juniper, Palo Alto, Windows, Docker, and Kubernetes.
- Linux and MikroTik Daily Check remain the real connector-backed execution paths.
- Linux Service Health is available for running services, failed services, important services, and targeted service status checks.
- Action execution results open in a new tab from Action Center, with a visible fallback link if the browser blocks popups.
- Action Result view now shows Persian summary, execution status, device/vendor, duration, structured output, next actions, and collapsed raw output.
- Execution safety remains strict: `intent=execute`, resolved template, real connector invocation, persisted stdout/stderr/exitCode/duration, and no success without `connectorInvoked=true`.

## Partial or Open

- Older mojibake strings still exist in unrelated legacy UI/backend areas and need a dedicated encoding cleanup task.
- Daily Check for non-Linux/MikroTik vendors is honest manual-only today; it is not real execution yet.
- Frontend build still emits the existing large-chunk warning; this is not introduced by Task 16.
- The local database needed the Task 16 enum migration SQL executed for validation; other environments must also apply it before using the new Linux service-health actions.

## Known Bugs and Risks

- If another environment does not apply `20260707160000_task16_linux_service_health`, creating plans for new Linux service-health actions will fail at the database enum layer.
- Several legacy screens still mix older English text with Persian-first UI conventions.
- Success semantics must stay evidence-based; preview-only states must never be shown as successful execution.
- `command_search_ai_fallback` metadata is now treated as controlled catalog metadata only when it is implemented, connector-backed, and has a registered execution template.
- `ai_mapped_template` metadata is controlled only when it is implemented, connector-backed, has a registered execution template, and still passes PolicyGuard/connector checks.

## Vendor Status

| Vendor | implemented | manualOnly | planned | connector status | daily check status |
|---|---|---|---|---|---|
| Linux | Yes | Some catalog items | No | `linux-ssh` real connector | Real execution |
| MikroTik | Yes | Some catalog items | Some | `mikrotik-ssh` real connector | Real execution |
| FortiGate | No product-grade execute path in current mode | Yes | Some | connector not ready for promoted product flow | Manual checklist |
| Cisco | No | Yes | Some | connector not ready | Manual checklist |
| pfSense | No | Yes | Some | connector not ready | Manual checklist |
| Juniper | No | Yes | Some | connector not ready | Manual checklist |
| Palo Alto | No | Yes | Some | connector not ready | Manual checklist |
| Windows | No | Yes | Some | connector not ready | Manual checklist |
| Docker | No | Yes | Some | connector not ready | Manual checklist |
| Kubernetes | No | Yes | Some | connector not ready | Manual checklist |

## Next Recommended Task

1. Run a focused UTF-8/mojibake cleanup pass without touching execution policy.
2. Apply the Task 16 enum migration to every shared/local environment that uses the project database.
3. If product scope continues, deepen Linux/MikroTik result UX and start real connector work for the next vendor.

## Validation

- `cd backend && npm run prisma:generate`
- `cd backend && npm run validate:command-catalog`
- `cd backend && npm run build`
- `cd backend && npm test`
- `cd backend && npx prisma db execute --file prisma/migrations/20260707183000_task16_3_persian_intent_aliases/migration.sql`
- `cd backend && npx prisma db execute --file prisma/migrations/20260707160000_task16_linux_service_health/migration.sql`
- `pnpm build` or equivalent root build command when pnpm is unavailable

Validation status: passed. Frontend build still shows the existing Vite chunk-size warning only.

## Protected Behavior

Keep:

- `ACTION_EXECUTION_MODE=quick_controlled`
- `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`

In this lab mode, one user confirmation is enough for supported Linux/MikroTik templates, but selected device, validated parameters, registered template/connector, explicit `intent=execute`, real connector invocation, audit logs, and real execution results remain mandatory.

## Task 16.3 Runtime Validation Follow-up

- The local no-result Command Catalog flow for `وضعیت پورت های باز رو نشون بده` now creates and executes a real connector-backed `linux_list_open_ports` ActionPlan without stale `sourceIp` validation.
- Verified route-level flow: search count 0 -> AI fallback `mode=executable_action_plan` -> `actionType=linux_list_open_ports` -> `executionTemplateRef=linux_list_open_ports` -> `executionSupport=connector` -> `connectorType=linux-ssh` -> validation passed -> quick execution succeeded with `connectorInvoked=true` and visible `ss/netstat` output.
- Action Center execute buttons now show the exact Persian label `تایید و اجرا`.
- Top-level ActionPlan control metadata such as `source=ai_mapped_template` must not be canonicalized into network fields such as `sourceIp`.
- Additional validation: `cd backend && npm run build`; `cd backend && npm run validate:command-catalog`; `cd backend && npm test` passed with 119/119 tests; root `npm run build` passed with the existing Vite large-chunk warning. `pnpm` is not available on PATH in this shell.
