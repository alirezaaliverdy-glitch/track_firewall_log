# Task 19A Browser Baseline

Date: 2026-07-13

Session: existing authenticated Playwright MCP session

Initial viewport and locale: 1440 x 900, Persian (`fa`, RTL)

## Method

Each required route was opened directly in the authenticated application. The pass recorded the visible purpose and status language, route-local network failures, HTTP responses at or above 400, console errors, document direction, and horizontal overflow. Source and API route inspection was then used to distinguish a working surface from a placeholder, alias, mock, or unverified integration.

The initial route pass produced no console errors, failed requests, HTTP responses at or above 400, or horizontal document overflow. That clean runtime result did not mean that every promoted route was a real feature; the state audit below records those semantic mismatches.

## Initial route baseline

| Route | Visible purpose | API/backend evidence | Initial product state | Baseline finding |
| --- | --- | --- | --- | --- |
| `/dashboard` | Operational overview | Asset, finding, monitoring, and action summaries | implemented | Working overview; primary navigation was frontend-owned. |
| `/assets` | Asset overview and inventory entry points | Asset intelligence APIs | implemented | Working. It also exposes contextual links to lower-readiness surfaces. |
| `/assets/devices` | Device inventory | Asset APIs | implemented | Working inventory surface. |
| `/assets/vendors` | Vendor capability overview | Vendor registry APIs | implemented | Working and the correct parent entry for vendor-specific partial features. |
| `/assets/vendors/cisco` | Cisco IOS-XE capability page | Cisco capability and device APIs | partial | Honest read-only state; live verification and mutations are incomplete. It was over-promoted as a direct sidebar item. |
| `/security` | Security posture overview | Finding and rule APIs | implemented | Working overview. |
| `/security/findings` | Finding list and review flow | `/api/security/findings` and detail routes | implemented | Working current finding model; later finding-model convergence remains deferred. |
| `/security/rules` | Seeded detection-rule library | `/api/security/rules` | partial | Read/list surface works; full lifecycle and rewrite belong to Milestone 19D. |
| `/monitoring` | Monitoring overview | Device, telemetry, and daily-check APIs | implemented | Working overview. |
| `/monitoring/linux` | Linux fleet observability | Linux monitoring summary/device APIs | partial | Reads degrade safely; persisted refresh remains blocked by the pending observability migration. |
| `/actions` | Action Center | ActionPlan, preview, execute, result, and audit routes | implemented | Working controlled-execution surface. No mutation was executed during this audit. |
| `/assistant` | AI-assisted proposal and guided workflows | AI/context/catalog APIs | partial | UI/API flow exists; provider availability remains environment-dependent. |
| `/integrations` | NetBox/Wazuh integration preview | Explicit mock adapter APIs | partial | Honest mock preview surface; production apply controls are disabled. |
| `/integrations/netbox` | NetBox-specific preview | Mock NetBox preview API | not_configured | Opens and labels mock state; production Apply is disabled; not a primary destination. |
| `/integrations/wazuh` | Wazuh-specific preview | Mock Wazuh preview API | not_configured | Opens and labels mock state; production Apply is disabled; not a primary destination. |
| `/settings` | Planned Settings Center | No settings contract/API | planned | Placeholder was incorrectly present in primary navigation. |

For all 16 rows, the initial desktop pass reached the requested route without an auth redirect, used RTL in Persian, had no horizontal overflow, and produced no console error, failed request, or HTTP response at or above 400. Loading states settled before inspection. Empty states were honest where data was unavailable: Cisco reported no detected devices, and integration children reported mock/not-configured behavior rather than success. No control that could mutate a device was used. The dead controls observed were the disabled production Apply actions on the NetBox/Wazuh mock surfaces; Settings contained no functional setting control.

## Additional promoted-route checks

The initial sidebar also promoted routes not justified as independent primary destinations:

| Route | Actual behavior | Resolution in 19A |
| --- | --- | --- |
| `/assets/sync` | Explicit mock sync preview | Removed from primary navigation; direct/contextual access remains. |
| `/integrations/netbox` | Not configured; mock adapter only | Removed from primary navigation. |
| `/integrations/wazuh` | Not configured; mock adapter only | Removed from primary navigation. |
| `/actions/pending` | Reuses the complete Action Center without a pending-only contract | Removed from primary navigation. |
| `/actions/history` | Reuses the complete Action Center without a history-only contract | Removed from primary navigation. |
| `/monitoring/devices` | Reuses the Monitoring overview | Removed from primary navigation. |
| `/monitoring/daily-check` | Mixed vendor support; some profiles are manual-only | Removed from primary navigation pending a distinct, consistently supported destination. |

## Baseline navigation mismatch

Before 19A, `src/routes/appRoutes.tsx` duplicated product readiness through local `implemented`, `nav`, and `mobilePrimary` flags. `Settings` was marked implemented and navigable even though its page explicitly rendered planned state. Mock-only integration children, an unverified vendor child, and route aliases were also elevated to primary navigation.

Milestone 19A replaces those flags with stable `featureKey` values. The backend Product State Contract is now the single navigation source, while the route registry remains responsible only for route-to-component mapping.

## Verification matrix

The completion pass re-opened all required routes in these combinations:

| Viewport | Locale | Required assertions |
| --- | --- | --- |
| Desktop 1440 x 900 | Persian | PASS: all routes authenticated, `fa`/RTL, no horizontal overflow, no console errors, failed requests, or HTTP >=400 responses. Navigation labels were Persian. |
| Desktop 1440 x 900 | English | PASS: all routes authenticated, `en`/LTR, no horizontal overflow, no console errors, failed requests, or HTTP >=400 responses. Contract navigation labels were English. Existing feature-page copy is not universally translated and remains a registered deferred gap. |
| Mobile 390 x 844 | Persian | PASS: all routes authenticated, `fa`/RTL, no horizontal overflow or runtime/network errors. Bottom navigation contained only Dashboard, Assets, Security, and Actions in Persian. |
| Mobile 390 x 844 | English | PASS: all routes authenticated, `en`/LTR, no horizontal overflow or runtime/network errors. Bottom navigation contained only Dashboard, Assets, Security, and Actions in English. |

The two integration child routes were also reopened directly after the generated-navigation checks. They remained reachable as honest mock/not-configured detail pages but were absent from both desktop primary navigation and mobile bottom navigation.

## Post-change navigation evidence

Desktop primary navigation contained only:

- Dashboard;
- Assets: Overview, Devices, Vendors;
- Security: Overview, Findings, Detection rules;
- Monitoring: Overview, Linux;
- Actions;
- Assistant; and
- Integrations overview.

It excluded Settings, asset sync, Cisco, NetBox, Wazuh, pending approvals, execution history, monitoring-device alias, and Daily Check alias. The same route set and exclusions were observed with Persian and English labels.
