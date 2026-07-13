# Task 19.1 Runtime Baseline — Milestone R-A

Date: 2026-07-13

## Milestone R-D verification addendum

- Preview resolved `linux.close-port`, `linux_close_port`, `linux-ssh`, Linux platform/vendor, canonical port 545/tcp parameters, medium risk, and revision 1 before approval.
- The reviewed Action Center execution invoked the real Linux SSH connector on the explicitly selected Linux device. The initial required change completed and the repeat connector inspection returned `verified_no_change`; both paths recorded `connectorInvoked=true`.
- Final stored state: `status=succeeded`, `planState=completed`, `planRevision=approvedRevision=1`, `previewStale=false`, firewall adapter UFW, effective state closed, and result `executed=true`, `connectorInvoked=true`.
- Repeating the exact Persian Assistant request returned immediately through deterministic catalog resolution, showed `linux_close_port`, removed the contradictory `missing_fields` debug state, and routed to the same ActionPlan ID. The action list contains one matching device/action/port plan.
- Exact-plan rendering passed at 1440x900 and 390x844 in Persian RTL and English LTR. Page and dialog horizontal overflow were both false.
- No `.env` access, credential output, migration, destructive database operation, external integration call, or ambiguous target selection occurred.

## Milestone R-C verification addendum

- `/actions/cmrix2ddb00ao2glvh3tagbe6` loads and selects only that plan; reload preserves its URL, current status, and revision.
- Browser back returns to `/actions`; invalid `/actions/task19-1-not-real` renders `ACTION_PLAN_NOT_FOUND` with recovery.
- Desktop English and 390px Persian RTL were verified in the fresh authenticated Playwright context.
- Mobile measured `viewport=375`, `scrollWidth=375`, one selected row, and one visible dialog.
- No execution request, connector call, device mutation, database operation, or credential access occurred.

Browser: new authenticated Playwright MCP context, desktop viewport

Application: `http://localhost:5173` with API requests to `http://localhost:4000/api`

## Safety boundary

- No `.env` file or credential was read, printed, or changed.
- No migration or destructive database command was run.
- The only execution attempt used the existing reviewed `close_port` ActionPlan for port 545 on the explicitly selected Linux device.
- The attempt stopped at the stale-plan guard. The connector was not invoked and no success is claimed.
- Existing untracked task files and Playwright evidence were preserved.

## Route baseline

| Route | Runtime observation | Console/network | Contract mismatch |
|---|---|---|---|
| `/dashboard` | Operational Persian summary loads with 6 assets, 5 open findings, and Linux health 0/1. | No failed request or console error observed. | Persian content renders under `html[lang=en][dir=ltr]`. |
| `/assets` | Asset totals, health summary, and two assets needing review load. | No failed request or console error observed. | No visible device-registration entry point. |
| `/assets/devices` | Six device/asset rows load with detail links. | No failed request or console error observed. | No add/register-device control; management data is presented as a list rather than an onboarding/workspace entry point. |
| `/assets/vendors` | Linux, MikroTik, FortiGate, Cisco, and pfSense cards load. | No failed request or console error observed. | No shared registration CTA. Cisco is described as limited while the backend advertises implemented read capabilities without a usable registered connector path. |
| `/assets/vendors/cisco` | Empty state reports zero Cisco devices and 11 active reads. | `GET /api/vendors/cisco` 200; `GET /api/vendors/cisco/devices` 200 with empty data. | CTAs lead to the generic device list or Action Center, not a Cisco registration workflow. The page claims active reads before a registered Cisco connector/device can exercise them. |
| `/assistant` | Device selector and chat load; selecting the Linux device and sending `پورت 545 را ببند` returns a proposal after about 35 seconds. | `POST /api/ai/chat` 200; no transport failure. | UI says `canCreateActionPlan: true` but also says manual-only and creates no ActionPlan. It exposes raw proposal JSON, mixes Persian/English, and provides no exact-plan Action Center navigation. |
| `/actions` | 100 plans load. Existing `close_port` plan for port 545 is shown as dry-run ready. | `POST /api/actions/{id}/quick-execute` returns 409 and creates a console error. | UI exposes the raw API URL/error. Backend rejects its own preview as stale before connector resolution/execution. |
| `/monitoring` | Telemetry and Daily Check surfaces load. | No failed request or console error observed. | English-heavy headings and controls remain in Persian product context. |
| `/monitoring/linux` | One Linux server loads with unknown health and no collection time. | No failed request or console error observed. | Persian page still inherits `lang=en dir=ltr`; no-data state is usable but does not lead to the device workspace requested by Task 19.1. |
| `/security/findings` | Five findings load with ActionPlan creation controls. | No failed request or console error observed. | Finding titles/descriptions remain English in the Persian surface. |
| `/security/rules` | Seeded detection rules load. | No failed request or console error observed. | Rule titles/descriptions and table labels remain English in Persian mode. |
| `/integrations` | NetBox and Wazuh are honestly labelled Mock and production Apply is disabled. | No failed request or console error observed. | Mixed Persian/English copy remains, but disabled production controls are explained and were not treated as successful integrations. |
| `/settings` | Direct route loads a planned-only settings message. | No failed request or console error observed. | No actionable settings workflow; route is correctly absent from primary navigation but remains a direct placeholder. |

## Reproduced critical failures

### Missing onboarding and Cisco dead end

There is no `ثبت دستگاه` entry point on `/assets`, `/assets/devices`, `/assets/vendors`, or `/assets/vendors/cisco`. The Cisco empty-state CTA `رفتن به تجهیزات` reaches the generic list, which also has no registration control. The backend response is:

```json
{
  "data": [],
  "pagination": { "page": 1, "pageSize": 25, "total": 0, "totalPages": 0 },
  "meta": { "note": "Cisco device operational inventory is populated after platform detection refresh." },
  "warnings": []
}
```

This is a loop: the UI says registration is required but exposes no route that can perform it.

### Assistant to Action Center

For the selected Linux device, the exact request `پورت 545 را ببند` returns an assistant proposal with:

- `intentType=close_port`
- `canCreateActionPlan=true`
- canonical `port=545`, `protocol=tcp`

The same screen then labels the request manual-only, shows raw JSON, and creates no new ActionPlan. The existing handoff helper only scrolls within the current document, so it cannot open `/actions/:id` or `/actions?selected=:id` from `/assistant`.

### Stale close-port plan

The existing plan is tied to the selected Linux device and contains `port=545`, `protocol=tcp`. Before execution its metadata already contains:

```text
previewGenerated=true
previewStale=true
staleReason=user_controlled_inputs_changed
vendor=linux_edge
catalogCommandId=null
executionTemplateRef=null
connectorInvoked=false
```

The controlled Action Center button sent:

```http
POST /api/actions/cmrix2ddb00ao2glvh3tagbe6/quick-execute
Content-Type: application/json

{"intent":"execute","reason":"Execute from Action Center"}
```

The API returned:

```http
409 Conflict
```

```json
{
  "error": "COMMAND_PLAN_STALE",
  "detail": "The command plan is stale because the ActionPlan parameters changed."
}
```

After the attempt, the plan remains `dry_run_ready`; `connectorInvoked=false`. No device mutation or successful execution occurred.

### Repeated request

The new authenticated context submitted the same port-545 intent again for the same selected Linux device. `POST /api/ai/chat` returned 200, but the UI produced a manual-only proposal while simultaneously reporting `canCreateActionPlan=true`; the action list therefore still contains only one matching `close_port` plan. The intended idempotent outcome cannot be reached because the first plan is stale and the repeated request does not enter the ActionPlan workflow.

## Initial root-cause map

- Onboarding exists in an older, unrouted panel, while Product State and the route registry declare no live onboarding route.
- Cisco capability metadata advertises implemented reads, but the Cisco connector is not registered in the device connector registry and live read calls return `connectorInvoked=false`.
- Assistant handoff is DOM-scroll based and carries no ActionPlan ID into routing.
- ActionPlan preview and execution re-run normalization at different lifecycle points. Vendor/template/connector fields are unresolved when the preview fingerprint is stored, then internal normalization marks the same plan stale.
- Approved-plan immutability and explicit revision identity are absent from the stored contract.
- Locale selection, document `lang/dir`, and page copy are not synchronized.

## R-A disposition

Milestone R-A is documentation-only. No implementation fix is included. The next allowed milestone is R-B: restore device onboarding and Product State visibility, then add the device workspace foundation in a separate commit.
