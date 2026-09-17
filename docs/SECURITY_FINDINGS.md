# Security Findings

## Implemented

Security findings now carry optional asset context in addition to device context. Detection can create a Finding from recent SecurityEvents, and operators can create a reviewed ActionPlan from a Finding.

Current Finding flow:

`SecurityEvent -> seeded detection rule -> Finding -> reviewed ActionPlan`

The ActionPlan bridge is proposal-only. It does not execute connectors, mark success, or bypass Action Center.

## Current APIs

- `GET /api/security/events`
- `POST /api/security/events`
- `GET /api/security/findings`
- `GET /api/security/findings/:id`
- `PATCH /api/security/findings/:id/status`
- `POST /api/security/findings/:id/action-plan`

## Safety Boundary

ActionPlans created from findings use the existing action lifecycle. Execution still requires preview, user confirmation, PolicyGuard, a registered connector/template, audit, and real connector invocation.
