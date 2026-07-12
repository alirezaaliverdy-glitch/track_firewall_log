# Monitoring Architecture

## Current State

The platform now has two monitoring lanes:

- Linux telemetry and Daily Check collectors feed existing event/finding workflows.
- Security platform events can be ingested through `/api/security/events` and correlated with assets.

Mock Wazuh integration demonstrates the intended external monitoring adapter shape without requiring live credentials.

## Data Flow

`Collector or integration -> SecurityEvent -> asset/device context -> detection rules -> Finding -> reviewed ActionPlan`

## Current Integration APIs

- `GET /api/integrations/wazuh/health`
- `GET /api/integrations/wazuh/sync-preview`
- `POST /api/integrations/wazuh/sync`

## Future Scope

Real integrations should use credential references, rate limits, import cursors, source health checks, and explicit redaction for raw event payloads.
