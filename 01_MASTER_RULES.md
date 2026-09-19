# Master Engineering Rules

## Non-negotiable invariants

1. Preserve working behavior. Patch existing flows; do not rewrite the project.
2. One scoped commit per phase. Stop the phase if its acceptance tests fail.
3. Never stage `.env`, secrets, `.runtime`, database files, backups, storage, coverage, Playwright artifacts, or unrelated deleted/untracked files.
4. AI and frontend never invoke SSH/API connectors directly.
5. All mutable operations follow:

   `Intent -> ActionPlan -> Backend validation -> Preview -> Explicit approval -> PolicyGuard -> Registered connector -> Verification -> Audit -> Result`

6. Device selection is context only. It never forces planning.
7. Ordinary chat must always remain available, even with a selected device.
8. Unknown-to-catalog does not mean unsupported. Valid custom AI actions may execute through a registered backend connector after policy validation.
9. Never report success from an exit code alone. Connector evidence and post-execution verification are required.
10. Server-side authorization is authoritative. Hiding a UI button is not authorization.
11. Preserve Persian/English parity, RTL/LTR behavior, and UTF-8 integrity.
12. No production or real-device destructive test. Use mocks/fixtures unless the operator explicitly provides a test device and approval.
13. Prefer official primary documentation for any new security package, PWA package, or vendor command behavior. Record short source notes in `docs/CURRENT_ARCHITECTURE.md`.

## Change discipline

Before editing each phase:

```bash
git status --short
git diff --check
```

After editing each phase:

```bash
npm run build
cd backend && npm run build && npm run validate:command-catalog
cd ..
npm run test:i18n
npm run test:utf8
npm run test:workflows
git diff --check
```

Run focused tests listed in the phase file. Use Playwright MCP for live UI checks when the phase touches UI.
