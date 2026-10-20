# Unified monitoring, response and camera-owned NVR access

## Operational contract

`Actual collection → normalized evidence → finding → diagnosis → registered preview → one user confirmation → PolicyGuard → connector → audit/result → fresh verification`

No vendor-wide compliance certificate, universal SMART support or automatic remediation is implied. A missing collector, sensor, command or recording capability is a visible gap, not a healthy reading or a successful action.

## Monitoring workspace

- `/monitoring` is a real, read-only fleet workspace, no longer a redirect into Assets. `/monitoring/daily-check` retains controlled inspections.
- `/api/monitoring/operations` is authenticated, owner-scoped and paginated at 12 network/server devices. It exposes only current resource measurements, collection coverage and up to five latest open findings per device. Truncation is explicit. GET never invokes a connector or changes device settings.
- The view refreshes every 10 seconds while visible. Existing resource polling normally runs every 120 seconds; actual interval can grow with fleet size or collection failures. Event arrival triggers detection independently. This is not a fixed end-to-end realtime SLA.
- NVRs remain camera-owned assets, with dedicated sensor/storage/control workspaces reached through Cameras. They are not fabricated SSH Device rows in the network/server fleet.
- Links respect individual page grants. A monitoring-only account may read monitoring; remediation additionally requires the relevant finding/action page and operational permission. Camera management does not require opening generic Assets or Actions.

## Reliability corrections

- Detection debounce has a fixed first-event deadline of 750 ms, not a trailing timer that continuous logs can postpone forever.
- At most two scopes execute concurrently, and a scope never overlaps itself. Events during a running scope receive a coalesced follow-up. Callers share a pending promise; queues and completion history are bounded. Saturation is explicit/retryable.
- The incremental sweep uses SQL `GROUP BY deviceId` and stable 100-device keyset pages over a fixed window. It advances the timestamp only after successful completion, with a five-second commit overlap. Prisma post-query `distinct` plus `take` is deliberately avoided.
- Stable event references do not inflate vendor thresholds on re-analysis. Stale/future/invalid event times are rejected; in-memory windows are bounded.
- Cisco/Juniper VPN messages, Cisco AAA, FortiGate VIP/local-in and pfSense update rules require actual failure/exposure qualifiers. Routine successful messages no longer match solely because they contain a subsystem name.
- Vendor aliases share one diagnostic resolver. FortiOS must resolve to FortiGate, not Cisco because it contains `ios`. Unknown vendors create no pretend ActionPlan.

## Measured resource findings

Every vendor that supplies trusted normalized CPU, memory, disk or datastore percentage samples can use the same resource lifecycle. This does not create new proprietary collectors for unsupported models.

- Two fresh, finite, same-source/same-series observations are required. Identical observation timestamps are not independent measurements.
- Product defaults: both samples at least 85% create a high finding; both at least 95% are critical. Two samples below 80% resolve it with an audit entry. These are conservative application defaults, not manufacturer-mandated thresholds or a replacement for a device-specific baseline.
- Maximum observation age is five minutes, future tolerance 30 seconds. Missing, stale, malformed or absent-series data never clears a finding. Mounts/datastores and different collectors are not mixed. Existing ESXi source isolation remains enforced.
- A repeated poll does not increment the finding. New high observations can reopen a resolved issue. Suppressed/accepted-risk findings are preserved.
- Resource evidence is presented as measurements, not as attack-log references. The guide requests diagnosis and a reviewed supported change; no automatic file deletion, reboot or arbitrary shell execution is introduced.
- Both decision and preview select the same implemented, registered, read-only parameter-free catalog diagnostic. Unsupported fixes return `FINDING_ACTION_UNSUPPORTED` without creating a plan.

## Camera/NVR access

The operator explicitly selected: operators/admins manage; viewers observe only.

| Entry | Purpose |
| --- | --- |
| Cameras → Register NVR asset | Company selection, encrypted account and connection setup |
| `/assets/cameras/register/nvr` | Camera-owned NVR registration route |
| `/assets/cameras/recorders/:cameraId` | Sensors, storage, recording controls and connection |
| Company → NVR card → Monitor & manage | The same independent recorder workspace |
| Company → camera/channel → Playback | Archive selection and review tools |

Legacy `/assets/devices/new?vendor=nvr` and `/assets/devices/nvr-…` routes remain compatible. CameraDevice owns credentials/transport; the existing `nvr-…` Asset projection remains durable. Camera-only operators can register an NVR, refresh sensors and execute permitted registered controls through camera-owned APIs, without access to other asset inventories, generic actions, settings or unrelated customers. Existing reboot/admin-only restrictions remain unchanged. Viewers cannot add, reconfigure, execute controls or export clips.

## Playback

- Ownership is checked before transport. Native replay validates the actual recorder route, not the live camera's route. An unavailable/empty unsupported standalone recording service can fall back to an authenticated, uniquely matched recorder in the same company/workspace. Channel IDs are read from actual decoder configuration, never guessed from IP suffixes.
- Native TaoShi/AppWeb clips default to the supported 15-second bound; ONVIF retains 60 seconds. The HTTP schema no longer injects an invalid 30-second native default.
- The browser prefetches only the next bounded clip. Current plus next payloads are at most 24 MiB, in memory only; no localStorage, persistent footage cache or unbounded buffering. Camera/token/range/start/duration identify the slot. Changing selection, seeking elsewhere, unmounting or cancelling aborts outstanding work.
- A view buffer is never reused to bypass export authorization/audit. Export makes its own authorized request and exports the current segment only.
- Existing short-segment/gap checks, recorder-local clock handling, seek/speed/fullscreen and download restrictions remain. No blank frames are inserted to pretend that a gap contains footage.
- Cloud ID remains unavailable. Native LAN/VPN SDK access is not XMEye cloud access. ONVIF live view and disk monitoring do not prove Profile G archive support.

## Acceptance and reference points

Tests: `realtime-resources.test.ts`, `realtime-operations.integration.test.ts`, `replay-buffer.test.ts`, expanded `camera-api.integration.test.ts`, native replay integration, page-access, finding/action, vendor semantics and protected quick-controlled suites. Browser fixtures: `capture-unified-operations.mjs` and `capture-camera-studio.mjs`, both themes at desktop/mobile widths. Synthetic APIs intercept device writes; customer replay probes emit metadata only and retain no footage.

Primary references used for interpretation: [ONVIF Profile G](https://www.onvif.org/profiles/profile-g/), [ONVIF Replay Control specification](https://onvif.org/specs/srv/replay/ONVIF-ReplayControl-Service-Spec.pdf), [Cisco CPU collection and platform/baseline thresholds](https://www.cisco.com/c/en/us/support/docs/ip/simple-network-management-protocol-snmp/15215-collect-cpu-util-snmp.html). These references do not establish universal model support.

No schema/dependency change, protected lab-policy change, global Docker prune, production deployment or push is required or authorized by this task.
