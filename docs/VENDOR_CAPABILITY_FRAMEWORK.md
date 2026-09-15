# Vendor Capability Framework

Milestone 18.2A adds `backend/src/vendors/` as the vendor-neutral registry layer.

Core pieces:

- `vendor.registry.ts`: vendor definitions and connector families.
- `platform.registry.ts`: Cisco platform families and execution eligibility.
- `capability.registry.ts`: capability definitions, source refs, parser versions and implementation states.
- `capability-discovery.service.ts`: per-device detection/cache contract.
- `routes/vendors.ts`: `/api/vendors/*` and capability refresh endpoints.

Support is never inferred from vendor name alone. Device capability cache stores detection evidence, capability support and warnings.
