# TASK 19.2 — Device Registration and Network Diagnostics Center

## Goal
Make device registration obvious and turn Integrations into a useful Network Diagnostics Center.

## Required outcomes
1. Add a prominent `ثبت دستگاه جدید` button to `/dashboard`.
2. Add `ثبت دستگاه` under Assets navigation.
3. Add vendor-specific onboarding buttons on Cisco, FortiGate, MikroTik and Linux pages.
4. Keep one reusable onboarding engine at `/assets/devices/new`.
5. Redesign Integrations as `ابزارها و یکپارچه‌سازی‌ها` with:
   - Diagnostic Tools
   - External Integrations
6. Add a unified diagnostics input for hostname, IP, URL, host:port and CIDR.
7. Add Check-Host-compatible multi-region checks.
8. Add a safe, isolated Nmap worker.
9. Add history, scheduled monitors, findings and ActionPlan proposals.
10. Verify everything with Playwright MCP.

## Mandatory reading
Read:
- AGENTS.md
- CODEX_HANDOFF.md
- TASK_19_PRODUCT_CONVERGENCE.md
- TASK_19_1_RUNTIME_CONVERGENCE_AND_CRITICAL_REPAIR.md
- docs/PRODUCT_STATE_CONTRACT.md
- docs/CURRENT_STATUS.md
- current dashboard/assets/integrations/onboarding/action/finding/monitoring code
- CHECK_HOST_CAPABILITY_MATRIX.md
- SECURITY_AND_SCAN_POLICY.md
- PLAYWRIGHT_ACCEPTANCE_MATRIX.md

Preserve all completed Task 19.1 work.

## Safety
- Never read or modify `.env`.
- Never expose credentials.
- Never execute user-supplied shell text.
- Nmap uses predefined argument arrays only.
- No arbitrary flags.
- No spoofing, decoys, idle scan, fragmentation, evasion, brute-force or exploit NSE.
- Public multi-region checks must reject localhost, private IPs, link-local, metadata addresses, unsupported URL schemes and DNS rebinding.
- Private/internal scans require a registered asset or approved CIDR scope.
- Never report success unless the worker/connector was invoked.

# Milestone 19.2-A — Restore visible device registration

## Dashboard
Add these Quick Actions:
- ثبت دستگاه جدید
- تست سریع شبکه
- بررسی دامنه یا IP
- مشاهده دستگاه‌ها

Primary CTA route:
`/assets/devices/new`

The user must reach onboarding from Dashboard in at most two clicks.

## Assets navigation
Add:
- نمای کلی
- تجهیزات
- ثبت دستگاه
- وندورها

Product State must not hide onboarding when backend, route and UI are implemented.

## Vendor CTAs
Add:
- ثبت دستگاه Cisco
- ثبت دستگاه FortiGate
- ثبت دستگاه MikroTik
- ثبت سرور Linux

All use the same onboarding engine with a preselected vendor.

# Milestone 19.2-B — Integrations redesign

Rename the area:
`ابزارها و یکپارچه‌سازی‌ها`

Tabs:
1. ابزارهای تشخیصی
2. یکپارچه‌سازی‌های خارجی

Diagnostic cards:
- Network Quick Check
- Multi-Region Reachability
- Nmap Scanner
- DNS Inspector
- HTTP/TLS Inspector
- TCP/UDP Test
- Traceroute
- IP/ASN/Geo
- Subnet/CIDR Calculator
- Scheduled Monitors
- Diagnostic History

External integrations:
- NetBox
- Wazuh
- OpenSearch
- Check-Host API

Each card must show purpose, state, health, last success, setup requirements, errors and history. No dead Sync buttons.

# Milestone 19.2-C — Unified diagnostics

Routes:
- /tools
- /tools/network-check
- /tools/nmap
- /tools/dns
- /tools/http
- /tools/ports
- /tools/traceroute
- /tools/ip-info
- /tools/subnet
- /tools/history
- /tools/monitors

Input:
`دامنه، IP، URL، پورت یا CIDR را وارد کنید`

Target parser identifies:
- domain
- IPv4
- IPv6
- URL
- host:port
- CIDR
- registered asset

For a domain suggest:
- DNS
- Ping
- HTTP/HTTPS
- TLS
- TCP 80/443
- IP/ASN/Geo
- traceroute
- optional authorized Nmap

Result tabs:
- خلاصه
- دسترسی‌پذیری
- DNS
- وب و TLS
- پورت‌ها
- مسیر
- اطلاعات IP
- Nmap
- تاریخچه

Do not use raw tool output as the main UX.

# Milestone 19.2-D — Check-Host API adapter

Use the documented JSON API, not HTML scraping or browser CSRF tokens.

Supported:
- ping
- http
- tcp
- udp
- dns
- node list
- selected nodes
- partial result polling

Endpoints:
- /check-<type>?host=<target>&max_nodes=<n>
- /check-result/<request_id>
- /check-result-extended/<request_id>
- /nodes/hosts
- /nodes/ips

Implement:
- typed validation
- bounded polling
- timeout
- retry with backoff
- cache
- rate limiting
- provider health
- node/country selection
- partial results
- provider failure state

UI shows:
- country
- city
- node
- ASN
- status
- latency
- resolved IP
- HTTP code
- error

Always label the source:
`منبع بررسی: Check-Host external nodes`

# Milestone 19.2-E — Capability parity

## IP info
- IPv4/IPv6
- reverse DNS
- country/region/city/timezone
- ASN/ISP/organization
- prefix/network
- source/freshness

## Ping
- local authorized and multi-region
- packet loss
- min/avg/max latency
- history

## HTTP/TLS
- status
- redirect chain
- response time
- resolved IP
- certificate issuer/expiry
- protocol
- safe header summary

Never show cookies or authorization headers.

## DNS
- A, AAAA, PTR, CNAME, MX, NS, TXT, SOA, TTL
- DNSSEC where available
- resolver comparison
- propagation mismatch
- split-horizon warning

## TCP/UDP
- selected authorized ports
- latency
- reachable/refused/timeout
- UDP response/unreachable/unknown distinction

Do not claim UDP open from silence.

## Subnet
- CIDR to range
- range to CIDR
- mask
- wildcard
- network
- broadcast
- first/last host
- usable count
- IPv4/IPv6

## Traceroute
- hops
- RTT
- reverse DNS
- ASN/geo enrichment
- path history

# Milestone 19.2-F — Nmap worker

Architecture:
backend API → policy engine → job queue → isolated worker → Nmap XML → parser → normalized result → audit/history

Allowed profiles:
1. host discovery
2. quick common TCP
3. selected ports
4. bounded service/version detection
5. OS guess for authorized assets
6. traceroute
7. full TCP only with admin permission, explicit confirmation and rate limits

Disabled:
- arbitrary flags
- evasion
- spoofing
- decoys
- idle scan
- fragmentation
- brute-force/exploit scripts
- intrusive NSE by default

Use process argument arrays. Never concatenate shell strings.

Normalize XML into:
- host status
- addresses
- hostname
- ports/states
- service/product/version
- OS confidence
- approved script output
- traceroute
- duration

Generate findings for:
- new exposed port
- public management service
- cleartext service
- unauthorized host
- unexpected service/version change
- missing expected port
- exposure drift

Do not infer a CVE from a version string alone.

# Milestone 19.2-G — Authorization and SSRF prevention

Create `ScanAuthorizationScope`:
- name
- asset/hostname/ip/cidr
- normalized value
- owner
- approver
- validity
- allowed profiles
- max frequency
- notes

Before every job:
normalize → resolve → classify public/private → scope check → permission → profile check → frequency check → approve/reject

SSRF controls:
- scheme allowlist
- block file/gopher/ftp and arbitrary schemes
- block loopback/private/link-local/metadata for external checks
- validate every redirect
- resolve and pin IP
- recheck after DNS resolution
- DNS rebinding defense
- isolated egress
- timeout and response-size limits
- no credential forwarding

# Milestone 19.2-H — Monitoring, findings and actions

Create monitors for:
- ping
- HTTP
- DNS
- TCP
- TLS expiry
- service port
- integration health

Support:
- interval
- timeout
- failure threshold
- recovery threshold
- maintenance window
- notification policy
- uptime/history

Diagnostics can create Findings:
- DNS mismatch
- certificate expiry
- unexpected port
- unavailable service
- route degradation
- integration outage

Finding links to evidence and may propose a registered ActionPlan. No automatic mutation.

# Tests

Backend:
- Product State exposes onboarding
- Dashboard CTA route
- target parser
- public/private classification
- SSRF and rebinding rejection
- redirect validation
- scope authorization
- Nmap profile allowlist
- no arbitrary flags
- XML parser fixtures
- UDP unknown semantics
- Check-Host polling/partial/rate-limit
- monitor history
- result-to-finding
- success requires worker invocation
- credential redaction

Frontend:
- Dashboard/Assets/Vendor onboarding CTAs
- tools input and suggestions
- multi-region results
- Nmap profile selection
- policy rejection
- loading/partial/error states
- history and monitor creation
- Persian/English/mobile
- no raw JSON
- no dead buttons

# Playwright flows

1. Dashboard → ثبت دستگاه جدید → onboarding
2. Tools → public domain → DNS + HTTP + Ping → multi-region results → history
3. Registered Linux asset → authorized Nmap quick scan → structured result → asset link
4. Unauthorized private IP → policy rejection → worker not invoked
5. Create HTTP monitor → run → history → failure/recovery

Viewports:
- 1440x900 FA/EN
- 1280x800 FA
- 390x844 FA/EN

# Controlled order

- 19.2-A: Dashboard/onboarding entry points
- 19.2-B: tools landing and session model
- 19.2-C: Check-Host adapter
- 19.2-D: IP/DNS/HTTP/TCP/UDP/TLS/traceroute/subnet
- 19.2-E: Nmap worker and scopes
- 19.2-F: monitors/findings/actions
- 19.2-G: polish and Playwright

Each phase gets a separate commit, tests and memory update.

# Validation

Backend:
- npx prisma validate
- npx prisma migrate status
- npx prisma generate
- npm run build
- npm test
- npm run validate:command-catalog

Frontend:
- npx pnpm@10 build
- npm run test:i18n
- npm run lint

Also:
- git diff --check
- git status --short
