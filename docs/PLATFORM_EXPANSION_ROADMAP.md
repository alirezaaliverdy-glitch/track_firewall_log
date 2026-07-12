# Platform Expansion Roadmap

## Minimum Tangible Milestone

This milestone adds the first usable Network/Security Operations surface without attempting the full platform roadmap:

- Asset inventory backbone with sites, locations, roles, vendors, platforms, interfaces, IPs, prefixes, VLANs, relationships, tags, and import sources.
- Idempotent asset import from manual JSON plus mock NetBox and Wazuh adapters.
- Detection-rule seed set with a small local correlation engine that turns recent SecurityEvents into persisted Findings.
- Finding-to-ActionPlan bridge that creates reviewed plans only; no connector execution is triggered by detection.
- Compact frontend entries at `/assets` and `/security`.

## Next Phases

- Case management with assignment, comments, SLA, and timeline records.
- Full search/correlation index across logs, events, findings, assets, and actions.
- Real NetBox/Wazuh connectors with credential-safe configuration.
- Topology graph with blast-radius and dependency analysis.
- AI workflow orchestration for guided investigation and safe remediation suggestions.

## Boundaries

The existing command execution contract remains unchanged: Preview is not execution, and success still requires real connector invocation with `connectorInvoked=true`.
