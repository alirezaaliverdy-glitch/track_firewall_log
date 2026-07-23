# M0 Runtime Audit

Recorded: 2026-07-23

Branch: `product-persian-command-catalog`

Phase H baseline: `18cd516fd1fd61987b637f08fa7b276e1b6a9c4f`

## Current Boundary

- The web UI uses `src/lib/apiTransport.ts` and server-backed API clients for devices, credentials, actions, Assistant, and monitoring.
- The server runtime owns Fastify routes, Prisma persistence, credential services, PolicyGuard, connector selection, SSH connectors, audit, and ActionPlan lifecycle.
- Phase H mobile hardening blocks offline server approval/execution and attaches idempotency keys, but there is no local runtime yet.
- `capacitor.config.ts` exists with app ID `com.firewallsoar.app`, but native Android/iOS projects and Capacitor package dependencies are not currently committed.

## Dirty State Preserved

- The unrelated deleted tracked docs and task files remain unstaged and unchanged.
- The pre-existing root `README_FA.md` modification remains unstaged and unchanged.
- Phase M will stage only focused files for each subphase.

## Safety Constraints

- No destructive commands will be executed against real devices.
- M0 characterization is source-only and does not touch a database, network device, credential, or native build output.
- Local Mode must be implemented without embedding Fastify, Prisma, or the Node server inside the WebView.
