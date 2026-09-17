# Search and Correlation

## Current State

The milestone adds structured identifiers needed for later search and correlation:

- Assets can link to devices, IPs, interfaces, sites, locations, vendors, and platforms.
- SecurityEvents can link to assets and devices.
- Findings can link to assets, devices, rules, and raw event references.
- ActionPlans can link back to assets.

## Implemented Correlation

Detection currently correlates recent SecurityEvents by seeded rule, event type, severity, asset ID, and device ID.

## Future Scope

Full search should index assets, events, findings, actions, audit logs, telemetry, and incidents. Cross-domain correlation should support time windows, entity pivots, IP/user pivots, topology impact, and saved investigations.
