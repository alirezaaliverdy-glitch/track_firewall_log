# OPEN-SOURCE CAPABILITY INTEGRATION MATRIX

Use external projects as architectural inspiration and optional adapters. Do not copy entire repositories or replace the current ActionPlan, connector, finding, asset or audit core.

| Project | Product-native capability | Tangible user workflow |
|---|---|---|
| NetBox | Source of truth and IPAM/DCIM sync | Test → Preview → Conflict review → Import/apply → Open assets |
| Wazuh | Security alerts and agent mapping | Fetch → Normalize → Findings → Related asset |
| OpenSearch Security Analytics | Searchable event timeline and detectors | Search/filter → Evidence → Finding/incident |
| Uptime Kuma | Monitor lifecycle and availability UX | Create monitor → Runs → Uptime → Failure/recovery |
| TheHive | Incident/case workflow | Create case → Owner/tasks → Observables/evidence |
| Cortex | Analyzer job abstraction | Select observable/analyzer → Run → Normalized result |
| OpenCTI | IOC/relationship enrichment | Enrich IOC → Confidence/source → Correlate findings/assets |
| Greenbone/OpenVAS | Vulnerability import adapter | Import → CVE/CVSS evidence → Finding lifecycle |
| ntopng | Traffic/flow summaries | Top talkers/protocols/flows → Asset context → anomaly summary |
| Nmap | Authorized discovery and port/service evidence | Safe scan → Normalized result → Drift/finding/history |

Hard rules:

- Every adapter has `real`, `fixture`, `not_configured`, `disabled`, and `error` states.
- Fixture mode is visibly labeled and never presented as live.
- Every adapter has test connection or fixture validation.
- Every adapter creates a user-visible result, not merely a backend log.
- External credentials remain secret references.
- External writes require confirmation.
