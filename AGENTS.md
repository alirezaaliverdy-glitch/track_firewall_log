# Project

Firewall Log Analyzer / AI Security Orchestrator is evolving into a lightweight Mini-SOAR. The primary product mode is Persian-first command operations backed by controlled execution.

## Stack

- Frontend: React, Vite, TypeScript, pnpm
- Backend: Node.js, Fastify, TypeScript, Prisma, PostgreSQL, npm
- AI: OpenAI-compatible and OpenRouter-compatible providers

## Product and Execution Rules

Primary flow in `PRODUCT_MODE=persian_command_catalog`:

`AI/Catalog -> ActionPlan -> Preview -> User Confirm -> PolicyGuard -> Connector -> Audit/Result`

- Catalog first; AI is a proposal fallback when no curated command fits.
- Action creation is permissive; execution is controlled. Never execute raw AI shell text.
- Only an `implemented` item with a registered planner, template, and connector handler is executable. `manualOnly` is review-only; `planned` and `unsupported` create no ActionPlan.
- Preview is not execution. Send `intent=execute`; never mark `succeeded` unless the real connector ran successfully and `connectorInvoked=true`.
- Keep catalog metadata and use stable execution inputs for preview freshness.

## Protected Lab Behavior

Preserve:

- `ACTION_EXECUTION_MODE=quick_controlled`
- `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`

In this combination, one user confirmation is sufficient for any supported registered Linux/MikroTik template. Do not add repeated approval, break-glass, risk, destructive-action, or missing-rollback blockers. Still require a selected device, validated parameters, registered template/connector, `intent=execute`, real connector invocation, audit, and a real result. Do not remove PolicyGuard or audit logging, and do not change execution behavior during documentation/refactor work.

## Important Locations

- Live handoff: `CODEX_HANDOFF.md`
- Memory index/status/history: `docs/PROJECT_MEMORY_INDEX.md`, `docs/CURRENT_STATUS.md`, `docs/TASK_HISTORY.md`
- Architecture/product docs: `docs/ARCHITECTURE_MAP.md`, `docs/CODEBASE_OVERVIEW.md`, `docs/PERSIAN_COMMAND_CATALOG_PRODUCT.md`
- Catalog/templates: `backend/src/commands/catalog/`, `backend/src/commands/execution/`
- Actions/policy/connectors: `backend/src/services/action-plan.service.ts`, `backend/src/services/policy-guard.service.ts`, `backend/src/connectors/`
- Daily Check/telemetry: `backend/src/daily-check/`, `backend/src/telemetry/`
- Schema/routes/UI: `backend/prisma/schema.prisma`, `backend/src/routes/`, `src/components/`

## Safety and Secrets

Never expose, print, document, or commit `.env` contents, API keys, tokens, passwords, private keys, credentials, logs, databases, uploads, dependency folders, or build output. Never hardcode credentials.

## Required Task Workflow

1. Read `AGENTS.md`, `CODEX_HANDOFF.md`, `docs/CURRENT_STATUS.md`, and `docs/TASK_HISTORY.md`.
2. Implement only the requested scope and preserve protected behavior.
3. Run backend build/tests when backend or package code changes; run frontend build when frontend or root package code changes. Validate catalog changes with `npm run validate:command-catalog` in `backend`.
4. After every meaningful task, update `CODEX_HANDOFF.md`, `docs/CURRENT_STATUS.md`, and `docs/TASK_HISTORY.md` when relevant.
5. Before commit, run `git status --short`, confirm no `.env` file is staged, run relevant validation, then commit with a clear message. The user expects a commit after each completed task.
