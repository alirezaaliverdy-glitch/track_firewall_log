# Topology and Impact

## Implemented

Basic topology data is persisted through:

- Asset relationships
- Asset interfaces and IP addresses
- Sites and locations
- Prefixes and VLANs

The current topology endpoint returns a selected asset with directly related assets.

## Current API

- `GET /api/assets/:id/topology`

## Future Scope

Impact analysis should add dependency direction, service ownership, network path hints, exposure scoring, and blast-radius summaries for findings and planned actions.
