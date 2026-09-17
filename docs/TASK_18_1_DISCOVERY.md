# Task 18.1 Discovery

Date: 2026-07-12

## Current Routes

- `/` and `/dashboard` previously rendered the dense legacy dashboard composition.
- `/assets` and `/security` rendered `SecurityPlatformPanel` with section switches.
- `/action-library` rendered `CommandCatalogPanel`.
- `/actions/:id/result` and `/guided-actions/:sessionId` were special-case path checks.
- Requested future routes such as `/assets/devices`, `/security/findings`, `/security/rules`, `/actions`, `/integrations`, and `/monitoring` had no standard route registry.

## Current Data Flow

- Asset flow: `/api/assets` -> `SecurityPlatformPanel` -> compact asset list/selected asset.
- Sync flow: mock NetBox/Wazuh preview/apply endpoints -> direct buttons in the asset view.
- Security flow: `/api/security/findings` and `/api/security/rules` -> same combined panel.
- Finding remediation flow: Finding -> proposed ActionPlan only; execution remains Action Center.
- Action execution flow is unchanged: preview, user confirmation, PolicyGuard, connector, audit/result.

## Backend Capabilities Without Full UI

- Asset detail and topology endpoints exist.
- Asset findings endpoint exists.
- Sites, VLANs, prefixes endpoints exist.
- Security events endpoint exists.
- Finding detail and status endpoints exist.
- Detection rule enable/disable/test endpoints exist.
- Mock integration health and sync-preview endpoints exist.

## UI Capabilities That Were Mock or Too Thin

- Sync controls were exposed as direct buttons beside asset summary rather than a preview-confirm flow page.
- Integration status was named as NetBox/Wazuh in the asset page without a dedicated mock/production distinction.
- Assets and security were both coupled in `SecurityPlatformPanel`.
- Result messages used raw `JSON.stringify(result).slice(...)`.

## Navigation Problems

- Top navigation had only Dashboard, Assets, Security, and Action Library.
- No grouped sidebar, mobile bottom navigation, or planned badges.
- Multiple routes were implemented through scattered `window.location.pathname` checks.
- `/dashboard` was not explicitly modeled as a route.

## Component Coupling

- `SecurityPlatformPanel` owned assets, findings, rules, sync, selected asset, messages, and action creation.
- App shell, route selection, page composition, and dashboard content were all in `App.tsx`.
- Feature folders for assets/security did not exist before this task.

## Production Blockers

- Unpaginated asset/finding/rule list endpoints remain a future backend UX hardening item.
- Browser inspection of authenticated pages requires a valid login session or credentials; no non-secret demo credential is documented.
- Integration sync still uses mock adapters and must not be represented as production-ready.
- Several legacy panels still contain mojibake and English/Persian mixing outside Milestone A scope.
