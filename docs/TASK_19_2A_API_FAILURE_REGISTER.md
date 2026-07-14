# Task 19.2A API Failure Register

| API | Baseline failure | Repair | Current evidence |
| --- | --- | --- | --- |
| `POST /api/device-onboarding/sessions/:id/answers` | HTTP 200 did not advance out of `draft`. | Returns `answers_saved` only after validation; clears downstream state on edit. | Focused backend test passed. |
| `POST /api/device-onboarding/sessions/:id/test` | Connection proof was not visible in UI progress. | Returns `connection_verified` only after connector invocation. | Focused backend test proves `connectorInvoked=true`. |
| `POST /api/device-onboarding/sessions/:id/detect` | Detection lacked explicit state in UI contract. | Returns `platform_detected` only after connector-backed evidence. | Focused backend test proves IOS-XE evidence. |
| `POST /api/device-onboarding/sessions/:id/discover` | Discovery built preview as a side effect. | Returns `discovery_completed`; preview is separate. | Focused backend test proves discovery connector invocation. |
| `POST /api/device-onboarding/sessions/:id/preview` | Endpoint missing. | Added explicit preview endpoint. | Focused backend test proves `preview_ready`. |
| `POST /api/device-onboarding/sessions/:id/commit` | Completion could be confused with HTTP success. | Returns `completed` only after persisted Device ID. | Focused backend test verifies persisted Device row. |
| `POST /api/device-onboarding/sessions/:id/cancel` | Endpoint missing. | Added explicit cancel endpoint. | Covered by route availability; deeper cancel UX can be extended later. |
| `GET /api/monitoring/linux/summary` | Missing optional tables could log Prisma stack traces before fallback. | Checks optional schema once, caches state, returns `observability.state`. | Focused backend test passed with `not_configured` on missing schema. |
