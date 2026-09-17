# Task 18.2 Discovery

Date: 2026-07-12

## Current Device and Connector Model

- `Device` is the managed connector target with vendor, type, host, protocol, credential references, status and JSON capabilities.
- Existing connector registry supports Linux, MikroTik and FortiGate through controlled connector modules.
- Existing `/api/devices/:id/capabilities` returned connector capabilities; Milestone 18.2A extends it to vendor/platform capability discovery while preserving the route.

## Linux Telemetry Collection

- Existing Linux telemetry lives under `backend/src/telemetry/linux/` and uses the Linux SSH connector.
- The server overview already collects CPU, memory, disk, network, services, listening ports and security warnings.
- Milestone 18.2A reuses that SSH path for persisted metric samples and health snapshots instead of adding Prometheus or Node Exporter as a dependency.

## Dashboard and Monitoring APIs

- Existing monitoring routes are `/api/devices/:id/telemetry/linux/*` plus live stream/storage/analyze endpoints.
- New 18.2A monitoring APIs are bounded under `/api/monitoring/linux/*`.
- Dashboard remains intentionally compact; deeper Linux UX is routed to `/monitoring/linux`.

## Command Catalog and Guided Actions

- Catalog execution remains template-backed and support-state gated.
- Guided actions remain the only path for multi-step mutations.
- Cisco mutations are not implemented in 18.2A; they are visible as planned only.

## ActionPlan Lifecycle

- Existing flow is unchanged: preview, explicit confirmation, PolicyGuard, connector invocation, audit/result.
- `connectorInvoked=true` remains required before success.
- The Cisco foundation does not add broad mutations or arbitrary CLI execution.

## Vendor and Platform Fields

- Existing `Device.vendor` is free text and asset intelligence has `AssetVendor`/`AssetPlatform`.
- 18.2A adds an explicit registry layer for vendor/platform/capability definitions and a `DeviceCapabilityCache` model for detected support.

## Reusable UI From Milestone 18.1

- `src/routes/appRoutes.tsx` route registry.
- `AppShell` sidebar/topbar/mobile navigation.
- `PageHeader`, state cards, summary grids, panel sections and responsive tables.

## Technical Debt and Blockers

- `docs/TASK_18_1_BROWSER_BASELINE.md` was requested by the task but is absent in the repo.
- Several legacy labels still show mojibake in terminal output, although the browser renders the Persian text.
- Live Cisco IOS-XE SSH execution is scaffolded but intentionally disabled until the interactive session hardening is lab verified.
- Prisma generation is required after the new migration before TypeScript sees new model delegates.

## Files Extended Instead of Duplicated

- `backend/src/app.ts` route registration.
- `backend/src/routes/devices.ts` existing capabilities route.
- `src/routes/appRoutes.tsx` route registry.
- Existing Linux telemetry parser/collector path is reused by the Linux health service.
