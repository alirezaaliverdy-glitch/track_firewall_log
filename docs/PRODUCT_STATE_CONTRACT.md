# Product State Contract

Contract version: `19.2-A`

Owner: backend product-state registry

Introduced: 2026-07-13

## Purpose

The Product State Contract is the authoritative runtime declaration of what the product can show, navigate to, and honestly claim. It prevents a frontend label or route flag from upgrading planned, mock, unsupported, or unverified work into an implemented feature.

The contract describes capability. It does not bypass ActionPlan, Preview, user confirmation, PolicyGuard, connector invocation, audit, or result requirements. It never treats preview as execution and does not change protected lab execution behavior.

## Authoritative sources

- Feature and navigation registry: `backend/src/product-state/product-state.registry.ts`
- Contract types: `backend/src/product-state/product-state.types.ts`
- Read-only API routes: `backend/src/routes/product-state.ts`
- Frontend consumer: `src/lib/productState.ts`
- Route-to-feature identity: `src/routes/appRoutes.tsx`

Frontend routes own component mapping and matching. They do not own product readiness or primary-navigation eligibility.

Device onboarding is implemented through one reusable engine at `/assets/devices/new`, `/assets/onboarding`, `/assets/vendors/:vendorKey/devices/new`, and `/assets/devices/:deviceId/setup`. Device workspace routes resolve managed Device IDs and unmanaged Asset IDs without exposing credentials. A visible registration CTA requires the onboarding backend, API, route, UI, and tests to be ready together.

In contract `19.2-A`, `assets.device_onboarding_new` is promoted into generated Assets navigation because the route, API, backend service, UI, and regression tests are implemented. Product State must not hide this implemented onboarding route while keeping contextual vendor/setup routes outside primary navigation.

## States

| State | Meaning | Primary navigation eligible? |
| --- | --- | --- |
| `implemented` | Complete for its declared current contract and verified | yes, if every readiness invariant passes |
| `partial` | A real, bounded subset is usable and its limitation is explicit | yes only when the exposed destination is itself coherent and verified |
| `not_configured` | Implementation may exist, but required deployment configuration is absent | no |
| `unverified` | Code exists without sufficient current runtime/live evidence | no |
| `planned` | Future intent or placeholder | no |
| `unsupported` | No supported product path | no |
| `disabled` | Intentionally unavailable | no |

`partial` is not a synonym for implemented. Every partial feature must include a reason that bounds the usable subset.

## Feature record

Each feature has:

- stable `key` shared with the frontend route registry;
- Persian and English labels;
- route and navigation group;
- explicit state;
- `userVisible` and `navigationVisible` decisions;
- independent `backendReady`, `apiReady`, `uiReady`, and `tested` evidence flags;
- optional reason and activation requirements; and
- `lastVerifiedAt` only when current verification exists.

## Navigation invariant

A feature may be generated into primary navigation only when all of these are true:

1. it has a route;
2. it is user-visible;
3. its state is not `planned`, `unsupported`, `disabled`, `not_configured`, or `unverified`;
4. backend readiness is true;
5. API readiness is true;
6. UI readiness is true; and
7. current mismatch tests pass.

The registry validator throws when any navigation-visible feature violates this invariant. The application shell consumes `/api/product-state/navigation`; it does not reconstruct readiness from local flags. If the navigation contract cannot load, the shell fails closed to a Dashboard recovery link and displays a localized error instead of exposing stale capability claims.

## API

All endpoints are read-only and follow the existing authenticated application API boundary:

| Endpoint | Projection |
| --- | --- |
| `GET /api/product-state` | Full versioned contract |
| `GET /api/product-state/navigation` | Eligible grouped navigation only |
| `GET /api/product-state/features` | Complete feature-state registry |
| `GET /api/product-state/vendors` | Vendor implementation state derived from the vendor registry |
| `GET /api/product-state/integrations` | Explicit integration configuration and execution state |

## Vendor and integration rules

Vendor state is derived from the existing vendor registry rather than duplicated in the UI. Vendor-specific partial or unverified pages remain reachable from an honest vendor context but do not become primary destinations.

NetBox and Wazuh are currently declared as:

- state: `not_configured`;
- mode: `mock`;
- configured: `false`; and
- executable: `false`.

Mock preview must stay visually and contractually distinct from production configuration or execution.

## Change protocol

Changing a feature state requires the same change to include relevant backend/API/UI evidence, mismatch-test updates, browser verification, and project-memory updates. Adding a route alone cannot make a feature primary. A future milestone may promote a feature only after its real contract and activation requirements are satisfied.

## Safety boundary

This contract is descriptive and read-only. It performs no device mutation, migration, connector execution, credential handling, or integration apply. Successful action execution remains valid only after the real connector ran and `connectorInvoked=true` is recorded.
