# TASK 20 NETWORK DIAGNOSTICS SECURITY POLICY

## Public external checks

Allow only validated public targets through external provider adapters.
Block localhost, loopback, RFC1918, link-local, metadata, multicast, broadcast, unsupported schemes, userinfo URLs, redirects to blocked destinations and DNS rebinding.

## Private/internal checks

Require a registered asset or approved ScanAuthorizationScope, role permission, isolated local worker, bounded profile and audit.

## Nmap

Allowed: host discovery, reviewed common TCP, selected ports, bounded service detection, authorized OS guess, traceroute, and confirmed full TCP.

Denied: arbitrary flags, exploit/brute-force NSE, evasion, spoofing, decoys, fragmentation, idle scan, and random Internet ranges.

Every run records user, target, normalized target, classification, scope, policy decision, provider/worker, invocation flag, profile, timestamps, result, evidence reference and related asset/finding/action.
