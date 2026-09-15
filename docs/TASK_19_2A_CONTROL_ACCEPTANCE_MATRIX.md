# Task 19.2A Control Acceptance Matrix

| Surface | Control | Expected result | Status |
| --- | --- | --- | --- |
| Dashboard | `ثبت دستگاه جدید` | `/assets/devices/new` | Pass |
| Dashboard | `تست سریع شبکه` | `/tools/network-check` | Pass |
| Dashboard | `بررسی دامنه یا IP` | `/tools` | Pass |
| Dashboard | `مشاهده دستگاه‌ها` | `/assets/devices` | Pass |
| Onboarding | `ذخیره اطلاعات` | `answers_saved` after validation | Pass |
| Onboarding | `تست امن اتصال` | `connection_verified` only with connector invocation | Pass |
| Onboarding | `تشخیص پلتفرم` | `platform_detected` only with evidence | Pass |
| Onboarding | `کشف خواندنی موجودی و قابلیت‌ها` | `discovery_completed` with connector invocation | Pass |
| Onboarding | `ساخت پیش‌نمایش` | `preview_ready` | Pass |
| Onboarding | `تأیید Preview و ثبت دستگاه` | `completed` plus persisted Device ID | Pass |
| Linux monitoring | Summary load | `available` or `not_configured` observability contract without stack-trace storm | Pass |

The click-level authenticated Playwright MCP audit remains blocked by unavailable MCP tools in this run.
