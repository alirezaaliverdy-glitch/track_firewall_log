# Task 19.1 Control Acceptance Matrix

Date: 2026-07-13

| Surface/control group | Route/API/state evidence | Empty/error/permission behavior | Acceptance |
|---|---|---|---|
| Primary navigation links | Playwright clicked Assets, Security, Monitoring, Actions, Assistant, and Integrations and verified exact paths. Contextual children were verified in the route sweep. | Navigation is generated from Product State and fails closed. | Pass |
| Sidebar toggle | Clicked collapsed and expanded states. | Always locally available. | Pass |
| Language selector | Switched Persian/English; `html lang` and `dir` changed atomically. | Persistent locale state; mobile and desktop verified. | Pass |
| Global search | No search backend/workflow exists. The input is now disabled with a localized explanation. | No longer presents a dead enabled control. | Pass as disabled |
| Notifications | No notification backend/workflow exists. The button is now disabled with a localized explanation. | No longer presents a dead enabled control. | Pass as disabled |
| Logout | Kept available and localized. It was not clicked in the acceptance context because it intentionally terminates the user-supplied authenticated session; backend auth coverage verifies logout. | Session-ending permission boundary. | Pass by contract/test |
| Asset/device/vendor CTAs | Registration and workspace links resolve to real routed pages with vendor prefill. | Unsupported or unavailable live discovery remains explicit. | Pass |
| Onboarding wizard | Ordering, credential-reference-only input, connection test, detect, discovery preview, and save contracts are covered by R-B tests/browser inspection. | Plaintext credentials rejected; commit permission-protected. | Pass structurally; live target blocked |
| Cisco onboarding | Prefilled CTA and IOS-XE-only read path are visible; unsupported platforms are rejected by tests. | No connector success without `connectorInvoked=true`; mutation remains disabled. | Pass structurally; live Cisco target blocked |
| Action Center refresh/tabs/topic filters | Playwright clicked refresh, all five status tabs, and all eight topic filters without errors. `all` and generated-command fallback are localized. | Empty/filter recovery is explicit; API errors are structured and URL-free. | Pass |
| Action detail/preview/revision/execute | Exact direct URL and revision 1 are stable. R-D live execution and repeat verification used the selected Linux device. | Genuine stale input returns structured recovery; success requires connector evidence. | Pass; live result had `connectorInvoked=true` |
| Assistant refresh/new/clear | Playwright clicked all three controls. Device selection and exact-plan navigation were previously verified. | Send is disabled with a localized explanation until input exists. | Pass |
| Monitoring refresh/collection controls | Read-only routes and current state load without API errors. Mutation-bearing or target-specific collection was not re-triggered during R-G. | Missing telemetry is rendered as no-data/warning, not fabricated health. | Pass |
| Finding-to-ActionPlan | Creates a review proposal only; it does not execute a connector or claim success. | Controlled permission/preview boundary retained. | Pass by contract/test |
| Integration previews | Playwright clicked NetBox and Wazuh mock previews without failed requests. | Production Apply disabled and explains missing real configuration. | Pass for mock contract |
| Settings | No enabled workflow controls are advertised. | Route remains outside primary navigation. | Pass as explicit partial state |

No enabled, inert global control remains from this audit. Controls capable of device or database mutation were not broadly clicked merely for coverage; their backend contracts, permission gates, and the one explicitly reviewed Linux execution are recorded separately.
