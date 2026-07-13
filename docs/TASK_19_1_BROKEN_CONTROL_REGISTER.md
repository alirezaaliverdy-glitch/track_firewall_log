# Task 19.1 Broken Control Register — Milestone R-A

Date: 2026-07-13

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
| BC-08 | Assistant Action Center handoff | Helper only scrolls for an element in the current page and carries no plan ID. | Navigate to the exact ActionPlan and preserve selection on reload. | Critical | R-C |
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
