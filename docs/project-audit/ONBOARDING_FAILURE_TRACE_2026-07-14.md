# Device Onboarding Failure Trace

Date: 2026-07-14

## Runtime baseline

- Branch: `product-persian-command-catalog`
- Commit: `1dfcb218efc206facd57e7e728472815645f2e0a`
- Runtime: frontend `5173`, backend `4000`, PostgreSQL `5432`, Playwright MCP `8931`
- Readiness: `databaseReady=true`, `schemaReady=true`
- Counts: Device 3, Asset 7, DeviceCredential 4, Finding 5, ActionPlan 124
- Existing working changes were preserved.

## Secret-safe credential readiness

All four historical credentials were tested through the normal decryptor without printing decrypted fields. Results:

| Name | Type | Decryptable | Sanitized error |
| --- | --- | --- | --- |
| `m` | password | true | none |
| `l` | password | true | none |
| `forti` | password | true | none |
| `cisco-f2` | password | true | none |

## Registered onboarding methods

The actual registered onboarding connectors are SSH-only:

- Linux: `linux-ssh`
- MikroTik: `mikrotik-ssh`
- FortiGate: `fortigate-ssh`
- Cisco IOS-XE: `cisco-iosxe-ssh`

The frontend nevertheless exposed API for FortiGate and MikroTik.

## Authenticated Playwright reproduction

Route: `/assets/devices/new`

Input used only to reproduce the pre-persistence failure:

- Vendor: `fortigate`
- Platform: `fortios`
- Connection method: `api`
- Host: documentation-only address `192.0.2.254`
- Port retained by the UI: `22`
- Credential reference: existing `forti` record; decryptable=true

Trace:

1. `POST /firewall-api/device-onboarding/sessions` -> 201
2. `POST /firewall-api/device-onboarding/sessions/dc7d86e0-8809-4d1d-b864-ae05e3d8b72b/answers` -> 200, UI status `answers_saved`
3. `POST /firewall-api/device-onboarding/sessions/dc7d86e0-8809-4d1d-b864-ae05e3d8b72b/test` -> 502

Response:

```json
{"error":{"code":"ONBOARDING_CONNECTION_FAILED","message":"No registered connector supports fortigate/api.","connectorInvoked":false}}
```

Read-back of the session returned HTTP 200 with:

- status: `connection_failed`
- vendor: `fortigate`
- connectionMethod: `api`
- managementPort: `22`
- credential reference present: true
- connectorInvoked: false

The UI retained its previous `answers_saved` display after the error instead of rendering the backend failure state.

## Root cause established before repair

The only registration button is gated behind successful test, detection, discovery, and preview states. Therefore an offline or unreachable device cannot be registered at all. Separately, the UI advertises API methods that have no onboarding connector, and method changes can retain an incorrect explicit port. This reproduction created no Device or Asset row.
