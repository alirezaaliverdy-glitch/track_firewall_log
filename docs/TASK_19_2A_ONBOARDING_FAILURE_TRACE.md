# Task 19.2A Onboarding Failure Trace

## Baseline Failure

Observed user path:

`/dashboard -> ثبت دستگاه جدید -> /assets/devices/new -> Cisco -> ذخیره پاسخ‌ها و ساخت Preview`

Observed problem:

1. Session started as `draft`.
2. Saving answers returned HTTP 200.
3. Session stayed `draft`.
4. `connectorInvoked=false`.
5. No platform detection evidence existed.
6. No discovery payload existed.
7. No preview was built.
8. No `Device` row was persisted.

Root cause:

- `/answers` was overloaded in the UI label but not in backend behavior.
- Backend states were too coarse to prove `answers_saved`, `connection_verified`, `platform_detected`, `discovery_completed`, and `completed`.
- Preview creation happened as a side effect of discovery instead of a separate auditable transition.

## Repaired State Machine

Required sequence now represented by backend state:

`draft -> answers_saved -> connection_testing -> connection_verified -> platform_detecting -> platform_detected -> discovery_running -> discovery_completed -> preview_ready -> saving -> completed`

Failure/recovery states:

`connection_failed`, `platform_unsupported`, `discovery_failed`, `validation_failed`, `save_failed`, `cancelled`

## Verified Regression Evidence

Focused backend regression `Task 19.2A Cisco onboarding uses explicit connector-backed transitions and persists the Device` proves:

- answers save returns `answers_saved`;
- connection test returns `connection_verified` with `test.connectorInvoked=true`;
- platform detection returns `platform_detected` with `platform=cisco-ios-xe` and evidence;
- discovery returns `discovery_completed` with `discovery.connectorInvoked=true`;
- preview returns `preview_ready`;
- commit returns `completed`, `result.connectorInvoked=true`, route `/assets/devices/:deviceId`, and a persisted `Device` row.

The test uses a stored encrypted credential reference and a mocked Cisco read-only connector response. It does not expose the secret.
