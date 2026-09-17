# Task 19.2A Dashboard Control Matrix

| Control | Required route | Current result | Status |
| --- | --- | --- | --- |
| `ثبت دستگاه جدید` header CTA | `/assets/devices/new` | Routes to reusable onboarding engine. | Pass |
| `ثبت دستگاه جدید` quick action | `/assets/devices/new` | Routes to reusable onboarding engine. | Pass |
| `تست سریع شبکه` | `/tools/network-check` | Routes to stable non-executing diagnostic landing page. | Pass |
| `بررسی دامنه یا IP` | `/tools` | Routes to stable non-executing diagnostic landing page. | Pass |
| `مشاهده دستگاه‌ها` | `/assets/devices` | Routes to device list. | Pass |
| `مشاهده یافته ها` | `/security/findings` | Existing route preserved. | Pass |
| `مشاهده پایش Linux` | `/monitoring/linux` | Existing route preserved; optional observability schema state is stable. | Pass |
| `مرکز اقدام` | `/actions` | Existing Action Center route preserved. | Pass |

Notes:

- `/tools` and `/tools/network-check` are non-executing placeholders for later Task 19.2 diagnostic milestones.
- No Check-Host, Nmap, scan authorization, external diagnostic request, monitor, finding, or worker invocation is part of this repair.
