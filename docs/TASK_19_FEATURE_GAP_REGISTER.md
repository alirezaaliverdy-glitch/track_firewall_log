# Task 19 Feature Gap Register

Date: 2026-07-13

Milestone: 19A only

This register separates real capability from navigation exposure. A backend model or route is not by itself evidence that a complete user feature exists.

## Feature-state register

| Area | Capability present now | State | Gap or constraint | Navigation decision | Owner after 19A |
| --- | --- | --- | --- | --- | --- |
| Dashboard | Operational overview backed by current summary APIs | implemented | No 19A blocker | primary | existing product |
| Assets | Inventory overview, device list, reusable onboarding, and dedicated device workspace foundation | implemented | Charts and vendor-specific deep views remain for R-F | primary plus contextual onboarding/workspace | Task 19.1 R-B/R-F |
| Asset sync | Mock NetBox/Wazuh preview | partial | No production integration | contextual only | Milestone 19H |
| Sites/networks/topology | Backend schema/routes exist in part | planned | No complete UI contract | hidden | later convergence |
| Cisco | IOS-XE read-only registry, connector-backed onboarding/test/detect/discover path, and honest empty inventory | partial | No real Cisco target/credential was supplied for live acceptance; mutations remain deliberately deferred | vendor-context only | Task 19.1 R-B plus later mutation milestone |
| Security overview | Current finding/rule posture | implemented | Broader model convergence deferred | primary | existing product |
| Findings | List/detail and reviewed ActionPlan handoff | implemented | Deduplication/lifecycle/evidence rewrite deferred | primary | Milestone 19E |
| Detection rules | Seeded list/read API and UI | partial | Enable/disable/test/detail lifecycle incomplete | primary with partial contract | Milestone 19D |
| Monitoring | Current fleet overview | implemented | None for overview | primary | existing product |
| Linux monitoring | Read APIs and safe degradation | partial | Persisted refresh awaits unapplied migration | primary with partial contract | migration recovery outside 19A |
| Device monitoring alias | Monitoring overview reused | partial | No distinct destination contract | hidden | later convergence |
| Daily Check alias | Linux/MikroTik execute; other vendors manual-only | partial | Mixed support and reused overview | hidden | later convergence |
| Action Center | Controlled ActionPlan lifecycle | implemented | Must preserve real connector and audit requirements | primary | existing product |
| Pending/history aliases | Complete Action Center reused | partial | No route-specific filters or UI contract | hidden | later convergence |
| Assistant | Proposal and guided workflow UI/API | partial | Provider availability depends on deployment configuration | primary with partial contract | Milestone 19G for onboarding |
| Integrations overview | Explicit mock previews | partial | No production configuration or execution | primary overview only | Milestone 19H |
| NetBox/Wazuh children | Mock-only, not configured | not_configured | Endpoint, credential reference, health and mapping verification missing | hidden | Milestone 19H |
| Settings | Planned-state page only | planned | No settings API or functional controls | hidden | Milestone 19F |

## Backend capabilities without a converged UI contract

- Asset site, VLAN, prefix, and topology data exists in the backend/schema but does not yet form complete 19A user journeys.
- Security event storage/routes exist, but a product-ready event investigation surface is not present.
- Detection-rule records exist, but the full rule lifecycle requested by the convergence plan is intentionally deferred.
- Connector and vendor registries expose richer support data than every current UI surface consumes.
- Linux observability models and code exist, but the pending migration prevents claiming persisted refresh readiness.

## UI surfaces whose label exceeded reality

- Settings was labeled as implemented/navigation-ready while rendering only planned state.
- Cisco, NetBox, and Wazuh child pages were direct primary destinations despite partial, unverified, or not-configured state.
- Sync, pending, history, device-monitoring, and daily-check routes looked like independent navigation destinations while representing mock, mixed-support, or alias behavior.

These mismatches are fixed by the Product State Contract and its navigation eligibility validator. Direct routes remain available for honest contextual access and deep links; hiding a route from primary navigation does not falsely upgrade or delete its state.

## Source-document gaps

The task documents reference the following files, but they are absent from the current checkout:

- `TASK_18_1_PLATFORM_UX_ARCHITECTURE.md`
- `TASK_18_2_RECOVERY_AND_CONTINUATION.md`
- `PRISMA_BASELINE_RECOVERY_RUNBOOK.md`

The available handoff, status, history, architecture, codebase, vendor, Linux, command-catalog, Task 18, schema, and migration sources were read. The missing references are recorded as documentation gaps and were not invented or reconstructed during 19A.

## Scope boundary

No onboarding, Cisco mutation, detection rewrite, finding rewrite, settings implementation, production integration expansion, device mutation, or database migration operation is included in this milestone.

## Task 19.1 R-B update — 2026-07-13

- Device onboarding is now an implemented Product State feature backed by versioned session APIs and one reusable UI engine.
- Registration CTAs are present on Assets, Devices, Vendors, generic vendor detail, and Cisco vendor surfaces.
- The Cisco path uses a registered safe read-only SSH probe and records `connectorInvoked=true` only after the connector actually runs; no live success is claimed without a supplied target and credential reference.
- The device workspace foundation exposes overview, health, inventory, capabilities, findings, actions, history, and configuration routes from one structured backend contract.
- Missing optional observability tables degrade to unavailable sections and do not require Prisma recovery or return 500.
