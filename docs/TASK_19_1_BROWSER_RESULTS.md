# Task 19.1 Browser Results

Date: 2026-07-13

## Runtime convergence follow-up

- Reused the same authenticated Playwright browser and context; no replacement context was created.
- Persian Assistant request `پورت 546 را ببند` created exact ActionPlan `cmrj3z0dc0009xslv1ba6moxs` at revision 1 and displayed its `quick_controlled` lifecycle contract.
- Assistant handoff opened `/actions/cmrj3z0dc0009xslv1ba6moxs`; Execute issued `POST /api/actions/cmrj3z0dc0009xslv1ba6moxs/quick-execute` and received HTTP 200, not 409.
- The result opened at `/actions/cmrj3z0dc0009xslv1ba6moxs/result` and visibly reported a real device execution, successful status, Linux executor, and verified no-change outcome.
- The returned ActionPlan stored `status=succeeded`, `planState=completed`, `approvedRevision=1`, `executingRevision=1`, and `connectorInvoked=true`. No stale state or browser console error remained.
- Automatic stale-input convergence itself is covered by the functional connector test: changed approved input regenerated revision 2 and executed revision 2 without `COMMAND_PLAN_STALE` or HTTP 409.

## Runtime and viewports

- Playwright MCP used the new user-authenticated browser context throughout.
- Verified 14 primary/direct routes at 1440x900 Persian, 1280x800 Persian, 390x844 Persian, 1440x900 English, and 390x844 English.
- All route/path checks passed. Persian rendered `lang=fa dir=rtl`; English rendered `lang=en dir=ltr`.
- No page-level horizontal overflow, unexpected API 4xx/5xx response, or current-navigation console error was observed.
- Safe control clicks passed for navigation, sidebar collapse, Action Center refresh/status/topic filters, Assistant refresh/new/clear, and NetBox/Wazuh mock previews.

## Required flows

| Flow | Visible result | Status |
|---|---|---|
| Add Linux device | CTA, vendor selection, ordered onboarding wizard, credential-reference boundary, SSH test/detect/discovery preview/save states, and resulting workspace route are implemented and tested. A new live target and credential reference were not supplied in this run. | Blocked for live end-to-end acceptance |
| Add Cisco device | Cisco-prefilled onboarding, IOS-XE bounded read-only detection/discovery, capability preview, save contract, workspace, and unsupported-platform rejection are implemented and tested. No unambiguous live Cisco target/credential was supplied. | Blocked for live end-to-end acceptance |
| Assistant close port | Persian request for port 545 resolved to the exact ActionPlan, previewed canonical revision 1, executed through the selected Linux SSH connector, and repeated as verified no-change. | Pass; `connectorInvoked=true` |
| Genuine parameter edit | Canonical revision creation, approved-snapshot immutability, stale-field reporting, fresh preview/re-confirm requirement, and UI recovery are covered by backend/UI tests. No second live device mutation was performed during R-G. | Pass structurally; not re-executed live |
| Asset health | Linux workspace renders stored health/connector/availability/resource/finding/action charts, range switching, recent change annotations, and honest no-data vendor tabs without raw JSON. | Pass |

Task 19.1 must not be described as having all five live end-to-end flows accepted. The Linux and Cisco new-device flows require explicit real targets and credential references; that is the remaining production acceptance blocker, not a fabricated success.

## Safety

- No `.env` file or credential was read, printed, modified, or staged.
- No migration, destructive database operation, or unreviewed device mutation was run.
- Mock integration previews are not reported as production integrations.
- The only successful device-changing evidence in Task 19.1 is the previously reviewed Linux close-port flow, whose stored result proves `executed=true` and `connectorInvoked=true`.
