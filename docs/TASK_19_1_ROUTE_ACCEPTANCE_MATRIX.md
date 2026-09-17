# Task 19.1 Route Acceptance Matrix

Date: 2026-07-13

Evidence: current authenticated Playwright MCP context against `http://localhost:5173`, with API traffic to the running backend. The same 14-route set was checked at 1440x900 Persian, 1280x800 Persian, 390x844 Persian, 1440x900 English, and 390x844 English.

| Route | State and evidence | Locale/responsive result | Acceptance |
|---|---|---|---|
| `/dashboard` | Real summary cards and primary destination links rendered from live API state. | RTL/LTR correct; no overflow or errors. | Pass |
| `/assets` | Real totals, device links, health state, and routed device-registration CTA. | RTL/LTR correct; no overflow or errors. | Pass |
| `/assets/devices` | Real device rows open stable workspaces; registration CTA opens onboarding. | RTL/LTR correct; no overflow or errors. | Pass |
| `/assets/vendors` | Vendor registry and contextual registration/detail routes render from feature state. | RTL/LTR correct; no overflow or errors. | Pass |
| `/assets/vendors/cisco` | Honest zero-device state, read-only capability scope, and Cisco-prefilled onboarding CTA. No live Cisco success is claimed. | RTL/LTR correct; no overflow or errors. | Pass with live-target blocker |
| `/security` | Real finding/action summaries and detail navigation. | RTL/LTR correct; no overflow or errors. | Pass |
| `/security/findings` | Real finding rows and proposal-only ActionPlan entry points. Finding content remains source data, not translated product chrome. | RTL/LTR correct; no overflow or errors. | Pass |
| `/security/rules` | Real registered rule state; no mutation control was introduced. | RTL/LTR correct; no overflow or errors. | Pass |
| `/monitoring` | Existing monitoring, read-only collection, and Daily Check controls render with honest state. | RTL/LTR correct; no overflow or errors. | Pass |
| `/monitoring/linux` | Real Linux inventory/health state and read-only refresh route. | RTL/LTR correct; no overflow or errors. | Pass |
| `/actions` | Exact-plan routing, revisions, structured errors, filters, preview/confirm/execute/result states. | Named product copy is localized; no overflow or errors. | Pass |
| `/assistant` | Device selection, summary, new request, clear chat, proposal, and exact ActionPlan handoff. | Named product copy is localized; no overflow or errors. | Pass |
| `/integrations` | Mock NetBox/Wazuh previews work; production Apply remains disabled and explained. | RTL/LTR correct; no overflow or errors. | Pass for mock contract |
| `/settings` | Direct route is an explicit non-actionable setup state and remains outside primary navigation. | RTL/LTR correct; no overflow or errors. | Pass as non-primary partial state |

Across the sweeps, Playwright recorded zero unexpected API responses at or above 400, zero console errors attributable to the current navigation, and zero page-level horizontal overflow.
