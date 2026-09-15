# Task 19.2A Route Acceptance Matrix

| Route | Expected behavior | Evidence | Status |
| --- | --- | --- | --- |
| `/dashboard` | Shows Add Device and correct Dashboard quick action routes. | Source regression and frontend build. | Pass |
| `/assets/devices/new` | Reusable onboarding engine with explicit steps. | Backend state-machine regression and frontend build. | Pass |
| `/assets/vendors/:vendorKey/devices/new` | Vendor-prefilled onboarding engine. | Route registry and Product State alignment tests. | Pass |
| `/tools` | Stable non-executing diagnostic landing route. | Route registry and Dashboard regression. | Pass |
| `/tools/network-check` | Stable non-executing quick-check route. | Route registry and Dashboard regression. | Pass |
| `/monitoring/linux` | Stable partial/not-configured state when optional tables are absent. | Linux monitoring summary regression. | Pass |

Playwright MCP route acceptance could not be completed because the connected MCP browser tools were not exposed to this turn. Local Playwright fallback previously reached the auth gate in a fresh context and is not a substitute for the requested authenticated MCP session.
