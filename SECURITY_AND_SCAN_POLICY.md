# SECURITY AND SCAN POLICY

## External multi-region plane
Only public domains and public IPs.
Use Check-Host API adapter.

Block:
- private/loopback/link-local/multicast/metadata
- internal hostnames
- unsupported schemes
- redirects to blocked destinations
- DNS rebinding targets

## Internal authorized plane
Only registered assets or approved CIDRs.
Use isolated local diagnostic/Nmap worker.

## Allowed Nmap profiles
- host discovery
- quick common TCP
- selected TCP ports
- bounded service detection
- OS guess on authorized assets
- traceroute
- full TCP with admin confirmation

## Prohibited
- evasion
- spoofing
- decoys
- idle scan
- fragmentation
- brute force
- exploit scripts
- arbitrary flags

## Audit fields
- user
- target
- normalized target
- scope
- profile
- policy decision
- worker invoked
- argument-array hash
- result
- timestamps
- evidence reference
