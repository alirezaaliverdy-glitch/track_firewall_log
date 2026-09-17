# Integrations Architecture

## Implemented

Mock NetBox and Wazuh adapters demonstrate integration contracts without storing credentials or requiring external services.

NetBox mock:

- Asset/site/vendor/platform/interface/IP import preview.
- Idempotent apply through `AssetSyncRun`.

Wazuh mock:

- Asset import.
- Event generation through the security event API path.

## Current APIs

- `GET /api/integrations/netbox/health`
- `GET /api/integrations/netbox/sync-preview`
- `POST /api/integrations/netbox/sync`
- `GET /api/integrations/wazuh/health`
- `GET /api/integrations/wazuh/sync-preview`
- `POST /api/integrations/wazuh/sync`

## Future Requirements

Real integrations must use credential references, source cursors, idempotency keys, redaction, audit records, and bounded payload sizes.
