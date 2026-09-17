# Project Memory Index

## Read in This Order

1. `AGENTS.md` — stable rules, protected execution behavior, and task workflow.
2. `CODEX_HANDOFF.md` — concise live task handoff and immediate next work.
3. `docs/CURRENT_STATUS.md` — current capabilities, gaps, bugs, and vendor matrix.
4. `docs/ARCHITECTURE_MAP.md` — system flows and ownership by component.
5. `docs/PRODUCT_STATE_CONTRACT.md` — feature readiness and navigation truth.
6. `docs/PERSIAN_COMMAND_CATALOG_PRODUCT.md` — Persian-first catalog contract.
7. `docs/TASK_HISTORY.md` — compact chronological record and known validation.

This sequence should onboard a new model in under two minutes. Read `docs/CODEBASE_OVERVIEW.md` only when file/API-level orientation is needed, and regenerate `docs/PROJECT_SNAPSHOT.md` for repository facts.

## Update Policy

- After every meaningful task: update `CODEX_HANDOFF.md`; update `docs/CURRENT_STATUS.md` and `docs/TASK_HISTORY.md` when relevant.
- After structural changes: update `docs/ARCHITECTURE_MAP.md` and `docs/CODEBASE_OVERVIEW.md`.
- After catalog/product-contract changes: update `docs/PERSIAN_COMMAND_CATALOG_PRODUCT.md`.
- Run `pnpm docs:snapshot` and `pnpm docs:check` before handoff when available.

## Stable vs. Live

- Keep `AGENTS.md` short and stable; change it only for durable project rules.
- Never rename, remove, or reorder the six headings in `CODEX_HANDOFF.md`.
- `CURRENT_STATUS.md`, `CODEX_HANDOFF.md`, and generated `PROJECT_SNAPSHOT.md` are live state.
- `TASK_HISTORY.md` is chronological history, not a design specification.
- Never copy secrets or `.env` contents into any memory file.
