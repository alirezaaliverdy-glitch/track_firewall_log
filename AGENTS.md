# Project Identity

This project is Firewall Log Analyzer / AI Security Orchestrator.

It is evolving from a log analyzer into a lightweight Mini-SOAR:
logs/events/incidents -> AI understanding -> ActionPlan -> PolicyGuard -> controlled connector execution -> audit.

# Tech Stack

Frontend:
- React
- Vite
- TypeScript
- pnpm

Backend:
- Node.js
- Fastify
- TypeScript
- Prisma
- PostgreSQL
- npm

AI:
- OpenAI-compatible provider
- OpenRouter-compatible configuration

# Core Architecture Rule

Action creation is permissive.
Execution is controlled.

The AI should try to create an ActionPlan/ActionIntent for operational requests.
High-risk, destructive, unsupported, or unknown-vendor requests should still become proposed actions when possible.
They must be classified with risk, expected impact, execution support, missing fields, prechecks, verification, and rollback suggestions.

AI must not silently execute anything.
Execution must stay behind backend-controlled flow:
ActionPlan -> PolicyGuard -> Connector -> Audit.

# Persian Command Catalog Product Mode

When `PRODUCT_MODE=persian_command_catalog`, the primary product path is Persian-first and backend-first:
device -> curated Command Catalog -> validated ActionPlan -> user review/confirmation -> PolicyGuard -> Connector -> verification/audit.

AI is a fallback only when the curated catalog has no suitable command. AI fallback may create a reviewed draft or proposed ActionPlan, but must never execute automatically. Add product commands in `backend/src/commands/catalog/`; keep internal identifiers in English and user-facing copy Persian-first.

Every product catalog item must declare `implemented`, `manualOnly`, `planned`, or `unsupported`. Only `implemented` items with a registered planner and connector handler may be presented as executable. `manualOnly` creates non-executable review plans; `planned` and `unsupported` must never create ActionPlans. Run `npm run validate:command-catalog` after catalog changes.

Catalog-created ActionPlans must retain `parametersJson.metadata.source=command_catalog`, catalog ID/version, exact action type, template/connector, implementation state, execution support, normalized parameters, and required-parameter satisfaction. Quick execution must resolve this metadata before using the legacy action catalogs; do not bypass PolicyGuard, confirmation, connector checks, or audit.

Prepared-command previews are never execution results. Keep `metadata.executed=false` through planning; only set it true and mark the ActionPlan `succeeded` after the registered connector/template actually runs successfully. Store executor, timestamps, exit code, and output in the result, and route successful confirmations to the command result view.

Prepared-command preview freshness must use only stable execution inputs (action type, vendor, device, normalized user parameters, catalog command ID, and template reference). Never include generated metadata, status, timestamps, audit/debug data, or command-plan output. Confirm requests send `intent=execute`; a preview-only response must be treated as an error, never success.

The in-app AI must use compact Evidence Packs and a central Security Orchestrator prompt; action creation is permissive, execution is controlled.

# Protected Lab Behavior

Do not break current lab execution behavior.

These must remain supported:
- `ACTION_EXECUTION_MODE=quick_controlled`
- `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`

Do not add strict production blocking to lab flow unless explicitly requested.

Permanent lab-unrestricted rule: when `ACTION_EXECUTION_MODE=quick_controlled` and `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`, one user confirmation is sufficient for any supported, registered Linux/MikroTik connector template. Do not add repeated approval, break-glass, risk-level, destructive-action, or missing-rollback blockers; do not downgrade a supported template to `manualOnly` or `manual_or_not_implemented`. Still require a selected device, complete validated parameters, a registered template/connector, `intent=execute`, real connector invocation, audit logs, and a real result before success. AI may create executable ActionPlans only by mapping to validated registered templates; never execute raw AI shell text.

# Vendor Direction

Current/target vendors:
- MikroTik
- FortiGate
- Linux
- pfSense
- Cisco
- Generic SSH / unknown vendor

MikroTik is currently the strongest execution path.
Linux and FortiGate need deeper support later.

# Vendor-Aware Telemetry Architecture

The normalized telemetry pipeline is:
raw live events or snapshots -> vendor profile -> Vendor Finding Engine -> persisted Finding -> proposed ActionPlan -> existing PolicyGuard/Connector/Audit flow.

- Vendor profile registry: `backend/src/telemetry/vendor-telemetry-profiles.ts`
- Finding engine: `backend/src/telemetry/vendor-finding-engine.ts`
- Finding APIs: `backend/src/routes/telemetry-findings.ts`
- Normalized persisted schema: Prisma `Finding` with device/vendor, severity/category/status/confidence, evidence/raw references, first/last seen, count, MITRE tags, network/actor fields, remediation intents, suppression reason, and stable per-device fingerprint.
- Profiles: Linux, MikroTik, FortiGate, pfSense are implemented; Cisco, Palo Alto, Juniper, Windows, Docker, Kubernetes, AWS, and Azure have core-rule scaffolds ready for connector/parser integration.
- Linux snapshots and live streams currently feed the shared engine. Future vendor collectors must call `processVendorTelemetry` rather than create a parallel finding type.

To add a vendor or rule, edit the central registry only: add/extend its profile, sources, suppression patterns, rule metadata, MITRE tags, and recommended intent. Feed normalized events/snapshots into `processVendorTelemetry`; do not scan or fork the whole analysis/action stack. Action creation remains permissive and execution remains controlled.

# Build Commands

Backend:
```powershell
cd backend
npm run build
npm test
```

Frontend:
```powershell
pnpm build
```

# Mandatory Workflow After Every Future Task

For every future Codex task:
1. Read `AGENTS.md` first.
2. Read `docs/CURRENT_STATUS.md`.
3. Read `docs/TASK_HISTORY.md`.
4. Implement only the requested task.
5. Do not change protected behavior unless explicitly requested.
6. Run backend build/tests when backend is touched.
7. Run frontend build when frontend is touched.
8. Update `docs/TASK_HISTORY.md`.
9. Update `docs/CURRENT_STATUS.md`.
10. Suggest a clear git commit message.

# Commit Rule

After every completed task, the user wants a git commit.

Before commit:
- Run `git status --short`.
- Ensure `.env` files are not staged.
- Run relevant build/tests.
- Update `docs/TASK_HISTORY.md`.
- Update `docs/CURRENT_STATUS.md`.

Never commit:
- `.env`
- `backend/.env`
- `.env.local`
- `.env.production`
- `.env.development`
- `node_modules`
- `dist`
- `build`
- `coverage`
- `storage/uploads`
- `uploads`
- `*.log`
- `*.db`
- `*.sqlite`

# Safety Rules

- Do not expose secrets.
- Do not print API keys.
- Do not hardcode credentials.
- Do not include raw passwords or private keys in docs.
- Do not remove PolicyGuard.
- Do not remove Audit logging.
- Do not change action execution behavior during documentation/refactor tasks.
