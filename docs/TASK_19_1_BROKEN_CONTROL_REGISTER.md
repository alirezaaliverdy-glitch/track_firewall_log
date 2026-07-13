# Task 19.1 Broken Control Register — Milestone R-A

Date: 2026-07-13

## Milestone R-F disposition

- BC-06 is resolved: `/assets/devices/:deviceId` is a stable workspace with operational overview, stored-data charts, time ranges, capability-gated vendor tabs, findings, exact actions, audit/history, and connection settings.
- A newly observed device/asset contract gap was fixed: findings/actions/collections now match either linked identity instead of requiring both IDs on the same record.

## Milestone R-E disposition

- BC-10 is resolved: user-facing errors no longer expose raw backend URLs; structured code, retryability, recovery, revision identity, and changed fields are preserved with a recovery control.
- BC-12 is resolved for Action Center primary controls in Persian and English, including explicit verified/no-change state.
- BC-13 is resolved for the normal Action Center workflow: canonical runtime and parameters are human-readable; raw technical JSON remains only inside the explicit Details disclosure.
- BC-16 is resolved on the R-E Assistant/Action Center surfaces: locale selection changes copy and document `lang`/`dir` atomically. The remaining global route audit belongs to R-G.

## Milestone R-D disposition

- BC-07 is resolved: deterministic `linux.close-port` creates or reuses the exact executable ActionPlan and exposes its exact route.
- BC-09 is resolved: canonical preview/approval revision 1 executed through the registered Linux SSH connector with `connectorInvoked=true`.
- BC-10 is partially resolved: genuine stale revisions now return structured retry/recovery/revision/changed-field details. Localization and normal-workflow presentation remain assigned to R-E.
- BC-11 is resolved: the repeated Persian request reuses the same succeeded ActionPlan and connector verification records `verified_no_change` with `connectorInvoked=true`.

R-C update: BC-08 is resolved. Route identity is now the source of truth for Action Center selection, and an unknown ID produces structured, non-retryable `ACTION_PLAN_NOT_FOUND`. Other controls remain assigned to later milestones. R-C performed no connector execution or device mutation.

Evidence source: authenticated Playwright MCP browser plus read-only source/API inspection.

| ID | Route/control | Observed behavior | Expected behavior | Severity | Planned milestone |
|---|---|---|---|---|---|
| BC-01 | `/assets` page header | No add/register-device CTA. | Visible `ثبت دستگاه` secondary global action. | Critical | R-B |
| BC-02 | `/assets/devices` | Device table has detail links only. | Visible onboarding CTA and routed registration workflow. | Critical | R-B |
| BC-03 | `/assets/vendors` | Vendor cards have no shared device-registration entry point. | Registration CTA carries vendor context when applicable. | High | R-B |
| BC-04 | Cisco empty-state `رفتن به تجهیزات` | Opens generic `/assets/devices`, which cannot register a device. | Open Cisco-prefilled onboarding. | Critical | R-B |
| BC-05 | Cisco `مشاهده وضعیت دستگاه‌های Cisco` | Repeats the zero-device inventory state without a way to resolve it. | Disabled with explanation or routed to a usable setup flow. | High | R-B |
| BC-06 | Asset detail links | Existing route is summary-shaped and not a complete health/management workspace. | Stable `/assets/devices/:deviceId` workspace with health, capabilities, actions, audit, settings, and vendor tabs. | High | R-B/R-F |
| BC-07 | Assistant reviewed action | `canCreateActionPlan=true` is followed by `فقط بررسی دستی`; no plan is created. | Create the supported registered ActionPlan or return one consistent unsupported state. | Critical | R-C/R-D |
| BC-08 | Assistant Action Center handoff | Resolved in R-C: every handoff uses `/actions/:actionPlanId`; direct load, reload, history, exact selection, focus, and mobile rendering are verified. | Navigate to the exact ActionPlan and preserve selection on reload. | Resolved | R-C |
| BC-09 | Action Center `تایید و اجرا` for port 545 | Returns `COMMAND_PLAN_STALE` for the backend-generated preview. | Execute the exact approved canonical revision; internal normalization must not invalidate it. | Critical | R-D |
| BC-10 | Action Center error state | Shows raw English error plus backend URL. | Localized structured error with code, retryability, recovery action, revision details, and no raw URL. | High | R-D/R-E |
| BC-11 | Repeated close-port request | Second assistant request returns a contradictory manual proposal and creates no new/grouped revision. | Already-compliant/verified-no-change after success, or a clearly grouped latest revision before success. | Critical | R-D/R-E |
| BC-12 | Action Center filters/tabs/table | English-heavy labels in Persian product context. | Complete Persian copy in Persian mode and English copy in English mode. | Medium | R-E |
| BC-13 | Assistant proposal details | Raw JSON is visible in the normal workflow. | Human-readable canonical parameters; technical JSON only in an explicit details disclosure. | Medium | R-C/R-E |
| BC-14 | `/monitoring` controls | English labels remain throughout the primary controls. | Locale-consistent controls. | Medium | R-G |
| BC-15 | Finding/rule tables | Titles, descriptions, and several columns remain English in Persian mode. | Localized product copy with correct RTL. | Medium | R-G |
| BC-16 | Language selector/document state | Selector displays English while much of the page is Persian; document stays `lang=en dir=ltr`. | Selected locale, copy, `lang`, and `dir` change atomically. | High | R-E/R-G |
| BC-17 | `/settings` | Direct route is a planned-only informational page. | Keep outside primary navigation until a real workflow exists; direct route must remain an explicit setup state. | Low | R-G |

## Controls that are intentionally disabled, not broken

- NetBox production Apply is disabled and labelled as Mock-only.
- Wazuh production Apply is disabled and labelled as Mock-only.
- Planned Cisco mutations remain disabled until a registered connector, verification, and rollback exist.

These controls must not be promoted or reported as implemented during Task 19.1.
