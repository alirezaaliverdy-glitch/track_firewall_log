# CHECK-HOST CAPABILITY MATRIX

| Check-Host feature | Product implementation |
|---|---|
| IP information | IP/ASN/Geo provider abstraction |
| Global Ping | Check-Host JSON API adapter |
| Global HTTP | Check-Host API + local HTTP/TLS inspector |
| Global DNS | Check-Host API + local DNS inspector |
| TCP port | External + local TCP probes |
| UDP port | External + approved local UDP profiles |
| Subnet calculator | Native implementation |
| Nodes list | Cached node registry |
| Selected nodes | Country/node selector |
| API result polling | Background bounded polling |
| Partial results | First-class partial state |
| Permanent report link | Provider metadata only |

Additional product capabilities:
- TLS inspection
- traceroute enrichment
- safe Nmap scans
- authorization scopes
- scan history
- scheduled monitors
- findings and ActionPlans
- asset linking
- Persian analysis
