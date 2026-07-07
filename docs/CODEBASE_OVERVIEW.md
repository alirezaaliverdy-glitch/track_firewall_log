# Codebase Overview

`track_firewall_log` is a React/Vite frontend and Fastify/Prisma/PostgreSQL backend. Frontend requests use the configured API base (normally proxied to backend `/api` routes).

## Repository Shape

- `src/`: frontend application, panels, contexts, API helpers, local log analysis.
- `backend/src/routes/`: authenticated HTTP surface registered by `backend/src/app.ts`.
- `backend/src/services/`: lifecycle, AI, event, device, credential, assessment, and policy services.
- `backend/src/commands/`: Persian catalog contract and execution-template registry.
- `backend/src/connectors/`: planners plus Linux, MikroTik, and FortiGate SSH connector foundations.
- `backend/src/daily-check/`: ten vendor profiles and grouped Daily Check engine.
- `backend/src/telemetry/`: vendor profiles/finding rules and Linux snapshot/live collection.
- `backend/prisma/schema.prisma`: 28 persistent models.
- `backend/test/`: task and regression tests.
- `docs/` and `scripts/`: project memory, generated snapshot, and integrity tooling.

## Backend Areas

| Area | Main files | API | Current state |
|---|---|---|---|
| Auth | `services/auth.service.ts`, `routes/auth.ts` | `/api/auth/login`, `/me`, `/logout` | Implemented |
| Devices/credentials | `services/device.service.ts`, `credential*.ts`, routes | `/api/devices/*`, `/api/credentials/*` | Implemented; credentials stay referenced/encrypted |
| Catalog | `commands/catalog/*`, `routes/command-catalog.ts` | `/api/commands/catalog*`, `/ai-propose` | 51 entries; 22 Linux/MikroTik items implemented |
| AI | `ai/context`, `ai/prompts`, `services/ai-*.ts` | `/api/ai/*` | Compact Evidence Pack and structured intents |
| Resolver/templates | `catalog-action-resolver.ts`, `execution-template-registry.ts` | Internal action resolution | Validated mappings; no raw AI CLI |
| Actions | `action-plan.service.ts`, `policy-guard.service.ts`, `dry-run.service.ts`, `routes/actions.ts` | `/api/actions/*` | Preview/confirm/execute/audit; rollback partial |
| Connectors | `connectors/*` and vendor planners | `/api/connectors/*`, `/api/actions/:id/plan` | Linux/MikroTik product-ready; FortiGate legacy foundation |
| Daily Check | `daily-check/*`, `routes/daily-check.ts` | `/api/daily-check/*` | Linux/MikroTik implemented; others manual-only |
| Telemetry/findings | `telemetry/*`, telemetry routes | `/api/devices/:id/telemetry/*`, findings APIs | Shared finding model; Linux feeds it today |
| Events/incidents | event/detection/incident services and routes | `/api/events/*`, `/api/detections/*`, `/api/incidents/*` | Implemented foundation; advanced correlation open |
| Assessment | `security-assessment.service.ts`, vendor profiles | `/api/assessments/*` | Multi-vendor deterministic analysis; proposal-only fixes |
| Audit/results | Action service and Prisma audit/approval models | `/api/actions/:id`, `/audit` | Persists connector evidence; success gated on invocation |

Prisma domains include auth; upload/job/analysis; devices/credentials/capabilities; AI chat/intents; ActionPlan/approval/audit; assessments/recommendations/snapshots; findings; events/collectors/detections/incidents; and device audit/status.

## Frontend Areas

| Area | Main path | API/status |
|---|---|---|
| Shell/routing | `src/App.tsx`, `src/main.tsx` | Main authenticated page plus `/actions/:id/result` |
| Device registry | `components/devices/DeviceRegistryPanel.tsx` | Device/credential APIs; implemented |
| Persian catalog | `components/commands/CommandCatalogPanel.tsx` | Command APIs; implemented |
| AI assistant | `components/ai/AiSecurityAssistantPanel.tsx` | AI APIs; implemented proposal flow |
| Action center/result | `components/actions/ActionCenterPanel.tsx`, `ActionResultView.tsx` | Action APIs; implemented controlled flow |
| Daily Check | `components/daily-check/DailyCheckPanel.tsx` | Profiles plus ActionPlan flow; vendor support varies |
| Health | app header/helpers | `/api/health`, provider status; basic |
| Telemetry/events | `components/telemetry`, `findings`, `events`, `incidents` | Linux live telemetry and shared event/finding review |
| Log analysis | upload/dashboard/chart/policy components and `LogContext` | Browser/backend analysis foundation |

## Non-Negotiable Boundary

Catalog or AI may create a reviewed plan. Execution requires stable preview inputs, explicit `intent=execute`, confirmation, PolicyGuard, registered template/connector, real invocation, persisted audit/result, and `connectorInvoked=true` before success. Protected lab mode removes repeated policy confirmations for supported Linux/MikroTik templates; it does not remove this boundary.
