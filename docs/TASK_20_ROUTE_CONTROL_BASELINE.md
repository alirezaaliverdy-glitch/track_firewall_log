# Task 20 Route and Control Baseline

Date: 2026-07-14

| Surface | Control or route | Baseline behavior | Task 20 requirement |
| --- | --- | --- | --- |
| Dashboard | `ثبت دستگاه جدید` | Routes to `/assets/devices/new`. | Keep as real onboarding entry. |
| Dashboard | `تست سریع شبکه` | Routes to `/tools/network-check`, but the page is non-executing. | Must execute a persisted diagnostic session. |
| Dashboard | `بررسی دامنه یا IP` | Routes to `/tools`, but the page is non-executing. | Must run real suggested checks and persist results. |
| Dashboard | `مشاهده دستگاه‌ها` | Routes to `/assets/devices`. | Keep direct route/reload behavior. |
| Tools | `/tools` | Placeholder diagnostic landing. | Real tools workspace with target parsing, suggestions, results, history, monitors, Nmap routes. |
| Tools | `/tools/network-check` | Placeholder quick-check route. | Real quick diagnostic session. |
| Tools | `/tools/nmap` | Not registered. | Real safe Nmap UI backed by policy and worker. |
| Tools | `/tools/history` | Not registered. | Persisted diagnostic history. |
| Tools | `/tools/monitors` | Not registered. | Real persisted monitors and run history. |
| Onboarding API | `/answers` | Validates and moves to `answers_saved`. | Preserve. |
| Onboarding API | `/test` | Connector-backed test route exists. | Add `/test-connection` alias required by Task 20. |
| Onboarding API | `/detect` | Detection route exists. | Add `/detect-platform` alias required by Task 20. |
| Onboarding API | `/preview` | Preview route exists. | Add `/build-preview` alias required by Task 20. |
| Onboarding API | `/retry` | Not registered. | Add structured retry route. |

## Dead or Placeholder Controls

The primary known placeholder is the Tools page itself. Dashboard controls reach stable URLs, but those URLs do not yet invoke real providers/workers or persist normalized diagnostic results.
