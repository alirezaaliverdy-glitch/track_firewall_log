# Detection Engine

## Implemented

The milestone adds a small local detection engine on top of existing `DetectionRule`, `SecurityEvent`, and `Finding` persistence.

`ensureSeededSecurityRules()` creates baseline rules for:

- Repeated failed logins
- Login from new source
- Admin account created
- Firewall policy change
- NAT change
- Management service enabled
- Interface unexpectedly down
- VPN auth failure
- New listening port
- Firewall disabled
- Critical service stopped
- Repeated Daily Check failures

`runSecurityDetection()` evaluates recent events, groups by rule and asset/device context, and creates or updates Findings with evidence and raw event references.

## DSL Boundary

Rule DSL validation is intentionally narrow for this milestone. Supported operators are allowlisted and unsafe JavaScript-like operators are rejected.

## Current APIs

- `GET /api/security/rules`
- `POST /api/security/rules/:id/enable`
- `POST /api/security/rules/:id/disable`
- `POST /api/security/rules/test`
- `POST /api/security/detections/run`
