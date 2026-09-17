# Asset Intelligence

## Implemented

Assets are modeled separately from devices so security data can be unified even when it comes from NetBox, Wazuh, manual import, or the existing device registry.

Core models:

- `AssetSite`, `AssetLocation`, `AssetRole`, `AssetVendor`, `AssetPlatform`
- `Asset`, `AssetInterface`, `AssetIpAddress`
- `AssetPrefix`, `AssetVlan`, `AssetRelationship`, `AssetTag`
- `AssetSource`, `AssetSyncRun`

The backend service `backend/src/assets/asset-intelligence.service.ts` supports preview-only import, idempotent apply, existing-device linking, asset listing, detail lookup, and basic topology.

## Import Rules

- Preview does not mutate data.
- Apply is idempotent when `sourceType` and `idempotencyKey` match.
- Secret-like import keys are rejected.
- Matching prefers source external ID, then management IP, then hostname/name.

## Current APIs

- `GET /api/assets`
- `GET /api/assets/:id`
- `GET /api/assets/:id/topology`
- `POST /api/assets/import/preview`
- `POST /api/assets/import/apply`
- `POST /api/assets/sync/devices`
- `GET /api/sites`
- `GET /api/vlans`
- `GET /api/prefixes`
