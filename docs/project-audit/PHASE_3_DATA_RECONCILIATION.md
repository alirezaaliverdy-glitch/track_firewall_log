# Phase 3 Data Reconciliation

Date: 2026-07-14

## Authority and invariants

- `Device` is the connection and controlled-execution entity.
- `Asset` is the inventory and observability projection of a Device when `Asset.deviceId` is set.
- An Asset without a Device remains valid imported inventory; it is not automatically converted into a control target.
- Ambiguous identity matches are reported and never changed automatically.
- The verified Phase 0 dump was not read, recreated, overwritten, restored, or modified during this phase.

## Read-only reconciliation audit

| Check | Result |
| --- | ---: |
| Devices | 3 |
| Assets | 7 |
| Devices with exactly one linked Asset | 3 |
| Devices without Asset | 0 |
| Ambiguous Device/Asset matches | 0 |
| Assets without Device | 4 |
| Linux Devices | 1 |
| Linux Devices included by monitoring query | 1 |
| Linux Devices excluded from monitoring | 0 |

The four inventory-only Assets are intentionally preserved: `task19-2a-cisco`, `edge-fw-01`, `linux-web-01`, and `wazuh-linux-01`. No repair mutation was needed (`changed=0`).

## Migration reconciliation

The database initially contained application tables but no applied Prisma migration history. A schema diff proved that the live database matched the repository through `20260712180000_platform_asset_security_milestone`; only the additive observability migration was absent.

The already-present 33 migrations were baselined with `prisma migrate resolve --applied`. The final migration initially failed before executing SQL because its tracked file began with a UTF-8 BOM (`PostgreSQL 42601`). The BOM was removed, that failed attempt was marked rolled back, and `20260712192000_task18_2a_vendor_linux_observability` applied successfully. `prisma migrate status` now reports the schema up to date.

All required observability tables are present: `DeviceCapabilityCache`, `CollectionRun`, `MetricSample`, `MetricAggregate`, `HealthSnapshot`, and `MonitorIncident`. The additive migration also created `HealthRule`. No application rows were deleted or rewritten.

## Runtime contracts

- Device create/update and its Asset projection now execute inside one Prisma transaction.
- Projection matching prefers the existing `deviceId` link and only accepts a single unlinked IP/hostname candidate.
- `npm run audit:device-assets` is read-only.
- `npm run repair:device-assets` is idempotent, requires explicit invocation, and refuses the entire operation if any ambiguous Device match exists.
- `/api/health/ready` reports the redacted database identity, `schemaReady`, and Device/Asset row-count smoke values.

## Record-preservation evidence

Before Phase 3: Device 3, Asset 7, DeviceCredential 4, Finding 5, ActionPlan 124.

After migration and reconciliation audit: Device 3, Asset 7. The repair command was not applied because every Device was already linked. Remaining model counts are verified again in the phase validation log before commit.
