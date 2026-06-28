# Codebase Overview

`track_firewall_log` is a React/Vite firewall-log UI backed by a Fastify/Prisma/PostgreSQL API. The frontend uses `VITE_API_BASE_URL` (default `/firewall-api`); the backend routes themselves are mounted under `/api`.

## 1. Frontend

- `src/App.tsx` composes the single-page workflow. `src/context/LogContext.tsx` holds uploaded/normalized logs, column mapping, local analytics, findings, selection, and search state.
- `components/csv-uploader.tsx` uploads a file for backend analysis or runs the browser-only importer. Backend mode calls `POST /analysis/upload`, then polls `GET /analysis/jobs/:jobId` and reads `GET /analysis/jobs/:jobId/result`; it also lists `GET /analysis/jobs`.
- Upload and analysis views (`upload/*`, `dashboard/*`, `charts/*`, `policies/*`, `findings/*`, `log-chart.tsx`, `log-table.tsx`, and `export/*`) select the firewall type, map columns, and display quality, traffic, ports, policy review, findings, charts, evidence, logs, and exports. They primarily consume `LogContext` and do not make their own API calls.
- `components/devices/DeviceRegistryPanel.tsx` manages devices, credentials, connection tests, discovery, and capabilities. It calls `/devices`, `/devices/:id`, `/devices/:id/test-connection`, `/devices/:id/capabilities`, `/credentials`, and `/credentials/:id`.
- `components/events/SecurityEventsPanel.tsx` filters and inspects stored events/batches, collector state, and retention. It calls `/events`, `/events/:id`, `/events/summary`, `/event-batches`, `/collectors/:deviceId/status`, `/collectors/:deviceId/run-once`, `/events/retention/status`, and `/events/retention/run`.
- `components/incidents/IncidentsPanel.tsx` runs detections, lists incident details/evidence, and changes incident status. It calls `POST /detections/run`, `/incidents`, `/incidents/:id`, and `/incidents/:id/events`.
- `components/ai/AiSecurityAssistantPanel.tsx` displays security context and provider state, sends chat messages, and completes missing intent fields. Its API module covers `/ai/chat`, chat sessions, `/ai/context/security-summary`, `/ai/provider/status`, `/ai/intents`, and `/ai/action-requests/:id/complete`.
- `components/actions/ActionCenterPanel.tsx` reviews the action lifecycle, generated commands, approvals, execution results, and audit history. It calls `/actions`, `/actions/:id`, and the `validate`, `dry-run`, `approve`, `reject`, `execute`, `quick-execute`, and `audit` subroutes.

## 2. Backend

### Routes

- Upload/analysis: `/api/uploads`, `/api/jobs`, `/api/analysis/*`, and analysis lookups under `/api/uploads/:id/analysis` and `/api/analysis-runs/:id`.
- Events/detection/incidents: `/api/events`, `/api/event-batches`, `/api/collectors`, `/api/detections/run` (plus the legacy singular alias), `/api/detection-rules`, and `/api/incidents`.
- Inventory: `/api/devices`, `/api/credentials`, connection tests, device capabilities, and `/api/connectors/{capabilities,vendors}`.
- AI/actions: `/api/ai/*`, `/api/actions/*`, and `/api/actions/:id/plan`.
- Operations: `/api/health` and retention endpoints under `/api/events/retention/*`.

### Services and data

- Upload and analysis: `upload.service.ts`, `worker.service.ts`, and `analysis.service.ts` store files/jobs and run the parser/normalizer/analytics pipeline in `src/analyzer/`.
- Event pipeline: `event.service.ts`, `event-ingestion.service.ts`, `collector.service.ts`, `event-retention.service.ts`, `detection.service.ts`, `incident-builder.service.ts`, and `incident.service.ts` store/query events and build incidents.
- Inventory: `device.service.ts`, `credential.service.ts`, and `credential-crypto.service.ts` manage devices, encrypted credentials, discovery, status, and device-level audit records.
- AI: `ai-context.service.ts` builds bounded security context; `ai-provider.service.ts` selects the configured provider; provider adapters return structured output; `ai-intent.service.ts` combines deterministic parsing with validated structured intent; `ai-chat.service.ts` persists chat and creates an `ActionPlan` only when the intent is supported and complete. Provider status explicitly reports `executionAllowed: false`.
- Controlled actions: `action-plan.service.ts` owns proposal, validation, dry-run, approval/rejection, execution, status, rollback metadata, and `ActionAuditLog`. `policy-guard.service.ts` rejects free-form command-shaped parameters and applies common/vendor rules. `dry-run.service.ts` combines the deterministic vendor planner with connector-specific validation. `connector-registry.service.ts` selects planners/connectors; vendor catalogs and command compilers generate allowlisted commands; SSH connectors perform discovery and approved execution.

The Prisma schema contains: `Upload`, `Job`, `AnalysisRun`; `Device`, `DeviceCredential`, `DeviceAuthProfile`, `DeviceCapability`, `DeviceStatusCheck`, and `AuditLog`; `EventSource`, `EventBatch`, `SecurityEvent`, and `EventCollectorState`; `DetectionRule`, `Incident`, and `IncidentEvent`; plus `AiChatSession`, `AiChatMessage`, `AiActionIntent`, `ActionPlan`, `ActionApproval`, and `ActionAuditLog`.

### Controlled action boundary

`AiActionIntent` is descriptive, while `ActionPlan` is the executable state machine. PolicyGuard validates the selected device, credential, protocol, catalog parameters, risk, and rollback metadata. Dry-run stores exact planned commands without changing the device. Approval is persisted separately in `ActionApproval`. Execution requires a stored dry-run, acceptable validation, an approved plan (except explicitly read-only vendor actions), and an immediate PolicyGuard re-check. The selected connector then executes only its supported, compiled command set and writes connection, preflight, command, result, and rollback-availability events to `ActionAuditLog`. Rollback instructions are stored, but connector-driven automatic rollback is not implemented.

## 3. Main workflows

### Log upload to incident

1. `POST /api/analysis/upload` stores the file and creates an `Upload` plus queued `Job`; the in-process worker parses, normalizes, and analyzes it.
2. `analysis.service.ts` stores `AnalysisRun` and converts normalized rows into an upload `EventSource`, one `EventBatch`, and `SecurityEvent` rows.
3. Detection is currently explicit: the UI or caller invokes `POST /api/detections/run`, optionally scoped to a batch/device/source/window.
4. Enabled `DetectionRule`s detect port scans, SSH brute force, sensitive-port exposure, and deny/drop spikes; the suspicious-outbound rule is intentionally a placeholder. Matches are upserted into `Incident` and linked through `IncidentEvent`. The incident builder also adds its recent-event patterns.

### AI chat to audited execution

`AI chat -> security context + provider/deterministic parser -> AiActionIntent -> missing-field completion (if needed) -> ActionPlan -> PolicyGuard validation -> deterministic dry-run -> manual approval -> connector execution -> ActionAuditLog/result`

AI output cannot carry raw CLI through this path. High/critical quick execution requires `EXECUTE`, the exact device name, and (for critical actions) a reason; critical vendor actions add break-glass checks.

### MikroTik dry-run and execution

1. The plan is normalized to a MikroTik catalog action and resolved to a registered SSH device/credential.
2. `policy-guard.service.ts` and `mikrotik-policy-guard.service.ts` validate exact targets, managed-object restrictions, lockout risk, risk level, backup need, and break-glass requirements. `mikrotik-action-catalog.ts`/`routeros-command-compiler.ts` compile structured parameters into exact RouterOS commands; raw commands are rejected.
3. `mikrotik.planner.ts` plus `mikrotik-ssh.connector.ts#dryRun` produce command specs, warnings, rollback steps, and any backup/export preflight commands without connecting to change the router.
4. After approval, execution re-runs PolicyGuard, verifies that every command belongs to the compiled allowlist, creates required backup/export artifacts, then runs commands over SSH. Critical operations require break-glass, `EXECUTE`, exact device-name confirmation, and a reason.
5. Each connection, preflight, backup, command, success/failure, and rollback-metadata event is audited. Address-list block/update actions have extra existence/idempotency handling. The read-only firewall summary may execute from `dry_run_ready`; automatic rollback remains unavailable.

## 4. Vendor status

| Vendor | Dry-run support | Execution support | Main connector/planner files | Current limitations |
|---|---|---|---|---|
| MikroTik | Yes: broad catalog, RouterOS compiler, exact command specs, PolicyGuard, and backup/break-glass metadata. | Yes, through the SSH connector after gating; read-only summary has the documented approval exception. | `connectors/mikrotik-ssh.connector.ts`, `connectors/vendors/mikrotik.planner.ts`, `actions/mikrotik-action-catalog.ts`, `services/routeros-command-compiler.ts`, `services/mikrotik-policy-guard.service.ts` | Runtime execution is SSH-only although capability metadata also advertises API; requires registered credentials; only catalog commands are accepted; automatic rollback is not implemented. |
| FortiGate | Yes: structured FortiOS catalog/compiler with discovery, vendor PolicyGuard, preflight, backup, and break-glass metadata. | Yes, through the FortiGate SSH connector for catalog actions. | `connectors/fortigate-ssh.connector.ts`, `connectors/vendors/fortigate.planner.ts`, `actions/fortigate-action-catalog.ts`, `services/fortigate-command-compiler.ts`, `services/fortigate-policy-guard.service.ts`, `services/fortigate-version.service.ts` | SSH and discovered structured targets are required; raw CLI and dangerous command shapes are blocked; output/rollback is metadata-driven and automatic rollback is absent. |
| Linux Edge | Yes for UFW open/close/block/unblock and read-only service status; the planner can describe SSH-port change, but the connector marks it dry-run-only. | Yes over SSH for open/close port, temporary block, unblock, and service-status check. | `connectors/linux-ssh.connector.ts`, `connectors/vendors/linux-edge.planner.ts` | Requires UFW and suitable sudo rights; protected/current SSH ports and private/local blocking are refused; temporary unblock is not scheduled automatically; SSH-port change and automatic rollback are not executable. |
| pfSense | Placeholder only: the planner returns an `unsupported` manual plan rather than an executable dry-run. | No. | `connectors/vendors/pfsense.planner.ts` (no device connector yet) | No configured pfSense API/SSH connector, discovery, compiler, or execution path; current output is manual guidance only. |

## 5. Five small next tasks

1. Trigger a batch-scoped detection run after upload analysis completes, or make the current manual step explicit in the upload UI.
2. Add focused tests for PolicyGuard, approval/dry-run prerequisites, critical confirmations, and connector command allowlists.
3. Reconcile advertised connector protocols with runtime support (for example, MikroTik API and Linux agent are listed but current execution connectors require SSH).
4. Add a small pfSense capability/discovery spike and keep execution disabled until a structured compiler and PolicyGuard exist.
5. Clarify rollback status in the API/UI and correct stale connector messages so stored rollback metadata is not mistaken for automatic rollback support.
