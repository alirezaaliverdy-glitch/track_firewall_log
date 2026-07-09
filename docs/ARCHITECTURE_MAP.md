# Architecture Map

## Core Flows

`Persian Catalog or AI fallback -> validated ActionPlan -> Preview -> User Confirm -> PolicyGuard -> registered Connector -> Audit/Result`

`Raw events/snapshots -> vendor profile -> Vendor Finding Engine -> persisted Finding -> proposed ActionPlan -> controlled execution flow`

`Resolver -> executable_action_plan | needs_input | guided_workflow | clarification | manual_or_not_supported`

Creation is permissive; execution is controlled. Preview never implies execution, and success requires `connectorInvoked=true`.

Task 17.2A adds a hard resolver guard before generic/manual fallback: clearly multi-step operational creation requests must route to `guided_workflow` when a vendor blueprint exists. The guard covers VPN, VDOM, Zone, Policy/Rule, VIP/NAT/Port Forward, Interface/VLAN/Subinterface, and Route/Gateway creation phrases in Persian and English. If no selected device exists, the resolver returns `clarification` asking the user to select the target device; it must not create `vendor=unknown`, `custom_vendor_action`, `generic_security_action`, or `unsupported_vendor` ActionPlans for these requests.

## Backend Map

| Area | Purpose | Main path | Route/API | Status |
|---|---|---|---|---|
| Auth | Session login/logout and route protection | `backend/src/services/auth.service.ts`, `routes/auth.ts` | `/api/auth/*` | Implemented |
| Devices | Device inventory, discovery, capabilities | `services/device.service.ts`, `routes/devices.ts` | `/api/devices/*` | Implemented |
| Credentials | Encrypted credential references | `services/credential*.ts`, `routes/credentials.ts` | `/api/credentials/*` | Implemented |
| Command catalog | Persian curated search, validation, plan handoff | `commands/catalog/`, `routes/command-catalog.ts` | `/api/commands/*` | Linux/MikroTik executable; others manual/planned |
| Guided actions | Backend-owned multi-step blueprints and session state | `backend/src/guided-actions/`, `routes/action-sessions.ts` | `/api/action-sessions/*`, `/guided-actions/:sessionId` | Implemented foundation; hard-routed for multi-step intents |
| AI assistant | Evidence Pack, provider, structured intents | `ai/`, `services/ai-*.ts`, `routes/ai.ts` | `/api/ai/*` | Implemented; proposal-first |
| AI/template resolver | Maps validated action/catalog metadata to registered templates | `commands/catalog/catalog-action-resolver.ts`, `commands/execution/execution-template-registry.ts` | Used by action routes | Implemented for registered templates |
| ActionPlan lifecycle | Propose, validate, preview, approve, execute, result | `services/action-plan.service.ts`, `routes/actions.ts` | `/api/actions/*` | Implemented; verification/rollback partial |
| PolicyGuard | Re-check execution boundaries | `services/policy-guard.service.ts`, vendor guards | Action execution boundary | Implemented; lab exception protected |
| Execution templates | Structured allowlisted command definitions | `commands/execution/` | Internal registry | Linux/MikroTik strongest |
| Connectors | Vendor planners and SSH invocation | `connectors/` | `/api/connectors/*`, action plan APIs | Linux/MikroTik real; FortiGate legacy foundation; others incomplete |
| Daily Check | Vendor profiles and grouped read-only plans/results | `daily-check/`, `routes/daily-check.ts` | `/api/daily-check/*` | Linux/MikroTik real; eight manual-only |
| Telemetry | Linux collection and shared vendor findings | `telemetry/`, `routes/linux-telemetry.ts`, `routes/telemetry-findings.ts` | `/api/devices/:id/telemetry/*`, `/api/*findings*` | Linux ingestion real; other collectors partial |
| Events/detection | Event store, collectors, detection, incidents | `services/event*.ts`, `services/detection.service.ts`, routes | `/api/events/*`, `/api/detections/*`, `/api/incidents/*` | Foundation implemented |
| Audit/result | Execution evidence, output, approvals | `ActionAuditLog`, `ActionApproval`, action service | `/api/actions/:id`, `/audit` | Implemented; no fake-success rule enforced |
| Prisma models | Persistent product state | `backend/prisma/schema.prisma` | Prisma client | 28 models including Finding/Action/Assessment/Event domains |

## Frontend Map

| Area | Purpose | Main path | Related API | Status |
|---|---|---|---|---|
| App shell/routing | Authenticated composition and result route | `src/App.tsx`, `src/main.tsx` | — | Implemented; mostly single-page composition |
| Device registry | Devices, credentials, connection/capabilities | `components/devices/DeviceRegistryPanel.tsx` | `/api/devices`, `/api/credentials` | Implemented |
| Command catalog | Persian search, parameters, plan creation | `components/commands/CommandCatalogPanel.tsx` | `/api/commands/*` | Implemented |
| Guided action wizard | Persian multi-step input collection and plan build | `components/guided-actions/GuidedActionWizard.tsx` | `/api/action-sessions/*` | Implemented foundation |
| AI assistant | Chat, context, missing fields, guided workflow handoff, action proposals | `components/ai/AiSecurityAssistantPanel.tsx` | `/api/ai/*`, `/api/action-sessions/*` | Implemented; selected-device context sent to resolver |
| Action center | Review, preview, confirm, execute, audits | `components/actions/ActionCenterPanel.tsx` | `/api/actions/*` | Implemented |
| Action result | Honest connector output/result view | `components/actions/ActionResultView.tsx` | `/api/actions/:id` | Implemented at `/actions/:id/result` |
| Daily Check | Vendor profile selection and grouped results | `components/daily-check/DailyCheckPanel.tsx` | `/api/daily-check/*`, actions | Linux/MikroTik executable; others manual |
| Service health | Backend/provider availability indicators | app/header and API helpers | `/api/health`, `/api/ai/provider/status` | Basic/partial |
| Telemetry/events | Linux stream, findings, event/incident review | `components/telemetry/`, `events/`, `findings/`, `incidents/` | telemetry, findings, events, incidents APIs | Implemented foundation; vendor ingestion partial |
